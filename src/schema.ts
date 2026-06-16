import {
  TypeKind,
  GraphQLType,
  GraphQLScalarType,
  GraphQLObjectType,
  GraphQLField,
  GraphQLArgument,
  GraphQLSchema,
  GraphQLFieldResolver
} from './types';

export { GraphQLField, GraphQLArgument, GraphQLObjectType };

export const GraphQLInt: GraphQLScalarType = {
  kind: TypeKind.SCALAR,
  name: 'Int',
  serialize: (value: any) => {
    const num = Number(value);
    if (Number.isInteger(num) && num >= -2147483648 && num <= 2147483647) {
      return num;
    }
    throw new Error(`Int cannot represent non-integer value: ${value}`);
  },
  parseValue: (value: any) => {
    const num = Number(value);
    if (Number.isInteger(num)) return num;
    throw new Error(`Int cannot represent non-integer value: ${value}`);
  }
};

export const GraphQLString: GraphQLScalarType = {
  kind: TypeKind.SCALAR,
  name: 'String',
  serialize: (value: any) => String(value),
  parseValue: (value: any) => String(value)
};

export const GraphQLBoolean: GraphQLScalarType = {
  kind: TypeKind.SCALAR,
  name: 'Boolean',
  serialize: (value: any) => Boolean(value),
  parseValue: (value: any) => Boolean(value)
};

export const GraphQLFloat: GraphQLScalarType = {
  kind: TypeKind.SCALAR,
  name: 'Float',
  serialize: (value: any) => {
    const num = Number(value);
    if (!Number.isNaN(num)) return num;
    throw new Error(`Float cannot represent non-numeric value: ${value}`);
  },
  parseValue: (value: any) => {
    const num = Number(value);
    if (!Number.isNaN(num)) return num;
    throw new Error(`Float cannot represent non-numeric value: ${value}`);
  }
};

export const GraphQLID: GraphQLScalarType = {
  kind: TypeKind.SCALAR,
  name: 'ID',
  serialize: (value: any) => String(value),
  parseValue: (value: any) => String(value)
};

export const defaultScalars: Record<string, GraphQLScalarType> = {
  Int: GraphQLInt,
  String: GraphQLString,
  Boolean: GraphQLBoolean,
  Float: GraphQLFloat,
  ID: GraphQLID
};

export function isNonNullType(type: GraphQLType): boolean {
  return type.kind === TypeKind.NON_NULL;
}

export function isListType(type: GraphQLType): boolean {
  return type.kind === TypeKind.LIST;
}

export function isScalarType(type: GraphQLType): boolean {
  return type.kind === TypeKind.SCALAR;
}

export function isObjectType(type: GraphQLType): boolean {
  return type.kind === TypeKind.OBJECT;
}

export function getNamedType(type: GraphQLType): GraphQLType {
  let t: GraphQLType = type;
  while (t.ofType) {
    t = t.ofType;
  }
  return t;
}

export function getNullableType(type: GraphQLType): GraphQLType {
  return isNonNullType(type) && type.ofType ? type.ofType : type;
}

export function GraphQLNonNull(ofType: GraphQLType): GraphQLType {
  return {
    kind: TypeKind.NON_NULL,
    ofType
  };
}

export function GraphQLList(ofType: GraphQLType): GraphQLType {
  return {
    kind: TypeKind.LIST,
    ofType
  };
}

export interface ObjectTypeConfig {
  name: string;
  description?: string;
  fields: Record<string, FieldConfig>;
}

export interface FieldConfig {
  type: GraphQLType;
  args?: Record<string, ArgumentConfig>;
  resolve?: GraphQLFieldResolver;
  description?: string;
  complexity?: number;
}

export interface ArgumentConfig {
  type: GraphQLType;
  defaultValue?: any;
  description?: string;
}

export function defineObjectType(config: ObjectTypeConfig): GraphQLObjectType {
  const fields: Record<string, GraphQLField> = {};
  for (const [name, fieldConfig] of Object.entries(config.fields)) {
    const args: GraphQLArgument[] = [];
    if (fieldConfig.args) {
      for (const [argName, argConfig] of Object.entries(fieldConfig.args)) {
        args.push({
          name: argName,
          type: argConfig.type,
          defaultValue: argConfig.defaultValue
        });
      }
    }
    fields[name] = {
      name,
      type: fieldConfig.type,
      args,
      resolve: fieldConfig.resolve,
      complexity: fieldConfig.complexity ?? 1
    };
  }
  return {
    kind: TypeKind.OBJECT,
    name: config.name,
    description: config.description,
    fields
  };
}

export interface SchemaConfig {
  query: GraphQLObjectType;
  mutation?: GraphQLObjectType;
  types?: GraphQLObjectType[];
}

export function defineSchema(config: SchemaConfig): GraphQLSchema {
  const types: Record<string, GraphQLType> = { ...defaultScalars };
  types[config.query.name] = config.query;
  if (config.mutation) {
    types[config.mutation.name] = config.mutation;
  }
  if (config.types) {
    for (const type of config.types) {
      types[type.name] = type;
    }
  }
  collectTypes(config.query, types);
  if (config.mutation) {
    collectTypes(config.mutation, types);
  }
  return {
    query: config.query,
    mutation: config.mutation,
    types
  };
}

function collectTypes(type: GraphQLObjectType, types: Record<string, GraphQLType>): void {
  for (const field of Object.values(type.fields)) {
    collectType(field.type, types);
    if (field.args) {
      for (const arg of field.args) {
        collectType(arg.type, types);
      }
    }
  }
}

function collectType(type: GraphQLType, types: Record<string, GraphQLType>): void {
  const namedType = getNamedType(type);
  if (namedType.name && !types[namedType.name]) {
    types[namedType.name] = namedType;
    if (isObjectType(namedType) && namedType.fields) {
      collectTypes(namedType as GraphQLObjectType, types);
    }
  }
}

export function printSchema(schema: GraphQLSchema): string {
  let result = '';
  for (const type of Object.values(schema.types)) {
    if (type.kind === TypeKind.SCALAR && defaultScalars[type.name!]) {
      continue;
    }
    result += printType(type) + '\n\n';
  }
  return result.trim();
}

function printType(type: GraphQLType): string {
  switch (type.kind) {
    case TypeKind.OBJECT:
      return `type ${type.name} {\n${printFields(type.fields!)}\n}`;
    case TypeKind.SCALAR:
      return `scalar ${type.name}`;
    default:
      return '';
  }
}

function printFields(fields: Record<string, GraphQLField>): string {
  return Object.values(fields)
    .map(field => `  ${field.name}${printArgs(field.args)}: ${printTypeRef(field.type)}`)
    .join('\n');
}

function printArgs(args?: GraphQLArgument[]): string {
  if (!args || args.length === 0) return '';
  return '(' + args.map(arg => `${arg.name}: ${printTypeRef(arg.type)}`).join(', ') + ')';
}

function printTypeRef(type: GraphQLType): string {
  if (type.kind === TypeKind.NON_NULL) {
    return printTypeRef(type.ofType!) + '!';
  }
  if (type.kind === TypeKind.LIST) {
    return '[' + printTypeRef(type.ofType!) + ']';
  }
  return type.name!;
}
