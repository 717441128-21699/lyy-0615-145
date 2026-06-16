import { graphql } from '../src/graphql';
import {
  schema,
  createDataLoaders,
  resetQueryCounter,
  getQueryCount,
  Context
} from '../src/example-schema';

describe('Integration Tests', () => {
  beforeEach(() => {
    resetQueryCounter();
  });

  describe('End-to-End Query Execution', () => {
    it('should execute simple query with variables', async () => {
      const context: Context = {
        loaders: createDataLoaders(),
        useDataLoader: false
      };

      const result = await graphql({
        schema,
        source: `
          query GetUser($id: ID!) {
            user(id: $id) {
              id
              name
              email
            }
          }
        `,
        variableValues: { id: '1' },
        contextValue: context
      });

      expect(result.errors).toBeUndefined();
      expect(result.data).toEqual({
        user: {
          id: '1',
          name: 'Alice',
          email: 'alice@example.com'
        }
      });
    });

    it('should handle aliases', async () => {
      const context: Context = {
        loaders: createDataLoaders(),
        useDataLoader: false
      };

      const result = await graphql({
        schema,
        source: `
          {
            alice: user(id: "1") {
              name
            }
            bob: user(id: "2") {
              name
            }
          }
        `,
        contextValue: context
      });

      expect(result.errors).toBeUndefined();
      expect(result.data).toEqual({
        alice: { name: 'Alice' },
        bob: { name: 'Bob' }
      });
    });

    it('should validate and return errors for invalid query', async () => {
      const context: Context = {
        loaders: createDataLoaders(),
        useDataLoader: false
      };

      const result = await graphql({
        schema,
        source: `
          {
            users {
              nonExistentField
            }
          }
        `,
        contextValue: context
      });

      expect(result.errors).toBeDefined();
      expect(result.errors?.length).toBeGreaterThan(0);
      expect(result.errors?.[0].message).toContain('nonExistentField');
      expect(result.data).toBeUndefined();
    });
  });

  describe('N+1 Problem Demonstration', () => {
    it('should show N+1 problem WITHOUT DataLoader', async () => {
      const context: Context = {
        loaders: createDataLoaders(),
        useDataLoader: false
      };

      await graphql({
        schema,
        source: `
          {
            users {
              id
              name
              posts {
                id
                title
              }
            }
          }
        `,
        contextValue: context
      });

      expect(getQueryCount()).toBe(4);
    });

    it('should solve N+1 problem WITH DataLoader', async () => {
      const context: Context = {
        loaders: createDataLoaders(),
        useDataLoader: true
      };

      await graphql({
        schema,
        source: `
          {
            users {
              id
              name
              posts {
                id
                title
              }
            }
          }
        `,
        contextValue: context
      });

      expect(getQueryCount()).toBe(2);
    });

    it('should show reverse N+1 problem WITHOUT DataLoader', async () => {
      const context: Context = {
        loaders: createDataLoaders(),
        useDataLoader: false
      };

      await graphql({
        schema,
        source: `
          {
            posts {
              id
              title
              author {
                id
                name
              }
            }
          }
        `,
        contextValue: context
      });

      expect(getQueryCount()).toBe(6);
    });

    it('should solve reverse N+1 problem WITH DataLoader', async () => {
      const context: Context = {
        loaders: createDataLoaders(),
        useDataLoader: true
      };

      await graphql({
        schema,
        source: `
          {
            posts {
              id
              title
              author {
                id
                name
              }
            }
          }
        `,
        contextValue: context
      });

      expect(getQueryCount()).toBe(2);
    });
  });

  describe('Depth and Complexity Protection', () => {
    it('should reject query exceeding depth limit', async () => {
      const context: Context = {
        loaders: createDataLoaders(),
        useDataLoader: true
      };

      const result = await graphql({
        schema,
        source: `
          query DeepQuery {
            user(id: "1") {
              posts {
                author {
                  posts {
                    author {
                      name
                    }
                  }
                }
              }
            }
          }
        `,
        contextValue: context,
        complexityOptions: {
          maxDepth: 3,
          maxComplexity: 1000
        }
      });

      expect(result.errors).toBeDefined();
      expect(result.errors?.length).toBeGreaterThan(0);
      expect(result.errors?.[0].message).toContain('exceeds maximum allowed depth');
      expect(result.extensions?.depth).toBeGreaterThan(3);
    });

    it('should reject query exceeding complexity limit', async () => {
      const context: Context = {
        loaders: createDataLoaders(),
        useDataLoader: true
      };

      const result = await graphql({
        schema,
        source: `
          {
            posts(first: 100) {
              title
              author {
                name
                posts {
                  title
                }
              }
            }
          }
        `,
        contextValue: context,
        variableValues: { first: 100 },
        complexityOptions: {
          maxDepth: 10,
          maxComplexity: 10
        }
      });

      expect(result.errors).toBeDefined();
      expect(result.errors?.length).toBeGreaterThan(0);
      expect(result.errors?.[0].message).toContain('exceeds maximum allowed complexity');
    });

    it('should include complexity info in extensions', async () => {
      const context: Context = {
        loaders: createDataLoaders(),
        useDataLoader: true
      };

      const result = await graphql({
        schema,
        source: `
          {
            users {
              name
              posts {
                title
              }
            }
          }
        `,
        contextValue: context,
        complexityOptions: {
          maxDepth: 10,
          maxComplexity: 1000
        }
      });

      expect(result.extensions).toBeDefined();
      expect(result.extensions?.depth).toBeGreaterThan(0);
      expect(result.extensions?.complexity).toBeGreaterThan(0);
    });
  });

  describe('Multiple Operations', () => {
    it('should execute named operation', async () => {
      const context: Context = {
        loaders: createDataLoaders(),
        useDataLoader: true
      };

      const result = await graphql({
        schema,
        source: `
          query GetUsers {
            users { name }
          }
          query GetPosts {
            posts { title }
          }
        `,
        operationName: 'GetPosts',
        contextValue: context
      });

      expect(result.errors).toBeUndefined();
      expect(result.data).toBeDefined();
      expect(result.data?.posts).toBeDefined();
      expect(result.data?.users).toBeUndefined();
    });

    it('should error if operationName not provided for multiple operations', async () => {
      const context: Context = {
        loaders: createDataLoaders(),
        useDataLoader: true
      };

      const result = await graphql({
        schema,
        source: `
          query GetUsers {
            users { name }
          }
          query GetPosts {
            posts { title }
          }
        `,
        contextValue: context
      });

      expect(result.errors).toBeDefined();
      expect(result.errors?.[0].message).toContain('operationName');
    });
  });
});
