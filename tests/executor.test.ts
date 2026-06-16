import { parse } from '../src/parser';
import { execute } from '../src/executor';
import {
  defineObjectType,
  defineSchema,
  GraphQLString,
  GraphQLInt,
  GraphQLID,
  GraphQLNonNull,
  GraphQLList
} from '../src/schema';
import { createDataLoader } from '../src/dataloader';

describe('Executor', () => {
  it('should execute simple query', async () => {
    const QueryType = defineObjectType({
      name: 'Query',
      fields: {
        hello: {
          type: GraphQLString,
          resolve: () => 'Hello World!'
        }
      }
    });

    const schema = defineSchema({ query: QueryType });
    const document = parse('{ hello }');

    const result = await execute({ schema, document });

    expect(result.data).toEqual({ hello: 'Hello World!' });
    expect(result.errors).toBeUndefined();
  });

  it('should execute query with arguments', async () => {
    const QueryType = defineObjectType({
      name: 'Query',
      fields: {
        greet: {
          type: GraphQLString,
          args: {
            name: { type: GraphQLNonNull(GraphQLString) }
          },
          resolve: (_root, args) => `Hello, ${args.name}!`
        }
      }
    });

    const schema = defineSchema({ query: QueryType });
    const document = parse('{ greet(name: "Alice") }');

    const result = await execute({ schema, document });

    expect(result.data).toEqual({ greet: 'Hello, Alice!' });
  });

  it('should execute query with variables', async () => {
    const QueryType = defineObjectType({
      name: 'Query',
      fields: {
        user: {
          type: GraphQLString,
          args: {
            id: { type: GraphQLNonNull(GraphQLID) }
          },
          resolve: (_root, args) => `User: ${args.id}`
        }
      }
    });

    const schema = defineSchema({ query: QueryType });
    const document = parse('query GetUser($id: ID!) { user(id: $id) }');

    const result = await execute({
      schema,
      document,
      variableValues: { id: '123' }
    });

    expect(result.data).toEqual({ user: 'User: 123' });
  });

  it('should execute nested queries', async () => {
    const UserType = defineObjectType({
      name: 'User',
      fields: {
        id: { type: GraphQLID },
        name: { type: GraphQLString }
      }
    });

    const QueryType = defineObjectType({
      name: 'Query',
      fields: {
        user: {
          type: UserType,
          resolve: () => ({ id: '1', name: 'Alice' })
        }
      }
    });

    const schema = defineSchema({ query: QueryType, types: [UserType] });
    const document = parse('{ user { id name } }');

    const result = await execute({ schema, document });

    expect(result.data).toEqual({
      user: { id: '1', name: 'Alice' }
    });
  });

  it('should execute list types', async () => {
    const UserType = defineObjectType({
      name: 'User',
      fields: {
        id: { type: GraphQLID },
        name: { type: GraphQLString }
      }
    });

    const QueryType = defineObjectType({
      name: 'Query',
      fields: {
        users: {
          type: GraphQLList(UserType),
          resolve: () => [
            { id: '1', name: 'Alice' },
            { id: '2', name: 'Bob' }
          ]
        }
      }
    });

    const schema = defineSchema({ query: QueryType, types: [UserType] });
    const document = parse('{ users { id name } }');

    const result = await execute({ schema, document });

    expect(result.data).toEqual({
      users: [
        { id: '1', name: 'Alice' },
        { id: '2', name: 'Bob' }
      ]
    });
  });

  it('should handle aliases', async () => {
    const QueryType = defineObjectType({
      name: 'Query',
      fields: {
        user: {
          type: GraphQLString,
          args: {
            id: { type: GraphQLID }
          },
          resolve: (_root, args) => `User: ${args.id}`
        }
      }
    });

    const schema = defineSchema({ query: QueryType });
    const document = parse('{ alice: user(id: "1"), bob: user(id: "2") }');

    const result = await execute({ schema, document });

    expect(result.data).toEqual({
      alice: 'User: 1',
      bob: 'User: 2'
    });
  });

  it('should handle __typename', async () => {
    const UserType = defineObjectType({
      name: 'User',
      fields: {
        name: { type: GraphQLString }
      }
    });

    const QueryType = defineObjectType({
      name: 'Query',
      fields: {
        user: {
          type: UserType,
          resolve: () => ({ name: 'Alice' })
        }
      }
    });

    const schema = defineSchema({ query: QueryType, types: [UserType] });
    const document = parse('{ user { __typename name } }');

    const result = await execute({ schema, document });

    expect(result.data).toEqual({
      user: { __typename: 'User', name: 'Alice' }
    });
  });

  it('should handle inline fragments', async () => {
    const UserType = defineObjectType({
      name: 'User',
      fields: {
        name: { type: GraphQLString },
        email: { type: GraphQLString }
      }
    });

    const QueryType = defineObjectType({
      name: 'Query',
      fields: {
        user: {
          type: UserType,
          resolve: () => ({ name: 'Alice', email: 'alice@example.com' })
        }
      }
    });

    const schema = defineSchema({ query: QueryType, types: [UserType] });
    const document = parse(`
      {
        user {
          ... on User {
            name
            email
          }
        }
      }
    `);

    const result = await execute({ schema, document });

    expect(result.data).toEqual({
      user: { name: 'Alice', email: 'alice@example.com' }
    });
  });

  it('should handle fragments', async () => {
    const UserType = defineObjectType({
      name: 'User',
      fields: {
        name: { type: GraphQLString },
        email: { type: GraphQLString }
      }
    });

    const QueryType = defineObjectType({
      name: 'Query',
      fields: {
        user: {
          type: UserType,
          resolve: () => ({ name: 'Alice', email: 'alice@example.com' })
        }
      }
    });

    const schema = defineSchema({ query: QueryType, types: [UserType] });
    const document = parse(`
      {
        user {
          ...UserFields
        }
      }
      fragment UserFields on User {
        name
        email
      }
    `);

    const result = await execute({ schema, document });

    expect(result.data).toEqual({
      user: { name: 'Alice', email: 'alice@example.com' }
    });
  });

  it('should handle null for nullable fields', async () => {
    const QueryType = defineObjectType({
      name: 'Query',
      fields: {
        maybeNull: {
          type: GraphQLString,
          resolve: () => null
        }
      }
    });

    const schema = defineSchema({ query: QueryType });
    const document = parse('{ maybeNull }');

    const result = await execute({ schema, document });

    expect(result.data).toEqual({ maybeNull: null });
  });

  it('should throw error for non-null fields returning null', async () => {
    const QueryType = defineObjectType({
      name: 'Query',
      fields: {
        notNull: {
          type: GraphQLNonNull(GraphQLString),
          resolve: () => null
        }
      }
    });

    const schema = defineSchema({ query: QueryType });
    const document = parse('{ notNull }');

    const result = await execute({ schema, document });

    expect(result.errors).toBeDefined();
    expect(result.errors?.length).toBeGreaterThan(0);
    expect(result.errors?.[0].message).toContain('non-nullable');
  });

  it('should handle context value', async () => {
    const QueryType = defineObjectType({
      name: 'Query',
      fields: {
        currentUser: {
          type: GraphQLString,
          resolve: (_root, _args, context) => context.currentUser
        }
      }
    });

    const schema = defineSchema({ query: QueryType });
    const document = parse('{ currentUser }');

    const result = await execute({
      schema,
      document,
      contextValue: { currentUser: 'Alice' }
    });

    expect(result.data).toEqual({ currentUser: 'Alice' });
  });

  it('should handle root value', async () => {
    const QueryType = defineObjectType({
      name: 'Query',
      fields: {
        value: {
          type: GraphQLString
        }
      }
    });

    const schema = defineSchema({ query: QueryType });
    const document = parse('{ value }');

    const result = await execute({
      schema,
      document,
      rootValue: { value: 'from root' }
    });

    expect(result.data).toEqual({ value: 'from root' });
  });

  it('should pass info to resolver', async () => {
    const resolver = jest.fn(() => 'test');
    const QueryType = defineObjectType({
      name: 'Query',
      fields: {
        test: {
          type: GraphQLString,
          resolve: resolver
        }
      }
    });

    const schema = defineSchema({ query: QueryType });
    const document = parse('{ test }');

    await execute({ schema, document });

    expect(resolver).toHaveBeenCalled();
    const calls = resolver.mock.calls as any[][];
    const info = calls[0][3];
    expect(info).toBeDefined();
    expect(info.fieldName).toBe('test');
    expect(info.parentType.name).toBe('Query');
  });

  it('should handle deeply nested lists', async () => {
    const ItemType = defineObjectType({
      name: 'Item',
      fields: {
        id: { type: GraphQLID }
      }
    });

    const QueryType = defineObjectType({
      name: 'Query',
      fields: {
        items: {
          type: GraphQLList(GraphQLList(ItemType)),
          resolve: () => [
            [{ id: '1' }, { id: '2' }],
            [{ id: '3' }]
          ]
        }
      }
    });

    const schema = defineSchema({ query: QueryType, types: [ItemType] });
    const document = parse('{ items { id } }');

    const result = await execute({ schema, document });

    expect(result.data).toEqual({
      items: [
        [{ id: '1' }, { id: '2' }],
        [{ id: '3' }]
      ]
    });
  });
});

