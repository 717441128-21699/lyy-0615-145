export enum TypeKind {
  SCALAR = 'SCALAR',
  OBJECT = 'OBJECT',
  LIST = 'LIST',
  NON_NULL = 'NON_NULL',
  INT = 'Int',
  STRING = 'String',
  BOOLEAN = 'Boolean',
  FLOAT = 'Float',
  ID = 'ID'
}

export interface GraphQLArgument {
  name: string;
  type: GraphQLType;
  defaultValue?: any;
}

export interface GraphQLField {
  name: string;
  type: GraphQLType;
  args?: GraphQLArgument[];
  resolve?: GraphQLFieldResolver;
  complexity?: number;
  description?: string;
}

export interface GraphQLType {
  kind: TypeKind;
  name?: string;
  ofType?: GraphQLType;
  fields?: Record<string, GraphQLField>;
  description?: string;
}

export interface GraphQLScalarType extends GraphQLType {
  kind: TypeKind.SCALAR;
  name: string;
  serialize: (value: any) => any;
  parseValue: (value: any) => any;
}

export interface GraphQLObjectType extends GraphQLType {
  kind: TypeKind.OBJECT;
  name: string;
  fields: Record<string, GraphQLField>;
}

export interface GraphQLSchema {
  query: GraphQLObjectType;
  mutation?: GraphQLObjectType;
  types: Record<string, GraphQLType>;
}

export interface GraphQLResolveInfo {
  fieldName: string;
  parentType: GraphQLObjectType;
  returnType: GraphQLType;
  schema: GraphQLSchema;
  fieldNodes: FieldNode[];
  variableValues: Record<string, any>;
  path: Path;
}

export type GraphQLFieldResolver<TSource = any, TContext = any, TArgs = any> = (
  source: TSource,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => any;

export interface Path {
  key: string | number;
  prev?: Path;
}

export interface Location {
  line: number;
  column: number;
}

export enum TokenKind {
  NAME = 'NAME',
  INT = 'INT',
  FLOAT = 'FLOAT',
  STRING = 'STRING',
  PUNCTUATOR = 'PUNCTUATOR',
  EOF = 'EOF'
}

export interface Token {
  kind: TokenKind;
  value: string;
  start: number;
  end: number;
  loc: Location;
}

export enum ASTNodeKind {
  NAME = 'Name',
  VARIABLE = 'Variable',
  ARGUMENT = 'Argument',
  FIELD = 'Field',
  SELECTION_SET = 'SelectionSet',
  INLINE_FRAGMENT = 'InlineFragment',
  FRAGMENT_SPREAD = 'FragmentSpread',
  FRAGMENT_DEFINITION = 'FragmentDefinition',
  OPERATION_DEFINITION = 'OperationDefinition',
  VARIABLE_DEFINITION = 'VariableDefinition',
  INT = 'IntValue',
  FLOAT = 'FloatValue',
  STRING = 'StringValue',
  LIST = 'ListValue',
  OBJECT = 'ObjectValue',
  OBJECT_FIELD = 'ObjectField',
  DOCUMENT = 'Document'
}

export interface NameNode {
  kind: ASTNodeKind.NAME;
  value: string;
  loc?: Location;
}

export interface VariableNode {
  kind: ASTNodeKind.VARIABLE;
  name: NameNode;
}

export interface ArgumentNode {
  kind: ASTNodeKind.ARGUMENT;
  name: NameNode;
  value: ValueNode;
}

export interface IntValueNode {
  kind: ASTNodeKind.INT;
  value: string;
}

export interface FloatValueNode {
  kind: ASTNodeKind.FLOAT;
  value: string;
}

export interface StringValueNode {
  kind: ASTNodeKind.STRING;
  value: string;
}

export interface BooleanValueNode {
  kind: 'BooleanValue';
  value: boolean;
}

export interface NullValueNode {
  kind: 'NullValue';
}

export interface ListValueNode {
  kind: ASTNodeKind.LIST;
  values: ValueNode[];
}

export interface ObjectValueNode {
  kind: ASTNodeKind.OBJECT;
  fields: ObjectFieldNode[];
}

export type ValueNode =
  | IntValueNode
  | FloatValueNode
  | StringValueNode
  | BooleanValueNode
  | NullValueNode
  | VariableNode
  | ListValueNode
  | ObjectValueNode
  | NameNode;

export interface ObjectFieldNode {
  kind: ASTNodeKind.OBJECT_FIELD;
  name: NameNode;
  value: ValueNode;
}

export interface FieldNode {
  kind: ASTNodeKind.FIELD;
  alias?: NameNode;
  name: NameNode;
  arguments?: ArgumentNode[];
  selectionSet?: SelectionSetNode;
}

export interface SelectionSetNode {
  kind: ASTNodeKind.SELECTION_SET;
  selections: SelectionNode[];
}

export type SelectionNode = FieldNode | FragmentSpreadNode | InlineFragmentNode;

export interface FragmentSpreadNode {
  kind: ASTNodeKind.FRAGMENT_SPREAD;
  name: NameNode;
}

export interface InlineFragmentNode {
  kind: ASTNodeKind.INLINE_FRAGMENT;
  typeCondition?: NameNode;
  selectionSet: SelectionSetNode;
}

export interface FragmentDefinitionNode {
  kind: ASTNodeKind.FRAGMENT_DEFINITION;
  name: NameNode;
  typeCondition: NameNode;
  selectionSet: SelectionSetNode;
}

export interface VariableDefinitionNode {
  kind: ASTNodeKind.VARIABLE_DEFINITION;
  variable: VariableNode;
  type: any;
  defaultValue?: ValueNode;
}

export interface OperationDefinitionNode {
  kind: ASTNodeKind.OPERATION_DEFINITION;
  operation: 'query' | 'mutation' | 'subscription';
  name?: NameNode;
  variableDefinitions?: VariableDefinitionNode[];
  selectionSet: SelectionSetNode;
}

export interface DocumentNode {
  kind: ASTNodeKind.DOCUMENT;
  definitions: DefinitionNode[];
}

export type DefinitionNode = OperationDefinitionNode | FragmentDefinitionNode;

export interface ValidationError {
  message: string;
  locations?: Location[];
  path?: (string | number)[];
}

export interface ExecutionResult<TData = { [key: string]: any }> {
  data?: TData;
  errors?: ValidationError[];
  extensions?: Record<string, any>;
}

export interface ExecutionContext {
  schema: GraphQLSchema;
  fragments: Record<string, FragmentDefinitionNode>;
  rootValue: any;
  contextValue: any;
  variableValues: Record<string, any>;
  dataloaders: Map<string, DataLoader<any, any>>;
}

export interface BatchLoadFn<K, V> {
  (keys: K[]): Promise<(V | Error)[]>;
}

export interface DataLoaderOptions<K, V> {
  batch?: boolean;
  cache?: boolean;
  cacheKeyFn?: (key: K) => any;
}

export interface DataLoader<K, V> {
  load: (key: K) => Promise<V>;
  loadMany: (keys: K[]) => Promise<V[]>;
  clear: (key: K) => this;
  clearAll: () => this;
  prime: (key: K, value: V | Error) => this;
}
