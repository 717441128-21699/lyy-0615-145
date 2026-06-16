import {
  createLexer,
  tokenize
} from './lexer';
import {
  Token,
  TokenKind,
  ASTNodeKind,
  NameNode,
  VariableNode,
  ArgumentNode,
  ValueNode,
  ObjectFieldNode,
  FieldNode,
  SelectionSetNode,
  SelectionNode,
  FragmentSpreadNode,
  InlineFragmentNode,
  FragmentDefinitionNode,
  VariableDefinitionNode,
  OperationDefinitionNode,
  DocumentNode,
  DefinitionNode
} from './types';

class Parser {
  private tokens: Token[];
  private pos: number = 0;

  constructor(source: string) {
    this.tokens = tokenize(source);
  }

  private peek(): Token {
    return this.tokens[this.pos];
  }

  private advance(): Token {
    return this.tokens[this.pos++];
  }

  private expect(kind: TokenKind, value?: string): Token {
    const token = this.advance();
    if (token.kind !== kind || (value !== undefined && token.value !== value)) {
      throw new Error(
        `Expected ${kind}${value ? ` "${value}"` : ''}, got ${token.kind} "${token.value}" ` +
        `at line ${token.loc.line}, column ${token.loc.column}`
      );
    }
    return token;
  }

  private expectKeyword(value: string): Token {
    return this.expect(TokenKind.NAME, value);
  }

  private expectPunctuator(value: string): Token {
    return this.expect(TokenKind.PUNCTUATOR, value);
  }

  parseDocument(): DocumentNode {
    const definitions: DefinitionNode[] = [];
    while (this.peek().kind !== TokenKind.EOF) {
      definitions.push(this.parseDefinition());
    }
    return {
      kind: ASTNodeKind.DOCUMENT,
      definitions
    };
  }

  private parseDefinition(): DefinitionNode {
    const token = this.peek();
    if (token.kind === TokenKind.NAME) {
      if (token.value === 'query' || token.value === 'mutation' || token.value === 'subscription') {
        return this.parseOperationDefinition();
      }
      if (token.value === 'fragment') {
        return this.parseFragmentDefinition();
      }
    }
    if (token.kind === TokenKind.PUNCTUATOR && token.value === '{') {
      return this.parseOperationDefinition();
    }
    throw new Error(`Unexpected token: ${token.value}`);
  }

  private parseOperationDefinition(): OperationDefinitionNode {
    const startToken = this.peek();

    if (startToken.kind === TokenKind.PUNCTUATOR && startToken.value === '{') {
      return {
        kind: ASTNodeKind.OPERATION_DEFINITION,
        operation: 'query',
        selectionSet: this.parseSelectionSet()
      };
    }

    const operation = this.parseOperationType();
    let name: NameNode | undefined;
    let variableDefinitions: VariableDefinitionNode[] | undefined;

    if (this.peek().kind === TokenKind.NAME) {
      name = this.parseName();
    }

    if (this.peek().kind === TokenKind.PUNCTUATOR && this.peek().value === '(') {
      variableDefinitions = this.parseVariableDefinitions();
    }

    return {
      kind: ASTNodeKind.OPERATION_DEFINITION,
      operation,
      name,
      variableDefinitions,
      selectionSet: this.parseSelectionSet()
    };
  }

  private parseOperationType(): 'query' | 'mutation' | 'subscription' {
    const token = this.advance();
    if (token.value === 'query') return 'query';
    if (token.value === 'mutation') return 'mutation';
    if (token.value === 'subscription') return 'subscription';
    throw new Error(`Expected operation type, got: ${token.value}`);
  }

  private parseVariableDefinitions(): VariableDefinitionNode[] {
    this.expectPunctuator('(');
    const definitions: VariableDefinitionNode[] = [];
    while (this.peek().value !== ')') {
      definitions.push(this.parseVariableDefinition());
    }
    this.expectPunctuator(')');
    return definitions;
  }

  private parseVariableDefinition(): VariableDefinitionNode {
    const variable = this.parseVariable();
    this.expectPunctuator(':');
    const type = this.parseTypeReference();
    let defaultValue: ValueNode | undefined;
    if (this.peek().value === '=') {
      this.advance();
      defaultValue = this.parseValueLiteral();
    }
    return {
      kind: ASTNodeKind.VARIABLE_DEFINITION,
      variable,
      type,
      defaultValue
    };
  }

  private parseTypeReference(): any {
    let type: any;
    if (this.peek().value === '[') {
      this.advance();
      type = {
        kind: 'ListType',
        type: this.parseTypeReference()
      };
      this.expectPunctuator(']');
    } else {
      type = {
        kind: 'NamedType',
        name: this.parseName()
      };
    }
    if (this.peek().value === '!') {
      this.advance();
      type = {
        kind: 'NonNullType',
        type
      };
    }
    return type;
  }

