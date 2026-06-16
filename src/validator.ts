import {
  DocumentNode,
  OperationDefinitionNode,
  FieldNode,
  SelectionSetNode,
  SelectionNode,
  FragmentDefinitionNode,
  ValidationError,
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLType,
  GraphQLField,
  ValueNode,
  VariableDefinitionNode,
  ASTNodeKind,
  Location,
  NameNode,
  TypeKind
} from './types';
import {
  getNamedType,
  getNullableType,
  isObjectType,
  isListType,
  isNonNullType
} from './schema';

function getLocation(loc?: Location): Location {
  return loc || { line: 0, column: 0 };
}

interface ValidationContext {
  schema: GraphQLSchema;
  document: DocumentNode;
  errors: ValidationError[];
  fragments: Record<string, FragmentDefinitionNode>;
  variableDefinitions: VariableDefinitionNode[];
  variableUsages: Map<string, Set<string>>;
  detectedCycles: Set<string>;
}

export function validate(
  schema: GraphQLSchema,
  document: DocumentNode
): ValidationError[] {
  const context: ValidationContext = {
    schema,
    document,
    errors: [],
    fragments: {},
    variableDefinitions: [],
    variableUsages: new Map(),
    detectedCycles: new Set()
  };

  for (const def of document.definitions) {
    if (def.kind === ASTNodeKind.FRAGMENT_DEFINITION) {
      if (context.fragments[def.name.value]) {
        context.errors.push({
          message: `Fragment "${def.name.value}" is defined multiple times.`
        });
      }
      context.fragments[def.name.value] = def;
    }
  }

  for (const def of document.definitions) {
    if (def.kind === ASTNodeKind.OPERATION_DEFINITION) {
      validateOperation(context, def);
    } else if (def.kind === ASTNodeKind.FRAGMENT_DEFINITION) {
      validateFragment(context, def);
    }
  }

  validateAllVariablesUsed(context);

  return context.errors;
}

function validateOperation(
  context: ValidationContext,
  operation: OperationDefinitionNode
): void {
  context.variableDefinitions = operation.variableDefinitions || [];
  context.variableUsages = new Map();

  const rootType = operation.operation === 'query'
    ? context.schema.query
    : context.schema.mutation;

  if (!rootType) {
    context.errors.push({
      message: `Schema is not configured for ${operation.operation} operations.`
    });
    return;
  }

  validateSelectionSet(
    context,
    operation.selectionSet,
    rootType,
    new Set()
  );
}

function validateFragment(
  context: ValidationContext,
  fragment: FragmentDefinitionNode
): void {
  const typeName = fragment.typeCondition.value;
  const type = context.schema.types[typeName];

  if (!type) {
    context.errors.push({
      message: `Unknown type "${typeName}".`,
      locations: [getLocation(fragment.typeCondition.loc)]
    });
    return;
  }

  if (!isObjectType(type)) {
    context.errors.push({
      message: `Fragment on non-object type "${typeName}" is not allowed.`,
      locations: [getLocation(fragment.typeCondition.loc)]
    });
    return;
  }

  validateSelectionSet(
    context,
    fragment.selectionSet,
    type as GraphQLObjectType,
    new Set([fragment.name.value])
  );
}

function validateSelectionSet(
  context: ValidationContext,
  selectionSet: SelectionSetNode,
  parentType: GraphQLObjectType,
  visitedFragments: Set<string>
): void {
  for (const selection of selectionSet.selections) {
    validateSelection(context, selection, parentType, visitedFragments);
  }
}

function validateSelection(
  context: ValidationContext,
  selection: SelectionNode,
  parentType: GraphQLObjectType,
  visitedFragments: Set<string>
): void {
  if (selection.kind === ASTNodeKind.FIELD) {
    validateField(context, selection, parentType, visitedFragments);
  } else if (selection.kind === ASTNodeKind.FRAGMENT_SPREAD) {
    validateFragmentSpread(context, selection, parentType, visitedFragments);
  } else if (selection.kind === ASTNodeKind.INLINE_FRAGMENT) {
    validateInlineFragment(context, selection, parentType, visitedFragments);
  }
}

function validateField(
  context: ValidationContext,
  field: FieldNode,
  parentType: GraphQLObjectType,
  visitedFragments: Set<string>
): void {
  const fieldName = field.name.value;

  if (fieldName === '__typename') {
    return;
  }

  const schemaField = parentType.fields[fieldName];
  if (!schemaField) {
    context.errors.push({
      message: `Field "${fieldName}" does not exist on type "${parentType.name}".`,
      locations: [getLocation(field.name.loc)]
    });
    return;
  }

  if (field.arguments) {
    for (const arg of field.arguments) {
      validateArgument(context, arg, schemaField);
    }
  }

  if (schemaField.args) {
    for (const argDef of schemaField.args) {
      if (isNonNullType(argDef.type)) {
        const argNode = field.arguments?.find(a => a.name.value === argDef.name);
        if (!argNode && argDef.defaultValue === undefined) {
          context.errors.push({
            message: `Field "${fieldName}" argument "${argDef.name}" of required type ` +
                     `is not provided.`,
            locations: [getLocation(field.name.loc)]
          });
        }
      }
    }
  }

  if (field.selectionSet) {
    const fieldType = getNamedType(schemaField.type);
    if (!isObjectType(fieldType)) {
      context.errors.push({
        message: `Field "${fieldName}" of type "${getTypeName(schemaField.type)}" ` +
                 `must not have a selection set.`,
        locations: [getLocation(field.name.loc)]
      });
      return;
    }
    validateSelectionSet(
      context,
      field.selectionSet,
      fieldType as GraphQLObjectType,
      visitedFragments
    );
  } else {
    const fieldType = getNullableType(schemaField.type);
    const namedType = getNamedType(fieldType);
    if (isObjectType(namedType)) {
      context.errors.push({
        message: `Field "${fieldName}" of type "${getTypeName(schemaField.type)} ` +
                 `must have a selection set.`,
        locations: [getLocation(field.name.loc)]
      });
    }
  }
}

