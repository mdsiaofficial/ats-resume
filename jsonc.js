/**
 * Minimal JSONC (JSON with comments) parser.
 *
 * JSONC is a superset of JSON: it allows line comments, block comments and
 * trailing commas. This module implements that on top of
 * `JSON.parse` without pulling in a dependency.
 *
 * The cleaner keeps the exact byte length of the input: every removed
 * character is replaced by a space and newlines are kept as newlines. Because
 * offsets survive unchanged, a `JSON.parse` error position can be mapped back
 * to the original file to report an accurate line/column.
 */

/**
 * Blanks out comments while preserving the length of the text.
 *
 * Comments are only recognised outside of JSON strings, so a `//` inside a
 * string value (e.g. "https://example.com") is left untouched.
 */
function blankComments(text) {
  const out = text.split('');
  let i = 0;
  let inString = false;

  while (i < text.length) {
    const ch = text[i];

    if (inString) {
      // A backslash escapes the next character, so `\"` does not end the string.
      if (ch === '\\') {
        i += 2;
        continue;
      }
      if (ch === '"') inString = false;
      i++;
      continue;
    }

    if (ch === '"') {
      inString = true;
      i++;
      continue;
    }

    if (ch === '/' && text[i + 1] === '/') {
      // Line comment: everything up to (but not including) the newline goes.
      // A lone \r also ends a line (classic Mac line endings).
      while (i < text.length && text[i] !== '\n' && text[i] !== '\r') {
        out[i] = ' ';
        i++;
      }
      continue;
    }

    if (ch === '/' && text[i + 1] === '*') {
      out[i] = ' ';
      out[i + 1] = ' ';
      i += 2;
      let closed = false;
      while (i < text.length) {
        if (text[i] === '*' && text[i + 1] === '/') {
          out[i] = ' ';
          out[i + 1] = ' ';
          i += 2;
          closed = true;
          break;
        }
        // Newlines inside a block comment must survive to keep line numbers intact.
        if (text[i] !== '\n') out[i] = ' ';
        i++;
      }
      if (!closed) {
        const err = new SyntaxError('Unterminated block comment');
        err.code = 'ERR_JSONC_PARSE';
        err.unterminatedBlockComment = true;
        throw err;
      }
      continue;
    }

    i++;
  }

  return out.join('');
}

function isWhitespace(ch) {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';
}

/**
 * Removes trailing commas, i.e. a comma directly before a `}` or `]`.
 *
 * The lookahead skips whitespace and comments. Comments have already been
 * blanked out into spaces by `blankComments`, so a single whitespace skip is
 * enough to see past them.
 */
function blankTrailingCommas(text) {
  const out = text.split('');
  let i = 0;
  let inString = false;

  while (i < text.length) {
    const ch = text[i];

    if (inString) {
      if (ch === '\\') {
        i += 2;
        continue;
      }
      if (ch === '"') inString = false;
      i++;
      continue;
    }

    if (ch === '"') {
      inString = true;
      i++;
      continue;
    }

    if (ch === ',') {
      let j = i + 1;
      while (j < text.length && isWhitespace(text[j])) j++;
      if (text[j] === '}' || text[j] === ']') out[i] = ' ';
    }

    i++;
  }

  return out.join('');
}

/**
 * Removes comments and trailing commas from JSONC text.
 *
 * The returned text has the same length as the input, so character offsets are
 * identical between the two.
 */
export function stripJsonComments(text) {
  return blankTrailingCommas(blankComments(text));
}

/** Converts a character offset into a 1-based line/column pair. */
function offsetToLineColumn(text, offset) {
  let line = 1;
  let column = 1;
  const limit = Math.min(offset, text.length);

  for (let i = 0; i < limit; i++) {
    if (text[i] === '\n') {
      line++;
      column = 1;
    } else {
      column++;
    }
  }

  return { line, column };
}

/**
 * Locates the first syntax error in a JSON text.
 *
 * `JSON.parse` does not always report a position (e.g. "Unexpected token"), so
 * this minimal validator is used as a fallback to point at the offending
 * character.
 *
 * @returns {number} The offset of the error, or -1 when the text is valid.
 */
