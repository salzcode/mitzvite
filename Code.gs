/**
 * Bar Mitzvah invitations & RSVPs — Google Sheets + Gmail (Google Apps Script).
 *
 * Lives inside the guest-list spreadsheet (Extensions > Apps Script) and is
 * published as two web apps from the same code:
 *   - the Dashboard (Execute as: Me, Who has access: Only myself), where you
 *     design the invitation, manage sub-events and the guest list, and send;
 *   - the RSVP page (Execute as: Me, Who has access: Anyone), which each family
 *     opens from the personal link in their email.
 * Emails go out from the Gmail account that owns the spreadsheet. Everything is
 * stored in the spreadsheet's tabs, so you can also read and edit it there.
 *
 * See README.md for the step-by-step setup.
 */

var SHEET = { SETTINGS: 'Settings', EVENTS: 'Events', GUESTS: 'Guests', RESPONSES: 'Responses', SUMMARY: 'Summary', LOG: 'Log' };

// Guest list columns. The script finds columns by their header text, so you can
// reorder them or add your own columns (address, table, notes...) freely.
var COL = {
  FAMILY: 'Family Name',
  GREETING: 'Greeting',
  EMAIL: 'Email',
  MAX: 'Max Guests',
  INVITED_TO: 'Invited To',
  TEST: 'Test',
  STATUS: 'Status',
  MESSAGE: 'Message From Guest',
  RESPONDED: 'Responded At',
  INVITE_SENT: 'Invite Sent',
  REMINDERS: 'Reminders Sent',
  LAST_REMINDER: 'Last Reminder',
  TOKEN: 'RSVP Token'
};
var GUEST_HEADERS = [COL.FAMILY, COL.GREETING, COL.EMAIL, COL.MAX, COL.INVITED_TO, COL.TEST, COL.STATUS, COL.MESSAGE,
  COL.RESPONDED, COL.INVITE_SENT, COL.REMINDERS, COL.LAST_REMINDER, COL.TOKEN];
var EVENT_HEADERS = ['ID', 'Name', 'When', 'Where', 'Details'];
var RESPONSE_HEADERS = ['RSVP Token', 'Family', 'Event ID', 'Event', 'Attending', 'Count', 'Updated'];

var STATUS = { NEW: 'Not invited yet', INVITED: 'Invited – awaiting reply', REPLIED: 'Replied' };

// [setting, default value, help text]
var SETTINGS_SPEC = [
  ['Child Name', 'Noah', 'Shown large at the top of the invitation and the RSVP page.'],
  ['Hosts', 'Sarah & David Cohen', 'Who the invitation is from.'],
  ['Invitation Heading', 'Bar Mitzvah', 'Small line above the name.'],
  ['Font Style', 'classic', 'Chosen in the Dashboard. One of: ' + 'classic, script, formal, modern, soft, hebrew, bold, handwritten.'],
  ['Color Theme', 'navy', 'Chosen in the Dashboard. One of: navy, black, royal, burgundy, forest, sky, blush, slate.'],
  ['Invitation Image', '', 'Managed by the Dashboard (a Google Drive file ID). Leave blank for no picture.'],
  ['Envelope Text', "You're invited", 'Written on the envelope that opens on the invitation website. Also the email heading when there is no picture.'],
  ['Website Message', 'Together with our family\n{hosts}\ninvite you to celebrate the Bar Mitzvah of', 'Shown above the name on the invitation website.'],
  ['RSVP Deadline', 'February 1, 2027', 'Shown in emails and on the RSVP page.'],
  ['Invitation Subject', "You're invited to {child}'s Bar Mitzvah", 'Placeholders: {greeting} {family} {child} {hosts} {deadline}'],
  ['Invitation Message', "{greeting},\n\nWith great joy, we invite you to celebrate {child}'s Bar Mitzvah.\n\nOpen your invitation to see the details and let us know who's coming by {deadline}.\n\nWith love,\n{hosts}", 'Shown under the picture, above the "Open your invitation" button.'],
  ['Reminder Subject', "Reminder: please RSVP for {child}'s Bar Mitzvah", ''],
  ['Reminder Message', "{greeting},\n\nA gentle reminder: we'd love to know whether you can join us for {child}'s Bar Mitzvah. Please reply by {deadline} using the button below — it only takes a minute.\n\nWith love,\n{hosts}", ''],
  ['Confirmation Subject', "Thank you for your RSVP — {child}'s Bar Mitzvah", 'Sent to the family after they reply.'],
  ['Confirmation Message', '{greeting},\n\nThank you for letting us know! Here is what we have for you:', ''],
  ['Picture In Email', 'TRUE', 'TRUE/FALSE. Show the invitation picture in the invitation and reminder emails. Turning it off can help emails avoid spam folders; the picture is still on the invitation page.'],
  ['Send Confirmation To Guests', 'TRUE', 'TRUE/FALSE. Each confirmation uses one email from your daily quota.'],
  ['Notify Me Of Replies', '', 'Your email address to get a note each time a family replies (leave blank for none).'],
  ['Email Sender Name', 'Sarah & David Cohen', 'The name guests see in their inbox.'],
  ['Send From Alias', '', 'Optional: a "Send mail as" address already set up in this Gmail account.'],
  ['Reply-To Address', '', 'Optional: where guests\' email replies go (default: this Gmail account).'],
  ['RSVP Page URL', '', 'The address the email buttons link to: the Web app URL of the RSVP deployment (ends in /exec), or a page that forwards to it, such as https://salzcode.github.io/mitzvite/'],
  ['Dashboard URL', '', 'The Web app URL of the Dashboard deployment (Who has access: Only myself).'],
  ['Test Mode', 'TRUE', 'TRUE: bulk sends only go to families marked Test. Set to FALSE to go live.'],
  ['Test Inboxes', '', 'Comma-separated addresses for preview emails (Gmail, Outlook, Yahoo, iCloud, mail-tester.com...).']
];

/*
 * Look of the invitation. "display" is used for the name and the sub-event
 * titles, "body" for everything else. Each has a fallback for email apps that
 * don't load web fonts (Gmail shows the fallback; Apple Mail and iPhone show
 * the real font). `css` is the Google Fonts request for the pair.
 */
var SERIF = "Georgia,'Times New Roman',serif", SANS = "'Helvetica Neue',Helvetica,Arial,sans-serif";
var FONT_PRESETS = {
  classic: { label: 'Classic', display: "'Playfair Display'," + SERIF, body: "'Lora'," + SERIF,
    css: 'family=Playfair+Display:wght@400;600&family=Lora:ital,wght@0,400;0,600;1,400' },
  script: { label: 'Elegant script', display: "'Great Vibes'," + SERIF, body: "'Cormorant Garamond'," + SERIF, displaySize: 1.5, scriptTitles: true,
    css: 'family=Great+Vibes&family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400' },
  formal: { label: 'Formal engraved', display: "'Cinzel'," + SERIF, body: "'EB Garamond'," + SERIF, displaySize: 0.85,
    css: 'family=Cinzel:wght@400;600&family=EB+Garamond:ital,wght@0,400;0,600;1,400' },
  modern: { label: 'Modern', display: "'Montserrat'," + SANS, body: "'Lato'," + SANS, displaySize: 0.9,
    css: 'family=Montserrat:wght@300;500;600&family=Lato:ital,wght@0,400;0,700;1,400' },
  soft: { label: 'Soft & airy', display: "'Cormorant Garamond'," + SERIF, body: "'Raleway'," + SANS, displaySize: 1.15,
    css: 'family=Cormorant+Garamond:wght@500;600&family=Raleway:wght@400;600' },
  hebrew: { label: 'Hebrew-friendly', display: "'Frank Ruhl Libre'," + SERIF, body: "'Assistant'," + SANS,
    css: 'family=Frank+Ruhl+Libre:wght@400;500;700&family=Assistant:wght@400;600' },
  bold: { label: 'Bold celebration', display: "'Abril Fatface'," + SERIF, body: "'Nunito Sans'," + SANS,
    css: 'family=Abril+Fatface&family=Nunito+Sans:ital,wght@0,400;0,700;1,400' },
  handwritten: { label: 'Handwritten', display: "'Dancing Script'," + SERIF, body: "'Josefin Sans'," + SANS, displaySize: 1.25, scriptTitles: true,
    css: 'family=Dancing+Script:wght@500;700&family=Josefin+Sans:wght@400;600' }
};
// ink: headings and buttons; accent: small heading, rules and numbers; bg: page; tint: soft panels.
var THEMES = {
  navy:     { label: 'Navy & gold',      ink: '#1f2a44', accent: '#b08d3c', bg: '#f7f2e8', tint: '#fbf8f1' },
  black:    { label: 'Black & gold',     ink: '#151515', accent: '#b8913a', bg: '#f3f0ea', tint: '#faf8f4' },
  royal:    { label: 'Royal blue & silver', ink: '#1c3f8f', accent: '#7d8aa0', bg: '#eef2f8', tint: '#f6f8fc' },
  burgundy: { label: 'Burgundy & gold',  ink: '#6b1f2e', accent: '#b4894a', bg: '#f8f1ec', tint: '#fcf8f5' },
  forest:   { label: 'Forest & brass',   ink: '#23432e', accent: '#a98a4f', bg: '#f2f1e8', tint: '#f9f8f2' },
  sky:      { label: 'Sky & sand',       ink: '#22557f', accent: '#c29a5b', bg: '#eef5f9', tint: '#f6fafc' },
  blush:    { label: 'Plum & blush',     ink: '#4f2f45', accent: '#c4879b', bg: '#fbf2f4', tint: '#fdf8f9' },
  slate:    { label: 'Slate & teal',     ink: '#263238', accent: '#2a8c82', bg: '#f0f4f4', tint: '#f7fafa' }
};

