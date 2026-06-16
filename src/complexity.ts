import {
  DocumentNode,
  OperationDefinitionNode,
  FieldNode,
  SelectionSetNode,
  SelectionNode,
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLField,
  ValidationError
} from './types';
import { getNamedType, isObjectType, getNullableType } from './schema';
import { ASTNodeKind } from './types';

export interface ComplexityResult {
  depth: number;
  complexity: number;
  errors: ValidationError[];
}

export interface ComplexityOptions {
  maxDepth?: number;
  maxComplexity?: number;
  defaultComplexity?: number;
}

export function calculateDepth(
  schema: GraphQLSchema,
  document: DocumentNode,
  variableValues: Record<string, any> = {}
): number {
  let maxDepth = 0;
  const fragments = collectFragments(document);

  for (const def of document.definitions) {
    if (def.kind === ASTNodeKind.OPERATION_DEFINITION) {
      const rootType = def.operation === 'query'
        ? schema.query
        : schema.mutation;
      if (rootType) {
        const depth = calculateSelectionSetDepth(
          def.selectionSet,
          rootType,
          0,
          fragments,
          new Set()
        );
        maxDepth = Math.max(maxDepth, depth);
      }
    }
  }

  return maxDepth;
}

function collectFragments(
  document: DocumentNode
): Record<string, any> {
  const fragments: Record<string, any> = {};
  for (const def of document.definitions) {
    if (def.kind === ASTNodeKind.FRAGMENT_DEFINITION) {
      fragments[def.name.value] = def;
    }
  }
  return fragments;
}

function calculateSelectionSetDepth(
  selectionSet: SelectionSetNode,
  parentType: GraphQLObjectType,
  currentDepth: number,
  fragments: Record<string, any>,
  visitedFragments: Set<string>
): number {
  let maxDepth = currentDepth;

  for (const selection of selectionSet.selections) {
    const depth = calculateSelectionDepth(
      selection,
      parentType,
      currentDepth,
      fragments,
      visitedFragments
    );
    maxDepth = Math.max(maxDepth, depth);
  }

  return maxDepth;
}

function calculateSelectionDepth(
  selection: SelectionNode,
  parentType: GraphQLObjectType,
  currentDepth: number,
  fragments: Record<string, any>,
  visitedFragments: Set<string>
): number {
  if (selection.kind === ASTNodeKind.FIELD) {
    return calculateFieldDepth(selection, parentType, currentDepth, fragments, visitedFragments);
  } else if (selection.kind === ASTNodeKind.INLINE_FRAGMENT) {
    return calculateSelectionSetDepth(
      selection.selectionSet,
      parentType,
      currentDepth,
      fragments,
      visitedFragments
    );
  } else if (selection.kind === ASTNodeKind.FRAGMENT_SPREAD) {
    const fragmentName = selection.name.value;
    if (visitedFragments.has(fragmentName)) {
      return currentDepth;
    }
    const fragment = fragments[fragmentName];
    if (!fragment) {
      return currentDepth;
    }
    const typeName = fragment.typeCondition.value;
    const type = parentType;
    return calculateSelectionSetDepth(
      fragment.selectionSet,
      type,
      currentDepth,
      fragments,
      new Set([...visitedFragments, fragmentName])
    );
  }

  return currentDepth;
}

function calculateFieldDepth(
  field: FieldNode,
  parentType: GraphQLObjectType,
  currentDepth: number,
  fragments: Record<string, any>,
  visitedFragments: Set<string>
): number {
  const fieldName = field.name.value;
  const schemaField = parentType.fields[fieldName];

  if (!schemaField) {
    return currentDepth;
  }

  const fieldType = getNamedType(schemaField.type);

  if (field.selectionSet && isObjectType(fieldType)) {
    return calculateSelectionSetDepth(
      field.selectionSet,
      fieldType as GraphQLObjectType,
      currentDepth + 1,
      fragments,
      visitedFragments
    );
  }

  return currentDepth + 1;
}

export function calculateComplexity(
  schema: GraphQLSchema,
  document: DocumentNode,
  variableValues: Record<string, any> = {},
  options: ComplexityOptions = {}
): ComplexityResult {
  const errors: ValidationError[] = [];
  let totalComplexity = 0;
  let maxDepth = 0;

  const defaultComplexity = options.defaultComplexity ?? 1;
  const fragments = collectFragments(document);

  for (const def of document.definitions) {
    if (def.kind === ASTNodeKind.OPERATION_DEFINITION) {
      const rootType = def.operation === 'query'
        ? schema.query
        : schema.mutation;
      if (rootType) {
        const result = calculateSelectionSetComplexity(
          def.selectionSet,
          rootType,
          variableValues,
          defaultComplexity,
          0,
          fragments,
          new Set()
        );
        totalComplexity += result.complexity;
        maxDepth = Math.max(maxDepth, result.depth);
      }
    }
  }

  if (options.maxDepth !== undefined && maxDepth > options.maxDepth) {
    errors.push({
      message: `Query depth ${maxDepth} exceeds maximum allowed depth ${options.maxDepth}.`
    });
  }

  if (options.maxComplexity !== undefined && totalComplexity > options.maxComplexity) {
    errors.push({
      message: `Query complexity ${totalComplexity} exceeds maximum allowed complexity ${options.maxComplexity}.`
    });
  }

  return {
    depth: maxDepth,
    complexity: totalComplexity,
    errors
  };
}

