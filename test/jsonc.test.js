import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJsonc, stripJsonComments, locateJsonError } from '../jsonc.js';
import { buildTemplate, SECTION_COMMENTS } from '../template-jsonc.js';
import { masterData } from '../data.js';

test('parses plain JSON unchanged (backwards compatibility)', () => {
  const input = '{"a": 1, "b": [1, 2, 3], "c": {"d": "e"}}';
  assert.deepEqual(parseJsonc(input, 'plain.json'), {
    a: 1,
    b: [1, 2, 3],
    c: { d: 'e' }
  });
});

test('strips line comments', () => {
  const input = `{
  // a line comment
  "a": 1 // trailing comment
}`;
  assert.deepEqual(parseJsonc(input, 'line.jsonc'), { a: 1 });
});

test('strips block comments', () => {
  const input = `{
  /* a block comment */
  "a": 1
  /* multi
     line */
}`;
  assert.deepEqual(parseJsonc(input, 'block.jsonc'), { a: 1 });
});

test('keeps a // inside a string value', () => {
  const input = '{ "url": "https://example.com/x", "n": 1 }';
  const parsed = parseJsonc(input, 'url.jsonc');
  assert.equal(parsed.url, 'https://example.com/x');
  assert.equal(parsed.n, 1);
});

test('keeps a // inside a string that also contains a quote escape', () => {
  const input = '{ "text": "he said \\"// not a comment\\" ok", "n": 2 }';
  const parsed = parseJsonc(input, 'escaped.jsonc');
  assert.equal(parsed.text, 'he said "// not a comment" ok');
  assert.equal(parsed.n, 2);
});

test('handles an escaped quote without ending the string', () => {
  const input = '{ "q": "a\\"b", "url": "https://x.dev" }';
  const parsed = parseJsonc(input, 'escquote.jsonc');
  assert.deepEqual(parsed, { q: 'a"b', url: 'https://x.dev' });
});

test('removes trailing commas before } and ]', () => {
  const input = `{
  "a": 1,
  "b": [1, 2,],
}`;
  assert.deepEqual(parseJsonc(input, 'trailing.jsonc'), { a: 1, b: [1, 2] });
});

test('removes a trailing comma followed by a line comment', () => {
  const input = `{
  "a": 1, // why
}`;
  assert.deepEqual(parseJsonc(input, 'trailing-comment.jsonc'), { a: 1 });
});

test('removes a trailing comma followed by a block comment', () => {
  const input = `{
  "a": 1, /* why */
}`;
  assert.deepEqual(parseJsonc(input, 'trailing-block.jsonc'), { a: 1 });
});

test('reports the line and column of a syntax error in the original text', () => {
  const input = `// comment on line 1
/* comment on line 2 */
{ "a": 1 "b": 2 }`;

  assert.throws(
    () => parseJsonc(input, 'broken.jsonc'),
    err => {
      assert.match(err.message, /broken\.jsonc/);
      assert.match(err.message, /line 3, column 10/);
      return true;
    }
  );
});

test('the cleaned text has the same length as the input', () => {
  const input = `// comment
{
  /* block */ "a": 1, // trailing
  "b": [1, 2,],
}`;
  assert.equal(stripJsonComments(input).length, input.length);
});

test('the cleaned text is valid JSON', () => {
  const input = `// comment
{
  /* block */ "a": 1, // trailing
  "b": [1, 2,],
}`;
  assert.deepEqual(JSON.parse(stripJsonComments(input)), { a: 1, b: [1, 2] });
});

test('cleaned text preserves newlines so offsets stay aligned', () => {
  const input = `// one\n/* two\nthree */\n{"a":1}`;
  const cleaned = stripJsonComments(input);
  assert.equal(cleaned.length, input.length);
  assert.equal(cleaned.split('\n').length, input.split('\n').length);
});

test('an invalid file reports the filename and a location', () => {
  assert.throws(
    () => parseJsonc('{ "a": }', 'oops.jsonc'),
    err => {
      assert.match(err.message, /Invalid JSON in 'oops\.jsonc'/);
      assert.match(err.message, /line 1, column 8/);
      return true;
    }
  );
});