/** Blends a #rrggbb colour toward white by `amt` (0–1); email apps don't all support transparency. */
function mix_(hex, amt) {
  var n = parseInt(hex.slice(1), 16), out = '#';
  [16, 8, 0].forEach(function (sh) { var c = (n >> sh) & 255; out += ('0' + Math.round(c + (255 - c) * amt).toString(16)).slice(-2); });
  return out;
}

function style_(s) {
  var f = FONT_PRESETS[s['Font Style']] || FONT_PRESETS.classic;
  var t = THEMES[s['Color Theme']] || THEMES.navy;
  return {
    font: s['Font Style'] in FONT_PRESETS ? s['Font Style'] : 'classic', theme: s['Color Theme'] in THEMES ? s['Color Theme'] : 'navy',
    display: f.display, body: f.body, displaySize: f.displaySize || 1,
    // Script lettering is lovely for the name but hard to read in event titles.
    title: f.scriptTitles ? f.body : f.display, titleWeight: f.scriptTitles ? 600 : 400,
    ink: t.ink, accent: t.accent, bg: t.bg, tint: t.tint,
    fontsUrl: 'https://fonts.googleapis.com/css2?' + f.css + '&display=swap'
  };
}

var DEFAULT_EVENTS = [
  ['E1', 'Friday Night', 'Friday, March 5, 2027 · 7:00 PM', 'Our home', ''],
  ['E2', 'Saturday Morning', 'Saturday, March 6, 2027 · 9:30 AM', 'Temple Beth Shalom, 123 Main St', 'Kiddush lunch to follow.'],
  ['E3', 'Saturday Night', 'Saturday, March 6, 2027 · 7:00 PM', 'The Grand Ballroom, 456 Oak Ave', 'Dinner, dancing and dessert.']
];

/* ------------------------------------------------------------------ menu */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('🎉 Bar Mitzvah')
    .addItem('Open the dashboard', 'menuOpenDashboard')
    .addItem('Refresh summary', 'refreshSummary')
    .addSeparator()
    .addItem('Set up / repair sheets', 'setup')
    .addToUi();
}

function menuOpenDashboard() {
  var url = getSettings_()['Dashboard URL'];
  var ui = SpreadsheetApp.getUi();
  if (!url) { ui.alert('Publish the Dashboard first and paste its URL into Settings > "Dashboard URL" (see README, step 1).'); return; }
  ui.showModalDialog(HtmlService.createHtmlOutput(
    '<div style="font:15px Arial;padding:8px"><a href="' + esc_(url) + '" target="_blank" style="font-size:18px">Open the dashboard ↗</a>' +
    '<p style="color:#777">Tip: bookmark it.</p></div>').setWidth(320).setHeight(120), 'Dashboard');
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

  var ev = ss.getSheetByName(SHEET.EVENTS) || ss.insertSheet(SHEET.EVENTS, 1);
  if (ev.getLastRow() === 0) {
    ev.getRange(1, 1, 1, EVENT_HEADERS.length).setValues([EVENT_HEADERS]);
    ev.getRange(2, 1, DEFAULT_EVENTS.length, EVENT_HEADERS.length).setValues(DEFAULT_EVENTS);
  }
  ev.getRange(1, 1, 1, EVENT_HEADERS.length).setFontWeight('bold').setBackground('#f3e8d0');
  ev.setFrozenRows(1);
  ev.setColumnWidth(2, 220); ev.setColumnWidth(3, 260); ev.setColumnWidth(4, 260); ev.setColumnWidth(5, 260);

  // Guests: create, or append any missing columns to the right.
  var g = ss.getSheetByName(SHEET.GUESTS) || ss.insertSheet(SHEET.GUESTS, 2);
  ensureHeaders_(g, GUEST_HEADERS);
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
      'Greeting is how the email opens, e.g. "Dear Rachel & Josh". Max Guests caps how many they can RSVP for. ' +
      'Invited To lists event IDs from the Events tab (e.g. E1, E3); leave it blank to invite the family to every event.');
  }

  var r = ss.getSheetByName(SHEET.RESPONSES) || ss.insertSheet(SHEET.RESPONSES, 3);
  ensureHeaders_(r, RESPONSE_HEADERS);
  r.getRange(1, 1, 1, RESPONSE_HEADERS.length).setFontWeight('bold').setBackground('#d9ead3');
  r.setFrozenRows(1);
  r.getRange('G:G').setNumberFormat('yyyy-mm-dd hh:mm');
  r.getRange('A:A').setFontColor('#999');

  if (!ss.getSheetByName(SHEET.SUMMARY)) ss.insertSheet(SHEET.SUMMARY, 4);
  var log = ss.getSheetByName(SHEET.LOG) || ss.insertSheet(SHEET.LOG);
  if (log.getLastRow() === 0) {
    log.appendRow(['When', 'What', 'Family', 'To', 'Result']);
    log.getRange(1, 1, 1, 5).setFontWeight('bold');
    log.setFrozenRows(1);
  }

  var def = ss.getSheetByName('Sheet1');
  if (def && def.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(def);

  refreshSummary();
  toast_('Sheets are ready. Next: publish the Dashboard and RSVP page (README step 1).');
}

function ensureHeaders_(sheet, want) {
  if (sheet.getLastColumn() === 0) { sheet.getRange(1, 1, 1, want.length).setValues([want]); return; }
  var have = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); });
  want.forEach(function (h) {
    if (have.indexOf(h) === -1) { sheet.getRange(1, sheet.getLastColumn() + 1).setValue(h); have.push(h); }
  });
}

/* --------------------------------------------------------------- helpers */

function ss_() {
  var ss = null;
  try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { /* web app context */ }
  if (ss) return ss;
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('Run "setup" from the Apps Script editor (or "Set up / repair sheets" in the spreadsheet menu) first.');
  return SpreadsheetApp.openById(id);
}

function sheet_(name) {
  var sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('No "' + name + '" sheet. Run "Set up / repair sheets" first.');
  return sh;
}

function headerMap_(sheet) {
  var row = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
  var map = {};
  row.forEach(function (h, i) { if (h !== '') map[String(h).trim()] = i; });
  return map;
}

function str_(v) { return v == null ? '' : String(v).trim(); }
function isTrue_(v) { return v === true || /^(true|yes|y|1|✓)$/i.test(String(v).trim()); }

