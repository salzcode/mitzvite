/**
 * Bar Mitzvah invitations & RSVPs — Google Sheets + Gmail (Google Apps Script).
 *
 * Lives inside the guest-list spreadsheet (Extensions > Apps Script). Emails go
 * out from the Gmail account that owns the spreadsheet; each family gets a
 * personal RSVP link to a small web page where they answer for the three events
 * and say how many of them will come to each. Answers land back in the sheet.
 *
 * See README.md in this folder for the step-by-step setup.
 */

var SHEET = { SETTINGS: 'Settings', GUESTS: 'Guests', SUMMARY: 'Summary', LOG: 'Log' };
var EVENT_COUNT = 3;

// Guest list columns. The script finds columns by their header text, so you can
// reorder them or add your own columns (address, table, notes...) freely.
var COL = {
  FAMILY: 'Family Name',
  GREETING: 'Greeting',
  EMAIL: 'Email',
  MAX: 'Max Guests',
  TEST: 'Test',
  STATUS: 'Status',
  INVITE_SENT: 'Invite Sent',
  REMINDERS: 'Reminders Sent',
  LAST_REMINDER: 'Last Reminder',
  RESPONDED: 'Responded At',
  MESSAGE: 'Message From Guest',
  TOKEN: 'RSVP Token'
};
function attendingCol_(i) { return 'Event ' + i + ' Attending'; }
function countCol_(i) { return 'Event ' + i + ' Count'; }

function guestHeaders_() {
  var h = [COL.FAMILY, COL.GREETING, COL.EMAIL, COL.MAX, COL.TEST, COL.STATUS];
  for (var i = 1; i <= EVENT_COUNT; i++) h.push(attendingCol_(i), countCol_(i));
  return h.concat([COL.MESSAGE, COL.RESPONDED, COL.INVITE_SENT, COL.REMINDERS, COL.LAST_REMINDER, COL.TOKEN]);
}

var STATUS = { NEW: 'Not invited yet', INVITED: 'Invited – awaiting reply', REPLIED: 'Replied' };

// [setting, default value, help text]
var SETTINGS_SPEC = [
  ['Child Name', 'Noah', 'Used in emails and on the RSVP page.'],
  ['Hosts', 'Sarah & David Cohen', 'Who the invitation is from.'],
  ['Event 1 Name', 'Shabbat Morning Service', ''],
  ['Event 1 When', 'Saturday, March 6, 2027 · 9:30 AM', 'Free text, written exactly as you want guests to see it.'],
  ['Event 1 Where', 'Temple Beth Shalom, 123 Main St', ''],
  ['Event 1 Details', 'Kiddush lunch to follow.', 'Optional extra line.'],
  ['Event 2 Name', 'Friday Night Dinner', ''],
  ['Event 2 When', 'Friday, March 5, 2027 · 7:00 PM', ''],
  ['Event 2 Where', 'Our home', ''],
  ['Event 2 Details', '', ''],
  ['Event 3 Name', 'Celebration Party', ''],
  ['Event 3 When', 'Saturday, March 6, 2027 · 7:00 PM', ''],
  ['Event 3 Where', 'The Grand Ballroom, 456 Oak Ave', ''],
  ['Event 3 Details', 'Dinner, dancing and dessert.', ''],
  ['RSVP Deadline', 'February 1, 2027', 'Shown in emails and on the RSVP page.'],
  ['Invitation Subject', "You're invited to {child}'s Bar Mitzvah", 'Placeholders: {greeting} {family} {child} {hosts} {deadline}'],
  ['Invitation Message', "{greeting},\n\nWe are thrilled to invite you to celebrate {child}'s Bar Mitzvah with us.\n\nPlease let us know which events you'll join, and how many of you will be coming, by {deadline}.\n\nWith love,\n{hosts}", 'The event details and the RSVP button are added below this automatically.'],
  ['Reminder Subject', "Reminder: please RSVP for {child}'s Bar Mitzvah", ''],
  ['Reminder Message', "{greeting},\n\nA gentle reminder: we'd love to know whether you can join us for {child}'s Bar Mitzvah. Please reply by {deadline} using the button below — it only takes a minute.\n\nWith love,\n{hosts}", ''],
  ['Confirmation Subject', "Thank you for your RSVP — {child}'s Bar Mitzvah", 'Sent to the family after they reply.'],
  ['Send Confirmation To Guests', 'TRUE', 'TRUE/FALSE. Each confirmation uses one email from your daily quota.'],
  ['Notify Me Of Replies', '', 'Your email address to get a note each time a family replies (leave blank for none).'],
  ['Email Sender Name', 'Sarah & David Cohen', 'The name guests see in their inbox.'],
  ['Send From Alias', '', 'Optional: a "Send mail as" address already set up in this Gmail account.'],
  ['Reply-To Address', '', 'Optional: where guests\' email replies go (default: this Gmail account).'],
  ['RSVP Page URL', '', 'Paste the Web app URL here after Deploy (ends in /exec).'],
  ['Test Mode', 'TRUE', 'TRUE: bulk sends only go to rows with Test ticked. Set to FALSE to go live.'],
  ['Test Inboxes', '', 'Comma-separated addresses for "Send preview to test inboxes" (Gmail, Outlook, Yahoo, iCloud, mail-tester.com...).']
];

