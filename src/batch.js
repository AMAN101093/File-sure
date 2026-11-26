// Mixed CIN + LLPIN list checker. Adds NO validation rules: it only decides which existing
// validator (validateCIN / validateLLPIN) each line goes to, then does line numbers,
// duplicates and totals across the whole input. Works in the browser and in Node.
(function (root) {
  'use strict';

  const V = typeof module !== 'undefined' && module.exports ? require('./validator.js') : root.CinChecker;
  const DASH = /[-\u2010-\u2015\u2212]/;

  // LLPIN-shaped = short, and either contains a dash or is 3 letters followed by digits
  // (so "AAA1234" and "AAA 1234" get the helpful LLPIN message, not a CIN length error).
  // Anything 15+ characters is treated as a CIN attempt, so "L17110-MH1973PLC019786"
  // is reported at the stray hyphen. Short junk like "L17110" is reported as a short CIN.
  function detectKind(raw) {
    const v = V.normalize(raw);
    if (v.length < 15 && (DASH.test(v) || /^[A-Z]{3}\s*[0-9]+$/.test(v))) return 'LLPIN';
    return 'CIN';
  }

  function checkMixed(text, options) {
    const firstSeen = new Map();
    const results = V.splitLines(text).map(({ line, text: lineText }) => {
      const r = detectKind(lineText) === 'LLPIN' ? V.validateLLPIN(lineText) : V.validateCIN(lineText, options);
      r.line = line;
      r.duplicateOf = null;
      if (firstSeen.has(r.normalized)) r.duplicateOf = firstSeen.get(r.normalized);
      else firstSeen.set(r.normalized, line);
      return r;
    });
    const valid = results.filter((r) => r.valid).length;
    return {
      results,
      summary: {
        total: results.length,
        valid,
        invalid: results.length - valid,
        duplicates: results.filter((r) => r.duplicateOf !== null).length,
      },
    };
  }

  const api = { detectKind, checkMixed };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CinBatch = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