test('stripping comments is idempotent', () => {
  const input = `// comment
{
  /* block */ "a": 1, // trailing
  "b": [1, 2,],
  "c": "http://example.com",
}`;
  const once = stripJsonComments(input);
  assert.equal(stripJsonComments(once), once);
});

test('a comma between two arrays is not removed', () => {
  const input = '[[1,2],[3,4]]';
  assert.equal(stripJsonComments(input), input);
  assert.deepEqual(parseJsonc(input, 'arrays.jsonc'), [[1, 2], [3, 4]]);
});

test('a line comment ends at a lone carriage return', () => {
  const input = '{"a":1,// c\r"b":2}';
  assert.deepEqual(parseJsonc(input, 'cr.jsonc'), { a: 1, b: 2 });
});

test('an unterminated block comment is reported with the filename', () => {
  assert.throws(
    () => parseJsonc('{ "a": 1 } /* never closed', 'open.jsonc'),
    err => {
      assert.match(err.message, /Unterminated block comment/);
      assert.match(err.message, /open\.jsonc/);
      assert.equal(err.code, 'ERR_JSONC_PARSE');
      return true;
    }
  );
});

test('malformed numbers report a line and a column', () => {
  const cases = [
    ['{"a":01}', 1, 7],
    ['{"a":1e}', 1, 8],
    ['{"a":-}', 1, 7]
  ];

  for (const [input, line, column] of cases) {
    assert.throws(
      () => parseJsonc(input, 'num.jsonc'),
      err => {
        assert.match(err.message, new RegExp(`line ${line}, column ${column}`));
        return true;
      },
      `expected ${input} to be reported at line ${line}, column ${column}`
    );
  }
});

test('the error locator rejects malformed numbers', () => {
  assert.notEqual(locateJsonError('{"a":01}'), -1);
  assert.notEqual(locateJsonError('{"a":1e}'), -1);
  assert.notEqual(locateJsonError('{"a":-}'), -1);
  assert.notEqual(locateJsonError('01'), -1);
  assert.equal(locateJsonError('{"a":1}'), -1);
  assert.equal(locateJsonError('{"a":1.5e-3}'), -1);
});

test('a keyword followed by junk is still reported as an error', () => {
  assert.notEqual(locateJsonError('{"a":truex}'), -1);
});

test('the generated template parses back to the original data', () => {
  const template = buildTemplate(masterData);
  assert.deepEqual(parseJsonc(template, 'demo-resume.jsonc'), masterData);
});

test('every section comment is attached to its top-level key', () => {
  const lines = buildTemplate(masterData).split('\n');

  for (const entry of SECTION_COMMENTS) {
    if (!(entry.key in masterData)) continue;

    const keyLine = lines.findIndex(line => new RegExp(`^ {2}"${entry.key}":`).test(line));
    assert.notEqual(keyLine, -1, `expected a top-level "${entry.key}" key`);

    entry.comments.forEach((comment, offset) => {
      assert.equal(
        lines[keyLine + 1 + offset],
        `    // ${comment}`,
        `expected the "${entry.key}" comment to follow its key`
      );
    });
  }
});

test('the projects comment is attached to the top-level projects key only', () => {
  const lines = buildTemplate(masterData).split('\n');

  const projectCommentLines = lines
    .map((line, index) => (line.includes('// Projects.') ? index : -1))
    .filter(index => index !== -1);

  assert.equal(projectCommentLines.length, 1, 'expected exactly one projects comment');

  const commentIndex = projectCommentLines[0];
  const keyIndex = lines.findIndex(line => /^ {2}"projects": \[/.test(line));
  assert.notEqual(keyIndex, -1);
  assert.equal(commentIndex, keyIndex + 1);

  // No comment may be injected into a nested "projects" array (e.g. a skill's).
  const nestedProjects = lines.findIndex(line => /^ {6}"projects": \[/.test(line));
  if (nestedProjects !== -1) {
    assert.notEqual(nestedProjects + 1, commentIndex);
    assert.equal(lines[nestedProjects + 1].includes('// Projects.'), false);
  }
});
