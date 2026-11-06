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
      const commentStart = i;
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
        err.offset = commentStart;
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
    if (text[i] === '\r') {
      // Treat CRLF as a single line ending, and a lone CR as one too.
      if (text[i + 1] === '\n' && i + 1 < limit) i++;
      line++;
      column = 1;
    } else if (text[i] === '\n') {
      line++;
      column = 1;
    } else {
      column++;
    }
  }

  return { line, column };
}

/**
 * Parses JSON text just far enough to describe its first syntax error.
 *
 * The returned `path` points at the container being parsed when the error was
 * found (e.g. ["experience", 0, "bullets"]), which lets the CLI tell the user
 * which section and entry needs attention.
 *
 * @returns {{offset:number, reason:string, hint?:string, path:(string|number)[]}|null}
 *          `null` when the text is valid JSON.
 */
export function analyzeJsonError(text) {
  const n = text.length;
  let i = 0;
  const path = [];

  const fail = (offset, reason, hint) => ({
    offset: Math.max(0, Math.min(offset, n)),
    reason,
    hint,
    path: path.slice()
  });

  const skipWhitespace = () => {
    while (i < n && (text[i] === ' ' || text[i] === '\t' || text[i] === '\n' || text[i] === '\r')) i++;
  };

  const isDigit = ch => ch >= '0' && ch <= '9';

  /**
   * Parses a string. Returns `{ value }` on success or `{ error }` on failure.
   * The decoded value is used to build the JSON path.
   */
  const parseStringValue = () => {
    const start = i;
    i++; // opening quote
    while (i < n) {
      const c = text[i];
      if (c === '\\') {
        i += 2;
        continue;
      }
      if (c === '"') {
        i++;
        const raw = text.slice(start, i);
        try {
          return { value: JSON.parse(raw) };
        } catch {
          return { value: raw.slice(1, -1) };
        }
      }
      if (c === '\n' || c === '\r') {
        return {
          error: fail(i, 'Unterminated string: missing closing double quote (").', 'Close the string with a " before the end of the line.')
        };
      }
      if (c < ' ') {
        return {
          error: fail(i, 'A string contains an unescaped control character.', 'Use an escape sequence such as \\n or \\t inside strings.')
        };
      }
      i++;
    }
    return {
      error: fail(n, 'Unterminated string: missing closing double quote (").', 'Add a closing " at the end of the text.')
    };
  };

  const parseNumber = () => {
    if (text[i] === '-') i++;

    if (i >= n) {
      return fail(i, 'Incomplete number: expected a digit after "-".', 'Add a digit after the minus sign.');
    }

    if (text[i] === '0') {
      i++;
      // A leading zero may not be followed by more digits (e.g. "01").
      if (i < n && isDigit(text[i])) {
        return fail(i, 'Numbers cannot have a leading zero.', 'Remove the extra leading zero (write 0 instead of 01).');
      }
    } else if (text[i] >= '1' && text[i] <= '9') {
      while (i < n && isDigit(text[i])) i++;
    } else {
      return fail(i, `Expected a digit, but found ${describeChar(text[i])}.`, 'Numbers must start with a digit or a minus sign.');
    }

    if (i < n && text[i] === '.') {
      i++;
      if (i >= n || !isDigit(text[i])) {
        return fail(i, 'A decimal point must be followed by a digit.', 'Add a digit after the decimal point.');
      }
      while (i < n && isDigit(text[i])) i++;
    }

    if (i < n && (text[i] === 'e' || text[i] === 'E')) {
      i++;
      if (i < n && (text[i] === '+' || text[i] === '-')) i++;
      if (i >= n || !isDigit(text[i])) {
        return fail(i, 'An exponent must be followed by a digit.', 'Add a digit after "e" or "E".');
      }
      while (i < n && isDigit(text[i])) i++;
    }

    return null;
  };

  const parseLiteral = word => {
    if (!text.startsWith(word, i)) return undefined;
    const end = i + word.length;
    const next = text[end];
    if (next && /[A-Za-z0-9_$]/.test(next)) {
      return fail(end, `Unexpected character ${describeChar(next)} after "${word}".`, 'Check the spelling of true, false, or null.');
    }
    i = end;
    return null;
  };

  const parseValue = () => {
    skipWhitespace();
    if (i >= n) {
      return fail(n, 'Unexpected end of file: expected a value.', 'Add a value (string, number, object, array, true, false, or null).');
    }

    const c = text[i];
    if (c === '{') return parseObject();
    if (c === '[') return parseArray();
    if (c === '"') {
      const result = parseStringValue();
      return result.error || null;
    }
    if (c === "'") {
      return fail(i, 'Strings must use double quotes (").', "Replace the single quotes (') with double quotes (\\\").");
    }
    if (c === 't' || c === 'f' || c === 'n') {
      for (const word of ['true', 'false', 'null']) {
        const result = parseLiteral(word);
        if (result !== undefined) return result;
      }
    }
    if (c === '-' || isDigit(c)) return parseNumber();

    return fail(
      i,
      `Unexpected character ${describeChar(c)}: expected a value.`,
      'Values must be a double-quoted string, number, object, array, true, false, or null. Check for a missing comma or a missing value.'
    );
  };

  const parseObject = () => {
    i++; // opening brace
    skipWhitespace();
    if (i >= n) {
      return fail(n, 'Unexpected end of file: missing closing brace (}).', 'Add } to close the object.');
    }
    if (text[i] === '}') {
      i++;
      return null;
    }

    for (;;) {
      skipWhitespace();
      if (i >= n) {
        return fail(n, 'Unexpected end of file: missing closing brace (}).', 'Add } to close the object.');
      }

      if (text[i] !== '"') {
        if (text[i] === '}') {
          // A trailing comma was left in place; JSONC allows it.
          i++;
          return null;
        }
        if (text[i] === "'") {
          return fail(i, 'Property names must use double quotes (").', "Replace the single quotes (') around the key with double quotes (\\\").");
        }
        return fail(
          i,
          'Expected a property name in double quotes or a closing brace (}).',
          'Check for a missing comma after the previous property, and make sure every key is wrapped in double quotes.'
        );
      }

      const keyResult = parseStringValue();
      if (keyResult.error) return keyResult.error;
      const key = keyResult.value;
      path.push(key);

      skipWhitespace();
      if (i >= n) {
        return fail(n, `Unexpected end of file: missing colon (:) after property ${JSON.stringify(key)}.`, 'Add : between the property name and its value.');
      }
      if (text[i] !== ':') {
        return fail(i, `Missing colon (:) after property ${JSON.stringify(key)}.`, 'Add : between the property name and its value.');
      }
      i++;

      const valueError = parseValue();
      path.pop();
      if (valueError) return valueError;

      skipWhitespace();
      if (i >= n) {
        return fail(n, `Unexpected end of file: missing comma (,) or closing brace (}) after property ${JSON.stringify(key)}.`, 'Add } to close the object, or a comma before the next property.');
      }
      if (text[i] === ',') {
        i++;
        continue;
      }
      if (text[i] === '}') {
        i++;
        return null;
      }
      return fail(
        i,
        'Missing comma (,) between properties, or a closing brace (}).',
        'Add a comma after the previous value. If this is the last property, add } to close the object.'
      );
    }
  };

  const parseArray = () => {
    i++; // opening bracket
    skipWhitespace();
    if (i >= n) {
      return fail(n, 'Unexpected end of file: missing closing bracket (]).', 'Add ] to close the array.');
    }
    if (text[i] === ']') {
      i++;
      return null;
    }

    for (let index = 0; ; index++) {
      path.push(index);
      const valueError = parseValue();
      path.pop();
      if (valueError) return valueError;

      skipWhitespace();
      if (i >= n) {
        return fail(n, 'Unexpected end of file: missing comma (,) or closing bracket (]) after an array item.', 'Add ] to close the array, or a comma before the next item.');
      }
      if (text[i] === ',') {
        i++;
        continue;
      }
      if (text[i] === ']') {
        i++;
        return null;
      }
      return fail(
        i,
        'Missing comma (,) between array items, or a closing bracket (]).',
        'Add a comma after the previous item. If this is the last item, add ] to close the array.'
      );
    }
  };

  const error = parseValue();
  if (error) return error;

  skipWhitespace();
  if (i < n) {
    return fail(
      i,
      `Unexpected character ${describeChar(text[i])} after the end of the document.`,
      'There may be an extra closing brace (}) or bracket (]), or a missing comma.'
    );
  }

  return null;
}

