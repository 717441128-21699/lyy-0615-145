import { tokenize, createLexer } from '../src/lexer';
import { TokenKind } from '../src/types';

describe('Lexer', () => {
  describe('tokenize', () => {
    it('should tokenize simple query', () => {
      const source = '{ user(id: "1") { name } }';
      const tokens = tokenize(source);

      expect(tokens.length).toBeGreaterThan(0);
      expect(tokens[0].kind).toBe(TokenKind.PUNCTUATOR);
      expect(tokens[0].value).toBe('{');
      expect(tokens[1].kind).toBe(TokenKind.NAME);
      expect(tokens[1].value).toBe('user');
    });

    it('should tokenize strings', () => {
      const tokens = tokenize('"hello world"');
      expect(tokens[0].kind).toBe(TokenKind.STRING);
      expect(tokens[0].value).toBe('hello world');
    });

    it('should tokenize integers', () => {
      const tokens = tokenize('123');
      expect(tokens[0].kind).toBe(TokenKind.INT);
      expect(tokens[0].value).toBe('123');
    });

    it('should tokenize floats', () => {
      const tokens = tokenize('123.456');
      expect(tokens[0].kind).toBe(TokenKind.FLOAT);
      expect(tokens[0].value).toBe('123.456');
    });

    it('should tokenize negative numbers', () => {
      const tokens = tokenize('-123');
      expect(tokens[0].kind).toBe(TokenKind.INT);
      expect(tokens[0].value).toBe('-123');
    });

    it('should tokenize names', () => {
      const tokens = tokenize('user_name123');
      expect(tokens[0].kind).toBe(TokenKind.NAME);
      expect(tokens[0].value).toBe('user_name123');
    });

    it('should tokenize punctuation', () => {
      const tokens = tokenize('!$():=@[]{},');
      const values = tokens.filter(t => t.kind === TokenKind.PUNCTUATOR).map(t => t.value);
      expect(values).toContain('!');
      expect(values).toContain('$');
      expect(values).toContain('(');
      expect(values).toContain(')');
      expect(values).toContain(':');
      expect(values).toContain('@');
      expect(values).toContain('[');
      expect(values).toContain(']');
      expect(values).toContain('{');
      expect(values).toContain('}');
    });

    it('should tokenize spread operator', () => {
      const tokens = tokenize('...');
      expect(tokens[0].kind).toBe(TokenKind.PUNCTUATOR);
      expect(tokens[0].value).toBe('...');
    });

    it('should skip comments', () => {
      const source = `# this is a comment
      { user }`;
      const tokens = tokenize(source);
      const nameTokens = tokens.filter(t => t.kind === TokenKind.NAME);
      expect(nameTokens[0].value).toBe('user');
    });

    it('should handle string escapes', () => {
      const tokens = tokenize('"hello \\"world\\""');
      expect(tokens[0].kind).toBe(TokenKind.STRING);
      expect(tokens[0].value).toBe('hello "world"');
    });

    it('should track location', () => {
      const source = `{
  user
}`;
      const tokens = tokenize(source);
      expect(tokens[0].loc.line).toBe(1);
      expect(tokens[0].loc.column).toBe(1);
      const userToken = tokens.find(t => t.value === 'user');
      expect(userToken?.loc.line).toBe(2);
      expect(userToken?.loc.column).toBe(3);
    });
  });

  describe('createLexer', () => {
    it('should create a lexer function', () => {
      const lexer = createLexer('{ user }');
      expect(typeof lexer).toBe('function');
    });

    it('should return EOF token at end', () => {
      const lexer = createLexer('');
      const token = lexer();
      expect(token.kind).toBe(TokenKind.EOF);
    });
  });
});