/* ------------------------------------------------------------------ menu */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('🎉 Bar Mitzvah')
    .addItem('Send preview to test inboxes…', 'menuSendPreview')
    .addItem('Get RSVP link for selected family', 'menuShowLink')
    .addSeparator()
    .addItem('Send invitations (everyone not yet invited)…', 'menuSendInvitations')
    .addItem('Send invitation to selected rows…', 'menuSendInvitationsToSelected')
    .addItem('Send reminders (invited, no reply yet)…', 'menuSendReminders')
    .addSeparator()
    .addItem('Refresh summary', 'refreshSummary')
    .addItem('Clear test rows (replies & sent dates)…', 'menuResetTestRows')
    .addItem('Check email quota', 'menuQuota')
    .addSeparator()
    .addItem('Set up / repair sheets', 'setup')
    .addToUi();
}

/* ----------------------------------------------------------------- setup */

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());

  // Settings: add any missing rows, never overwrite values already filled in.
  var st = ss.getSheetByName(SHEET.SETTINGS) || ss.insertSheet(SHEET.SETTINGS, 0);
  if (st.getLastRow() === 0) st.appendRow(['Setting', 'Value', 'Help']);
  var existing = st.getLastRow() > 1 ? st.getRange(2, 1, st.getLastRow() - 1, 1).getValues().map(function (r) { return r[0]; }) : [];
  st.getRange('B:B').setNumberFormat('@'); // keep dates and TRUE/FALSE as typed
  SETTINGS_SPEC.forEach(function (s) {
    if (existing.indexOf(s[0]) === -1) st.appendRow(s);
  });
  st.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#f3e8d0');
  st.getRange(2, 2, st.getLastRow() - 1, 1).setWrap(true);
  st.setColumnWidth(1, 200); st.setColumnWidth(2, 420); st.setColumnWidth(3, 420);
  st.getRange(2, 3, st.getLastRow() - 1, 1).setFontColor('#777').setWrap(true);
  st.setFrozenRows(1);

  // Guests: create, or append any missing columns to the right.
  var g = ss.getSheetByName(SHEET.GUESTS) || ss.insertSheet(SHEET.GUESTS, 1);
  var want = guestHeaders_();
  if (g.getLastColumn() === 0) {
    g.getRange(1, 1, 1, want.length).setValues([want]);
  } else {
    var have = g.getRange(1, 1, 1, g.getLastColumn()).getValues()[0];
    want.forEach(function (h) {
      if (have.indexOf(h) === -1) { g.getRange(1, g.getLastColumn() + 1).setValue(h); have.push(h); }
    });
  }
  var hdr = headerMap_(g);
  g.getRange(1, 1, 1, g.getLastColumn()).setFontWeight('bold').setBackground('#d9ead3').setWrap(true);
  g.setFrozenRows(1);
  g.setFrozenColumns(1);
  var rows = Math.max(g.getMaxRows() - 1, 1);
  g.getRange(2, hdr[COL.TEST] + 1, rows, 1).insertCheckboxes();
  g.getRange(2, hdr[COL.TOKEN] + 1, rows, 1).setFontColor('#999');
  [COL.INVITE_SENT, COL.LAST_REMINDER, COL.RESPONDED].forEach(function (c) {
    g.getRange(2, hdr[c] + 1, rows, 1).setNumberFormat('yyyy-mm-dd hh:mm');
  });
  g.setColumnWidth(hdr[COL.FAMILY] + 1, 180);
  g.setColumnWidth(hdr[COL.GREETING] + 1, 200);
  g.setColumnWidth(hdr[COL.EMAIL] + 1, 240);
  g.setColumnWidth(hdr[COL.STATUS] + 1, 170);
  if (g.getRange(1, 1).getNote() === '') {
    g.getRange(1, 1).setNote('One row per family. Email can hold several addresses separated by commas. ' +
      'Greeting is how the email opens, e.g. "Dear Rachel & Josh". Max Guests caps how many they can RSVP for.');
  }

  if (!ss.getSheetByName(SHEET.SUMMARY)) ss.insertSheet(SHEET.SUMMARY, 2);
  var log = ss.getSheetByName(SHEET.LOG) || ss.insertSheet(SHEET.LOG);
  if (log.getLastRow() === 0) {
    log.appendRow(['When', 'What', 'Family', 'To', 'Result']);
    log.getRange(1, 1, 1, 5).setFontWeight('bold');
    log.setFrozenRows(1);
  }

  var def = ss.getSheetByName('Sheet1');
  if (def && def.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(def);

  refreshSummary();
  toast_('Sheets are ready. Fill in Settings, then add families to Guests.');
}