/** Only the spreadsheet's owner may use the dashboard functions. */
function isOwner_() {
  var me = '', owner = '';
  try { me = Session.getActiveUser().getEmail(); } catch (e) { /* anonymous */ }
  try { owner = Session.getEffectiveUser().getEmail(); } catch (e) { /* none */ }
  return !!me && me.toLowerCase() === String(owner).toLowerCase();
}
function requireOwner_() {
  if (!isOwner_()) throw new Error('Only the owner of this invitation list can do that.');
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
  return s;
}

function readEvents_() {
  var sh = sheet_(SHEET.EVENTS);
  var hdr = headerMap_(sh);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var out = [];
  sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues().forEach(function (v, i) {
    var ev = { row: i + 2, id: str_(v[hdr.ID]), name: str_(v[hdr.Name]), when: str_(v[hdr.When]), where: str_(v[hdr.Where]), details: str_(v[hdr.Details]) };
    if (ev.id || ev.name) out.push(ev);
  });
  return out;
}

/** Reads every reply, keyed by token then event ID. */
function readResponses_() {
  var sh = sheet_(SHEET.RESPONSES);
  var map = {};
  if (sh.getLastRow() < 2) return map;
  sh.getRange(2, 1, sh.getLastRow() - 1, RESPONSE_HEADERS.length).getValues().forEach(function (v) {
    var t = str_(v[0]);
    if (!t) return;
    (map[t] = map[t] || {})[str_(v[2])] = { attending: /^yes$/i.test(str_(v[4])), count: parseInt(v[5], 10) || 0 };
  });
  return map;
}

/** Reads every family row as an object; `row` is the sheet row number. */
function readGuests_(events) {
  var g = sheet_(SHEET.GUESTS);
  var hdr = headerMap_(g);
  var missing = GUEST_HEADERS.filter(function (h) { return !(h in hdr); });
  if (missing.length) throw new Error('Guests sheet is missing columns: ' + missing.join(', ') + '. Run "Set up / repair sheets".');
  events = events || readEvents_();
  var allIds = events.map(function (e) { return e.id; });
  var responses = readResponses_();
  var last = g.getLastRow();
  var list = [];
  if (last >= 2) {
    g.getRange(2, 1, last - 1, g.getLastColumn()).getValues().forEach(function (v, i) {
      if (str_(v[hdr[COL.FAMILY]]) === '' && str_(v[hdr[COL.EMAIL]]) === '') return;
      var max = parseInt(v[hdr[COL.MAX]], 10);
      var inv = str_(v[hdr[COL.INVITED_TO]]);
      var gst = {
        row: i + 2,
        family: str_(v[hdr[COL.FAMILY]]),
        greetingRaw: str_(v[hdr[COL.GREETING]]),
        emails: String(v[hdr[COL.EMAIL]]).split(/[,;\s]+/).map(function (e) { return e.trim(); }).filter(String),
        max: isNaN(max) || max < 1 ? 1 : max,
        allEvents: inv === '',
        invitedTo: inv === '' ? allIds.slice() : inv.split(/[,;\s]+/).filter(function (id) { return allIds.indexOf(id) !== -1; }),
        test: isTrue_(v[hdr[COL.TEST]]),
        status: str_(v[hdr[COL.STATUS]]),
        message: str_(v[hdr[COL.MESSAGE]]),
        responded: v[hdr[COL.RESPONDED]] || '',
        inviteSent: v[hdr[COL.INVITE_SENT]] || '',
        reminders: parseInt(v[hdr[COL.REMINDERS]], 10) || 0,
        lastReminder: v[hdr[COL.LAST_REMINDER]] || '',
        token: str_(v[hdr[COL.TOKEN]])
      };
      gst.answers = (gst.token && responses[gst.token]) || {};
      gst.greeting = gst.greetingRaw || 'Dear ' + (gst.family || 'friends');
      list.push(gst);
    });
  }
  return { sheet: g, hdr: hdr, list: list, events: events };
}

function eventsFor_(guest, events) {
  return events.filter(function (e) { return guest.invitedTo.indexOf(e.id) !== -1; });
}

function setCell_(sheet, hdr, row, col, value) { sheet.getRange(row, hdr[col] + 1).setValue(value); }

function newToken_() { return Utilities.getUuid().replace(/-/g, ''); }

function ensureToken_(data, guest) {
  if (guest.token) return guest.token;
  guest.token = newToken_();
  setCell_(data.sheet, data.hdr, guest.row, COL.TOKEN, guest.token);
  return guest.token;
}

function rsvpUrl_(settings, token, preview) {
  var base = settings['RSVP Page URL'];
  if (!base) throw new Error('Publish the RSVP page and paste its URL into Settings first (see README, step 1).');
  return base + (base.indexOf('?') === -1 ? '?' : '&') + 't=' + encodeURIComponent(token) + (preview ? '&preview=1' : '');
}

