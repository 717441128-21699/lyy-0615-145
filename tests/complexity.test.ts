import { parse } from '../src/parser';
import { calculateDepth, calculateComplexity } from '../src/complexity';
import {
  defineObjectType,
  defineSchema,
  GraphQLString,
  GraphQLInt,
  GraphQLID,
  GraphQLNonNull,
  GraphQLList
} from '../src/schema';

const PostType = defineObjectType({
  name: 'Post',
  fields: {
    id: { type: GraphQLNonNull(GraphQLID) },
    title: { type: GraphQLString, complexity: 1 }
  }
});

const UserType = defineObjectType({
  name: 'User',
  fields: {
    id: { type: GraphQLNonNull(GraphQLID), complexity: 1 },
    name: { type: GraphQLString, complexity: 1 },
    posts: {
      type: GraphQLList(PostType),
      complexity: 5
    }
  }
});

const QueryType = defineObjectType({
  name: 'Query',
  fields: {
    user: {
      type: UserType,
      args: {
        id: { type: GraphQLNonNull(GraphQLID) }
      },
      complexity: 1
    },
    users: {
      type: GraphQLList(UserType),
      complexity: 1
    }
  }
});

const schema = defineSchema({
  query: QueryType,
  types: [UserType, PostType]
});

describe('Complexity Analysis', () => {
  describe('calculateDepth', () => {
    it('should calculate depth 1 for scalar fields', () => {
      const source = `
        {
          user(id: "1") {
            name
          }
        }
      `;
      const document = parse(source);
      const depth = calculateDepth(schema, document);
      expect(depth).toBe(2);
    });

    it('should calculate depth for nested fields', () => {
      const source = `
        {
          user(id: "1") {
            posts {
              title
            }
          }
        }
      `;
      const document = parse(source);
      const depth = calculateDepth(schema, document);
      expect(depth).toBe(3);
    });

    it('should calculate depth for deeply nested fields', () => {
      const source = `
        {
          user(id: "1") {
            posts {
              id
              title
            }
          }
        }
      `;
      const document = parse(source);
      const depth = calculateDepth(schema, document);
      expect(depth).toBe(3);
    });
  });

  describe('calculateComplexity', () => {
    it('should calculate complexity for simple query', () => {
      const source = `
        {
          user(id: "1") {
            name
          }
        }
      `;
      const document = parse(source);
      const result = calculateComplexity(schema, document);
      expect(result.depth).toBe(2);
      expect(result.complexity).toBeGreaterThan(0);
      expect(result.errors).toEqual([]);
    });

    it('should calculate complexity with multiplier for list arguments', () => {
      const source = `
        {
          users(first: 10) {
            name
            posts {
              title
            }
          }
        }
      `;
      const document = parse(source);
      const result = calculateComplexity(schema, document, { first: 10 });
      expect(result.complexity).toBeGreaterThan(10);
    });

    it('should return error when depth exceeds maxDepth', () => {
      const deepQuery = `
        {
          user(id: "1") {
            posts {
              id
            }
          }
        }
      `;
      const document = parse(deepQuery);
      const result = calculateComplexity(schema, document, {}, { maxDepth: 2 });
      expect(result.errors.length).toBe(1);
      expect(result.errors[0].message).toContain('exceeds maximum allowed depth');
    });

    it('should return error when complexity exceeds maxComplexity', () => {
      const complexQuery = `
        {
          users(first: 100) {
            name
            posts {
              title
            }
          }
        }
      `;
      const document = parse(complexQuery);
      const result = calculateComplexity(
        schema,
        document,
        { first: 100 },
        { maxComplexity: 10 }
      );
      expect(result.errors.length).toBe(1);
      expect(result.errors[0].message).toContain('exceeds maximum allowed complexity');
    });

    it('should use default complexity when not specified', () => {
      const TestType = defineObjectType({
        name: 'Test',
        fields: {
          field1: { type: GraphQLString },
          field2: { type: GraphQLInt }
        }
      });
      const TestQueryType = defineObjectType({
        name: 'Query',
        fields: {
          test: { type: TestType }
        }
      });
      const testSchema = defineSchema({ query: TestQueryType });

      const source = '{ test { field1 field2 } }';
      const document = parse(source);
      const result = calculateComplexity(testSchema, document);
      expect(result.complexity).toBe(3);
    });
  });
});