function describeChar(ch) {
  if (ch === undefined) return 'the end of the file';
  if (ch === '\n') return 'a line break';
  if (ch === '\r') return 'a carriage return';
  if (ch === '\t') return 'a tab';
  return JSON.stringify(ch);
}

/** Converts a JSON path array into a readable string, e.g. experience[0].title. */
function formatJsonPath(parts) {
  let out = '';
  for (const part of parts) {
    if (typeof part === 'number') out += `[${part}]`;
    else out += out ? `.${part}` : part;
  }
  return out || '(root)';
}

/**
 * Locates the first syntax error in a JSON text.
 *
 * `JSON.parse` does not always report a position (e.g. "Unexpected token"), so
 * this uses `analyzeJsonError` as a fallback to point at the offending
 * character.
 *
 * @returns {number} The offset of the error, or -1 when the text is valid.
 */
export function locateJsonError(text) {
  const error = analyzeJsonError(text);
  return error ? error.offset : -1;
}

/** Expands tabs so the caret in a code frame lines up with the source line. */
function expandTabs(line) {
  return line.replace(/\t/g, '    ');
}

function caretOffset(line, column) {
  let offset = 0;
  const limit = Math.min(column - 1, line.length);
  for (let i = 0; i < limit; i++) {
    offset += line[i] === '\t' ? 4 : 1;
  }
  return offset;
}

