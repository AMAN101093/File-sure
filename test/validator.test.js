// Run with: npm test   (uses Node's built-in test runner, nothing to install)
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateCIN, validateLLPIN, checkList, splitLines } = require('../src/validator.js');
const REF = require('../src/reference-data.js');

// Fixed "today" so the year tests do not change as time passes.
const NOW_2026 = { now: new Date(2026, 10, 26) };
const cin = (value, options) => validateCIN(value, options || NOW_2026);
const messages = (result) => result.errors.map((e) => e.message);

// ---------- reference data ----------

test('reference data: sizes, code shapes and statuses', () => {
  assert.equal(Object.keys(REF.listing).length, 2);
  assert.equal(Object.keys(REF.state).length, 45);
  assert.equal(Object.keys(REF.companyType).length, 13);
  for (const code of Object.keys(REF.state)) assert.match(code, /^[A-Z]{2}$/);
  for (const code of Object.keys(REF.companyType)) assert.match(code, /^[A-Z]{3}$/);
  const allowed = ['current', 'legacy', 'alias', 'observed'];
  for (const table of [REF.listing, REF.state, REF.companyType]) {
    for (const entry of Object.values(table)) assert.ok(allowed.includes(entry.status));
  }
});

// ---------- CIN: valid ----------

test('CIN: the assignment example decodes correctly (industry 17110 is not rejected)', () => {
  const r = cin('L17110MH1973PLC019786');
  assert.equal(r.valid, true);
  assert.equal(r.entityType, 'Company');
  assert.equal(r.fields.listing.meaning, 'Listed company');
  assert.equal(r.fields.state.meaning, 'Maharashtra');
  assert.equal(r.fields.year.year, 1973);
  assert.equal(r.fields.companyType.meaning, 'Public limited Indian non-government company');
  assert.equal(r.fields.industry.code, '17110');
  assert.equal(r.fields.industry.meaning, null); // industry is not decoded
  assert.equal(r.fields.registration.code, '019786');
});

test('CIN: unlisted private company', () => {
  const r = cin('U72900DL2020PTC123456');
  assert.equal(r.valid, true);
  assert.equal(r.fields.listing.meaning, 'Unlisted company');
  assert.equal(r.fields.state.meaning, 'Delhi');
  assert.equal(r.fields.year.year, 2020);
  assert.equal(r.fields.companyType.code, 'PTC');
});

test('CIN: lowercase and surrounding whitespace are accepted', () => {
  const r = cin('  l17110mh1973plc019786\t');
  assert.equal(r.valid, true);
  assert.equal(r.normalized, 'L17110MH1973PLC019786');
});

test('CIN: leading zeros in the registration number are kept', () => {
  const r = cin('U12345MH2001PTC000001');
  assert.equal(r.valid, true);
  assert.equal(r.fields.registration.code, '000001');
});

test('CIN: one person company and government company types decode', () => {
  assert.equal(cin('U12345KA2019OPC000123').fields.companyType.meaning, 'One Person Company');
  assert.equal(cin('U40108CT2003SGC015822').fields.companyType.meaning, 'State Government company');
  assert.equal(cin('U12345DL1999GOI000123').fields.companyType.meaning, 'Union Government company');
});

// ---------- CIN: whole-input problems ----------

test('CIN: empty and whitespace-only input', () => {
  for (const value of ['', '   ', '\t']) {
    const r = cin(value);
    assert.equal(r.valid, false);
    assert.equal(r.errors[0].field, 'input');
    assert.match(r.errors[0].message, /Nothing to check/);
  }
});

test('CIN: a space inside is reported with its position', () => {
  const r = cin('L17110 MH1973PLC019786');
  assert.equal(r.valid, false);
  assert.match(r.errors[0].message, /Position 7 contains a space/);
});

test('CIN: hyphens are rejected', () => {
  const r = cin('L17110-MH1973PLC019786');
  assert.equal(r.valid, false);
  assert.match(r.errors[0].message, /Position 7 contains "-"/);
});

test('CIN: invisible characters are named, not shown as blanks', () => {
  const r = cin('L17110MH1973PLC019786\u200B');
  assert.equal(r.valid, false);
  assert.match(r.errors[0].message, /invisible character \(U\+200B\)/);
});

test('CIN: wrong lengths say how far off they are', () => {
  assert.deepEqual(messages(cin('L17110MH1973PLC01978')), ['Length is 20, expected 21 (1 missing).']);
  assert.deepEqual(messages(cin('L17110MH1973PLC0197860')), ['Length is 22, expected 21 (1 too many).']);
  assert.deepEqual(messages(cin('L17110')), ['Length is 6, expected 21 (15 missing).']);
});

test('CIN: an LLPIN pasted in the CIN box gets a pointer to the other section', () => {
  const r = cin('AAA-1234');
  assert.equal(r.valid, false);
  assert.match(r.errors[0].message, /looks like an LLPIN/);
});

// ---------- CIN: field by field ----------