/* --------------------------------------------------------------- helpers */

function ss_() {
  var ss = null;
  try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { /* web app context */ }
  if (ss) return ss;
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('Run "Set up / repair sheets" from the spreadsheet menu first.');
  return SpreadsheetApp.openById(id);
}

function headerMap_(sheet) {
  var row = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
  var map = {};
  row.forEach(function (h, i) { if (h !== '') map[String(h).trim()] = i; });
  return map;
}

function getSettings_() {
  var sh = ss_().getSheetByName(SHEET.SETTINGS);
  var s = {};
  SETTINGS_SPEC.forEach(function (r) { s[r[0]] = r[1]; });
  if (sh && sh.getLastRow() > 1) {
    var tz = ss_().getSpreadsheetTimeZone();
    sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(function (r) {
      var v = r[1];
      if (v instanceof Date) v = Utilities.formatDate(v, tz, 'EEEE, MMMM d, yyyy');
      if (r[0] !== '') s[String(r[0]).trim()] = String(v).trim();
    });
  }
  s.testMode = isTrue_(s['Test Mode']);
  s.events = [];
  for (var i = 1; i <= EVENT_COUNT; i++) {
    s.events.push({
      name: s['Event ' + i + ' Name'], when: s['Event ' + i + ' When'],
      where: s['Event ' + i + ' Where'], details: s['Event ' + i + ' Details']
    });
  }
  return s;
}

function isTrue_(v) { return v === true || /^(true|yes|y|1|✓)$/i.test(String(v).trim()); }

function guestsSheet_() {
  var g = ss_().getSheetByName(SHEET.GUESTS);
  if (!g) throw new Error('No "Guests" sheet. Run "Set up / repair sheets" first.');
  return g;
}

/** Reads every family row as an object; `row` is the sheet row number. */
function readGuests_() {
  var g = guestsSheet_();
  var hdr = headerMap_(g);
  var missing = guestHeaders_().filter(function (h) { return !(h in hdr); });
  if (missing.length) throw new Error('Guests sheet is missing columns: ' + missing.join(', ') + '. Run "Set up / repair sheets".');
  var last = g.getLastRow();
  if (last < 2) return { sheet: g, hdr: hdr, list: [] };
  var values = g.getRange(2, 1, last - 1, g.getLastColumn()).getValues();
  var list = [];
  values.forEach(function (v, i) {
    if (String(v[hdr[COL.FAMILY]]).trim() === '' && String(v[hdr[COL.EMAIL]]).trim() === '') return;
    var max = parseInt(v[hdr[COL.MAX]], 10);
    var gst = {
      row: i + 2,
      family: String(v[hdr[COL.FAMILY]]).trim(),
      greeting: String(v[hdr[COL.GREETING]]).trim(),
      emails: String(v[hdr[COL.EMAIL]]).split(/[,;\s]+/).map(function (e) { return e.trim(); }).filter(String),
      max: isNaN(max) || max < 1 ? 1 : max,
      test: isTrue_(v[hdr[COL.TEST]]),
      inviteSent: v[hdr[COL.INVITE_SENT]],
      reminders: parseInt(v[hdr[COL.REMINDERS]], 10) || 0,
      responded: v[hdr[COL.RESPONDED]],
      status: String(v[hdr[COL.STATUS]]).trim(),
      token: String(v[hdr[COL.TOKEN]]).trim(),
      message: String(v[hdr[COL.MESSAGE]]),
      answers: []
    };
    for (var e = 1; e <= EVENT_COUNT; e++) {
      var a = String(v[hdr[attendingCol_(e)]]).trim();
      gst.answers.push({ attending: a === '' ? null : /^yes$/i.test(a), count: parseInt(v[hdr[countCol_(e)]], 10) || 0 });
    }
    if (!gst.greeting) gst.greeting = 'Dear ' + (gst.family || 'friends');
    list.push(gst);
  });
  return { sheet: g, hdr: hdr, list: list };
}