describe('DataLoader Integration', () => {
  it('should batch requests using DataLoader', async () => {
    const batchFn = jest.fn(async (keys: string[]) => {
      return keys.map(id => ({ id, name: `User ${id}` }));
    });

    const userLoader = createDataLoader(batchFn);

    const UserType = defineObjectType({
      name: 'User',
      fields: {
        id: { type: GraphQLID },
        name: { type: GraphQLString }
      }
    });

    const QueryType = defineObjectType({
      name: 'Query',
      fields: {
        users: {
          type: GraphQLList(UserType),
          args: {
            ids: { type: GraphQLNonNull(GraphQLList(GraphQLNonNull(GraphQLID))) }
          },
          resolve: async (_root, args) => {
            return Promise.all(args.ids.map((id: string) => userLoader.load(id)));
          }
        }
      }
    });

    const schema = defineSchema({ query: QueryType, types: [UserType] });
    const document = parse('{ users(ids: ["1", "2", "3"]) { id name } }');

    const result = await execute({ schema, document });

    expect(result.data).toEqual({
      users: [
        { id: '1', name: 'User 1' },
        { id: '2', name: 'User 2' },
        { id: '3', name: 'User 3' }
      ]
    });
    expect(batchFn).toHaveBeenCalledTimes(1);
    expect(batchFn).toHaveBeenCalledWith(['1', '2', '3']);
  });

  it('should handle N+1 scenario with DataLoader', async () => {
    const mockDB = {
      users: [
        { id: '1', name: 'Alice' },
        { id: '2', name: 'Bob' }
      ],
      posts: [
        { id: 'p1', title: 'Post 1', authorId: '1' },
        { id: 'p2', title: 'Post 2', authorId: '1' },
        { id: 'p3', title: 'Post 3', authorId: '2' }
      ]
    };

    const postsByAuthorBatchFn = jest.fn(async (authorIds: string[]) => {
      return authorIds.map(authorId =>
        mockDB.posts.filter(p => p.authorId === authorId)
      );
    });

    const postsByAuthorLoader = createDataLoader(postsByAuthorBatchFn);

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
        name: { type: GraphQLString },
        posts: {
          type: GraphQLList(PostType),
          resolve: (user) => postsByAuthorLoader.load(user.id)
        }
      }
    });

    const QueryType = defineObjectType({
      name: 'Query',
      fields: {
        users: {
          type: GraphQLList(UserType),
          resolve: () => mockDB.users
        }
      }
    });

    const schema = defineSchema({ query: QueryType, types: [UserType, PostType] });
    const document = parse('{ users { name posts { title } } }');

    const result = await execute({ schema, document });

    expect(result.data).toEqual({
      users: [
        { name: 'Alice', posts: [{ title: 'Post 1' }, { title: 'Post 2' }] },
        { name: 'Bob', posts: [{ title: 'Post 3' }] }
      ]
    });

    expect(postsByAuthorBatchFn).toHaveBeenCalledTimes(1);
    expect(postsByAuthorBatchFn).toHaveBeenCalledWith(['1', '2']);
  });
});