function fill_(template, guest, s) {
  return String(template || '')
    .replace(/\{greeting\}/g, String(guest.greeting || '').replace(/[\s,;:]+$/, ''))
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

/** The invitation picture as a blob, or null. Cached for the length of one run. */
var imageCache_;
function imageBlob_(s) {
  if (imageCache_ !== undefined) return imageCache_;
  imageCache_ = null;
  var id = s['Invitation Image'];
  if (id) { try { imageCache_ = DriveApp.getFileById(id).getBlob(); } catch (e) { imageCache_ = null; } }
  return imageCache_;
}
/** Image source for an email: a "cid:" reference for real emails, a data: URL for on-screen previews. */
function media_(s, forPreview) {
  var pic = imageBlob_(s);
  return { picture: pic ? (forPreview ? 'data:' + pic.getContentType() + ';base64,' + Utilities.base64Encode(pic.getBytes()) : 'cid:invite') : '' };
}

function imageDataUrl_(s) {
  var b = imageBlob_(s);
  return b ? 'data:' + b.getContentType() + ';base64,' + Utilities.base64Encode(b.getBytes()) : '';
}

/* ---------------------------------------------------------------- emails */

/**
 * kind: 'invite' | 'reminder' | 'confirm'. media (see media_) holds the picture
 * source. Invitations and reminders are a short email (picture, message, button)
 * that links to the invitation website; the thank-you lists their answers.
 */
function buildEmail_(kind, guest, s, events, url, media) {
  media = media || {};
  var subjectKey = { invite: 'Invitation Subject', reminder: 'Reminder Subject', confirm: 'Confirmation Subject' }[kind];
  var msgKey = { invite: 'Invitation Message', reminder: 'Reminder Message', confirm: 'Confirmation Message' }[kind];
  var subject = fill_(s[subjectKey], guest, s);
  var intro = fill_(s[msgKey], guest, s);
  var mine = eventsFor_(guest, events);

  var st = style_(s);
  var D = st.display, B = st.body;
  var text = intro + '\n\n';
  var rows = '';
  mine.forEach(function (ev, n) {
    var reply = '';
    if (kind === 'confirm') {
      var a = guest.answers[ev.id];
      reply = !a ? 'No answer' : a.attending ? 'Yes, ' + a.count + (a.count === 1 ? ' guest' : ' guests') : 'Unable to attend';
    }
    text += (n + 1) + '. ' + ev.name + (reply ? ' — ' + reply : '') + '\n  ' + [ev.when, ev.where, ev.details].filter(String).join('\n  ') + '\n\n';
    rows += '<tr><td style="padding:0 0 12px">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' + st.tint + ';border-radius:8px;border-left:3px solid ' + st.accent + '"><tr>' +
      '<td width="44" valign="top" style="padding:16px 0 16px 16px;font-family:' + B + ';font-size:13px;letter-spacing:1px;color:' + st.accent + '">' + ('0' + (n + 1)).slice(-2) + '</td>' +
      '<td style="padding:14px 18px 14px 6px">' +
      '<div style="font-family:' + st.title + ';font-weight:' + st.titleWeight + ';font-size:' + (st.titleWeight > 400 ? 18 : Math.round(20 * Math.min(st.displaySize, 1.2))) + 'px;line-height:1.25;color:' + st.ink + '">' + esc_(ev.name) + '</div>' +
      (reply ? '<div style="margin:4px 0 2px;font-family:' + B + ';font-weight:bold;font-size:14px;color:' + (/^Yes/.test(reply) ? '#2e7d32' : '#9e3b3b') + '">' + esc_(reply) + '</div>' : '') +
      [ev.when, ev.where, ev.details].filter(String).map(function (t, i) {
        return '<div style="font-family:' + B + ';color:' + (i === 0 ? '#333' : '#666') + ';font-size:14px;line-height:1.55' + (i === 2 ? ';font-style:italic' : '') + '">' + esc_(t) + '</div>';
      }).join('') + '</td></tr></table></td></tr>';
  });

  var button = kind === 'confirm' ? 'Change my reply' : 'RSVP now';
  text += (kind === 'confirm' ? 'Need to change anything? Use your link: ' : 'Please RSVP here: ') + url + '\n';
  if (kind !== 'confirm') text += 'RSVP by ' + s['RSVP Deadline'] + '.\n';

  var rule = '<table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:14px auto"><tr>' +
    '<td style="width:44px;border-top:1px solid ' + st.accent + '"></td><td style="padding:0 8px;color:' + st.accent + ';font-size:10px;line-height:1">◆</td>' +
    '<td style="width:44px;border-top:1px solid ' + st.accent + '"></td></tr></table>';

  if (kind !== 'confirm') {
    return { subject: subject, text: simpleText_(intro, url, mine), html: simpleEmail_(s, st, intro, url, media, mine) };
  }
  var imgSrc = media.picture;
  var html =
    '<link href="' + esc_(st.fontsUrl) + '" rel="stylesheet">' +
    '<div style="background:' + st.bg + ';padding:28px 10px;font-family:' + B + '">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:580px;margin:0 auto;background:#ffffff;border-radius:12px;border:1px solid ' + mix_(st.accent, 0.65) + '">' +
    (imgSrc ? '<tr><td style="padding:0"><img src="' + esc_(imgSrc) + '" alt="" width="580" style="display:block;width:100%;max-width:580px;height:auto;border-radius:12px 12px 0 0"></td></tr>' : '') +
    '<tr><td style="padding:36px 32px 0;text-align:center">' +
    (s['Invitation Heading'] ? '<div style="font-family:' + B + ';letter-spacing:4px;color:' + st.accent + ';font-size:12px;text-transform:uppercase">' + esc_(s['Invitation Heading']) + '</div>' : '') +
    '<div style="font-family:' + D + ';font-size:' + Math.round(40 * st.displaySize) + 'px;line-height:1.15;color:' + st.ink + ';margin-top:10px">' + esc_(s['Child Name']) + '</div>' +
    rule + '</td></tr>' +
    '<tr><td style="padding:6px 36px 22px;font-family:' + B + ';font-size:16px;line-height:1.7;color:#333">' +
    esc_(intro).replace(/\n/g, '<br>') + '</td></tr>' +
    '<tr><td style="padding:0 24px 8px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">' + rows + '</table></td></tr>' +
    '<tr><td style="padding:18px 24px 34px;text-align:center">' +
    '<a href="' + esc_(url) + '" style="display:inline-block;background:' + st.ink + ';color:#ffffff;text-decoration:none;padding:15px 40px;border-radius:999px;font-family:' + B + ';font-size:16px;letter-spacing:1px">' + button + '</a>' +
    (kind !== 'confirm' ? '<div style="margin-top:14px;font-family:' + B + ';color:#777;font-size:13px;font-style:italic">Kindly reply by ' + esc_(s['RSVP Deadline']) + '</div>' : '') +
    '</td></tr></table>' +
    '<div style="max-width:580px;margin:14px auto 0;text-align:center;color:#999;font-size:11px;font-family:Arial,sans-serif">Button not working? Copy this link into your browser:<br>' +
    '<span style="word-break:break-all">' + esc_(url) + '</span></div></div>';

  return { subject: subject, text: text, html: html };
}

/**
 * Invitation and reminder emails, written to look like a personal letter rather than a
 * newsletter (that matters to spam filters): the picture, the message, and one plain link
 * placed just before the sign-off.
 */
function letterParts_(intro) {
  var paras = String(intro).split(/\n\s*\n/);
  var signoff = paras.length > 2 ? paras.pop() : '';
  return { body: paras, signoff: signoff };
}
function simpleEmail_(s, st, intro, url, media, events) {
  var parts = letterParts_(intro);
  var p = function (t) { return '<p style="margin:0 0 16px">' + esc_(t).replace(/\n/g, '<br>') + '</p>'; };
  // The family's sub-events, written out: useful to guests, and it keeps the email from
  // being "mostly picture", which spam filters penalise.
  var list = (events || []).length ? '<p style="margin:0 0 6px">' + 'We hope you can join us for:' + '</p>' +
    '<ul style="margin:0 0 16px;padding-left:22px">' + events.map(function (ev) {
      return '<li style="margin:0 0 8px"><b>' + esc_(ev.name) + '</b>' + [ev.when, ev.where].filter(String).map(function (t) { return '<br>' + esc_(t); }).join('') + '</li>';
    }).join('') + '</ul>' : '';
  return '<div style="font-family:Georgia,\'Times New Roman\',serif;font-size:16px;line-height:1.6;color:#222;max-width:560px">' +
    (media.picture && isTrue_(s['Picture In Email']) ? '<p style="margin:0 0 18px"><img src="' + esc_(media.picture) + '" alt="' + esc_(s['Child Name'] + '\'s Bar Mitzvah') +
      '" width="560" style="display:block;width:100%;max-width:560px;height:auto;border:0;border-radius:6px"></p>' : '') +
    parts.body.map(p).join('') + list +
    '<p style="margin:0 0 20px"><a href="' + esc_(url) + '" style="color:' + st.ink + ';font-weight:bold">Open your invitation and RSVP</a></p>' +
    (parts.signoff ? p(parts.signoff) : '') +
    '</div>';
}
function simpleText_(intro, url, events) {
  var parts = letterParts_(intro);
  var list = (events || []).length ? '\n\nWe hope you can join us for:\n' + events.map(function (ev) {
    return '- ' + ev.name + [ev.when, ev.where].filter(String).map(function (t) { return '\n  ' + t; }).join('');
  }).join('\n') : '';
  return parts.body.join('\n\n') + list + '\n\nOpen your invitation and RSVP:\n' + url + (parts.signoff ? '\n\n' + parts.signoff : '') + '\n';
}

function send_(to, mail, s) {
  var opts = { htmlBody: mail.html, name: s['Email Sender Name'] || s['Hosts'] };
  if (s['Reply-To Address']) opts.replyTo = s['Reply-To Address'];
  if (s['Send From Alias']) opts.from = s['Send From Alias'];
  var img = imageBlob_(s);
  if (img && mail.html.indexOf('cid:invite') !== -1) opts.inlineImages = { invite: img };
  GmailApp.sendEmail(to, mail.subject, mail.text, opts);
}

/**
 * Sends invitations or reminders to the given families, stopping cleanly if the
 * daily Gmail quota runs out (the rest can be sent the next day — rows already
 * sent are marked, so re-running picks up where it stopped).
 */
function sendBatch_(kind, guests, data, s) {
  var sent = 0, failed = [], skipped = 0;
  var media = media_(s, false);
  for (var i = 0; i < guests.length; i++) {
    var g = guests[i];
    if (!g.emails.length) { failed.push(g.family + ' (no email)'); continue; }
    if (!eventsFor_(g, data.events).length) { failed.push(g.family + ' (not invited to any event)'); continue; }
    if (MailApp.getRemainingDailyQuota() < g.emails.length) { skipped = guests.length - i; break; }
    try {
      send_(g.emails.join(','), buildEmail_(kind, g, s, data.events, rsvpUrl_(s, ensureToken_(data, g), false), media), s);
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
  if (skipped) msg += ' Gmail\'s daily sending limit was reached, so ' + skipped + ' famil' + (skipped === 1 ? 'y was' : 'ies were') +
    ' not sent yet. Send again tomorrow to continue.';
  if (failed.length) msg += ' Problems: ' + failed.join('; ') + '.';
  return msg;
}

function inScope_(g, s) { return s.testMode ? g.test : !g.test; }

/* ------------------------------------------------- Gmail drafts (send by hand) */

/*
 * Instead of the script sending, it can put each family's personalised email in your Gmail
 * Drafts folder; you press Send on each one in Gmail, so it is an ordinary email from you.
 * Pending drafts are remembered here, and once a draft has left the Drafts folder the family
 * is marked as invited (or reminded).
 */
function pendingDrafts_() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('PENDING_DRAFTS') || '{}'); } catch (e) { return {}; }
}
function savePendingDrafts_(p) { PropertiesService.getScriptProperties().setProperty('PENDING_DRAFTS', JSON.stringify(p)); }

