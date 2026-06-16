import {
  defineObjectType,
  defineSchema,
  GraphQLInt,
  GraphQLString,
  GraphQLID,
  GraphQLNonNull,
  GraphQLList,
  GraphQLInt as IntType,
  GraphQLString as StringType,
  getNamedType,
  getNullableType,
  isNonNullType,
  isListType,
  isObjectType,
  isScalarType,
  printSchema
} from '../src/schema';
import { TypeKind } from '../src/types';

describe('Schema', () => {
  describe('Type helpers', () => {
    it('should identify non-null types', () => {
      const type = GraphQLNonNull(GraphQLString);
      expect(isNonNullType(type)).toBe(true);
      expect(isNonNullType(GraphQLString)).toBe(false);
    });

    it('should identify list types', () => {
      const type = GraphQLList(GraphQLString);
      expect(isListType(type)).toBe(true);
      expect(isListType(GraphQLString)).toBe(false);
    });

    it('should identify object types', () => {
      const obj = defineObjectType({
        name: 'Test',
        fields: { name: { type: GraphQLString } }
      });
      expect(isObjectType(obj)).toBe(true);
      expect(isObjectType(GraphQLString)).toBe(false);
    });

    it('should identify scalar types', () => {
      expect(isScalarType(GraphQLInt)).toBe(true);
      expect(isScalarType(GraphQLString)).toBe(true);
    });

    it('should get named type from wrapped types', () => {
      const type = GraphQLNonNull(GraphQLList(GraphQLNonNull(GraphQLString)));
      const named = getNamedType(type);
      expect(named.name).toBe('String');
    });

    it('should get nullable type', () => {
      const type = GraphQLNonNull(GraphQLString);
      const nullable = getNullableType(type);
      expect(isNonNullType(nullable)).toBe(false);
    });
  });

  describe('defineObjectType', () => {
    it('should define object type with fields', () => {
      const UserType = defineObjectType({
        name: 'User',
        description: 'A user',
        fields: {
          id: { type: GraphQLNonNull(GraphQLID) },
          name: { type: GraphQLString }
        }
      });

      expect(UserType.kind).toBe(TypeKind.OBJECT);
      expect(UserType.name).toBe('User');
      expect(UserType.description).toBe('A user');
      expect(Object.keys(UserType.fields)).toEqual(['id', 'name']);
      expect(UserType.fields.id.type.kind).toBe(TypeKind.NON_NULL);
    });

    it('should define fields with arguments', () => {
      const QueryType = defineObjectType({
        name: 'Query',
        fields: {
          user: {
            type: GraphQLID,
            args: {
              id: { type: GraphQLNonNull(GraphQLID) },
              limit: { type: GraphQLInt, defaultValue: 10 }
            }
          }
        }
      });

      expect(QueryType.fields.user.args).toHaveLength(2);
      expect(QueryType.fields.user.args![0].name).toBe('id');
      expect(QueryType.fields.user.args![1].defaultValue).toBe(10);
    });

    it('should define fields with resolvers', () => {
      const resolver = jest.fn();
      const QueryType = defineObjectType({
        name: 'Query',
        fields: {
          hello: {
            type: GraphQLString,
            resolve: resolver
          }
        }
      });

      expect(QueryType.fields.hello.resolve).toBe(resolver);
    });
  });

  describe('defineSchema', () => {
    it('should define schema with query type', () => {
      const QueryType = defineObjectType({
        name: 'Query',
        fields: {
          hello: { type: GraphQLString }
        }
      });

      const schema = defineSchema({ query: QueryType });

      expect(schema.query).toBe(QueryType);
      expect(schema.types['Query']).toBe(QueryType);
      expect(schema.types['String']).toBeDefined();
      expect(schema.types['Int']).toBeDefined();
    });

    it('should collect nested types', () => {
      const PostType = defineObjectType({
        name: 'Post',
        fields: {
          id: { type: GraphQLID },
          title: { type: GraphQLString }
        }
      });

      const UserType = defineObjectType({
        name: 'User',
        fields: {
          id: { type: GraphQLID },
          posts: { type: GraphQLList(PostType) }
        }
      });

      const QueryType = defineObjectType({
        name: 'Query',
        fields: {
          user: { type: UserType }
        }
      });

      const schema = defineSchema({ query: QueryType });

      expect(schema.types['User']).toBe(UserType);
      expect(schema.types['Post']).toBe(PostType);
    });
  });

  describe('printSchema', () => {
    it('should print schema definition', () => {
      const UserType = defineObjectType({
        name: 'User',
        fields: {
          id: { type: GraphQLNonNull(GraphQLID) },
          name: { type: GraphQLString },
          age: {
            type: GraphQLInt,
            args: {
              min: { type: GraphQLInt }
            }
          }
        }
      });

      const QueryType = defineObjectType({
        name: 'Query',
        fields: {
          user: { type: UserType }
        }
      });

      const schema = defineSchema({ query: QueryType });
      const printed = printSchema(schema);

      expect(printed).toContain('type Query');
      expect(printed).toContain('type User');
      expect(printed).toContain('id: ID!');
      expect(printed).toContain('name: String');
      expect(printed).toContain('age(min: Int): Int');
    });
  });

  describe('Scalar types', () => {
    it('should serialize Int', () => {
      expect(IntType.serialize(42)).toBe(42);
      expect(() => IntType.serialize(3.14)).toThrow();
      expect(() => IntType.serialize(9999999999999999)).toThrow();
    });

    it('should serialize String', () => {
      expect(StringType.serialize('hello')).toBe('hello');
      expect(StringType.serialize(123)).toBe('123');
    });
  });
});