test('CIN: bad listing letter is reported and the rest still decodes', () => {
  const r = cin('X17110MH1973PLC019786');
  assert.equal(r.valid, false);
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].field, 'listing');
  assert.match(r.errors[0].message, /Position 1 must be L \(listed\) or U \(unlisted\), found "X"/);
  assert.equal(r.fields.state.meaning, 'Maharashtra');
});

test('CIN: industry must be five digits', () => {
  const r = cin('L1711AMH1973PLC019786');
  assert.equal(r.valid, false);
  assert.match(r.errors[0].message, /Positions 2-6 \(industry code\) must be 5 digits, found "1711A"/);
});

test('CIN: state must be two letters, then be a known code', () => {
  assert.match(messages(cin('L17110M11973PLC019786'))[0], /Positions 7-8 \(state\/UT code\) must be 2 letters, found "M1"/);
  assert.match(messages(cin('L17110XX1973PLC019786'))[0], /"XX" is not a recognised state\/UT code/);
});

test('CIN: state status policy (current, legacy, observed, alias)', () => {
  // current
  for (const code of ['CT', 'UR', 'UT', 'KA', 'DL']) {
    const r = cin(`U12345${code}2010PTC000001`);
    assert.equal(r.valid, true, code);
    assert.equal(r.fields.state.label, null, code);
  }
  // legacy: accepted and labelled
  const legacy = cin('U12345OR2001PTC000001');
  assert.equal(legacy.valid, true);
  assert.equal(legacy.fields.state.label, 'Legacy code');
  // observed: accepted and labelled
  for (const code of ['TG', 'DN', 'LH', 'UW']) {
    const r = cin(`U12345${code}2010PTC000001`);
    assert.equal(r.valid, true, code);
    assert.match(r.fields.state.label, /Observed in records/, code);
  }
  // alias: recognised abbreviation, not accepted as a CIN state code
  for (const code of ['CG', 'DH', 'LA', 'TS', 'UK']) {
    const r = cin(`U12345${code}2010PTC000001`);
    assert.equal(r.valid, false, code);
    assert.match(r.errors[0].message, /recognised abbreviation .* not accepted as a CIN state\/UT code/, code);
  }
});

test('CIN: year bounds are 1850 through the current year, inclusive', () => {
  assert.equal(cin('U12345MH1849PTC000001').valid, false);
  assert.match(messages(cin('U12345MH1849PTC000001'))[0], /year 1849 is before 1850/);
  assert.equal(cin('U12345MH1850PTC000001').valid, true);
  assert.equal(cin('U12345MH1857PTC000001').valid, true);
  assert.equal(cin('U12345MH2026PTC000001').valid, true); // current year
  assert.equal(cin('U12345MH2027PTC000001').valid, false);
  assert.match(messages(cin('U12345MH2027PTC000001'))[0], /year 2027 is in the future \(latest accepted: 2026\)/);
  // the "current year" really follows the clock that is passed in
  assert.equal(cin('U12345MH2027PTC000001', { now: new Date(2030, 0, 1) }).valid, true);
});

test('CIN: year must be four digits', () => {
  assert.match(messages(cin('U12345MHABCDPTC000001'.slice(0, 21)))[0], /Positions 9-12 \(incorporation year\) must be 4 digits/);
  assert.match(messages(cin('U12345MH19A3PTC000001'))[0], /found "19A3"/);
});

test('CIN: year is never cross-checked against the state', () => {
  // Ladakh (observed code LH) in 1960 and Telangana (TG) in 1950 look odd but are not errors.
  assert.equal(cin('U12345LH1960PTC000001').valid, true);
  assert.equal(cin('L12345TG1950PLC000001').valid, true);
});

test('CIN: company type must be 3 letters, then be a known code', () => {
  assert.match(messages(cin('U12345MH2010P1C000001'))[0], /Positions 13-15 \(company type\) must be 3 letters, found "P1C"/);
  assert.match(messages(cin('U12345MH2010XYZ000001'))[0], /"XYZ" is not a recognised company type code/);
});

test('CIN: legacy and observed company types are accepted with a label', () => {
  assert.equal(cin('U12345MH1960GAP000001').fields.companyType.label, 'Legacy code');
  assert.equal(cin('U12345MH1960NPL000001').fields.companyType.label, 'Legacy code');
  assert.match(cin('U65999PN2021PLN201657').fields.companyType.label, /Observed in records/);
});

test('CIN: registration number must be six digits', () => {
  assert.match(messages(cin('L17110MH1973PLC01978A'))[0], /Positions 16-21 \(registration number\) must be 6 digits, found "01978A"/);
});

test('CIN: every wrong field is reported at once', () => {
  const r = cin('X1711AXX2031XYZ12345A');
  assert.equal(r.valid, false);
  assert.deepEqual(r.errors.map((e) => e.field), ['listing', 'industry', 'state', 'year', 'companyType', 'registration']);
});

test('CIN: the result says it is a structure check, not a registry lookup', () => {
  assert.match(cin('L17110MH1973PLC019786').note, /does not confirm/);
});