function validateFragmentSpread(
  context: ValidationContext,
  spread: any,
  parentType: GraphQLObjectType,
  visitedFragments: Set<string>
): void {
  const fragmentName = spread.name.value;
  const fragment = context.fragments[fragmentName];

  if (!fragment) {
    context.errors.push({
      message: `Fragment "${fragmentName}" is not defined.`,
      locations: [getLocation(spread.name.loc)]
    });
    return;
  }

  if (visitedFragments.has(fragmentName)) {
    const cycleId = [...visitedFragments, fragmentName].sort().join('->');
    if (!context.detectedCycles.has(cycleId)) {
      context.detectedCycles.add(cycleId);
      context.errors.push({
        message: `Fragment "${fragmentName}" forms a cycle.`,
        locations: [getLocation(spread.name.loc)]
      });
    }
    return;
  }

  const typeConditionName = fragment.typeCondition.value;
  if (typeConditionName !== parentType.name) {
    const typeCondition = context.schema.types[typeConditionName];
    if (!typeCondition) {
      context.errors.push({
        message: `Unknown type "${typeConditionName}" in fragment.`,
        locations: [getLocation(fragment.typeCondition.loc)]
      });
      return;
    }
  }

  validateSelectionSet(
    context,
    fragment.selectionSet,
    context.schema.types[typeConditionName] as GraphQLObjectType,
    new Set([...visitedFragments, fragmentName])
  );
}

function validateInlineFragment(
  context: ValidationContext,
  fragment: any,
  parentType: GraphQLObjectType,
  visitedFragments: Set<string>
): void {
  let type = parentType;
  if (fragment.typeCondition) {
    const typeName = fragment.typeCondition.value;
    const schemaType = context.schema.types[typeName];
    if (!schemaType) {
      context.errors.push({
        message: `Unknown type "${typeName}" in inline fragment.`,
        locations: [getLocation(fragment.typeCondition.loc)]
      });
      return;
    }
    if (!isObjectType(schemaType)) {
      context.errors.push({
        message: `Inline fragment on non-object type "${typeName}" is not allowed.`,
        locations: [getLocation(fragment.typeCondition.loc)]
      });
      return;
    }
    type = schemaType as GraphQLObjectType;
  }

  validateSelectionSet(
    context,
    fragment.selectionSet,
    type,
    visitedFragments
  );
}

function validateArgument(
  context: ValidationContext,
  arg: any,
  field: GraphQLField
): void {
  const argName = arg.name.value;
  const argDef = field.args?.find(a => a.name === argName);

  if (!argDef) {
    context.errors.push({
      message: `Unknown argument "${argName}" on field "${field.name}".`,
      locations: [arg.name.loc]
    });
    return;
  }

  validateValue(context, arg.value, argDef.type);
}

function validateValue(
  context: ValidationContext,
  value: ValueNode,
  type: GraphQLType
): void {
  const nullableType = getNullableType(type);

  if (isNonNullType(type) && value.kind === 'NullValue') {
    context.errors.push({
      message: `Expected non-null value for type "${getTypeName(type)}".`
    });
    return;
  }

  if (value.kind === 'NullValue') {
    return;
  }

  if (value.kind === ASTNodeKind.VARIABLE) {
    const varName = value.name.value;
    const varDef = context.variableDefinitions.find(v => v.variable.name.value === varName);

    if (!varDef) {
      context.errors.push({
        message: `Variable "$${varName}" is not defined.`,
        locations: [getLocation(value.name.loc)]
      });
    } else {
      let usages = context.variableUsages.get(varName);
      if (!usages) {
        usages = new Set();
        context.variableUsages.set(varName, usages);
      }
      usages.add(getTypeName(type));
    }
    return;
  }

  const namedType = getNamedType(nullableType);

  if (isListType(nullableType)) {
    if (value.kind !== ASTNodeKind.LIST) {
      validateValue(context, value, nullableType.ofType!);
      return;
    } else {
      for (const item of value.values) {
        validateValue(context, item, nullableType.ofType!);
      }
    }
    return;
  }

  if (namedType.kind === TypeKind.SCALAR) {
    return;
  }

  if (isObjectType(namedType)) {
    if (value.kind === ASTNodeKind.OBJECT) {
      for (const field of value.fields) {
      }
    }
  }
}

function validateAllVariablesUsed(context: ValidationContext): void {
  for (const varDef of context.variableDefinitions) {
    const varName = varDef.variable.name.value;
    const usages = context.variableUsages.get(varName);
    if (!usages || usages.size === 0) {
      context.errors.push({
        message: `Variable "$${varName}" is defined but not used.`,
        locations: [getLocation(varDef.variable.name.loc)]
      });
    }
  }
}

function getTypeName(type: GraphQLType): string {
  if (type.kind === 'NON_NULL') {
    return getTypeName(type.ofType!) + '!';
  }
  if (type.kind === 'LIST') {
    return '[' + getTypeName(type.ofType!) + ']';
  }
  return type.name || '';
}