/** Builds a small source snippet with a caret under the reported column. */
function buildCodeFrame(text, line, column) {
  const lines = text.split(/\r\n|\r|\n/);
  if (!lines.length) return '';

  const index = Math.max(0, Math.min(line - 1, lines.length - 1));
  const start = Math.max(0, index - 1);
  const end = Math.min(lines.length, index + 2);
  const width = String(end).length;
  const out = [];

  for (let n = start; n < end; n++) {
    out.push(`  ${String(n + 1).padStart(width)} | ${expandTabs(lines[n])}`);
    if (n === index) {
      out.push(`  ${' '.repeat(width)} | ${' '.repeat(caretOffset(lines[n], column))}^`);
    }
  }
  return out.join('\n');
}

/** Maps Node's terse JSON errors onto a plain-language explanation. */
function friendlyJsonParseMessage(message) {
  if (/Unexpected end of JSON input/i.test(message)) {
    return {
      reason: 'The file ends unexpectedly: a closing brace (}) or bracket (]) is missing.',
      hint: 'Check the end of the file and close every { and [ that you opened.'
    };
  }
  if (/Bad escaped character/i.test(message)) {
    return {
      reason: 'Invalid escape sequence in a string.',
      hint: 'Use \\" for a quote, \\\\ for a backslash, or \\uXXXX for a Unicode character.'
    };
  }
  if (/Bad control character/i.test(message)) {
    return {
      reason: 'A string contains an unescaped line break or control character.',
      hint: 'Close the string on the same line, or use \\n for a line break.'
    };
  }
  if (/Expected property name/i.test(message)) {
    return {
      reason: 'Expected a property name in double quotes.',
      hint: 'Check for a missing comma after the previous property and make sure keys use double quotes.'
    };
  }
  if (/Expected ':'/i.test(message)) {
    return {
      reason: 'Missing colon (:) after a property name.',
      hint: 'Add : between the key and its value.'
    };
  }
  if (/Unexpected token/i.test(message)) {
    return {
      reason: 'Unexpected character in the file.',
      hint: 'Check for a missing comma, colon, double quote, brace, or bracket near the marker.'
    };
  }
  return null;
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
  const detail = analyzeJsonError(cleanedText);
  const fallback = friendlyJsonParseMessage(message);

  let offset = null;
  if (positionMatch) {
    offset = Number(positionMatch[1]);
  } else if (detail) {
    offset = detail.offset;
  } else {
    const fallbackOffset = locateJsonError(cleanedText);
    if (fallbackOffset !== -1) offset = fallbackOffset;
  }

  let line = null;
  let column = null;
  if (offset !== null) {
    ({ line, column } = offsetToLineColumn(originalText, offset));
  }

  const reason = (detail && detail.reason) || (fallback && fallback.reason) || message;
  const hint = (detail && detail.hint) || (fallback && fallback.hint);
  const path = detail && detail.path && detail.path.length ? formatJsonPath(detail.path) : null;

  let errorMessage = `Invalid JSON in '${filename}'`;
  if (line !== null) errorMessage += ` at line ${line}, column ${column}`;
  if (path) errorMessage += ` (path: ${path})`;
  errorMessage += `.\n\n  Problem: ${reason}`;
  if (hint) errorMessage += `\n  Hint: ${hint}`;
  if (line !== null) errorMessage += `\n\n${buildCodeFrame(originalText, line, column)}`;
  if (!detail && !fallback) errorMessage += `\n  Parser message: ${message}`;

  const error = new SyntaxError(errorMessage);
  error.code = 'ERR_JSONC_PARSE';
  error.filename = filename;
  if (line !== null) {
    error.line = line;
    error.column = column;
  }
  if (path) error.path = path;
  error.reason = reason;
  if (hint) error.hint = hint;
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
      const offset = typeof err.offset === 'number' ? err.offset : 0;
      const { line, column } = offsetToLineColumn(text, offset);
      const errorMessage = `Invalid JSON in '${filename}' at line ${line}, column ${column}.\n\n  Problem: Unterminated block comment: missing closing */.\n  Hint: Close the comment with */ or remove the opening /*.\n\n${buildCodeFrame(text, line, column)}`;
      const error = new SyntaxError(errorMessage);
      error.code = 'ERR_JSONC_PARSE';
      error.filename = filename;
      error.line = line;
      error.column = column;
      error.reason = 'Unterminated block comment: missing closing */.';
      error.hint = 'Close the comment with */ or remove the opening /*.';
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
