// UI only. All validation comes from CinChecker (validator.js) via CinBatch (batch.js).
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const input = $('input'), results = $('results'), summaryEl = $('summary'), list = $('list'), count = $('count');

  const SAMPLE = [
    'L17110MH1973PLC019786',
    'U40108CT2003SGC015822',
    'AAA-1234',
    'u74999ut2020ptc123456',
    '',
    'U22120CG2014PTC001277',
    'U12345UW1998PLC000001',
    'U12345MH2030PTC000001',
    'AAA1234',
    'l17110mh1973plc019786',
  ].join('\n');

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function updateCount() {
    const n = CinChecker.splitLines(input.value).length;
    count.textContent = n ? n + (n === 1 ? ' identifier' : ' identifiers') : '';
  }

  // One decoded field: value from the validator, plus its legacy/observed label if any.
  function row(label, f, text) {
    if (!f || !f.ok) return '<div><dt>' + label + '</dt><dd class="na">Could not be decoded</dd></div>';
    const flag = f.label ? '<span class="flagnote">' + esc(f.label) + '</span>' : '';
    return '<div><dt>' + label + '</dt><dd>' + esc(text) + flag + '</dd></div>';
  }

  function cinBody(r) {
    if (!r.fields) return ''; // wrong length / bad characters: nothing reliable to decode
    const F = r.fields;
    const segs = [['listing', 'Listing'], ['industry', 'Industry'], ['state', 'State'], ['year', 'Year'], ['companyType', 'Type'], ['registration', 'Serial']]
      .map(([k, name]) => {
        const f = F[k];
        const cls = !f.ok ? ' bad' : f.label ? ' flag' : '';
        return '<span class="seg' + cls + '">' + esc(f.code) + '<small>' + name + '</small></span>';
      }).join('');
    return '<div class="strip" aria-label="Segments of the CIN">' + segs + '</div><dl>' +
      row('Listing indicator', F.listing, F.listing.meaning + ' (' + F.listing.code + ')') +
      row('State / UT', F.state, F.state.meaning + ' (' + F.state.code + ')') +
      row('Year of incorporation', F.year, F.year.meaning) +
      row('Company type', F.companyType, F.companyType.meaning + ' (' + F.companyType.code + ')') +
      row('Registration sequence', F.registration, F.registration.code) + '</dl>';
  }

  function llpinBody(r) {
    if (!r.valid) return '';
    const na = (label, v) => '<div><dt>' + label + '</dt><dd class="na">' + esc(v) + '</dd></div>';
    const F = r.fields;
    return '<dl><div><dt>Prefix</dt><dd>' + esc(r.parts.prefix) + '</dd></div><div><dt>Number</dt><dd>' + esc(r.parts.number) + '</dd></div>' +
      na('State / UT', F.state) + na('Year of incorporation', F.year) + na('Listing indicator', F.listing) + na('Company type', F.companyType) + '</dl>';
  }

  function card(r) {
    const errs = r.errors.length ? '<ul class="errors">' + r.errors.map((e) => '<li>' + esc(e.message) + '</li>').join('') + '</ul>' : '';
    const dup = r.duplicateOf ? '<span class="tag dup">Duplicate of line ' + r.duplicateOf + '</span>' : '';
    return '<article class="card ' + (r.valid ? 'valid' : 'invalid') + '"><div class="card-head">' +
      '<span class="status">' + (r.valid ? 'Valid format' : 'Invalid') + '</span><code class="id">' + esc(r.input.trim()) + '</code>' +
      '<span class="tag">' + r.entityType + (r.kind === 'CIN' ? ' (CIN)' : ' (LLPIN)') + '</span><span class="tag">Line ' + r.line + '</span>' + dup +
      '</div>' + (r.kind === 'CIN' ? cinBody(r) : llpinBody(r)) + errs + '</article>';
  }

  function run() {
    results.hidden = false;
    const { results: rs, summary: s } = CinBatch.checkMixed(input.value);
    if (!rs.length) {
      summaryEl.hidden = true;
      list.innerHTML = '<p class="empty">Nothing to check yet. Paste a CIN such as L17110MH1973PLC019786 or an LLPIN such as AAA-1234, one per line.</p>';
      return;
    }
    summaryEl.hidden = false;
    summaryEl.innerHTML = [['Total', s.total, ''], ['Valid', s.valid, 's-ok'], ['Invalid', s.invalid, 's-bad'], ['Duplicates', s.duplicates, '']]
      .map(([l, n, c]) => '<div class="' + c + '"><b>' + n + '</b><span>' + l + '</span></div>').join('');
    list.innerHTML = rs.map(card).join('');
    results.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  $('check').addEventListener('click', run);
  $('clear').addEventListener('click', () => { input.value = ''; results.hidden = true; updateCount(); input.focus(); });
  $('sample').addEventListener('click', () => { input.value = SAMPLE; updateCount(); run(); });
  $('only-invalid').addEventListener('change', (e) => results.classList.toggle('only-invalid', e.target.checked));
  input.addEventListener('input', updateCount);
})();
