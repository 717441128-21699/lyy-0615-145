import {
  DocumentNode,
  OperationDefinitionNode,
  FieldNode,
  SelectionSetNode,
  SelectionNode,
  FragmentDefinitionNode,
  ExecutionResult,
  ExecutionContext,
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLType,
  GraphQLField,
  GraphQLResolveInfo,
  Path,
  ValueNode,
  VariableDefinitionNode,
  DataLoader
} from './types';
import {
  getNamedType,
  getNullableType,
  isObjectType,
  isListType,
  isNonNullType,
  isScalarType
} from './schema';
import { ASTNodeKind } from './types';
import { createDataLoader } from './dataloader';

export interface ExecuteOptions {
  schema: GraphQLSchema;
  document: DocumentNode;
  rootValue?: any;
  contextValue?: any;
  variableValues?: Record<string, any>;
  operationName?: string;
  dataloaderFactory?: (context: any) => Record<string, DataLoader<any, any>>;
}

export async function execute(
  options: ExecuteOptions
): Promise<ExecutionResult> {
  const {
    schema,
    document,
    rootValue = {},
    contextValue = {},
    variableValues = {},
    operationName,
    dataloaderFactory
  } = options;

  try {
    const operation = getOperation(document, operationName);
    const variableDefs = operation.variableDefinitions || [];
    const coercedVariables = coerceVariableValues(
      schema,
      variableDefs,
      variableValues
    );

    const fragments: Record<string, FragmentDefinitionNode> = {};
    for (const def of document.definitions) {
      if (def.kind === ASTNodeKind.FRAGMENT_DEFINITION) {
        fragments[def.name.value] = def;
      }
    }

    const dataloaders = new Map<string, DataLoader<any, any>>();
    if (dataloaderFactory) {
      const loaderMap = dataloaderFactory(contextValue);
      for (const [key, loader] of Object.entries(loaderMap)) {
        dataloaders.set(key, loader);
      }
    }

    const execContext: ExecutionContext = {
      schema,
      fragments,
      rootValue,
      contextValue,
      variableValues: coercedVariables,
      dataloaders
    };

    const rootType = operation.operation === 'query'
      ? schema.query
      : schema.mutation;

    if (!rootType) {
      return {
        errors: [{
          message: `Schema is not configured for ${operation.operation} operations.`
        }]
      };
    }

    const data = await executeSelectionSet(
      execContext,
      operation.selectionSet,
      rootType,
      rootValue,
      undefined
    );

    return { data };
  } catch (error) {
    return {
      errors: [{
        message: error instanceof Error ? error.message : String(error)
      }]
    };
  }
}

function getOperation(
  document: DocumentNode,
  operationName?: string
): OperationDefinitionNode {
  const operations = document.definitions.filter(
    def => def.kind === ASTNodeKind.OPERATION_DEFINITION
  ) as OperationDefinitionNode[];

  if (operations.length === 0) {
    throw new Error('No operation found in document.');
  }

  if (operationName) {
    const operation = operations.find(op => op.name?.value === operationName);
    if (!operation) {
      throw new Error(`Operation "${operationName}" not found.`);
    }
    return operation;
  }

  if (operations.length > 1) {
    throw new Error(
      'Document contains multiple operations, but no operationName was provided.'
    );
  }

  return operations[0];
}

function coerceVariableValues(
  schema: GraphQLSchema,
  varDefs: VariableDefinitionNode[],
  inputs: Record<string, any>
): Record<string, any> {
  const coerced: Record<string, any> = {};

  for (const varDef of varDefs) {
    const varName = varDef.variable.name.value;
    const value = inputs[varName];

    if (value === undefined) {
      if (varDef.defaultValue) {
        coerced[varName] = valueFromAST(varDef.defaultValue, schema);
      } else if (!isNonNullTypeFromAST(varDef.type)) {
        coerced[varName] = null;
      } else {
        throw new Error(
          `Variable "$${varName}" of required type is not provided.`
        );
      }
    } else {
      coerced[varName] = value;
    }
  }

  return coerced;
}

function isNonNullTypeFromAST(type: any): boolean {
  return type.kind === 'NonNullType';
}

function valueFromAST(
  valueNode: ValueNode,
  schema: GraphQLSchema,
  variables?: Record<string, any>
): any {
  switch (valueNode.kind) {
    case ASTNodeKind.INT:
      return parseInt(valueNode.value, 10);
    case ASTNodeKind.FLOAT:
      return parseFloat(valueNode.value);
    case ASTNodeKind.STRING:
      return valueNode.value;
    case 'BooleanValue':
      return valueNode.value;
    case 'NullValue':
      return null;
    case ASTNodeKind.VARIABLE:
      return variables?.[valueNode.name.value];
    case ASTNodeKind.LIST:
      return valueNode.values.map(v => valueFromAST(v, schema, variables));
    case ASTNodeKind.OBJECT: {
      const obj: Record<string, any> = {};
      for (const field of valueNode.fields) {
        obj[field.name.value] = valueFromAST(field.value, schema, variables);
      }
      return obj;
    }
    case ASTNodeKind.NAME:
      return valueNode.value;
    default:
      return null;
  }
}

