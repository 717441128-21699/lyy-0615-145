import { Token, TokenKind, Location } from './types';

const charCodeAt = (str: string, index: number): number => str.charCodeAt(index);

const isNameStart = (code: number): boolean =>
  (code >= 65 && code <= 90) ||
  (code >= 97 && code <= 122) ||
  code === 95;

const isNameContinue = (code: number): boolean =>
  isNameStart(code) ||
  (code >= 48 && code <= 57);

const isDigit = (code: number): boolean =>
  code >= 48 && code <= 57;

const isWhitespace = (code: number): boolean =>
  code === 9 || code === 32 || code === 10 || code === 13 || code === 44;

function createLocation(source: string, pos: number): Location {
  let line = 1;
  let column = 1;
  for (let i = 0; i < pos; i++) {
    if (source.charCodeAt(i) === 10) {
      line++;
      column = 1;
    } else {
      column++;
    }
  }
  return { line, column };
}

export function createLexer(source: string): () => Token {
  let pos = 0;
  const len = source.length;

  function readToken(): Token {
    while (pos < len) {
      const code = charCodeAt(source, pos);

      if (isWhitespace(code)) {
        pos++;
        continue;
      }

      if (code === 35) {
        while (pos < len && charCodeAt(source, pos) !== 10) {
          pos++;
        }
        continue;
      }

      const start = pos;
      const loc = createLocation(source, start);

      if (isNameStart(code)) {
        return readName();
      }

      if (code === 45 || isDigit(code)) {
        return readNumber();
      }

      if (code === 34) {
        return readString();
      }

      if (code === 33 || code === 36 || code === 40 || code === 41 ||
          code === 58 || code === 61 || code === 64 || code === 91 ||
          code === 93 || code === 123 || code === 125) {
        pos++;
        return {
          kind: TokenKind.PUNCTUATOR,
          value: source.slice(start, pos),
          start,
          end: pos,
          loc
        };
      }

      if (code === 46) {
        if (charCodeAt(source, pos + 1) === 46 && charCodeAt(source, pos + 2) === 46) {
          pos += 3;
          return {
            kind: TokenKind.PUNCTUATOR,
            value: '...',
            start,
            end: pos,
            loc
          };
        }
      }

      throw new Error(`Unexpected character "${source[pos]}" at position ${pos}`);
    }

    return {
      kind: TokenKind.EOF,
      value: '<EOF>',
      start: pos,
      end: pos,
      loc: createLocation(source, pos)
    };
  }

  function readName(): Token {
    const start = pos;
    const loc = createLocation(source, start);
    pos++;
    while (pos < len && isNameContinue(charCodeAt(source, pos))) {
      pos++;
    }
    return {
      kind: TokenKind.NAME,
      value: source.slice(start, pos),
      start,
      end: pos,
      loc
    };
  }

  function readNumber(): Token {
    const start = pos;
    const loc = createLocation(source, start);
    let isFloat = false;

    if (charCodeAt(source, pos) === 45) {
      pos++;
    }

    while (pos < len && isDigit(charCodeAt(source, pos))) {
      pos++;
    }

    if (charCodeAt(source, pos) === 46) {
      isFloat = true;
      pos++;
      while (pos < len && isDigit(charCodeAt(source, pos))) {
        pos++;
      }
    }

    const expChar = charCodeAt(source, pos);
    if (expChar === 69 || expChar === 101) {
      isFloat = true;
      pos++;
      const sign = charCodeAt(source, pos);
      if (sign === 43 || sign === 45) {
        pos++;
      }
      while (pos < len && isDigit(charCodeAt(source, pos))) {
        pos++;
      }
    }

    return {
      kind: isFloat ? TokenKind.FLOAT : TokenKind.INT,
      value: source.slice(start, pos),
      start,
      end: pos,
      loc
    };
  }

  function readString(): Token {
    const start = pos;
    const loc = createLocation(source, start);
    let value = '';
    pos++;

    while (pos < len) {
      const code = charCodeAt(source, pos);

      if (code === 34) {
        pos++;
        return {
          kind: TokenKind.STRING,
          value,
          start,
          end: pos,
          loc
        };
      }

      if (code === 92) {
        pos++;
        const escapeCode = charCodeAt(source, pos);
        switch (escapeCode) {
          case 34: value += '"'; break;
          case 47: value += '/'; break;
          case 92: value += '\\'; break;
          case 98: value += '\b'; break;
          case 102: value += '\f'; break;
          case 110: value += '\n'; break;
          case 114: value += '\r'; break;
          case 116: value += '\t'; break;
          case 117:
            const hex = source.slice(pos + 1, pos + 5);
            value += String.fromCharCode(parseInt(hex, 16));
            pos += 4;
            break;
          default:
            throw new Error(`Invalid escape character: ${source[pos]}`);
        }
        pos++;
        continue;
      }

      if (code < 32) {
        throw new Error(`Invalid character in string: ${code}`);
      }

      value += source[pos];
      pos++;
    }

    throw new Error('Unterminated string');
  }

  return readToken;
}

export function tokenize(source: string): Token[] {
  const lexer = createLexer(source);
  const tokens: Token[] = [];
  let token: Token;
  do {
    token = lexer();
    tokens.push(token);
  } while (token.kind !== TokenKind.EOF);
  return tokens;
}