/** Marks families whose draft has been sent (or removed) from Gmail. Returns how many drafts are still waiting, and whether any rows changed. */
function syncDrafts_(data) {
  var pending = pendingDrafts_(), ids = Object.keys(pending);
  if (!ids.length) return { waiting: 0, changed: false };
  var live = {};
  GmailApp.getDrafts().forEach(function (d) { live[d.getId()] = true; });
  var changed = false, now = new Date();
  ids.forEach(function (id) {
    if (live[id]) return;
    var p = pending[id], g = data.list.filter(function (x) { return x.token === p.token; })[0];
    if (g) {
      if (p.kind === 'invite') {
        setCell_(data.sheet, data.hdr, g.row, COL.INVITE_SENT, now);
        if (!g.responded) setCell_(data.sheet, data.hdr, g.row, COL.STATUS, STATUS.INVITED);
      } else {
        setCell_(data.sheet, data.hdr, g.row, COL.REMINDERS, g.reminders + 1);
        setCell_(data.sheet, data.hdr, g.row, COL.LAST_REMINDER, now);
      }
      log_(p.kind === 'invite' ? 'Invitation' : 'Reminder', g, g.emails.join(', '), 'Sent by hand from Gmail Drafts');
    }
    delete pending[id]; changed = true;
  });
  if (changed) { savePendingDrafts_(pending); SpreadsheetApp.flush(); }
  return { waiting: Object.keys(pending).length, changed: changed };
}

/** mode: 'new' or 'reminders'. Creates a Gmail draft for each family instead of sending. */
function createDrafts(mode) {
  requireOwner_();
  var s = getSettings_(), data = readGuests_();
  syncDrafts_(data);
  data = readGuests_();
  rsvpUrl_(s, 'x', false);
  var pending = pendingDrafts_(), waiting = {};
  Object.keys(pending).forEach(function (id) { waiting[pending[id].token] = true; });
  var kind = mode === 'reminders' ? 'reminder' : 'invite';
  var list = data.list.filter(function (g) {
    return inScope_(g, s) && !waiting[g.token] && (kind === 'invite' ? !g.inviteSent : g.inviteSent && !g.responded);
  });
  if (!list.length) throw new Error('Nobody to write to.' + (s.testMode ? ' Test Mode is on, so only families marked Test are included.' : ''));
  var media = media_(s, false), img = imageBlob_(s), made = 0, failed = [];
  list.forEach(function (g) {
    if (!g.emails.length) { failed.push(g.family + ' (no email)'); return; }
    if (!eventsFor_(g, data.events).length) { failed.push(g.family + ' (not invited to any event)'); return; }
    try {
      var mail = buildEmail_(kind, g, s, data.events, rsvpUrl_(s, ensureToken_(data, g), false), media);
      var opts = { htmlBody: mail.html, name: s['Email Sender Name'] || s['Hosts'] };
      if (s['Reply-To Address']) opts.replyTo = s['Reply-To Address'];
      if (s['Send From Alias']) opts.from = s['Send From Alias'];
      if (img && mail.html.indexOf('cid:invite') !== -1) opts.inlineImages = { invite: img };
      var d = GmailApp.createDraft(g.emails.join(','), mail.subject, mail.text, opts);
      pending[d.getId()] = { token: g.token, kind: kind };
      log_(kind === 'invite' ? 'Invitation' : 'Reminder', g, g.emails.join(', '), 'Draft created in Gmail');
      made++;
    } catch (err) { failed.push(g.family + ' (' + err.message + ')'); }
  });
  savePendingDrafts_(pending);
  var d2 = getDashboard();
  d2.notice = 'Created ' + made + ' draft' + (made === 1 ? '' : 's') + ' in your Gmail Drafts folder. Open each one and press Send.' +
    (failed.length ? ' Problems: ' + failed.join('; ') + '.' : '');
  return d2;
}

/* ------------------------------------------------------------ web pages */

