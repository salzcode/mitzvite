// Builds docs/index.html (the invitation page on GitHub Pages) from Rsvp.html.
// Guests then never open a Google page, so being signed in to two Google accounts
// can't break it. The page loads its data from, and sends replies to, the Apps Script web app.
// Run after changing Rsvp.html:  node tools/build-site.js
var fs = require('fs'), path = require('path');
var API = 'https://script.google.com/macros/s/AKfycby8fnTG7R4rCr3pEwtjUt1Cc-L3s5lQC6aaA4GZZ9XVF3O7REK5s7RYraHO3zPk7ygD/exec';
var root = path.join(__dirname, '..');
var html = fs.readFileSync(path.join(root, 'Rsvp.html'), 'utf8');

var marker = '  var M = <?!= modelJson ?>;\n';
var at = html.indexOf(marker), end = html.lastIndexOf('</script>');
if (at < 0 || end < at) throw new Error('Rsvp.html no longer has the expected model line');
var body = html.slice(at + marker.length, end);

var boot = [
  "  var API = '" + API + "';",
  '  // Stands in for google.script.run: the page is not served by Google here.',
  '  var google = { script: { run: (function make(ok, fail) {',
  '    return {',
  '      withSuccessHandler: function (f) { return make(f, fail); },',
  '      withFailureHandler: function (f) { return make(ok, f); },',
  '      submitRsvp: function (token, answers, message) {',
  "        fetch(API, { method: 'POST', credentials: 'omit', body: JSON.stringify({ token: token, answers: answers, message: message }) })",
  '          .then(function (r) { return r.json(); })',
  '          .then(function (res) { if (res && res.ok) { if (ok) ok(res); } else if (fail) fail(new Error((res && res.error) || \'Something went wrong. Please try again.\')); })',
  "          .catch(function () { if (fail) fail(new Error('We could not reach the server. Please check your connection and try again.')); });",
  '      }',
  '    };',
  '  })() } };',
  '  function start(M) {',
  "    var ld = document.getElementById('loading'); if (ld) ld.parentNode.removeChild(ld);",
  "    if (M.child) document.title = M.child + \"'s Bar Mitzvah\";",
  body.replace(/^/gm, '  ').replace(/\s+$/, ''),
  '  }',
  "  var q = location.search ? location.search.slice(1) + '&' : '';",
  "  fetch(API + '?' + q + 'api=model', { credentials: 'omit' })",
  '    .then(function (r) { return r.json(); })',
  '    .then(start)',
  '    .catch(function () {',
  "      document.getElementById('loading').innerHTML = 'We couldn\\'t open your invitation just now.<br><a href=\"' + API + location.search + '\">Tap here to try another way</a>';",
  '    });',
  ''
].join('\n');

var loading = '<div id="loading" style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;' +
  'background:radial-gradient(ellipse at 50% 45%,#2c3a5c,#1f2a44 75%);color:#f3ead6;font:18px/1.6 Georgia,serif;z-index:50">' +
  '<div>Opening your invitation…</div></div>\n';

var out = html.slice(0, at) + boot + html.slice(end);
out = out.replace('<body>\n', '<body>\n' + loading);
out = out.replace('<head>\n', '<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <!-- Built from Rsvp.html by tools/build-site.js. Edit Rsvp.html, then rebuild. -->\n  <meta name="robots" content="noindex">\n  <title>Bar Mitzvah Invitation</title>\n');
fs.writeFileSync(path.join(root, 'docs', 'index.html'), out);
console.log('Wrote docs/index.html (' + out.length + ' bytes)');
