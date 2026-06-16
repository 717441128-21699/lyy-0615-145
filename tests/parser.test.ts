import { parse } from '../src/parser';
import { ASTNodeKind } from '../src/types';

describe('Parser', () => {
  it('should parse simple query', () => {
    const source = `
      query GetUser {
        user(id: "1") {
          name
          email
        }
      }
    `;
    const document = parse(source);
    expect(document.kind).toBe(ASTNodeKind.DOCUMENT);
    expect(document.definitions.length).toBe(1);

    const operation = document.definitions[0] as any;
    expect(operation.kind).toBe(ASTNodeKind.OPERATION_DEFINITION);
    expect(operation.operation).toBe('query');
    expect(operation.name?.value).toBe('GetUser');
  });

  it('should parse anonymous query', () => {
    const source = '{ user { name } }';
    const document = parse(source);
    const operation = document.definitions[0] as any;
    expect(operation.operation).toBe('query');
    expect(operation.name).toBeUndefined();
  });

  it('should parse fields with arguments', () => {
    const source = '{ user(id: "1", limit: 10) { name } }';
    const document = parse(source);
    const operation = document.definitions[0] as any;
    const field = operation.selectionSet.selections[0];
    expect(field.arguments.length).toBe(2);
    expect(field.arguments[0].name.value).toBe('id');
    expect(field.arguments[1].name.value).toBe('limit');
  });

  it('should parse nested fields', () => {
    const source = `
      {
        user {
          posts {
            title
            author {
              name
            }
          }
        }
      }
    `;
    const document = parse(source);
    const operation = document.definitions[0] as any;
    const userField = operation.selectionSet.selections[0];
    const postsField = userField.selectionSet.selections[0];
    const authorField = postsField.selectionSet.selections[1];
    expect(authorField.selectionSet.selections[0].name.value).toBe('name');
  });

  it('should parse aliases', () => {
    const source = '{ alice: user(id: "1") { name } }';
    const document = parse(source);
    const operation = document.definitions[0] as any;
    const field = operation.selectionSet.selections[0];
    expect(field.alias.value).toBe('alice');
    expect(field.name.value).toBe('user');
  });

  it('should parse variables', () => {
    const source = `
      query GetUser($id: ID!) {
        user(id: $id) {
          name
        }
      }
    `;
    const document = parse(source);
    const operation = document.definitions[0] as any;
    expect(operation.variableDefinitions.length).toBe(1);
    expect(operation.variableDefinitions[0].variable.name.value).toBe('id');
  });

  it('should parse fragments', () => {
    const source = `
      query GetUser {
        user {
          ...UserFields
        }
      }
      fragment UserFields on User {
        name
        email
      }
    `;
    const document = parse(source);
    expect(document.definitions.length).toBe(2);
    const fragment = document.definitions[1] as any;
    expect(fragment.kind).toBe(ASTNodeKind.FRAGMENT_DEFINITION);
    expect(fragment.name.value).toBe('UserFields');
  });

  it('should parse inline fragments', () => {
    const source = `
      {
        user {
          ... on User {
            name
          }
        }
      }
    `;
    const document = parse(source);
    const operation = document.definitions[0] as any;
    const selection = operation.selectionSet.selections[0].selectionSet.selections[0];
    expect(selection.kind).toBe(ASTNodeKind.INLINE_FRAGMENT);
  });

  it('should parse list values', () => {
    const source = '{ users(ids: ["1", "2", "3"]) { name } }';
    const document = parse(source);
    const operation = document.definitions[0] as any;
    const field = operation.selectionSet.selections[0];
    const arg = field.arguments[0];
    expect(arg.value.kind).toBe(ASTNodeKind.LIST);
    expect(arg.value.values.length).toBe(3);
  });

  it('should parse object values', () => {
    const source = '{ user(filter: { name: "Alice", minAge: 18 }) { name } }';
    const document = parse(source);
    const operation = document.definitions[0] as any;
    const field = operation.selectionSet.selections[0];
    const arg = field.arguments[0];
    expect(arg.value.kind).toBe(ASTNodeKind.OBJECT);
    expect(arg.value.fields.length).toBe(2);
  });

  it('should parse booleans', () => {
    const source = '{ users(active: true) { name } }';
    const document = parse(source);
    const operation = document.definitions[0] as any;
    const arg = operation.selectionSet.selections[0].arguments[0];
    expect(arg.value.kind).toBe('BooleanValue');
    expect(arg.value.value).toBe(true);
  });

  it('should parse null', () => {
    const source = '{ user(id: null) { name } }';
    const document = parse(source);
    const operation = document.definitions[0] as any;
    const arg = operation.selectionSet.selections[0].arguments[0];
    expect(arg.value.kind).toBe('NullValue');
  });
});