async function executeSelectionSet(
  context: ExecutionContext,
  selectionSet: SelectionSetNode,
  parentType: GraphQLObjectType,
  rootValue: any,
  path: Path | undefined
): Promise<Record<string, any>> {
  const promises: Array<Promise<Record<string, any>>> = [];

  for (const selection of selectionSet.selections) {
    promises.push(
      executeSelection(
        context,
        selection,
        parentType,
        rootValue,
        path
      )
    );
  }

  const results = await Promise.all(promises);
  return Object.assign({}, ...results);
}

async function executeSelection(
  context: ExecutionContext,
  selection: SelectionNode,
  parentType: GraphQLObjectType,
  rootValue: any,
  path: Path | undefined
): Promise<Record<string, any>> {
  if (selection.kind === ASTNodeKind.FIELD) {
    const result = await executeField(
      context,
      selection,
      parentType,
      rootValue,
      path
    );
    const responseKey = selection.alias?.value ?? selection.name.value;
    return { [responseKey]: result };
  } else if (selection.kind === ASTNodeKind.FRAGMENT_SPREAD) {
    const fragment = context.fragments[selection.name.value];
    if (fragment) {
      return executeSelectionSet(
        context,
        fragment.selectionSet,
        parentType,
        rootValue,
        path
      );
    }
    return {};
  } else if (selection.kind === ASTNodeKind.INLINE_FRAGMENT) {
    return executeSelectionSet(
      context,
      selection.selectionSet,
      parentType,
      rootValue,
      path
    );
  }
  return {};
}

async function executeField(
  context: ExecutionContext,
  field: FieldNode,
  parentType: GraphQLObjectType,
  source: any,
  path: Path | undefined
): Promise<any> {
  const fieldName = field.name.value;

  if (fieldName === '__typename') {
    return parentType.name;
  }

  const schemaField = parentType.fields[fieldName];
  if (!schemaField) {
    return undefined;
  }

  const args = resolveArguments(field.arguments, context.variableValues);

  const fieldPath: Path = {
    key: field.alias?.value ?? fieldName,
    prev: path
  };

  const info: GraphQLResolveInfo = {
    fieldName,
    parentType,
    returnType: schemaField.type,
    schema: context.schema,
    fieldNodes: [field],
    variableValues: context.variableValues,
    path: fieldPath
  };

  let result: any;

  if (schemaField.resolve) {
    try {
      result = await schemaField.resolve(
        source,
        args,
        context.contextValue,
        info
      );
    } catch (error) {
      throw error;
    }
  } else if (source !== null && source !== undefined) {
    result = source[fieldName];
  }

  return completeValue(
    context,
    field,
    schemaField.type,
    result,
    fieldPath
  );
}

function resolveArguments(
  argNodes: any[] | undefined,
  variables: Record<string, any>
): Record<string, any> {
  const args: Record<string, any> = {};
  if (!argNodes) return args;

  for (const arg of argNodes) {
    args[arg.name.value] = valueFromAST(arg.value, undefined as any, variables);
  }

  return args;
}

async function completeValue(
  context: ExecutionContext,
  field: FieldNode,
  returnType: GraphQLType,
  result: any,
  path: Path
): Promise<any> {
  if (isNonNullType(returnType)) {
    if (result === null || result === undefined) {
      throw new Error(
        `Cannot return null for non-nullable field "${path.key}".`
      );
    }
    return completeValue(
      context,
      field,
      returnType.ofType!,
      result,
      path
    );
  }

  if (result === null || result === undefined) {
    return null;
  }

  if (isListType(returnType)) {
    return completeListValue(
      context,
      field,
      returnType,
      result,
      path
    );
  }

  const namedType = getNamedType(returnType);

  if (isScalarType(namedType)) {
    return (namedType as any).serialize
      ? (namedType as any).serialize(result)
      : result;
  }

  if (isObjectType(namedType) && field.selectionSet) {
    return executeSelectionSet(
      context,
      field.selectionSet,
      namedType as GraphQLObjectType,
      result,
      path
    );
  }

  return result;
}

async function completeListValue(
  context: ExecutionContext,
  field: FieldNode,
  returnType: GraphQLType,
  result: any,
  path: Path
): Promise<any[]> {
  if (!Array.isArray(result)) {
    throw new Error(`Expected list for field "${path.key}".`);
  }

  const itemType = returnType.ofType!;
  const promises: Array<Promise<any>> = [];

  for (let i = 0; i < result.length; i++) {
    const itemPath: Path = {
      key: i,
      prev: path
    };

    const promise = completeValue(
      context,
      field,
      itemType,
      result[i],
      itemPath
    ).catch(error => {
      if (isNonNullType(itemType)) {
        throw error;
      }
      return null;
    });

    promises.push(promise);
  }

  return Promise.all(promises);
}

export { valueFromAST };