export function locateJsonError(text) {
  const n = text.length;
  let i = 0;

  const skipWhitespace = () => {
    while (i < n && (text[i] === ' ' || text[i] === '\t' || text[i] === '\n' || text[i] === '\r')) i++;
  };

  const parseString = () => {
    i++; // opening quote
    while (i < n) {
      const c = text[i];
      if (c === '\\') {
        i += 2;
        continue;
      }
      if (c === '"') {
        i++;
        return -1;
      }
      if (c < ' ') return i; // control characters are not allowed in JSON strings
      i++;
    }
    return i; // unterminated string
  };

  const isDigit = ch => ch >= '0' && ch <= '9';

  /**
   * Validates a JSON number and returns the offset of the first invalid
   * character, or -1 when the number is well formed.
   */
  const parseNumber = () => {
    const start = i;
    if (text[i] === '-') i++;

    if (i >= n) return start;
    if (text[i] === '0') {
      i++;
      // A leading zero may not be followed by more digits (e.g. "01").
      if (i < n && isDigit(text[i])) return i;
    } else if (text[i] >= '1' && text[i] <= '9') {
      while (i < n && isDigit(text[i])) i++;
    } else {
      return start; // no integer part at all
    }

    if (i < n && text[i] === '.') {
      i++;
      if (i >= n || !isDigit(text[i])) return i;
      while (i < n && isDigit(text[i])) i++;
    }

    if (i < n && (text[i] === 'e' || text[i] === 'E')) {
      i++;
      if (i < n && (text[i] === '+' || text[i] === '-')) i++;
      if (i >= n || !isDigit(text[i])) return i;
      while (i < n && isDigit(text[i])) i++;
    }

    return -1;
  };

  const parseValue = () => {
    skipWhitespace();
    if (i >= n) return n;
    const c = text[i];
    if (c === '{') return parseObject();
    if (c === '[') return parseArray();
    if (c === '"') return parseString();
    if (text.startsWith('true', i)) {
      i += 4;
      return -1;
    }
    if (text.startsWith('false', i)) {
      i += 5;
      return -1;
    }
    if (text.startsWith('null', i)) {
      i += 4;
      return -1;
    }
    return parseNumber();
  };

  const parseObject = () => {
    i++; // opening brace
    skipWhitespace();
    if (text[i] === '}') {
      i++;
      return -1;
    }
    for (;;) {
      skipWhitespace();
      if (text[i] !== '"') return i;
      let err = parseString();
      if (err !== -1) return err;
      skipWhitespace();
      if (text[i] !== ':') return i;
      i++;
      err = parseValue();
      if (err !== -1) return err;
      skipWhitespace();
      if (text[i] === ',') {
        i++;
        continue;
      }
      if (text[i] === '}') {
        i++;
        return -1;
      }
      return i;
    }
  };

  const parseArray = () => {
    i++; // opening bracket
    skipWhitespace();
    if (text[i] === ']') {
      i++;
      return -1;
    }
    for (;;) {
      const err = parseValue();
      if (err !== -1) return err;
      skipWhitespace();
      if (text[i] === ',') {
        i++;
        continue;
      }
      if (text[i] === ']') {
        i++;
        return -1;
      }
      return i;
    }
  };

  const err = parseValue();
  if (err !== -1) return err;
  skipWhitespace();
  return i < n ? i : -1;
}

/**
 * Builds a descriptive error for a failed JSON parse.
 *
 * The offset reported by Node refers to the cleaned text; because cleaning
 * preserves offsets it is also valid for the original file.
 */
function describeParseError(cause, originalText, cleanedText, filename) {
  const message = cause && cause.message ? cause.message : String(cause);
  const positionMatch = message.match(/position (\d+)/);

  let line = null;
  let column = null;

  if (positionMatch) {
    const offset = Number(positionMatch[1]);
    ({ line, column } = offsetToLineColumn(originalText, offset));
  } else {
    // No position in the message: find the first syntax error ourselves.
    const offset = locateJsonError(cleanedText);
    if (offset !== -1) {
      ({ line, column } = offsetToLineColumn(originalText, offset));
    }
  }

  const location = line !== null ? ` at line ${line}, column ${column}` : '';
  const error = new SyntaxError(`Invalid JSON in '${filename}'${location}: ${message}`);
  error.code = 'ERR_JSONC_PARSE';
  error.filename = filename;
  if (line !== null) {
    error.line = line;
    error.column = column;
  }
  error.cause = cause;
  return error;
}

/**
 * Parses JSONC text into a value.
 *
 * @param {string} text      The file contents.
 * @param {string} filename  Used in error messages.
 * @returns {any} The parsed value.
 */
export function parseJsonc(text, filename = 'input') {
  let cleaned;
  try {
    cleaned = stripJsonComments(text);
  } catch (err) {
    if (err && err.unterminatedBlockComment) {
      const error = new SyntaxError(`Unterminated block comment in '${filename}'`);
      error.code = 'ERR_JSONC_PARSE';
      error.filename = filename;
      error.cause = err;
      throw error;
    }
    throw err;
  }

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    throw describeParseError(err, text, cleaned, filename);
  }
}