function setCell_(sheet, hdr, row, col, value) { sheet.getRange(row, hdr[col] + 1).setValue(value); }

function ensureToken_(data, guest) {
  if (guest.token) return guest.token;
  guest.token = Utilities.getUuid().replace(/-/g, '');
  setCell_(data.sheet, data.hdr, guest.row, COL.TOKEN, guest.token);
  return guest.token;
}

function rsvpUrl_(settings, token, preview) {
  var base = settings['RSVP Page URL'];
  if (!base) { try { base = ScriptApp.getService().getUrl(); } catch (e) { base = ''; } }
  if (!base) throw new Error('Deploy the web app and paste its URL into Settings > "RSVP Page URL" first (see README).');
  return base + (base.indexOf('?') === -1 ? '?' : '&') + 't=' + encodeURIComponent(token) + (preview ? '&preview=1' : '');
}

function fill_(template, guest, s) {
  return String(template || '')
    .replace(/\{greeting\}/g, guest.greeting)
    .replace(/\{family\}/g, guest.family)
    .replace(/\{child\}/g, s['Child Name'])
    .replace(/\{hosts\}/g, s['Hosts'])
    .replace(/\{deadline\}/g, s['RSVP Deadline']);
}

function esc_(t) {
  return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function log_(what, guest, to, result) {
  var sh = ss_().getSheetByName(SHEET.LOG);
  if (sh) sh.appendRow([new Date(), what, guest ? guest.family : '', to, result]);
}

function toast_(msg) {
  try { SpreadsheetApp.getActiveSpreadsheet().toast(msg, 'Bar Mitzvah', 8); } catch (e) { /* no UI */ }
}

/* ---------------------------------------------------------------- emails */

/** kind: 'invite' | 'reminder' | 'confirm' */
function buildEmail_(kind, guest, s, url) {
  var subjectKey = { invite: 'Invitation Subject', reminder: 'Reminder Subject', confirm: 'Confirmation Subject' }[kind];
  var subject = fill_(s[subjectKey], guest, s);
  var intro = kind === 'confirm'
    ? guest.greeting + ',\n\nThank you for letting us know! Here is what we have for you:'
    : fill_(kind === 'invite' ? s['Invitation Message'] : s['Reminder Message'], guest, s);

  var text = intro + '\n\n';
  var rows = '';
  s.events.forEach(function (ev, i) {
    var line = ev.name;
    if (kind === 'confirm') {
      var a = guest.answers[i];
      line += a.attending ? ' — Yes, ' + a.count + (a.count === 1 ? ' guest' : ' guests') : ' — Unable to attend';
    }
    text += '• ' + line + '\n  ' + [ev.when, ev.where, ev.details].filter(String).join('\n  ') + '\n\n';
    rows += '<tr><td style="padding:14px 18px;border-top:1px solid #eadfca">' +
      '<div style="font-size:17px;font-weight:bold;color:#1f2a44">' + esc_(ev.name) + '</div>' +
      (kind === 'confirm' ? '<div style="margin:2px 0 4px;font-weight:bold;color:' + (guest.answers[i].attending ? '#2e7d32' : '#9e3b3b') + '">' +
        esc_(line.slice(ev.name.length + 3)) + '</div>' : '') +
      [ev.when, ev.where, ev.details].filter(String).map(function (t) {
        return '<div style="color:#555;font-size:14px;line-height:1.5">' + esc_(t) + '</div>';
      }).join('') + '</td></tr>';
  });

  var button = kind === 'confirm' ? 'Change my reply' : 'RSVP now';
  text += (kind === 'confirm' ? 'Need to change anything? Use your link: ' : 'Please RSVP here: ') + url + '\n';
  if (kind !== 'confirm') text += 'RSVP by ' + s['RSVP Deadline'] + '.\n';

  var html =
    '<div style="background:#f7f2e8;padding:24px 10px;font-family:Georgia,\'Times New Roman\',serif">' +
    '<table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:10px;border:1px solid #eadfca">' +
    '<tr><td style="padding:28px 24px 8px;text-align:center">' +
    '<div style="letter-spacing:3px;color:#b08d3c;font-size:12px;text-transform:uppercase">Bar Mitzvah</div>' +
    '<div style="font-size:28px;color:#1f2a44;margin-top:6px">' + esc_(s['Child Name']) + '</div></td></tr>' +
    '<tr><td style="padding:12px 24px 18px;font-size:16px;line-height:1.6;color:#333">' +
    esc_(intro).replace(/\n/g, '<br>') + '</td></tr>' +
    '<tr><td style="padding:0 6px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">' + rows + '</table></td></tr>' +
    '<tr><td style="padding:24px;text-align:center">' +
    '<a href="' + esc_(url) + '" style="display:inline-block;background:#1f2a44;color:#ffffff;text-decoration:none;padding:13px 30px;border-radius:6px;font-size:17px;font-family:Arial,sans-serif">' + button + '</a>' +
    (kind !== 'confirm' ? '<div style="margin-top:12px;color:#777;font-size:13px">Please reply by ' + esc_(s['RSVP Deadline']) + '</div>' : '') +
    '<div style="margin-top:14px;color:#999;font-size:12px;font-family:Arial,sans-serif">Button not working? Copy this link into your browser:<br>' +
    '<span style="word-break:break-all">' + esc_(url) + '</span></div>' +
    '</td></tr></table></div>';

  return { subject: subject, text: text, html: html };
}

function send_(to, mail, s) {
  var opts = { htmlBody: mail.html, name: s['Email Sender Name'] || s['Hosts'] };
  if (s['Reply-To Address']) opts.replyTo = s['Reply-To Address'];
  if (s['Send From Alias']) opts.from = s['Send From Alias'];
  GmailApp.sendEmail(to, mail.subject, mail.text, opts);
}

/**
 * Sends invitations or reminders to the given families, stopping cleanly if the
 * daily Gmail quota runs out (the rest can be sent the next day — rows already
 * sent are marked, so re-running picks up where it stopped).
 */
function sendBatch_(kind, guests, data, s) {
  var sent = 0, failed = [], skipped = 0;
  for (var i = 0; i < guests.length; i++) {
    var g = guests[i];
    if (!g.emails.length) { failed.push(g.family + ' (no email)'); continue; }
    if (MailApp.getRemainingDailyQuota() < g.emails.length) { skipped = guests.length - i; break; }
    try {
      var mail = buildEmail_(kind, g, s, rsvpUrl_(s, ensureToken_(data, g), false));
      send_(g.emails.join(','), mail, s);
      var now = new Date();
      if (kind === 'invite') {
        setCell_(data.sheet, data.hdr, g.row, COL.INVITE_SENT, now);
        if (!g.responded) setCell_(data.sheet, data.hdr, g.row, COL.STATUS, STATUS.INVITED);
      } else {
        setCell_(data.sheet, data.hdr, g.row, COL.REMINDERS, g.reminders + 1);
        setCell_(data.sheet, data.hdr, g.row, COL.LAST_REMINDER, now);
      }
      log_(kind === 'invite' ? 'Invitation' : 'Reminder', g, g.emails.join(', '), 'Sent');
      sent++;
    } catch (err) {
      failed.push(g.family + ' (' + err.message + ')');
      log_(kind === 'invite' ? 'Invitation' : 'Reminder', g, g.emails.join(', '), 'FAILED: ' + err.message);
    }
    SpreadsheetApp.flush();
  }
  refreshSummary();
  var msg = 'Sent ' + sent + (kind === 'invite' ? ' invitation' : ' reminder') + (sent === 1 ? '' : 's') + '.';
  if (skipped) msg += '\n\nGmail\'s daily sending limit was reached — ' + skipped + ' famil' + (skipped === 1 ? 'y was' : 'ies were') +
    ' not sent yet. Run the same menu item again tomorrow to continue.';
  if (failed.length) msg += '\n\nProblems:\n' + failed.join('\n');
  return msg;
}

function inScope_(g, s) { return s.testMode ? g.test : !g.test; }

function confirmSend_(ui, what, n, s) {
  if (!n) { ui.alert('Nobody to send to.' + (s.testMode ? '\n\nTest Mode is ON, so only rows with "Test" ticked are included.' : '')); return false; }
  var q = 'Send ' + what + ' to ' + n + ' famil' + (n === 1 ? 'y' : 'ies') + '?';
  if (s.testMode) q += '\n\n(TEST MODE: only rows with "Test" ticked.)';
  q += '\n\nEmails you can still send today: ' + MailApp.getRemainingDailyQuota();
  return ui.alert(q, ui.ButtonSet.YES_NO) === ui.Button.YES;
}

function menuSendInvitations() {
  var ui = SpreadsheetApp.getUi(), s = getSettings_(), data = readGuests_();
  rsvpUrl_(s, 'x', false); // fail early if the page URL isn't set
  var list = data.list.filter(function (g) { return inScope_(g, s) && !g.inviteSent; });
  if (!confirmSend_(ui, 'invitations', list.length, s)) return;
  ui.alert(sendBatch_('invite', list, data, s));
}

function menuSendInvitationsToSelected() {
  var ui = SpreadsheetApp.getUi(), s = getSettings_(), data = readGuests_();
  rsvpUrl_(s, 'x', false);
  var rows = selectedRows_(data);
  var list = data.list.filter(function (g) { return rows.indexOf(g.row) !== -1; });
  if (!list.length) { ui.alert('Select one or more family rows on the Guests sheet first.'); return; }
  var already = list.filter(function (g) { return g.inviteSent; }).length;
  if (!confirmSend_(ui, 'the invitation' + (already ? ' (' + already + ' already invited — they will get it again)' : ''), list.length, s)) return;
  ui.alert(sendBatch_('invite', list, data, s));
}

function menuSendReminders() {
  var ui = SpreadsheetApp.getUi(), s = getSettings_(), data = readGuests_();
  var list = data.list.filter(function (g) { return inScope_(g, s) && g.inviteSent && !g.responded; });
  if (!confirmSend_(ui, 'a reminder', list.length, s)) return;
  ui.alert(sendBatch_('reminder', list, data, s));
}

function selectedRows_(data) {
  var sheet = SpreadsheetApp.getActiveSheet();
  if (sheet.getName() !== SHEET.GUESTS) return [];
  var rows = [];
  sheet.getActiveRangeList().getRanges().forEach(function (r) {
    for (var i = r.getRow(); i < r.getRow() + r.getNumRows(); i++) if (i > 1) rows.push(i);
  });
  return rows;
}

/** Emails a sample invitation and reminder to the Test Inboxes, with a preview link that doesn't save. */
function menuSendPreview() {
  var ui = SpreadsheetApp.getUi(), s = getSettings_(), data = readGuests_();
  var to = String(s['Test Inboxes'] || Session.getActiveUser().getEmail()).split(/[,;\s]+/).filter(String);
  if (!to.length) { ui.alert('Add some addresses to Settings > "Test Inboxes".'); return; }
  var rows = selectedRows_(data);
  var g = data.list.filter(function (x) { return rows.indexOf(x.row) !== -1; })[0] || data.list[0];
  if (!g) { ui.alert('Add at least one family to the Guests sheet first (it is used as the sample).'); return; }
  var q = 'Send a sample invitation and reminder (using "' + g.family + '") to:\n\n' + to.join('\n') +
    '\n\nThe RSVP button in these opens a preview — answers are not saved.';
  if (ui.alert(q, ui.ButtonSet.OK_CANCEL) !== ui.Button.OK) return;
  var url = rsvpUrl_(s, ensureToken_(data, g), true);
  var inv = buildEmail_('invite', g, s, url), rem = buildEmail_('reminder', g, s, url);
  inv.subject = '[Preview] ' + inv.subject; rem.subject = '[Preview] ' + rem.subject;
  to.forEach(function (addr) { send_(addr, inv, s); send_(addr, rem, s); log_('Preview', g, addr, 'Sent'); });
  ui.alert('Sent. Check each inbox — and its Spam/Junk and Promotions folders.\n\n' +
    'If one landed in spam, mark it "Not spam" and move it to the inbox; see README for more deliverability tips.');
}

function menuShowLink() {
  var ui = SpreadsheetApp.getUi(), s = getSettings_(), data = readGuests_();
  var rows = selectedRows_(data);
  var g = data.list.filter(function (x) { return rows.indexOf(x.row) !== -1; })[0];
  if (!g) { ui.alert('Click a family row on the Guests sheet first.'); return; }
  var url = rsvpUrl_(s, ensureToken_(data, g), false);
  var html = HtmlService.createHtmlOutput(
    '<div style="font-family:Arial;font-size:14px">Personal RSVP link for <b>' + esc_(g.family) + '</b> ' +
    '(you can text or WhatsApp it to them):<br><br><textarea style="width:100%;height:80px" onclick="this.select()">' +
    esc_(url) + '</textarea><br><br><a href="' + esc_(url) + '&preview=1" target="_blank">Open a preview (doesn\'t save)</a></div>'
  ).setWidth(480).setHeight(220);
  ui.showModalDialog(html, 'RSVP link');
}

function menuResetTestRows() {
  var ui = SpreadsheetApp.getUi(), data = readGuests_();
  var list = data.list.filter(function (g) { return g.test; });
  if (!list.length) { ui.alert('No rows have "Test" ticked.'); return; }
  if (ui.alert('Clear the replies, sent dates and reminder counts of ' + list.length + ' test row(s)?', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  var clear = [COL.INVITE_SENT, COL.REMINDERS, COL.LAST_REMINDER, COL.RESPONDED, COL.MESSAGE];
  for (var e = 1; e <= EVENT_COUNT; e++) clear.push(attendingCol_(e), countCol_(e));
  list.forEach(function (g) {
    clear.forEach(function (c) { setCell_(data.sheet, data.hdr, g.row, c, ''); });
    setCell_(data.sheet, data.hdr, g.row, COL.STATUS, STATUS.NEW);
  });
  refreshSummary();
  toast_('Test rows cleared.');
}

function menuQuota() {
  SpreadsheetApp.getUi().alert('Emails this account can still send from the script today: ' + MailApp.getRemainingDailyQuota() +
    '\n\n(Each address counts once. A regular Gmail account gets about 100 per day; Google Workspace about 1,500.)');
}

/* ----------------------------------------------------------- RSVP page */

function doGet(e) {
  var p = (e && e.parameter) || {};
  var s = getSettings_();
  var data = readGuests_();
  var token = String(p.t || '').trim();
  var g = token ? data.list.filter(function (x) { return x.token === token; })[0] : null;
  var model = {
    preview: p.preview === '1',
    child: s['Child Name'], hosts: s['Hosts'], deadline: s['RSVP Deadline'],
    events: s.events,
    found: !!g,
    token: token,
    family: g ? g.family : '',
    greeting: g ? g.greeting : '',
    max: g ? g.max : 1,
    answers: g ? g.answers : [],
    message: g ? g.message : '',
    replied: g ? !!g.responded : false
  };
  var t = HtmlService.createTemplateFromFile('Rsvp');
  t.modelJson = JSON.stringify(model).replace(/</g, '\\u003c');
  return t.evaluate()
    .setTitle(s['Child Name'] + "'s Bar Mitzvah · RSVP")
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Called from the RSVP page. answers: [{attending: bool, count: n}, ...] */
function submitRsvp(token, answers, message) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var s = getSettings_(), data = readGuests_();
    var g = data.list.filter(function (x) { return x.token === String(token); })[0];
    if (!g) throw new Error('We could not find your invitation. Please use the link from your email.');
    if (!Array.isArray(answers) || answers.length !== EVENT_COUNT) throw new Error('Please answer for every event.');
    var clean = answers.map(function (a, i) {
      if (!a || typeof a.attending !== 'boolean') throw new Error('Please answer for "' + s.events[i].name + '".');
      var n = a.attending ? parseInt(a.count, 10) : 0;
      if (a.attending && (isNaN(n) || n < 1 || n > g.max)) throw new Error('Please choose how many are coming to "' + s.events[i].name + '".');
      return { attending: a.attending, count: n };
    });
    var now = new Date();
    clean.forEach(function (a, i) {
      setCell_(data.sheet, data.hdr, g.row, attendingCol_(i + 1), a.attending ? 'Yes' : 'No');
      setCell_(data.sheet, data.hdr, g.row, countCol_(i + 1), a.count);
    });
    setCell_(data.sheet, data.hdr, g.row, COL.MESSAGE, String(message || '').slice(0, 2000));
    setCell_(data.sheet, data.hdr, g.row, COL.RESPONDED, now);
    setCell_(data.sheet, data.hdr, g.row, COL.STATUS, STATUS.REPLIED);
    SpreadsheetApp.flush();
    g.answers = clean;
    log_('Reply', g, '', clean.map(function (a, i) { return s.events[i].name + ': ' + (a.attending ? a.count : 'no'); }).join('; '));
    refreshSummary();
  } finally {
    lock.releaseLock();
  }

  // Emails after the lock, so a slow send never blocks another family's reply.
  var url = rsvpUrl_(s, g.token, false);
  if (isTrue_(s['Send Confirmation To Guests']) && g.emails.length && MailApp.getRemainingDailyQuota() >= g.emails.length) {
    try { send_(g.emails.join(','), buildEmail_('confirm', g, s, url), s); log_('Confirmation', g, g.emails.join(', '), 'Sent'); }
    catch (err) { log_('Confirmation', g, g.emails.join(', '), 'FAILED: ' + err.message); }
  }
  if (s['Notify Me Of Replies'] && MailApp.getRemainingDailyQuota() > 0) {
    try {
      var body = g.family + ' replied:\n\n' + clean.map(function (a, i) {
        return s.events[i].name + ': ' + (a.attending ? 'Yes — ' + a.count : 'No');
      }).join('\n') + (message ? '\n\nMessage: ' + message : '') + '\n\n' + ss_().getUrl();
      GmailApp.sendEmail(s['Notify Me Of Replies'], 'RSVP: ' + g.family, body, { name: 'RSVP tracker' });
    } catch (err) { log_('Notify', g, s['Notify Me Of Replies'], 'FAILED: ' + err.message); }
  }
  return { ok: true };
}

/* --------------------------------------------------------------- summary */

function refreshSummary() {
  var ss = ss_(), s = getSettings_(), data = readGuests_();
  var sh = ss.getSheetByName(SHEET.SUMMARY) || ss.insertSheet(SHEET.SUMMARY);
  data.list.forEach(function (g) { // label newly added families
    if (!g.status) setCell_(data.sheet, data.hdr, g.row, COL.STATUS, g.responded ? STATUS.REPLIED : g.inviteSent ? STATUS.INVITED : STATUS.NEW);
  });
  var list = data.list.filter(function (g) { return inScope_(g, s); });
  var invited = list.filter(function (g) { return g.inviteSent; });
  var replied = list.filter(function (g) { return g.responded; });

  var out = [
    [s.testMode ? 'TEST MODE — counting only rows with Test ticked' : 'Live — test rows not counted', '', '', '', ''],
    ['Updated', new Date(), '', '', ''],
    ['', '', '', '', ''],
    ['Families on the list', list.length, '', '', ''],
    ['Invited', invited.length, '', '', ''],
    ['Replied', replied.length, '', '', ''],
    ['Awaiting reply', invited.length - replied.filter(function (g) { return g.inviteSent; }).length, '', '', ''],
    ['Not invited yet', list.length - invited.length, '', '', ''],
    ['', '', '', '', ''],
    ['Event', 'Guests coming', 'Families yes', 'Families no', 'Families no answer yet']
  ];
  s.events.forEach(function (ev, i) {
    var yes = replied.filter(function (g) { return g.answers[i].attending === true; });
    var no = replied.filter(function (g) { return g.answers[i].attending === false; });
    var people = yes.reduce(function (n, g) { return n + g.answers[i].count; }, 0);
    out.push([ev.name, people, yes.length, no.length, list.length - yes.length - no.length]);
  });
  sh.clear();
  sh.getRange(1, 1, out.length, 5).setValues(out);
  sh.getRange(1, 1).setFontWeight('bold').setFontColor(s.testMode ? '#b45309' : '#2e7d32');
  sh.getRange(2, 2).setNumberFormat('yyyy-mm-dd hh:mm').setHorizontalAlignment('left');
  sh.getRange(10, 1, 1, 5).setFontWeight('bold').setBackground('#d9ead3');
  sh.getRange(11, 2, EVENT_COUNT, 1).setFontWeight('bold');
  sh.setColumnWidth(1, 260);
  for (var c = 2; c <= 5; c++) sh.setColumnWidth(c, 140);
}