function doGet(e) {
  var p = (e && e.parameter) || {};
  var token = str_(p.t);
  // The invitation page hosted on GitHub asks for its data here, so guests never open a Google page.
  if (p.api === 'model') return json_(rsvpModel_(token, p.preview === '1'));
  if (!token && isOwner_()) {
    return HtmlService.createTemplateFromFile('Dashboard').evaluate()
      .setTitle('Invitations dashboard')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  var s = getSettings_();
  var t = HtmlService.createTemplateFromFile('Rsvp');
  t.modelJson = JSON.stringify(rsvpModel_(token, p.preview === '1')).replace(/</g, '\\u003c');
  return t.evaluate()
    .setTitle(s['Child Name'] + "'s Bar Mitzvah · RSVP")
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Everything the invitation page shows for one family (or a not-found page when the code is unknown). */
function rsvpModel_(token, preview) {
  var s = getSettings_();
  var data = readGuests_();
  var g = token ? data.list.filter(function (x) { return x.token === token; })[0] : null;
  var mine = g ? eventsFor_(g, data.events) : [];
  return {
    preview: !!preview,
    heading: s['Invitation Heading'], child: s['Child Name'], hosts: s['Hosts'], deadline: s['RSVP Deadline'],
    image: imageDataUrl_(s),
    style: style_(s),
    envelopeText: s['Envelope Text'],
    websiteMessage: g ? fill_(s['Website Message'], g, s) : '',
    events: mine.map(function (ev) { return { id: ev.id, name: ev.name, when: ev.when, where: ev.where, details: ev.details }; }),
    found: !!g,
    token: token,
    family: g ? g.family : '',
    greeting: g ? g.greeting : '',
    max: g ? g.max : 1,
    answers: g ? g.answers : {},
    message: g ? g.message : '',
    replied: g ? !!g.responded : false
  };
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/** Replies sent from the invitation page hosted on GitHub. Body: {token, answers, message} as text. */
function doPost(e) {
  try {
    var b = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    submitRsvp(b.token, b.answers, b.message);
    return json_({ ok: true });
  } catch (err) {
    return json_({ error: err.message || String(err) });
  }
}

/** Called from the RSVP page. answers: {eventId: {attending: bool, count: n}, ...} */
function submitRsvp(token, answers, message) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  var s, data, g, clean = {}, mine;
  try {
    s = getSettings_(); data = readGuests_();
    g = data.list.filter(function (x) { return x.token === String(token); })[0];
    if (!g || !token) throw new Error('We could not find your invitation. Please use the link from your email.');
    mine = eventsFor_(g, data.events);
    if (!answers || typeof answers !== 'object') throw new Error('Please answer for every event.');
    mine.forEach(function (ev) {
      var a = answers[ev.id];
      if (!a || typeof a.attending !== 'boolean') throw new Error('Please answer for "' + ev.name + '".');
      var n = a.attending ? parseInt(a.count, 10) : 0;
      if (a.attending && (isNaN(n) || n < 1 || n > g.max)) throw new Error('Please choose how many are coming to "' + ev.name + '".');
      clean[ev.id] = { attending: a.attending, count: n };
    });
    var now = new Date();
    writeResponses_(g, mine, clean, now);
    setCell_(data.sheet, data.hdr, g.row, COL.MESSAGE, String(message || '').slice(0, 2000));
    setCell_(data.sheet, data.hdr, g.row, COL.RESPONDED, now);
    setCell_(data.sheet, data.hdr, g.row, COL.STATUS, STATUS.REPLIED);
    SpreadsheetApp.flush();
    g.answers = clean;
    log_('Reply', g, '', mine.map(function (ev) { return ev.name + ': ' + (clean[ev.id].attending ? clean[ev.id].count : 'no'); }).join('; '));
    refreshSummary();
  } finally {
    lock.releaseLock();
  }

  // Emails after the lock, so a slow send never blocks another family's reply.
  var url = rsvpUrl_(s, g.token, false);
  if (isTrue_(s['Send Confirmation To Guests']) && g.emails.length && MailApp.getRemainingDailyQuota() >= g.emails.length) {
    try {
      send_(g.emails.join(','), buildEmail_('confirm', g, s, data.events, url, media_(s, false)), s);
      log_('Confirmation', g, g.emails.join(', '), 'Sent');
    } catch (err) { log_('Confirmation', g, g.emails.join(', '), 'FAILED: ' + err.message); }
  }
  if (s['Notify Me Of Replies'] && MailApp.getRemainingDailyQuota() > 0) {
    try {
      var body = g.family + ' replied:\n\n' + mine.map(function (ev) {
        var a = clean[ev.id];
        return ev.name + ': ' + (a.attending ? 'Yes — ' + a.count : 'No');
      }).join('\n') + (message ? '\n\nMessage: ' + message : '') + '\n\n' + (s['Dashboard URL'] || ss_().getUrl());
      GmailApp.sendEmail(s['Notify Me Of Replies'], 'RSVP: ' + g.family, body, { name: 'RSVP tracker' });
    } catch (err) { log_('Notify', g, s['Notify Me Of Replies'], 'FAILED: ' + err.message); }
  }
  return { ok: true };
}

/** Replaces this family's rows in the Responses sheet. */
function writeResponses_(g, events, answers, when) {
  var sh = sheet_(SHEET.RESPONSES);
  clearResponses_(sh, g.token);
  var rows = events.map(function (ev) {
    var a = answers[ev.id];
    return [g.token, g.family, ev.id, ev.name, a.attending ? 'Yes' : 'No', a.count, when];
  });
  if (rows.length) sh.getRange(sh.getLastRow() + 1, 1, rows.length, RESPONSE_HEADERS.length).setValues(rows);
}

function clearResponses_(sh, token) {
  for (var r = sh.getLastRow(); r >= 2; r--) {
    if (str_(sh.getRange(r, 1).getValue()) === token) sh.deleteRow(r);
  }
}

/* -------------------------------------------------------------- summary */

function stats_(data, s) {
  var list = data.list.filter(function (g) { return inScope_(g, s); });
  var invited = list.filter(function (g) { return g.inviteSent; });
  var replied = list.filter(function (g) { return g.responded; });
  return {
    families: list.length,
    invited: invited.length,
    replied: replied.length,
    awaiting: invited.filter(function (g) { return !g.responded; }).length,
    notInvited: list.length - invited.length,
    events: data.events.map(function (ev) {
      var on = list.filter(function (g) { return g.invitedTo.indexOf(ev.id) !== -1; });
      var yes = on.filter(function (g) { return g.answers[ev.id] && g.answers[ev.id].attending; });
      var no = on.filter(function (g) { return g.answers[ev.id] && !g.answers[ev.id].attending; });
      return {
        id: ev.id, name: ev.name, invitedFamilies: on.length,
        guests: yes.reduce(function (n, g) { return n + g.answers[ev.id].count; }, 0),
        yes: yes.length, no: no.length, pending: on.length - yes.length - no.length,
        maxGuests: on.reduce(function (n, g) { return n + g.max; }, 0)
      };
    })
  };
}

function refreshSummary() {
  var ss = ss_(), s = getSettings_(), data = readGuests_();
  var sh = ss.getSheetByName(SHEET.SUMMARY) || ss.insertSheet(SHEET.SUMMARY);
  data.list.forEach(function (g) { // label newly added families
    if (!g.status) setCell_(data.sheet, data.hdr, g.row, COL.STATUS, g.responded ? STATUS.REPLIED : g.inviteSent ? STATUS.INVITED : STATUS.NEW);
  });
  var st = stats_(data, s);
  var out = [
    [s.testMode ? 'TEST MODE — counting only families marked Test' : 'Live — test families not counted', '', '', '', '', ''],
    ['Updated', new Date(), '', '', '', ''],
    ['', '', '', '', '', ''],
    ['Families on the list', st.families, '', '', '', ''],
    ['Invited', st.invited, '', '', '', ''],
    ['Replied', st.replied, '', '', '', ''],
    ['Awaiting reply', st.awaiting, '', '', '', ''],
    ['Not invited yet', st.notInvited, '', '', '', ''],
    ['', '', '', '', '', ''],
    ['Event', 'Guests coming', 'Families invited', 'Families yes', 'Families no', 'No answer yet']
  ];
  st.events.forEach(function (e) { out.push([e.name, e.guests, e.invitedFamilies, e.yes, e.no, e.pending]); });
  sh.clear();
  sh.getRange(1, 1, out.length, 6).setValues(out);
  sh.getRange(1, 1).setFontWeight('bold').setFontColor(s.testMode ? '#b45309' : '#2e7d32');
  sh.getRange(2, 2).setNumberFormat('yyyy-mm-dd hh:mm').setHorizontalAlignment('left');
  sh.getRange(10, 1, 1, 6).setFontWeight('bold').setBackground('#d9ead3');
  if (st.events.length) sh.getRange(11, 2, st.events.length, 1).setFontWeight('bold');
  sh.setColumnWidth(1, 260);
  for (var c = 2; c <= 6; c++) sh.setColumnWidth(c, 130);
}

/* ------------------------------------------------------ dashboard (API) */
/* Every function below is called from Dashboard.html and is owner-only.  */

var MANAGED_SETTINGS = ['Invitation Image'];
var EDITABLE_SETTINGS = SETTINGS_SPEC.map(function (r) { return r[0]; }).filter(function (k) { return MANAGED_SETTINGS.indexOf(k) === -1; });

function fmtDate_(v) {
  if (!(v instanceof Date)) return str_(v);
  return Utilities.formatDate(v, ss_().getSpreadsheetTimeZone(), 'MMM d, h:mm a');
}

function guestView_(g) {
  return {
    token: g.token, family: g.family, greeting: g.greetingRaw, emails: g.emails.join(', '), max: g.max,
    invitedTo: g.invitedTo, test: g.test, status: g.status || STATUS.NEW, message: g.message,
    responded: fmtDate_(g.responded), inviteSent: fmtDate_(g.inviteSent), reminders: g.reminders,
    answers: g.answers
  };
}

/** Everything the dashboard shows, in one call. */
function getDashboard() {
  requireOwner_();
  var s = getSettings_();
  var data = readGuests_();
  // Give every family a token so the dashboard can address rows reliably.
  data.list.forEach(function (g) { ensureToken_(data, g); });
  var draftsWaiting = 0;
  try {
    var sync = syncDrafts_(data);
    draftsWaiting = sync.waiting;
    if (sync.changed) data = readGuests_();
  } catch (e) { /* Gmail unavailable */ }
  var settings = {};
  EDITABLE_SETTINGS.forEach(function (k) { settings[k] = s[k]; });
  return {
    settings: settings,
    help: SETTINGS_SPEC.reduce(function (m, r) { m[r[0]] = r[2]; return m; }, {}),
    testMode: s.testMode,
    image: imageDataUrl_(s),
    imageId: s['Invitation Image'],
    style: style_(s),
    fonts: Object.keys(FONT_PRESETS).map(function (k) { var f = FONT_PRESETS[k]; return { key: k, label: f.label, display: f.display, body: f.body, displaySize: f.displaySize || 1 }; }),
    themes: Object.keys(THEMES).map(function (k) { var t = THEMES[k]; return { key: k, label: t.label, ink: t.ink, accent: t.accent, bg: t.bg }; }),
    allFontsUrl: 'https://fonts.googleapis.com/css2?' + Object.keys(FONT_PRESETS).map(function (k) { return FONT_PRESETS[k].css; }).join('&') + '&display=swap',
    events: data.events.map(function (e) { return { id: e.id, name: e.name, when: e.when, where: e.where, details: e.details }; }),
    guests: data.list.map(guestView_),
    stats: stats_(data, s),
    quota: MailApp.getRemainingDailyQuota(),
    draftsWaiting: draftsWaiting,
    sheetUrl: ss_().getUrl(),
    owner: Session.getEffectiveUser().getEmail()
  };
}

function saveSettings(values) {
  requireOwner_();
  var sh = sheet_(SHEET.SETTINGS);
  var keys = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 1).getValues().map(function (r) { return str_(r[0]); });
  Object.keys(values || {}).forEach(function (k) {
    if (EDITABLE_SETTINGS.indexOf(k) === -1) return;
    var v = values[k] === true ? 'TRUE' : values[k] === false ? 'FALSE' : String(values[k] == null ? '' : values[k]);
    var i = keys.indexOf(k);
    if (i === -1) { sh.appendRow([k, v, '']); keys.push(k); } else sh.getRange(i + 2, 2).setValue(v);
  });
  SpreadsheetApp.flush();
  refreshSummary();
  return getDashboard();
}

/** Creates or updates an event. inviteAll: for a new event, also invite every family to it. */
function saveEvent(ev, inviteAll) {
  requireOwner_();
  var sh = sheet_(SHEET.EVENTS);
  var events = readEvents_();
  var name = str_(ev && ev.name);
  if (!name) throw new Error('Give the event a name.');
  var row = [str_(ev.id), name, str_(ev.when), str_(ev.where), str_(ev.details)];
  var existing = ev.id ? events.filter(function (e) { return e.id === ev.id; })[0] : null;
  if (existing) {
    sh.getRange(existing.row, 1, 1, EVENT_HEADERS.length).setValues([row]);
  } else {
    var n = 1;
    while (events.some(function (e) { return e.id === 'E' + n; })) n++;
    row[0] = 'E' + n;
    // Families whose "Invited To" is blank are invited to every event, including
    // new ones. If this event is only for some families, pin everyone else's list first.
    if (!inviteAll) pinInvites_(events);
    else appendInvite_(row[0]);
    sh.appendRow(row);
  }
  SpreadsheetApp.flush();
  refreshSummary();
  return getDashboard();
}

function pinInvites_(events) {
  var data = readGuests_(events);
  data.list.forEach(function (g) {
    if (g.allEvents) setCell_(data.sheet, data.hdr, g.row, COL.INVITED_TO, g.invitedTo.join(', '));
  });
}

function appendInvite_(id) {
  var data = readGuests_();
  data.list.forEach(function (g) {
    if (!g.allEvents) setCell_(data.sheet, data.hdr, g.row, COL.INVITED_TO, g.invitedTo.concat([id]).join(', '));
  });
}

function deleteEvent(id) {
  requireOwner_();
  var events = readEvents_();
  var ev = events.filter(function (e) { return e.id === id; })[0];
  if (!ev) throw new Error('That event no longer exists.');
  var data = readGuests_(events);
  data.list.forEach(function (g) {
    if (!g.allEvents && g.invitedTo.indexOf(id) !== -1) {
      setCell_(data.sheet, data.hdr, g.row, COL.INVITED_TO, g.invitedTo.filter(function (x) { return x !== id; }).join(', '));
    }
  });
  var rs = sheet_(SHEET.RESPONSES);
  for (var r = rs.getLastRow(); r >= 2; r--) if (str_(rs.getRange(r, 3).getValue()) === id) rs.deleteRow(r);
  sheet_(SHEET.EVENTS).deleteRow(ev.row);
  SpreadsheetApp.flush();
  refreshSummary();
  return getDashboard();
}

/** Moves an event up (-1) or down (+1); the order is how guests see them. */
function moveEvent(id, dir) {
  requireOwner_();
  var sh = sheet_(SHEET.EVENTS);
  var events = readEvents_();
  var i = events.map(function (e) { return e.id; }).indexOf(id), j = i + dir;
  if (i === -1 || j < 0 || j >= events.length) return getDashboard();
  var a = sh.getRange(events[i].row, 1, 1, EVENT_HEADERS.length), b = sh.getRange(events[j].row, 1, 1, EVENT_HEADERS.length);
  var av = a.getValues(), bv = b.getValues();
  a.setValues(bv); b.setValues(av);
  SpreadsheetApp.flush();
  refreshSummary();
  return getDashboard();
}

/** Creates (no token) or updates (token) a family. */
function saveGuest(g) {
  requireOwner_();
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var data = readGuests_();
    var family = str_(g && g.family);
    if (!family) throw new Error('Enter a family name.');
    var emails = str_(g.emails).split(/[,;\s]+/).filter(String);
    var bad = emails.filter(function (e) { return !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e); });
    if (bad.length) throw new Error('This doesn\'t look like an email address: ' + bad.join(', '));
    var ids = data.events.map(function (e) { return e.id; });
    var inv = (g.invitedTo || []).filter(function (id) { return ids.indexOf(id) !== -1; });
    if (!inv.length) throw new Error('Tick at least one event for ' + family + '.');
    var max = Math.max(1, parseInt(g.max, 10) || 1);
    var values = {};
    values[COL.FAMILY] = family;
    values[COL.GREETING] = str_(g.greeting);
    values[COL.EMAIL] = emails.join(', ');
    values[COL.MAX] = max;
    values[COL.INVITED_TO] = inv.length === ids.length ? '' : inv.join(', ');
    values[COL.TEST] = !!g.test;
    var row;
    var existing = g.token ? data.list.filter(function (x) { return x.token === g.token; })[0] : null;
    if (existing) {
      row = existing.row;
    } else {
      row = Math.max(data.sheet.getLastRow(), 1) + 1;
      values[COL.TOKEN] = newToken_();
      values[COL.STATUS] = STATUS.NEW;
    }
    Object.keys(values).forEach(function (c) { setCell_(data.sheet, data.hdr, row, c, values[c]); });
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  refreshSummary();
  return getDashboard();
}