  private parseSelectionSet(): SelectionSetNode {
    this.expectPunctuator('{');
    const selections: SelectionNode[] = [];
    while (this.peek().value !== '}') {
      selections.push(this.parseSelection());
    }
    this.expectPunctuator('}');
    return {
      kind: ASTNodeKind.SELECTION_SET,
      selections
    };
  }

  private parseSelection(): SelectionNode {
    if (this.peek().value === '...') {
      return this.parseFragment();
    }
    return this.parseField();
  }

  private parseField(): FieldNode {
    let alias: NameNode | undefined;
    let name = this.parseName();

    if (this.peek().value === ':') {
      this.advance();
      alias = name;
      name = this.parseName();
    }

    let args: ArgumentNode[] | undefined;
    if (this.peek().value === '(') {
      args = this.parseArguments();
    }

    let selectionSet: SelectionSetNode | undefined;
    if (this.peek().value === '{') {
      selectionSet = this.parseSelectionSet();
    }

    return {
      kind: ASTNodeKind.FIELD,
      alias,
      name,
      arguments: args,
      selectionSet
    };
  }

  private parseArguments(): ArgumentNode[] {
    this.expectPunctuator('(');
    const args: ArgumentNode[] = [];
    while (this.peek().value !== ')') {
      args.push(this.parseArgument());
    }
    this.expectPunctuator(')');
    return args;
  }

  private parseArgument(): ArgumentNode {
    const name = this.parseName();
    this.expectPunctuator(':');
    const value = this.parseValueLiteral();
    return {
      kind: ASTNodeKind.ARGUMENT,
      name,
      value
    };
  }

  private parseFragment(): FragmentSpreadNode | InlineFragmentNode {
    this.expectPunctuator('...');
    if (this.peek().kind === TokenKind.NAME && this.peek().value !== 'on') {
      return {
        kind: ASTNodeKind.FRAGMENT_SPREAD,
        name: this.parseName()
      };
    }

    let typeCondition: NameNode | undefined;
    if (this.peek().value === 'on') {
      this.advance();
      typeCondition = this.parseName();
    }

    return {
      kind: ASTNodeKind.INLINE_FRAGMENT,
      typeCondition,
      selectionSet: this.parseSelectionSet()
    };
  }

  private parseFragmentDefinition(): FragmentDefinitionNode {
    this.expectKeyword('fragment');
    const name = this.parseName();
    this.expectKeyword('on');
    const typeCondition = this.parseName();
    return {
      kind: ASTNodeKind.FRAGMENT_DEFINITION,
      name,
      typeCondition,
      selectionSet: this.parseSelectionSet()
    };
  }

  private parseName(): NameNode {
    const token = this.expect(TokenKind.NAME);
    return {
      kind: ASTNodeKind.NAME,
      value: token.value,
      loc: token.loc
    };
  }

  private parseVariable(): VariableNode {
    this.expectPunctuator('$');
    return {
      kind: ASTNodeKind.VARIABLE,
      name: this.parseName()
    };
  }

  private parseValueLiteral(): ValueNode {
    const token = this.peek();

    if (token.value === '$') {
      return this.parseVariable();
    }

    if (token.value === '[') {
      return this.parseList();
    }

    if (token.value === '{') {
      return this.parseObject();
    }

    if (token.value === 'true' || token.value === 'false') {
      this.advance();
      return {
        kind: 'BooleanValue',
        value: token.value === 'true'
      };
    }

    if (token.value === 'null') {
      this.advance();
      return {
        kind: 'NullValue'
      };
    }

    if (token.kind === TokenKind.INT) {
      this.advance();
      return {
        kind: ASTNodeKind.INT,
        value: token.value
      };
    }

    if (token.kind === TokenKind.FLOAT) {
      this.advance();
      return {
        kind: ASTNodeKind.FLOAT,
        value: token.value
      };
    }

    if (token.kind === TokenKind.STRING) {
      this.advance();
      return {
        kind: ASTNodeKind.STRING,
        value: token.value
      };
    }

    if (token.kind === TokenKind.NAME) {
      return this.parseName();
    }

    throw new Error(`Unexpected token: ${token.value}`);
  }

  private parseList(): ValueNode {
    this.expectPunctuator('[');
    const values: ValueNode[] = [];
    while (this.peek().value !== ']') {
      values.push(this.parseValueLiteral());
    }
    this.expectPunctuator(']');
    return {
      kind: ASTNodeKind.LIST,
      values
    };
  }

  private parseObject(): ValueNode {
    this.expectPunctuator('{');
    const fields: ObjectFieldNode[] = [];
    while (this.peek().value !== '}') {
      fields.push(this.parseObjectField());
    }
    this.expectPunctuator('}');
    return {
      kind: ASTNodeKind.OBJECT,
      fields
    };
  }

  private parseObjectField(): ObjectFieldNode {
    const name = this.parseName();
    this.expectPunctuator(':');
    const value = this.parseValueLiteral();
    return {
      kind: ASTNodeKind.OBJECT_FIELD,
      name,
      value
    };
  }
}

export function parse(source: string): DocumentNode {
  const parser = new Parser(source);
  return parser.parseDocument();
}
