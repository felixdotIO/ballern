/**
 * The waitlist's entire backend: an Apps Script bound to the Google Sheet that
 * holds the signups, deployed as a web app. `src/waitlist/main.ts` posts an
 * email here; this appends a row. Nothing else reads or writes the sheet.
 *
 * ---- one-time setup --------------------------------------------------------
 *
 * 1. Open (or create) the Google Sheet that should collect signups.
 * 2. Extensions -> Apps Script. Delete the placeholder `Code.gs` content and
 *    paste this file in its place.
 * 3. Change SHARED_SECRET below to something only you know — it is the one
 *    thing stopping a stranger who finds the deployed URL from writing rows
 *    into your sheet directly. It ships inside the public website's JS, so it
 *    is a lock on the front door, not a vault: fine for a waitlist, not for
 *    anything sensitive.
 * 4. Deploy -> New deployment -> type "Web app".
 *      Execute as: Me
 *      Who has access: Anyone
 * 5. Authorize it (Google will warn you it's your own unreviewed script —
 *    that's expected, it's never left your account).
 * 6. Copy the "Web app URL" it gives you. That is VITE_WAITLIST_URL — put it
 *    in Vercel's environment variables and in your local .env.
 * 7. Set the same string as SHARED_SECRET here and as VITE_WAITLIST_SECRET in
 *    Vercel/.env.
 *
 * Re-deploying after an edit here needs "Manage deployments" -> the pencil ->
 * a new version, not just saving the file — Apps Script web apps freeze the
 * code at the version they were deployed with.
 */

const SHARED_SECRET = 'replace-me';

/** First sheet in the bound spreadsheet. Rename the tab and this still finds it. */
function targetSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);

    if (body.secret !== SHARED_SECRET) {
      return respond({ ok: false, error: 'forbidden' });
    }

    // A bot fills in every field it finds; a person never sees this one.
    // Answer as if it worked so the bot has no signal to adapt to, and skip
    // the write.
    if (body.hp) {
      return respond({ ok: true });
    }

    const email = String(body.email || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return respond({ ok: false, error: 'invalid email' });
    }

    targetSheet().appendRow([email, new Date(), String(body.source || '')]);
    return respond({ ok: true });
  } catch (err) {
    return respond({ ok: false, error: String(err) });
  }
}

function respond(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