function deleteGuests(tokens) {
  requireOwner_();
  var data = readGuests_();
  var rs = sheet_(SHEET.RESPONSES);
  data.list.filter(function (g) { return g.token && tokens.indexOf(g.token) !== -1; })
    .sort(function (a, b) { return b.row - a.row; })
    .forEach(function (g) { clearResponses_(rs, g.token); data.sheet.deleteRow(g.row); });
  SpreadsheetApp.flush();
  refreshSummary();
  return getDashboard();
}

/**
 * Adds many families at once from pasted lines, one per family:
 *   Family name, email(s), max guests
 * Several addresses can be separated by spaces or semicolons. New families are
 * invited to every event.
 */
function importGuests(text, test) {
  requireOwner_();
  var data = readGuests_();
  var have = data.list.map(function (g) { return g.family.toLowerCase(); });
  var added = 0, skipped = [];
  String(text || '').split(/\r?\n/).forEach(function (line) {
    var parts = line.split(/[\t,;]/).map(str_); // pasted from a spreadsheet (tabs) or typed with commas
    var family = parts[0];
    if (!family) return;
    var rest = parts.slice(1).join(' ');
    var emails = rest.match(/[^@\s]+@[^@\s]+\.[^@\s]+/g) || [];
    var maxPart = (rest.replace(/[^@\s]+@[^@\s]+/g, ' ').match(/\b\d+\b/) || [])[0];
    if (have.indexOf(family.toLowerCase()) !== -1) { skipped.push(family + ' (already on the list)'); return; }
    var row = Math.max(data.sheet.getLastRow(), 1) + 1;
    var v = {};
    v[COL.FAMILY] = family; v[COL.EMAIL] = emails.join(', '); v[COL.MAX] = parseInt(maxPart, 10) || 2;
    v[COL.TEST] = !!test; v[COL.TOKEN] = newToken_(); v[COL.STATUS] = STATUS.NEW; v[COL.INVITED_TO] = '';
    Object.keys(v).forEach(function (c) { setCell_(data.sheet, data.hdr, row, c, v[c]); });
    have.push(family.toLowerCase());
    added++;
  });
  SpreadsheetApp.flush();
  refreshSummary();
  var d = getDashboard();
  d.notice = 'Added ' + added + ' famil' + (added === 1 ? 'y' : 'ies') + '.' + (skipped.length ? ' Skipped: ' + skipped.join('; ') + '.' : '');
  return d;
}

