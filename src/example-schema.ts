import {
  defineObjectType,
  defineSchema,
  GraphQLInt,
  GraphQLString,
  GraphQLID,
  GraphQLNonNull,
  GraphQLList,
  GraphQLField
} from './schema';
import { createDataLoader } from './dataloader';
import type { DataLoader } from './dataloader';
import { GraphQLObjectType, GraphQLType } from './types';

export interface User {
  id: string;
  name: string;
  email: string;
}

export interface Post {
  id: string;
  title: string;
  content: string;
  authorId: string;
}

export const mockUsers: User[] = [
  { id: '1', name: 'Alice', email: 'alice@example.com' },
  { id: '2', name: 'Bob', email: 'bob@example.com' },
  { id: '3', name: 'Charlie', email: 'charlie@example.com' },
];

export const mockPosts: Post[] = [
  { id: '101', title: 'GraphQL Basics', content: 'Introduction to GraphQL', authorId: '1' },
  { id: '102', title: 'Advanced GraphQL', content: 'Deep dive into GraphQL', authorId: '1' },
  { id: '103', title: 'REST vs GraphQL', content: 'Comparison of API paradigms', authorId: '2' },
  { id: '104', title: 'DataLoader Pattern', content: 'Solving N+1 queries', authorId: '2' },
  { id: '105', title: 'GraphQL Security', content: 'Securing your GraphQL API', authorId: '3' },
];

let queryCount = 0;
let queryLog: string[] = [];

export function resetQueryCounter(): void {
  queryCount = 0;
  queryLog = [];
}

export function getQueryCount(): number {
  return queryCount;
}

export function getQueryLog(): string[] {
  return [...queryLog];
}

function logQuery(query: string): void {
  queryCount++;
  queryLog.push(query);
  console.log(`[DB Query #${queryCount}] ${query}`);
}

export function findUserById(id: string): User | undefined {
  logQuery(`SELECT * FROM users WHERE id = '${id}'`);
  return mockUsers.find(u => u.id === id);
}

export function findUsersByIds(ids: string[]): User[] {
  logQuery(`SELECT * FROM users WHERE id IN (${ids.map(id => `'${id}'`).join(', ')})`);
  return ids.map(id => mockUsers.find(u => u.id === id)).filter(Boolean) as User[];
}

export function findPostsByAuthorId(authorId: string): Post[] {
  logQuery(`SELECT * FROM posts WHERE authorId = '${authorId}'`);
  return mockPosts.filter(p => p.authorId === authorId);
}

export function findPostsByAuthorIds(authorIds: string[]): Post[][] {
  logQuery(`SELECT * FROM posts WHERE authorId IN (${authorIds.map(id => `'${id}'`).join(', ')})`);
  const allPosts = mockPosts.filter(p => authorIds.includes(p.authorId));
  return authorIds.map(authorId => allPosts.filter(p => p.authorId === authorId));
}

export function getAllUsers(): User[] {
  logQuery('SELECT * FROM users');
  return [...mockUsers];
}

export function getAllPosts(): Post[] {
  logQuery('SELECT * FROM posts');
  return [...mockPosts];
}

export interface DataLoaders {
  userLoader: DataLoader<string, User | undefined>;
  postsByAuthorLoader: DataLoader<string, Post[]>;
}

export function createDataLoaders(): DataLoaders {
  const userLoader = createDataLoader<string, User | undefined>(
    async (keys: string[]) => {
      console.log(`[DataLoader] Batching users: [${keys.join(', ')}]`);
      const users = findUsersByIds(keys);
      return keys.map(key => users.find(u => u?.id === key));
    }
  );

  const postsByAuthorLoader = createDataLoader<string, Post[]>(
    async (authorIds: string[]) => {
      console.log(`[DataLoader] Batching posts for authors: [${authorIds.join(', ')}]`);
      return findPostsByAuthorIds(authorIds);
    }
  );

  return { userLoader, postsByAuthorLoader };
}

export interface Context {
  loaders: DataLoaders;
  useDataLoader: boolean;
}

export let UserType: GraphQLObjectType;
export let PostType: GraphQLObjectType;

UserType = defineObjectType({
  name: 'User',
  description: 'A user of the system',
  fields: {
    id: {
      type: GraphQLNonNull(GraphQLID),
      description: 'The unique identifier of the user'
    },
    name: {
      type: GraphQLNonNull(GraphQLString),
      description: 'The name of the user'
    },
    email: {
      type: GraphQLNonNull(GraphQLString),
      description: 'The email of the user'
    }
  }
});

PostType = defineObjectType({
  name: 'Post',
  description: 'A blog post',
  fields: {
    id: {
      type: GraphQLNonNull(GraphQLID),
      description: 'The unique identifier of the post'
    },
    title: {
      type: GraphQLNonNull(GraphQLString),
      description: 'The title of the post'
    },
    content: {
      type: GraphQLNonNull(GraphQLString),
      description: 'The content of the post'
    },
    author: {
      type: GraphQLNonNull(UserType),
      description: 'The author of the post',
      resolve: async (post: Post, _args: any, context: Context) => {
        if (context.useDataLoader) {
          return context.loaders.userLoader.load(post.authorId);
        }
        return findUserById(post.authorId);
      },
      complexity: 2
    }
  }
});

const postsField: GraphQLField = {
  name: 'posts',
  type: GraphQLNonNull(GraphQLList(GraphQLNonNull(PostType))),
  description: 'Posts written by this user',
  resolve: async (user: User, _args: any, context: Context) => {
    if (context.useDataLoader) {
      return context.loaders.postsByAuthorLoader.load(user.id);
    }
    return findPostsByAuthorId(user.id);
  },
  complexity: 5
};

UserType.fields['posts'] = postsField;

export const QueryType = defineObjectType({
  name: 'Query',
  description: 'The root query type',
  fields: {
    user: {
      type: UserType,
      description: 'Get a user by ID',
      args: {
        id: {
          type: GraphQLNonNull(GraphQLID),
          description: 'The ID of the user'
        }
      },
      resolve: async (_root: any, args: { id: string }, context: Context) => {
        if (context.useDataLoader) {
          return context.loaders.userLoader.load(args.id);
        }
        return findUserById(args.id);
      },
      complexity: 1
    },
    users: {
      type: GraphQLNonNull(GraphQLList(GraphQLNonNull(UserType))),
      description: 'Get all users',
      resolve: () => getAllUsers(),
      complexity: 1
    },
    post: {
      type: PostType,
      description: 'Get a post by ID',
      args: {
        id: {
          type: GraphQLNonNull(GraphQLID),
          description: 'The ID of the post'
        }
      },
      resolve: (_root: any, args: { id: string }) => {
        logQuery(`SELECT * FROM posts WHERE id = '${args.id}'`);
        return mockPosts.find(p => p.id === args.id);
      },
      complexity: 1
    },
    posts: {
      type: GraphQLNonNull(GraphQLList(GraphQLNonNull(PostType))),
      description: 'Get all posts',
      args: {
        first: {
          type: GraphQLInt,
          description: 'Limit the number of posts returned'
        }
      },
      resolve: (_root: any, args: { first?: number }) => {
        const posts = getAllPosts();
        return args.first ? posts.slice(0, args.first) : posts;
      },
      complexity: 1
    }
  }
});

export const schema = defineSchema({
  query: QueryType,
  types: [UserType, PostType]
});