interface SelectionComplexityResult {
  complexity: number;
  depth: number;
}

function calculateSelectionSetComplexity(
  selectionSet: SelectionSetNode,
  parentType: GraphQLObjectType,
  variableValues: Record<string, any>,
  defaultComplexity: number,
  currentDepth: number,
  fragments: Record<string, any>,
  visitedFragments: Set<string>
): SelectionComplexityResult {
  let complexity = 0;
  let depth = currentDepth;

  for (const selection of selectionSet.selections) {
    const result = calculateSelectionComplexity(
      selection,
      parentType,
      variableValues,
      defaultComplexity,
      currentDepth,
      fragments,
      visitedFragments
    );
    complexity += result.complexity;
    depth = Math.max(depth, result.depth);
  }

  return { complexity, depth };
}

function calculateSelectionComplexity(
  selection: SelectionNode,
  parentType: GraphQLObjectType,
  variableValues: Record<string, any>,
  defaultComplexity: number,
  currentDepth: number,
  fragments: Record<string, any>,
  visitedFragments: Set<string>
): SelectionComplexityResult {
  if (selection.kind === ASTNodeKind.FIELD) {
    return calculateFieldComplexity(
      selection,
      parentType,
      variableValues,
      defaultComplexity,
      currentDepth,
      fragments,
      visitedFragments
    );
  } else if (selection.kind === ASTNodeKind.INLINE_FRAGMENT) {
    return calculateSelectionSetComplexity(
      selection.selectionSet,
      parentType,
      variableValues,
      defaultComplexity,
      currentDepth,
      fragments,
      visitedFragments
    );
  } else if (selection.kind === ASTNodeKind.FRAGMENT_SPREAD) {
    const fragmentName = selection.name.value;
    if (visitedFragments.has(fragmentName)) {
      return { complexity: 0, depth: currentDepth };
    }
    const fragment = fragments[fragmentName];
    if (!fragment) {
      return { complexity: 0, depth: currentDepth };
    }
    return calculateSelectionSetComplexity(
      fragment.selectionSet,
      parentType,
      variableValues,
      defaultComplexity,
      currentDepth,
      fragments,
      new Set([...visitedFragments, fragmentName])
    );
  }

  return { complexity: 0, depth: currentDepth };
}

function calculateFieldComplexity(
  field: FieldNode,
  parentType: GraphQLObjectType,
  variableValues: Record<string, any>,
  defaultComplexity: number,
  currentDepth: number,
  fragments: Record<string, any>,
  visitedFragments: Set<string>
): SelectionComplexityResult {
  const fieldName = field.name.value;
  const schemaField = parentType.fields[fieldName];

  if (!schemaField) {
    return { complexity: 0, depth: currentDepth };
  }

  const fieldComplexity = schemaField.complexity ?? defaultComplexity;
  const multiplier = getMultiplier(field, variableValues);

  let childComplexity = 0;
  let childDepth = currentDepth + 1;

  const fieldType = getNamedType(schemaField.type);

  if (field.selectionSet && isObjectType(fieldType)) {
    const result = calculateSelectionSetComplexity(
      field.selectionSet,
      fieldType as GraphQLObjectType,
      variableValues,
      defaultComplexity,
      currentDepth + 1,
      fragments,
      visitedFragments
    );
    childComplexity = result.complexity;
    childDepth = result.depth;
  }

  const totalComplexity = (fieldComplexity + childComplexity) * multiplier;

  return {
    complexity: totalComplexity,
    depth: childDepth
  };
}

function getMultiplier(
  field: FieldNode,
  variableValues: Record<string, any>
): number {
  if (!field.arguments) {
    return 1;
  }

  let multiplier = 1;

  for (const arg of field.arguments) {
    if (arg.name.value === 'first' || arg.name.value === 'last' || arg.name.value === 'limit') {
      const value = resolveValue(arg.value, variableValues);
      if (typeof value === 'number' && value > 0) {
        multiplier = Math.min(value, 100);
        break;
      }
    }
  }

  return multiplier;
}

function resolveValue(
  value: any,
  variableValues: Record<string, any>
): any {
  if (value.kind === ASTNodeKind.VARIABLE) {
    return variableValues[value.name.value];
  }
  if (value.kind === ASTNodeKind.INT) {
    return parseInt(value.value, 10);
  }
  return null;
}
