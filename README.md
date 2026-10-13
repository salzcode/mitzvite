# Bar Mitzvah invitations & RSVPs

This runs in a Google Sheet and sends its emails from your Gmail account. It's a Google Apps Script, so it needs no server, hosting or paid service.

- **Guests sheet:** one row per family, with their email(s) and the most guests they can RSVP for.
- **Invitations:** each family gets an email from your Gmail with the three events and a personal **RSVP now** button.
- **RSVP page:** for each event the family picks *Joyfully accept* or *Regretfully decline*, and if they accept, how many of them will come. They can also leave a note. Using the same link again lets them change their answers.
- **Responses** go straight into the family's row. The **Summary** sheet shows the headcount for each event and who hasn't replied yet.
- **Reminders** go only to families who were invited and haven't replied.
- **Testing:** "Test Mode" plus preview emails let you check delivery to Gmail, Outlook, Yahoo and others before any real guest gets anything.

---

## 1. One-time setup (about 15 minutes)

1. Sign in to the **Gmail account the invitations should come from**, then go to <https://sheets.new> to create a new spreadsheet. Name it something like "Bar Mitzvah Guests".
2. In the spreadsheet, open **Extensions → Apps Script**.
3. In the editor:
   - Replace everything in `Code.gs` with the contents of [`Code.gs`](Code.gs).
   - Click **+ → HTML**, name the file `Rsvp` (the editor adds `.html`) and paste in the contents of [`Rsvp.html`](Rsvp.html).
   - Click 💾 **Save**.
4. In the function dropdown at the top, pick **`setup`** and click **▶ Run**. Google will ask for permissions:
   **Review permissions → choose your account → Advanced → Go to (project name) → Allow**.
   The "unverified app" warning appears because you wrote the script yourself. It's safe to continue.
5. Go back to the spreadsheet and reload the tab. You'll see **Settings**, **Guests**, **Summary** and **Log** sheets, plus a **🎉 Bar Mitzvah** menu.
6. **Publish the RSVP page.** In Apps Script, click **Deploy → New deployment → ⚙ → Web app** and set:
   - *Description:* `RSVP`
   - *Execute as:* **Me**
   - *Who has access:* **Anyone**. Guests must not need a Google account.

   Click **Deploy** and copy the **Web app URL**, which ends in `/exec`.
7. In the **Settings** sheet, paste that URL into **RSVP Page URL**.

> **When you change the code later:** go to **Deploy → Manage deployments → ✏ Edit → Version: New version → Deploy**. This keeps the same URL, so links you already sent keep working. Don't use "New deployment", because that creates a different URL.

## 2. Fill in your details

**Settings sheet:** set your son's name, the hosts, the three events (name, when, where and an optional detail line), the RSVP deadline, and the sender name guests will see. Write dates exactly as you want guests to see them.

You can edit the email wording freely. These placeholders get filled in automatically: `{greeting}` `{family}` `{child}` `{hosts}` `{deadline}`. The event details and the RSVP button are always added below your message.

**Guests sheet:** one row per family.

| Column | What to put |
|---|---|
| Family Name | `The Levi Family` (for you, and used in the summary) |
| Greeting | How the email opens: `Dear Rachel & Josh`. If you leave it blank, the script uses "Dear *Family Name*". |
| Email | One or more addresses separated by commas. Everyone listed gets the email. |
| Max Guests | The most people this family can RSVP for at each event. |
| Test | Tick this for your own test rows (see below). |

The script fills in all the other columns: Status, the attending/count columns for each event, Message, timestamps and the token. You can add your own columns anywhere, such as address, table number or "kids' names". The script finds its columns by their header text, so don't rename the existing headers.

Tip: if your list is already in another spreadsheet, paste the columns into **Guests**. Then choose **🎉 Bar Mitzvah → Set up / repair sheets** to tidy up the formatting.

## 3. Test before you invite anyone

Gmail generally delivers well when you send from your own account. Still, check the main inboxes your guests use.

**A. Inbox / spam check.**
1. In Settings → **Test Inboxes**, list addresses you control at several providers. Include Gmail, Outlook/Hotmail, Yahoo and iCloud, and a work address if many guests use one.
2. *Optional, recommended:* go to <https://www.mail-tester.com>, copy the address it shows you, add it to Test Inboxes, and check your score after sending. 9/10 or higher is good.
3. Click a family row, then choose **🎉 Bar Mitzvah → Send preview to test inboxes…**. Each address gets a sample invitation and a sample reminder, marked `[Preview]`. The RSVP button in these opens the real page in **preview mode**, so nothing is saved.
4. Look in each inbox. If a message is in Spam/Junk or Promotions, mark it *Not spam* or move it to Primary.

**B. Full end-to-end test.**
1. Keep **Test Mode = TRUE** in Settings.
2. Add 2–3 rows for yourself, your spouse or a friend, using real addresses, and tick **Test**.
3. Choose **Send invitations…**. With Test Mode on, only the ticked rows get emails.
4. Open the emails, RSVP with different answers, and check the row, the **Summary** and the confirmation email. Then RSVP again to change an answer.
5. Choose **Send reminders…**. Only test rows that haven't replied get one.
6. When you're done, choose **Clear test rows…** to reset those rows. You can also delete them.

**C. Go live:** set **Test Mode = FALSE**, then choose **Send invitations (everyone not yet invited)…**. Test rows are always skipped and not counted in live mode.

## 4. Day to day

| Menu item | What it does |
|---|---|
| Send invitations (everyone not yet invited) | Emails every family whose **Invite Sent** is empty. You can safely run it again after adding more families; it skips anyone already invited. |
| Send invitation to selected rows | Re-sends to the rows you've selected, for example after fixing a typo in an address. |
| Send reminders (invited, no reply yet) | Nudges everyone who hasn't answered. The **Reminders Sent** and **Last Reminder** columns track this. |
| Get RSVP link for selected family | Shows the family's personal link so you can text or WhatsApp it to them. |
| Refresh summary | Recalculates the Summary sheet. This also happens automatically after every send and every reply. |
| Check email quota | Shows how many emails you can still send today. |

Every send, reply and failure is recorded in the **Log** sheet. To get an email each time a family replies, put your address in **Notify Me Of Replies**.

## Good to know

- **Daily limit:** a regular Gmail account can send to about **100 addresses per day** from a script. A Google Workspace account gets about 1,500. Families with two addresses count twice, and confirmation emails also count. If you hit the limit partway through, the script stops cleanly and tells you. Run the same menu item the next day and it continues where it left off. For a large list, plan to spread the invitations over 2–3 days. You can also set **Send Confirmation To Guests = FALSE** to save quota.
- **Deliverability tips:**
  - Send from an established personal Gmail rather than a brand-new account.
  - Keep the subject natural, with no ALL CAPS or "!!!".
  - Ask a few close family members to reply to or star the email; that helps it reach later recipients' inboxes.
  - Don't attach large images. If you add your printed invitation design, link to it instead.
  - The emails include a plain-text version and the visible link, which spam filters like.
- **Sending from a different address:** to have the invitations come from an address like `cohenfamily@...`, first add it in Gmail under **Settings → Accounts → Send mail as**. Then put it in **Send From Alias**.
- **Privacy:** each family's link contains a long random token. Only someone holding that link can see or change that family's answers. The RSVP page shows a small Google banner ("This application was created by a Google Apps Script user"); that's normal.
- **Changing an event later:** edit Settings. The RSVP page always shows the current details. Emails already sent keep the old text.
