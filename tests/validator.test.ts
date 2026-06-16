import { parse } from '../src/parser';
import { validate } from '../src/validator';
import {
  defineObjectType,
  defineSchema,
  GraphQLString,
  GraphQLInt,
  GraphQLID,
  GraphQLNonNull,
  GraphQLList
} from '../src/schema';

const UserType = defineObjectType({
  name: 'User',
  fields: {
    id: { type: GraphQLNonNull(GraphQLID) },
    name: { type: GraphQLString },
    age: { type: GraphQLInt }
  }
});

const QueryType = defineObjectType({
  name: 'Query',
  fields: {
    user: {
      type: UserType,
      args: {
        id: { type: GraphQLNonNull(GraphQLID) }
      }
    },
    users: {
      type: GraphQLList(UserType)
    },
    hello: {
      type: GraphQLString
    }
  }
});

const schema = defineSchema({ query: QueryType, types: [UserType] });

describe('Validator', () => {
  it('should validate valid query', () => {
    const source = `
      query GetUser($id: ID!) {
        user(id: $id) {
          id
          name
        }
      }
    `;
    const document = parse(source);
    const errors = validate(schema, document);
    expect(errors).toEqual([]);
  });

  it('should detect non-existent field', () => {
    const source = `
      {
        user(id: "1") {
          nonExistentField
        }
      }
    `;
    const document = parse(source);
    const errors = validate(schema, document);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('nonExistentField');
    expect(errors[0].message).toContain('does not exist');
  });

  it('should detect missing required arguments', () => {
    const source = `
      {
        user {
          name
        }
      }
    `;
    const document = parse(source);
    const errors = validate(schema, document);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain('id');
    expect(errors[0].message).toContain('not provided');
  });

  it('should detect non-existent argument', () => {
    const source = `
      {
        user(id: "1", invalidArg: "test") {
          name
        }
      }
    `;
    const document = parse(source);
    const errors = validate(schema, document);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('invalidArg');
    expect(errors[0].message).toContain('Unknown argument');
  });

  it('should detect missing selection set on object type', () => {
    const source = `
      {
        user(id: "1")
      }
    `;
    const document = parse(source);
    const errors = validate(schema, document);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain('must have a selection set');
  });

  it('should detect selection set on scalar type', () => {
    const source = `
      {
        hello {
          subField
        }
      }
    `;
    const document = parse(source);
    const errors = validate(schema, document);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('must not have a selection set');
  });

  it('should detect undefined variable', () => {
    const source = `
      {
        user(id: $undefinedVar) {
          name
        }
      }
    `;
    const document = parse(source);
    const errors = validate(schema, document);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('$undefinedVar');
    expect(errors[0].message).toContain('not defined');
  });

  it('should detect unused variable', () => {
    const source = `
      query GetUser($unused: String) {
        user(id: "1") {
          name
        }
      }
    `;
    const document = parse(source);
    const errors = validate(schema, document);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('$unused');
    expect(errors[0].message).toContain('defined but not used');
  });

  it('should detect undefined fragment', () => {
    const source = `
      {
        user(id: "1") {
          ...UserFields
        }
      }
    `;
    const document = parse(source);
    const errors = validate(schema, document);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('UserFields');
    expect(errors[0].message).toContain('not defined');
  });

  it('should detect fragment cycles', () => {
    const source = `
      {
        user(id: "1") {
          ...A
        }
      }
      fragment A on User {
        ...B
      }
      fragment B on User {
        ...A
      }
    `;
    const document = parse(source);
    const errors = validate(schema, document);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('forms a cycle');
  });

  it('should detect duplicate fragments', () => {
    const source = `
      {
        user(id: "1") {
          ...UserFields
        }
      }
      fragment UserFields on User {
        name
      }
      fragment UserFields on User {
        age
      }
    `;
    const document = parse(source);
    const errors = validate(schema, document);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('multiple times');
  });

  it('should detect unknown type in fragment', () => {
    const source = `
      {
        user(id: "1") {
          ...UnknownTypeFields
        }
      }
      fragment UnknownTypeFields on UnknownType {
        name
      }
    `;
    const document = parse(source);
    const errors = validate(schema, document);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain('Unknown type');
  });

  it('should validate inline fragments', () => {
    const source = `
      {
        user(id: "1") {
          ... on User {
            name
          }
        }
      }
    `;
    const document = parse(source);
    const errors = validate(schema, document);
    expect(errors).toEqual([]);
  });

  it('should detect __typename', () => {
    const source = `
      {
        user(id: "1") {
          __typename
          name
        }
      }
    `;
    const document = parse(source);
    const errors = validate(schema, document);
    expect(errors).toEqual([]);
  });
});
