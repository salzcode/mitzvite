# Bar Mitzvah invitations & RSVPs

A small website for sending the invitations and collecting RSVPs. It runs on Google Apps Script inside a Google Sheet and sends from your own Gmail account, so there's no server, hosting or paid service.

It has two web pages, both hosted by Google:

- **The dashboard, which is only for you.** Google signs you in, and nobody else can open it. From here you:
  - design the invitation: upload a picture, then write the heading, the message and the reminder and thank-you emails, with a live preview;
  - add, edit and reorder the **sub-events** (Friday dinner, the service, the party…);
  - manage the **guest list**: one row per family, with a tick box per sub-event to choose which ones each family is invited to;
  - send previews, invitations and reminders, and see the headcount for each sub-event as replies come in.
- **The RSVP page, for guests.** Each family's email has a personal link. The page shows only the sub-events that family is invited to. For each one they pick *Joyfully accept* or *Regretfully decline* and say how many are coming. They can come back with the same link to change their answers.

All the data lives in your Google Sheet, in tabs you can read and edit: **Settings**, **Events**, **Guests**, **Responses**, **Summary** and **Log**.

---

## 1. One-time setup (about 20 minutes)

1. Sign in to the **Gmail account the invitations should come from**. Go to <https://sheets.new> to create a spreadsheet, and name it something like "Bar Mitzvah Guests".
2. In the spreadsheet, open **Extensions → Apps Script**.
3. In the editor, add the three files:
   - Replace everything in `Code.gs` with the contents of [`Code.gs`](Code.gs).
   - Click **+ → HTML** and name the file `Dashboard` (the editor adds `.html`). Paste in the contents of [`Dashboard.html`](Dashboard.html).
   - Click **+ → HTML** again, name it `Rsvp`, and paste in the contents of [`Rsvp.html`](Rsvp.html).
   - Click 💾 **Save**.
4. In the function dropdown at the top, pick **`setup`** and click **▶ Run**. Google asks for permissions:
   **Review permissions → choose your account → Advanced → Go to (project name) → Allow**.
   The "unverified app" warning appears because you wrote the script yourself, so it's safe to continue. The script asks for Sheets (your guest list), Gmail (sending), and Drive (storing the invitation picture).
5. **Publish the RSVP page for guests.** Click **Deploy → New deployment → ⚙ → Web app** and set:
   - *Description:* `RSVP`
   - *Execute as:* **Me**
   - *Who has access:* **Anyone**, so guests don't need a Google account.

   Click **Deploy** and copy the **Web app URL** (it ends in `/exec`).
6. **Publish the dashboard for yourself.** Click **Deploy → New deployment** again, choose **Web app**, and set:
   - *Description:* `Dashboard`
   - *Execute as:* **Me**
   - *Who has access:* **Only myself**

   Click **Deploy**, then open the new **Web app URL**. That's your dashboard, so **bookmark it**.
7. In the dashboard, open **Email & settings**. Paste the RSVP page address from step 5 and the dashboard address from step 6, then click **Save**.

> **When the code changes later:** paste in the new files, save, then go to **Deploy → Manage deployments**. For **each** of the two deployments, click ✏ **Edit → Version: New version → Deploy**. The addresses stay the same, so links you already sent keep working. Don't use "New deployment", because that creates new addresses.

## 2. Set it up in the dashboard

- **Invitation tab:** upload your picture (your printed design, a photo or a logo) and write the text. These placeholders fill in automatically: `{greeting}` `{family}` `{child}` `{hosts}` `{deadline}`. Each family's sub-events and their RSVP button are added below your message. Click **Save and update preview**, then check the preview as different families.
- **Sub-events tab:** edit the three examples, add more, reorder them or delete them. When you add a sub-event, you choose whether every family is invited to it straight away. Leave that unticked for something only some families come to.
- **Guest list tab:** use **+ Add a family**, or **Add many at once** to paste a list. Each line is `family name, email(s), most guests`, and you can copy those three columns straight from another spreadsheet. Then tick which sub-events each family is invited to; changes save immediately.
  - *Greeting* is how the email opens, for example "Dear Rachel & Josh". If you leave it blank, the script uses "Dear *family name*".
  - *Most guests* caps how many people the family can RSVP for at each sub-event.

You can also edit everything directly in the Sheet. In the **Guests** tab, *Invited To* holds event IDs from the **Events** tab, such as `E1, E3`. Blank means every event.

## 3. Test before you invite anyone

**A. Inbox and spam check.**
1. Under **Email & settings → Test inboxes**, list addresses you control at several providers: Gmail, Outlook/Hotmail, Yahoo and iCloud, plus a work address if many guests use one.
2. *Optional but recommended:* go to <https://www.mail-tester.com>, copy the address it shows, add it to the test inboxes, and check your score after sending. 9/10 or higher is good.
3. On **Overview**, click **Send preview to my test inboxes**. Each address gets a sample invitation and reminder marked `[Preview]`. The RSVP button in these opens the real page in preview mode, so nothing is saved.
4. Check each inbox, including Spam/Junk and Promotions. If a message landed there, mark it *Not spam* or move it to Primary.

**B. Full end-to-end test.**
1. Leave the dashboard in **TEST MODE** (the yellow button at the top).
2. Add 2–3 families for yourself, your spouse or a friend, using real addresses. New families are marked *test* automatically while Test Mode is on.
3. On **Overview**, click **Send invitations to everyone not yet invited**. Only test families get it.
4. Open the emails, RSVP with different answers, and check the guest list, the Overview numbers and the thank-you email. RSVP again to change an answer.
5. Click **Send reminders**. Only test families who haven't replied get one.
6. Click **Clear test families' replies and sent dates** to start over, or delete them.

**C. Go live.** Click the **TEST MODE · switch to live** button. From then on, sends go to every real family, and test families are skipped and not counted.

## Good to know

- **Daily limit:** a regular Gmail account can send to about **100 addresses a day** from a script, and a Google Workspace account about 1,500. A family with two addresses counts twice, and thank-you emails count too. The dashboard shows how many sends you have left. If you hit the limit partway through, sending stops cleanly; press the same button the next day and it carries on where it stopped. For a large list, plan on 2–3 days. You can also turn off thank-you emails under **Email & settings** to save quota.
- **Sending to particular families:** on the guest list, tick the families on the left and click **Send the invitation**. This is how you re-send after fixing an address. It sends to exactly the families you ticked, whatever the Test Mode setting.
- **Texting a link:** **Link** on any family shows their personal RSVP link to copy into a text or WhatsApp message.
- **Deliverability tips:**
  - Send from an established personal Gmail account rather than a brand-new one.
  - Keep subjects natural, with no ALL CAPS or "!!!".
  - Ask a few close family members to reply to or star the email, which helps it reach later guests' inboxes.
  - The dashboard shrinks your picture to 1200 pixels wide, so the email stays light. The emails also include a plain-text version and the visible link, which spam filters like.
- **Sending from a different address:** to send from something like `cohenfamily@…`, first add it in Gmail under **Settings → Accounts → Send mail as**. Then enter it under **Email & settings**.
- **Privacy:** only you can open the dashboard; anyone else who tries just sees the RSVP page's "couldn't find your invitation" message. Each family's link has a long random code, and only someone holding that link can see or change that family's answers. Google shows a small banner on the RSVP page ("This application was created by a Google Apps Script user"); that's normal.
- **Changing a sub-event later:** edit it in the dashboard. The RSVP page always shows the current details, but emails already sent keep the old text. Deleting a sub-event also deletes the replies to it.
