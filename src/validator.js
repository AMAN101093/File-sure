// CIN and LLPIN validator.
//
// What this does: checks the STRUCTURE of an identifier and decodes what is written
// inside it. What it does NOT do: check that the company or LLP exists. No network
// calls, no database. The only data used is reference-data.js.
//
// Works in the browser (window.CinChecker) and in Node (require) so it can be tested.

(function (root) {
  'use strict';

  const REF =
    typeof module !== 'undefined' && module.exports
      ? require('./reference-data.js')
      : root.CIN_REFERENCE;

  const CIN_LENGTH = 21;
  const MIN_YEAR = 1850; // start of Indian company legislation; a structural limit, not proof
  const LLPIN_PATTERN = /^[A-Z]{3}-[0-9]{4}$/;
  const NOT_ENCODED = 'Not encoded in LLPIN';
  const STRUCTURE_NOTE =
    'Structure check only. This does not confirm that the company or LLP exists in the MCA registry.';

  // What to do with a code depending on its "status" column in the reference CSV.
  // Change a line here to change the behaviour for a whole group of codes.
  const STATUS_POLICY = {
    current: { accept: true, label: null },
    legacy: { accept: true, label: 'Legacy code' },
    observed: { accept: true, label: 'Observed in records - verify against MCA' },
    alias: { accept: false, label: null }, // known abbreviation, not a CIN token
  };

  // ---------- small helpers ----------

  // Trim the edges and make letters uppercase. Spaces INSIDE are kept so we can report them.
  function normalize(raw) {
    return String(raw == null ? '' : raw).trim().toUpperCase();
  }

  function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  // Describe a character so the error message makes sense even for invisible ones.
  function describeChar(ch) {
    if (/\s/.test(ch)) return 'a space';
    const code = ch.codePointAt(0);
    const invisible = code < 32 || (code >= 0x200b && code <= 0x200f) || code === 0xfeff;
    if (invisible) {
      return 'an invisible character (U+' + code.toString(16).toUpperCase().padStart(4, '0') + ')';
    }
    return '"' + ch + '"';
  }

  function failure(positions, code, error) {
    return { ok: false, positions, code, error };
  }

  // Look a code up in a reference table and apply the status policy.
  function decodeCode(table, code, positions, what) {
    if (!hasOwn(table, code)) {
      return failure(positions, code, 'Positions ' + positions + ': "' + code + '" is not a recognised ' + what + '.');
    }
    const entry = table[code];
    const policy = STATUS_POLICY[entry.status];
    if (!policy.accept) {
      return failure(
        positions,
        code,
        'Positions ' + positions + ': "' + code + '" is a recognised abbreviation (' + entry.meaning +
          ') but is not accepted as a CIN ' + what + '.'
      );
    }
    return {
      ok: true,
      positions,
      code,
      meaning: entry.meaning,
      status: entry.status,
      label: policy.label,
      note: entry.notes,
    };
  }

  // ---------- CIN ----------

  function validateCIN(raw, options) {
    const now = (options && options.now) || new Date();
    const currentYear = now.getFullYear();
    const input = String(raw == null ? '' : raw);
    const value = normalize(input);

    const result = {
      kind: 'CIN',
      entityType: 'Company',
      input,
      normalized: value,
      valid: false,
      errors: [],
      fields: null,
      note: STRUCTURE_NOTE,
    };
    const fail = (field, positions, message) => {
      result.errors.push({ field, positions, message });
      return result;
    };

    if (value === '') {
      return fail('input', null, 'Nothing to check. Enter a 21-character CIN.');
    }

    // Wrong box? An LLPIN pasted into the CIN section.
    if (LLPIN_PATTERN.test(value)) {
      return fail('input', null, 'This looks like an LLPIN, not a CIN. Check it in the LLPIN section.');
    }

    // Only letters and digits are allowed anywhere. Report the first bad character.
    const bad = value.match(/[^A-Z0-9]/);
    if (bad) {
      return fail(
        'input',
        String(bad.index + 1),
        'Position ' + (bad.index + 1) + ' contains ' + describeChar(bad[0]) +
          '. A CIN has only letters and digits, with no spaces or hyphens.'
      );
    }

    if (value.length !== CIN_LENGTH) {
      const diff = value.length - CIN_LENGTH;
      const detail = diff < 0 ? Math.abs(diff) + ' missing' : diff + ' too many';
      return fail('length', null, 'Length is ' + value.length + ', expected ' + CIN_LENGTH + ' (' + detail + ').');
    }

    // Exactly 21 letters/digits: check each part on its own, so every problem is reported.
    const parts = {
      listing: value.slice(0, 1),
      industry: value.slice(1, 6),
      state: value.slice(6, 8),
      year: value.slice(8, 12),
      companyType: value.slice(12, 15),
      registration: value.slice(15, 21),
    };
    const fields = {};

    // Position 1: L or U
    if (hasOwn(REF.listing, parts.listing)) {
      const entry = REF.listing[parts.listing];
      fields.listing = { ok: true, positions: '1', code: parts.listing, meaning: entry.meaning, status: entry.status, label: null, note: entry.notes };
    } else {
      fields.listing = failure('1', parts.listing, 'Position 1 must be L (listed) or U (unlisted), found "' + parts.listing + '".');
    }

    // Positions 2-6: five digits. Checked for shape only; the industry is not decoded.
    fields.industry = /^[0-9]{5}$/.test(parts.industry)
      ? { ok: true, positions: '2-6', code: parts.industry, meaning: null }
      : failure('2-6', parts.industry, 'Positions 2-6 (industry code) must be 5 digits, found "' + parts.industry + '".');

    // Positions 7-8: two letters, then look the state up.
    fields.state = /^[A-Z]{2}$/.test(parts.state)
      ? decodeCode(REF.state, parts.state, '7-8', 'state/UT code')
      : failure('7-8', parts.state, 'Positions 7-8 (state/UT code) must be 2 letters, found "' + parts.state + '".');

    // Positions 9-12: four digits, between MIN_YEAR and the current year. Read on its own;
    // it is never compared with the state code.
    if (!/^[0-9]{4}$/.test(parts.year)) {
      fields.year = failure('9-12', parts.year, 'Positions 9-12 (incorporation year) must be 4 digits, found "' + parts.year + '".');
    } else {
      const year = Number(parts.year);
      if (year < MIN_YEAR) {
        fields.year = failure('9-12', parts.year, 'Positions 9-12: year ' + year + ' is before ' + MIN_YEAR + ', the earliest year accepted.');
      } else if (year > currentYear) {
        fields.year = failure('9-12', parts.year, 'Positions 9-12: year ' + year + ' is in the future (latest accepted: ' + currentYear + ').');
      } else {
        fields.year = { ok: true, positions: '9-12', code: parts.year, year, meaning: String(year) };
      }
    }

    // Positions 13-15: three letters, then look the company type up.
    fields.companyType = /^[A-Z]{3}$/.test(parts.companyType)
      ? decodeCode(REF.companyType, parts.companyType, '13-15', 'company type code')
      : failure('13-15', parts.companyType, 'Positions 13-15 (company type) must be 3 letters, found "' + parts.companyType + '".');

    // Positions 16-21: six digits. Kept as text so leading zeros survive.
    fields.registration = /^[0-9]{6}$/.test(parts.registration)
      ? { ok: true, positions: '16-21', code: parts.registration, meaning: parts.registration }
      : failure('16-21', parts.registration, 'Positions 16-21 (registration number) must be 6 digits, found "' + parts.registration + '".');

    for (const name of Object.keys(fields)) {
      if (!fields[name].ok) {
        result.errors.push({ field: name, positions: fields[name].positions, message: fields[name].error });
      }
    }
    result.fields = fields;
    result.valid = result.errors.length === 0;
    return result;
  }

  // ---------- LLPIN ----------

  function validateLLPIN(raw) {
    const input = String(raw == null ? '' : raw);
    const value = normalize(input);

    const result = {
      kind: 'LLPIN',
      entityType: 'LLP',
      input,
      normalized: value,
      valid: false,
      formatValid: false,
      errors: [],
      fields: null,
      note: STRUCTURE_NOTE,
    };
    const fail = (field, message) => {
      result.errors.push({ field, positions: null, message });
      return result;
    };

    if (value === '') {
      return fail('input', 'Nothing to check. Enter an LLPIN like AAA-1234.');
    }

    // Wrong box? Something CIN-shaped pasted into the LLPIN section.
    if (/^[A-Z0-9]{21}$/.test(value)) {
      return fail('input', 'This looks like a CIN, not an LLPIN. Check it in the CIN section.');
    }

    if (LLPIN_PATTERN.test(value)) {
      const [prefix, number] = value.split('-');
      result.valid = true;
      result.formatValid = true;
      result.parts = { prefix, number }; // number stays text, so 0012 keeps its zeros
      result.fields = {
        entityType: 'LLP',
        formatValid: true,
        state: NOT_ENCODED,
        year: NOT_ENCODED,
        listing: NOT_ENCODED,
        companyType: NOT_ENCODED,
      };
      return result;
    }

    // Not valid: work out exactly why.
    const space = value.match(/\s/);
    if (space) {
      return fail('input', 'Contains ' + describeChar(space[0]) + ' at position ' + (space.index + 1) + '. Remove spaces; the format is AAA-1234.');
    }
    const dash = value.match(/[\u2010-\u2015\u2212]/);
    if (dash) {
      return fail('input', 'Uses a different dash (' + describeChar(dash[0]) + ') instead of a plain hyphen "-". The format is AAA-1234.');
    }
    const hyphens = value.split('-').length - 1;
    if (hyphens === 0) {
      return fail('hyphen', 'Hyphen missing. The format is 3 letters, a hyphen, then 4 digits, like AAA-1234.');
    }
    if (hyphens > 1) {
      return fail('hyphen', 'Contains ' + hyphens + ' hyphens; expected exactly one, like AAA-1234.');
    }
    const [prefix, number] = value.split('-');
    if (!/^[A-Z]{3}$/.test(prefix)) {
      fail('prefix', 'Before the hyphen: expected exactly 3 letters, found "' + prefix + '" (' + prefix.length + ' characters).');
    }
    if (!/^[0-9]{4}$/.test(number)) {
      fail('number', 'After the hyphen: expected exactly 4 digits, found "' + number + '" (' + number.length + ' characters).');
    }
    return result;
  }

  // ---------- lists (one identifier per line) ----------

  // Split pasted text into lines (Windows, Mac and Linux line endings) and drop blank ones,
  // remembering the original line numbers.
  function splitLines(text) {
    return String(text == null ? '' : text)
      .split(/\r\n|[\r\n\u2028\u2029]/)
      .map((t, i) => ({ line: i + 1, text: t }))
      .filter((l) => l.text.trim() !== '');
  }

  // kind is 'CIN' or 'LLPIN'. Duplicates are only flagged (duplicateOf = first line number);
  // they never change whether a line is valid.
  function checkList(text, kind, options) {
    const check = kind === 'LLPIN' ? validateLLPIN : validateCIN;
    const firstSeen = new Map();
    const results = splitLines(text).map(({ line, text: lineText }) => {
      const r = check(lineText, options);
      r.line = line;
      r.duplicateOf = null;
      if (firstSeen.has(r.normalized)) r.duplicateOf = firstSeen.get(r.normalized);
      else firstSeen.set(r.normalized, line);
      return r;
    });
    const valid = results.filter((r) => r.valid).length;
    return {
      kind,
      results,
      summary: {
        total: results.length,
        valid,
        invalid: results.length - valid,
        duplicates: results.filter((r) => r.duplicateOf !== null).length,
      },
    };
  }

  const api = {
    validateCIN,
    validateLLPIN,
    checkList,
    splitLines,
    normalize,
    CIN_LENGTH,
    MIN_YEAR,
    NOT_ENCODED,
    STRUCTURE_NOTE,
    STATUS_POLICY,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CinChecker = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