// ---------- LLPIN ----------

test('LLPIN: valid format, entity type and "not encoded" fields', () => {
  const r = validateLLPIN('AAA-1234');
  assert.equal(r.valid, true);
  assert.equal(r.formatValid, true);
  assert.equal(r.entityType, 'LLP');
  for (const key of ['state', 'year', 'listing', 'companyType']) {
    assert.equal(r.fields[key], 'Not encoded in LLPIN');
  }
  assert.match(r.note, /does not confirm/);
});

test('LLPIN: lowercase and surrounding whitespace are accepted', () => {
  assert.equal(validateLLPIN('aaa-1234').normalized, 'AAA-1234');
  assert.equal(validateLLPIN('  AbC-1234 \n').valid, true);
});

test('LLPIN: leading zeros are preserved', () => {
  const r = validateLLPIN('ABC-0012');
  assert.equal(r.valid, true);
  assert.equal(r.parts.number, '0012');
});

test('LLPIN: empty input', () => {
  assert.match(validateLLPIN('').errors[0].message, /Nothing to check/);
});

test('LLPIN: missing or extra hyphens', () => {
  assert.match(validateLLPIN('AAA1234').errors[0].message, /Hyphen missing/);
  assert.match(validateLLPIN('AAA--1234').errors[0].message, /2 hyphens/);
  assert.match(validateLLPIN('AAA-1234-5678').errors[0].message, /2 hyphens/);
});

test('LLPIN: prefix must be exactly three letters', () => {
  assert.match(validateLLPIN('AA-1234').errors[0].message, /expected exactly 3 letters, found "AA" \(2 characters\)/);
  assert.match(validateLLPIN('AAAA-1234').errors[0].message, /found "AAAA"/);
  assert.match(validateLLPIN('AA1-1234').errors[0].message, /found "AA1"/);
});

test('LLPIN: number must be exactly four digits', () => {
  assert.match(validateLLPIN('AAA-123').errors[0].message, /expected exactly 4 digits, found "123"/);
  assert.match(validateLLPIN('AAA-12345').errors[0].message, /found "12345"/);
  assert.match(validateLLPIN('AAA-12A4').errors[0].message, /found "12A4"/);
});

test('LLPIN: both parts wrong gives two errors', () => {
  const r = validateLLPIN('AB-12');
  assert.deepEqual(r.errors.map((e) => e.field), ['prefix', 'number']);
});

test('LLPIN: spaces inside and fancy dashes get a clear message', () => {
  assert.match(validateLLPIN('AAA - 1234').errors[0].message, /Remove spaces/);
  assert.match(validateLLPIN('AAA\u20131234').errors[0].message, /different dash/);
});

test('LLPIN: a CIN pasted in the LLPIN box gets a pointer to the other section', () => {
  const r = validateLLPIN('L17110MH1973PLC019786');
  assert.equal(r.valid, false);
  assert.match(r.errors[0].message, /looks like a CIN/);
});

// ---------- lists ----------

test('lists: Windows, Mac and Linux line endings; blank lines skipped; line numbers kept', () => {
  const lines = splitLines('A\r\n\r\nB\rC\n   \nD');
  assert.deepEqual(lines.map((l) => [l.line, l.text]), [[1, 'A'], [3, 'B'], [4, 'C'], [6, 'D']]);
});

test('lists: CIN list summary and per-line results', () => {
  const text = 'L17110MH1973PLC019786\r\n\r\nU72900DL2020PTC123456\r\nnot-a-cin\r\n';
  const { results, summary } = checkList(text, 'CIN', NOW_2026);
  assert.deepEqual(summary, { total: 3, valid: 2, invalid: 1, duplicates: 0 });
  assert.deepEqual(results.map((r) => r.line), [1, 3, 4]);
  assert.equal(results[2].valid, false);
});

test('lists: duplicates are flagged but do not change validity', () => {
  const { results, summary } = checkList('AAA-1234\naaa-1234\nBBB-0001', 'LLPIN');
  assert.equal(results[1].duplicateOf, 1);
  assert.equal(results[1].valid, true);
  assert.equal(summary.duplicates, 1);
});

test('lists: 500 lines of mixed input are handled', () => {
  const lines = [];
  for (let i = 0; i < 500; i++) {
    lines.push(i % 5 === 0 ? 'garbage' + i : 'U12345MH2010PTC' + String(i).padStart(6, '0'));
  }
  const { summary } = checkList(lines.join('\n'), 'CIN', NOW_2026);
  assert.equal(summary.total, 500);
  assert.equal(summary.invalid, 100);
  assert.equal(summary.valid, 400);
});

test('lists: non-string input does not throw', () => {
  assert.doesNotThrow(() => cin(null));
  assert.doesNotThrow(() => cin(undefined));
  assert.doesNotThrow(() => validateLLPIN(12345));
  assert.equal(checkList(null, 'CIN').summary.total, 0);
});