/** Saves the invitation picture (sent from the browser as a data: URL, already resized) to Drive. */
function uploadImage(dataUrl, fileName) {
  requireOwner_();
  var m = /^data:(image\/(?:png|jpeg|gif|webp));base64,(.+)$/.exec(String(dataUrl || ''));
  if (!m) throw new Error('Please choose a PNG, JPG, GIF or WebP picture.');
  var blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], fileName || 'invitation');
  var s = getSettings_();
  var oldId = s['Invitation Image'];
  var file = DriveApp.createFile(blob).setName('Bar Mitzvah invitation picture · ' + (fileName || 'image'));
  setSettingRaw_('Invitation Image', file.getId());
  if (oldId) { try { DriveApp.getFileById(oldId).setTrashed(true); } catch (e) { /* already gone */ } }
  imageCache_ = undefined;
  return getDashboard();
}

function removeImage() {
  requireOwner_();
  var id = getSettings_()['Invitation Image'];
  if (id) { try { DriveApp.getFileById(id).setTrashed(true); } catch (e) { /* already gone */ } }
  setSettingRaw_('Invitation Image', '');
  imageCache_ = undefined;
  return getDashboard();
}

function setSettingRaw_(key, value) {
  var sh = sheet_(SHEET.SETTINGS);
  var keys = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 1).getValues().map(function (r) { return str_(r[0]); });
  var i = keys.indexOf(key);
  if (i === -1) sh.appendRow([key, value, '']); else sh.getRange(i + 2, 2).setValue(value);
  SpreadsheetApp.flush();
}

/** HTML of an email as a family would receive it (for the on-screen preview). */
function previewEmail(kind, token) {
  requireOwner_();
  var s = getSettings_(), data = readGuests_();
  var g = (token && data.list.filter(function (x) { return x.token === token; })[0]) || data.list[0] || sampleGuest_(data.events);
  var url = s['RSVP Page URL'] ? rsvpUrl_(s, g.token || 'sample', true) : 'https://example.com/your-rsvp-link';
  var mail = buildEmail_(kind, g, s, data.events, url, media_(s, true));
  return { subject: mail.subject, html: mail.html, family: g.family };
}

function sampleGuest_(events) {
  return { family: 'The Sample Family', greeting: 'Dear Sample Family', invitedTo: events.map(function (e) { return e.id; }), answers: {}, max: 4, emails: [], token: '' };
}

/** Sends a sample invitation and reminder to the Test Inboxes. */
function sendPreviewEmails(token) {
  requireOwner_();
  var s = getSettings_(), data = readGuests_();
  var to = String(s['Test Inboxes'] || Session.getEffectiveUser().getEmail()).split(/[,;\s]+/).filter(String);
  var g = (token && data.list.filter(function (x) { return x.token === token; })[0]) || data.list[0];
  if (!g) throw new Error('Add at least one family first (it is used as the sample).');
  var url = rsvpUrl_(s, ensureToken_(data, g), true);
  var media = media_(s, false);
  var inv = buildEmail_('invite', g, s, data.events, url, media), rem = buildEmail_('reminder', g, s, data.events, url, media);
  inv.subject = '[Preview] ' + inv.subject; rem.subject = '[Preview] ' + rem.subject;
  if (MailApp.getRemainingDailyQuota() < to.length * 2) throw new Error('Not enough of today\'s email quota left for the previews.');
  to.forEach(function (addr) { send_(addr, inv, s); send_(addr, rem, s); log_('Preview', g, addr, 'Sent'); });
  return 'Sent a sample invitation and reminder (as ' + g.family + ') to ' + to.join(', ') +
    '. Check each inbox, and its Spam/Junk and Promotions folders.';
}

function withSetting_(s, key, value) {
  var c = {};
  for (var k in s) c[k] = s[k];
  c[key] = value;
  return c;
}

/**
 * Spam check: sends the invitation three ways to the test inboxes, so you can see which
 * version lands in the inbox: A with the picture, B without it, C as plain text only.
 */
function sendSpamTest() {
  requireOwner_();
  var s = getSettings_(), data = readGuests_();
  var to = String(s['Test Inboxes'] || Session.getEffectiveUser().getEmail()).split(/[,;\s]+/).filter(String);
  var g = data.list[0];
  if (!g) throw new Error('Add at least one family first (it is used as the sample).');
  if (MailApp.getRemainingDailyQuota() < to.length * 3) throw new Error('Not enough of today\'s email quota left for the test.');
  var url = rsvpUrl_(s, ensureToken_(data, g), true);
  var withPic = buildEmail_('invite', g, withSetting_(s, 'Picture In Email', 'TRUE'), data.events, url, media_(s, false));
  var noPic = buildEmail_('invite', g, withSetting_(s, 'Picture In Email', 'FALSE'), data.events, url, {});
  to.forEach(function (addr) {
    send_(addr, { subject: withPic.subject + ' (A)', text: withPic.text, html: withPic.html }, s);
    send_(addr, { subject: noPic.subject + ' (B)', text: noPic.text, html: noPic.html }, s);
    var opts = { name: s['Email Sender Name'] || s['Hosts'] };
    if (s['Reply-To Address']) opts.replyTo = s['Reply-To Address'];
    if (s['Send From Alias']) opts.from = s['Send From Alias'];
    GmailApp.sendEmail(addr, withPic.subject + ' (C)', noPic.text, opts);
    log_('Spam test', g, addr, 'Sent A, B, C');
  });
  return 'Sent three versions to ' + to.join(', ') + ': (A) with the picture, (B) without it, (C) plain text. ' +
    'Check which ones reach the inbox and which land in Spam.';
}

/** mode: 'new' (everyone in scope not yet invited), 'reminders', or a list of tokens. */
function sendNow(mode) {
  requireOwner_();
  var s = getSettings_(), data = readGuests_();
  rsvpUrl_(s, 'x', false); // fail early if the page URL isn't set
  var list;
  if (mode === 'new') list = data.list.filter(function (g) { return inScope_(g, s) && !g.inviteSent; });
  else if (mode === 'reminders') list = data.list.filter(function (g) { return inScope_(g, s) && g.inviteSent && !g.responded; });
  else list = data.list.filter(function (g) { return (mode || []).indexOf(g.token) !== -1; });
  if (!list.length) throw new Error('Nobody to send to.' + (s.testMode && typeof mode === 'string' ? ' Test Mode is on, so only families marked Test are included.' : ''));
  var msg = sendBatch_(mode === 'reminders' ? 'reminder' : 'invite', list, data, s);
  var d = getDashboard();
  d.notice = msg;
  return d;
}

/** How many families each send button would reach right now, for the confirm prompt. */
function countRecipients(mode) {
  requireOwner_();
  var s = getSettings_(), data = readGuests_();
  var list = mode === 'new' ? data.list.filter(function (g) { return inScope_(g, s) && !g.inviteSent; })
    : data.list.filter(function (g) { return inScope_(g, s) && g.inviteSent && !g.responded; });
  return { families: list.length, addresses: list.reduce(function (n, g) { return n + g.emails.length; }, 0), quota: MailApp.getRemainingDailyQuota(), testMode: s.testMode };
}

function getLink(token) {
  requireOwner_();
  var s = getSettings_();
  return rsvpUrl_(s, token, false);
}

/** Clears replies, sent dates and reminder counts of every family marked Test. */
function resetTestRows() {
  requireOwner_();
  var data = readGuests_();
  var rs = sheet_(SHEET.RESPONSES);
  var list = data.list.filter(function (g) { return g.test; });
  list.forEach(function (g) {
    [COL.INVITE_SENT, COL.REMINDERS, COL.LAST_REMINDER, COL.RESPONDED, COL.MESSAGE].forEach(function (c) { setCell_(data.sheet, data.hdr, g.row, c, ''); });
    setCell_(data.sheet, data.hdr, g.row, COL.STATUS, STATUS.NEW);
    if (g.token) clearResponses_(rs, g.token);
  });
  SpreadsheetApp.flush();
  refreshSummary();
  var d = getDashboard();
  d.notice = 'Cleared ' + list.length + ' test famil' + (list.length === 1 ? 'y' : 'ies') + '.';
  return d;
}
