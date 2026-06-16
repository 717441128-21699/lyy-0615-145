import { graphql } from './graphql';
import {
  schema,
  createDataLoaders,
  resetQueryCounter,
  getQueryCount,
  getQueryLog,
  Context
} from './example-schema';
import { printSchema } from './schema';

async function demo() {
  console.log('='.repeat(80));
  console.log('GraphQL Engine Demo');
  console.log('='.repeat(80));

  console.log('\n📋 Schema Definition:');
  console.log('-'.repeat(80));
  console.log(printSchema(schema));
  console.log('-'.repeat(80));

  const section = (title: string) => {
    console.log('\n' + '='.repeat(80));
    console.log(` ${title}`);
    console.log('='.repeat(80));
  };

  const testQuery = async (
    name: string,
    query: string,
    variables?: Record<string, any>,
    useDataLoader: boolean = false
  ) => {
    console.log(`\n🔍 Query: ${name}`);
    console.log(query);
    if (variables) {
      console.log(`\n📊 Variables: ${JSON.stringify(variables, null, 2)}`);
    }
    console.log(`\n⚙️  DataLoader: ${useDataLoader ? 'ENABLED' : 'DISABLED'}`);
    console.log('-'.repeat(80));

    resetQueryCounter();

    const context: Context = {
      loaders: createDataLoaders(),
      useDataLoader
    };

    const result = await graphql({
      schema,
      source: query,
      variableValues: variables,
      contextValue: context,
      complexityOptions: {
        maxDepth: 10,
        maxComplexity: 1000
      }
    });

    console.log('\n✅ Result:');
    console.log(JSON.stringify(result, null, 2));
    console.log(`\n📈 DB Query Count: ${getQueryCount()}`);
    console.log('📋 Query Log:');
    getQueryLog().forEach((q, i) => console.log(`   ${i + 1}. ${q}`));

    return result;
  };

  section('1. Basic Query - Single Field');
  await testQuery(
    'Get single user',
    `
    query GetUser($id: ID!) {
      user(id: $id) {
        id
        name
        email
      }
    }
    `,
    { id: '1' }
  );

  section('2. N+1 Problem Demo - Without DataLoader');
  console.log('\n⚠️  This query demonstrates the N+1 problem:');
  console.log('   - 1 query to get all users');
  console.log('   - N queries to get posts for each user (N = number of users)');
  console.log('   - Total: N+1 queries');

  await testQuery(
    'Get all users with their posts (WITHOUT DataLoader)',
    `
    query GetAllUsersWithPosts {
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
    undefined,
    false
  );

  section('3. N+1 Solution - With DataLoader');
  console.log('\n✅ This query demonstrates DataLoader batching:');
  console.log('   - 1 query to get all users');
  console.log('   - 1 BATCH query to get all posts for all users');
  console.log('   - Total: 2 queries (instead of N+1)');

  await testQuery(
    'Get all users with their posts (WITH DataLoader)',
    `
    query GetAllUsersWithPosts {
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
    undefined,
    true
  );

  section('4. Deep Nested Query - Reverse N+1');
  console.log('\n⚠️  Reverse N+1: Getting posts then their authors');
  console.log('   - 1 query to get all posts');
  console.log('   - N queries to get author for each post');

  await testQuery(
    'Get all posts with their authors (WITHOUT DataLoader)',
    `
    query GetAllPostsWithAuthors {
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
    undefined,
    false
  );

  section('5. Deep Nested Query - DataLoader Solution');
  console.log('\n✅ DataLoader batches the author lookups:');
  console.log('   - 1 query to get all posts');
  console.log('   - 1 BATCH query to get all authors');
  console.log('   - Total: 2 queries');

  await testQuery(
    'Get all posts with their authors (WITH DataLoader)',
    `
    query GetAllPostsWithAuthors {
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
    undefined,
    true
  );

  section('6. Query with Arguments and Aliases');
  await testQuery(
    'Get multiple users with aliases',
    `
    query GetTwoUsers {
      alice: user(id: "1") {
        name
        email
      }
      bob: user(id: "2") {
        name
        email
      }
    }
    `,
    undefined,
    true
  );

  section('7. Query Depth and Complexity Analysis');
  console.log('\n📊 The following queries demonstrate depth and complexity limits:');

  const deepQuery = `
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
  `;

  console.log('\nQuery:');
  console.log(deepQuery);

  const context: Context = {
    loaders: createDataLoaders(),
    useDataLoader: true
  };

  const result = await graphql({
    schema,
    source: deepQuery,
    contextValue: context,
    complexityOptions: {
      maxDepth: 3,
      maxComplexity: 50
    }
  });

  console.log('\nResult with maxDepth=3:');
  console.log(JSON.stringify(result, null, 2));

  section('8. Explanation of How DataLoader Works');
  console.log(`
📚 DataLoader Mechanism Explained:

1. **Collect Phase (Same Event Loop Tick)**:
   - When multiple load() calls are made synchronously or in the same microtask,
     DataLoader collects all the keys into a batch queue.
   - This happens because DataLoader uses Promise.resolve().then() to defer
     execution until the next microtask.

2. **Event Loop Tick Boundary**:
   - JavaScript's event loop processes all synchronous code first,
     then processes microtasks (Promises),
     then processes macrotasks (setTimeout, I/O).
   - DataLoader uses this to ensure all load() calls in the current tick
     are collected before dispatching the batch.

3. **Dispatch Phase (Next Tick)**:
   - All collected keys are passed to the batch function as a single array.
   - The batch function performs a single optimized query.
   - Results are mapped back to individual load() callers.

4. **Caching**:
   - DataLoader also provides per-request caching.
   - If the same key is requested again in the same request,
     it returns the cached promise.

🔍 The N+1 Problem and Solution:

   WITHOUT DataLoader:
   users() → SELECT * FROM users (1 query)
     user1.posts → SELECT * FROM posts WHERE authorId = '1' (query #2)
     user2.posts → SELECT * FROM posts WHERE authorId = '2' (query #3)
     user3.posts → SELECT * FROM posts WHERE authorId = '3' (query #4)
   Total: 4 queries for 3 users = N+1

   WITH DataLoader:
   users() → SELECT * FROM users (1 query)
     user1.posts → loader.load('1') → adds '1' to batch
     user2.posts → loader.load('2') → adds '2' to batch
     user3.posts → loader.load('3') → adds '3' to batch
   [event loop tick boundary]
     batch function called with ['1', '2', '3']
     → SELECT * FROM posts WHERE authorId IN ('1', '2', '3') (query #2)
   Total: 2 queries regardless of N

🛡️ Query Depth and Complexity Protection:

   - **Depth Limit**: Prevents infinitely nested queries that could cause
     stack overflows or excessive database joins.
     Example: user.posts.author.posts.author... has depth 5.

   - **Complexity Limit**: Each field has a complexity score.
     List fields multiply complexity by the number of items.
     Prevents queries like { users(first: 1000) { posts { author { posts } } } }
     from requesting millions of records.
  `);

  section('9. Invalid Query - Validation Error');
  console.log('\n❌ This query will fail validation because field does not exist:');

  await testQuery(
    'Invalid query - non-existent field',
    `
    query InvalidQuery {
      users {
        id
        name
        nonExistentField
      }
    }
    `
  );

  section('10. Inline Fragments');
  await testQuery(
    'Query with inline fragments',
    `
    query GetUsersWithInline {
      users {
        ... on User {
          name
          posts {
            title
          }
        }
      }
    }
    `,
    undefined,
    true
  );

  console.log('\n' + '='.repeat(80));
  console.log('Demo Complete!');
  console.log('='.repeat(80));
}

demo().catch(console.error);
