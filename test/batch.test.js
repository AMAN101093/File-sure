const test = require('node:test');
const assert = require('node:assert');
const { detectKind, checkMixed } = require('../src/batch.js');
const { NOT_ENCODED } = require('../src/validator.js');

const CIN = 'L17110MH1973PLC019786';

test('routes by shape', () => {
  assert.strictEqual(detectKind(CIN), 'CIN');
  assert.strictEqual(detectKind(' aaa-1234 '), 'LLPIN');
  assert.strictEqual(detectKind('AAA1234'), 'LLPIN');
  assert.strictEqual(detectKind('AAA 1234'), 'LLPIN');
  assert.strictEqual(detectKind('AA-1234'), 'LLPIN');
  assert.strictEqual(detectKind('L17110'), 'CIN');
  assert.strictEqual(detectKind('L17110-MH1973PLC019786'), 'CIN');
});

test('mixed list keeps original line numbers and never drops a line', () => {
  const text = [CIN, '', 'AAA-1234', '   ', 'junk!', 'AAA1234'].join('\r\n');
  const { results, summary } = checkMixed(text);
  assert.deepStrictEqual(results.map((r) => r.line), [1, 3, 5, 6]);
  assert.deepStrictEqual(results.map((r) => r.valid), [true, true, false, false]);
  assert.deepStrictEqual(summary, { total: 4, valid: 2, invalid: 2, duplicates: 0 });
  assert.match(results[3].errors[0].message, /Hyphen missing/);
  assert.match(results[2].errors[0].message, /Position 5/);
});

test('duplicates are detected across kinds and case/whitespace, and stay valid', () => {
  const { results, summary } = checkMixed([CIN, 'AAA-1234', ' ' + CIN.toLowerCase(), 'aaa-1234'].join('\n'));
  assert.deepStrictEqual(results.map((r) => r.duplicateOf), [null, null, 1, 2]);
  assert.strictEqual(summary.duplicates, 2);
  assert.strictEqual(summary.valid, 4);
});

test('LLPIN shows no invented CIN fields', () => {
  const r = checkMixed('ABC-0012').results[0];
  assert.strictEqual(r.entityType, 'LLP');
  assert.strictEqual(r.parts.number, '0012');
  for (const k of ['state', 'year', 'listing', 'companyType']) assert.strictEqual(r.fields[k], NOT_ENCODED);
});

test('status policy flows through: observed warns, alias rejected', () => {
  const obs = checkMixed('U12345UW1998PLC000001').results[0];
  assert.ok(obs.valid && obs.fields.state.status === 'observed' && obs.fields.state.label);
  const alias = checkMixed('U22120CG2014PTC001277').results[0];
  assert.ok(!alias.valid && alias.errors.some((e) => e.field === 'state'));
});

test('500 mixed lines are all kept, quickly', () => {
  const lines = [];
  for (let i = 0; i < 500; i++) lines.push(i % 2 ? 'AAA-' + String(i).padStart(4, '0') : 'U12345MH2020PTC' + String(i).padStart(6, '0'));
  const t = Date.now();
  const { results, summary } = checkMixed(lines.join('\n'));
  assert.strictEqual(results.length, 500);
  assert.strictEqual(summary.valid, 500);
  assert.ok(Date.now() - t < 500);
});
