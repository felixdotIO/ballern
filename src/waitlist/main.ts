/**
 * The waitlist form's only job: get an email address into the sheet behind it.
 *
 * The endpoint is a Google Apps Script web app bound to that sheet, not a
 * server this project runs — see the deploy note in README/the Apps Script
 * project itself. Posted with `mode: 'no-cors'` because Apps Script's web app
 * responses don't carry CORS headers for a cross-origin `fetch`, which makes
 * the response opaque: we cannot read success/failure from it, only whether
 * the request left the browser. The write still happens on Apps Script's
 * side; this page just can't see the result, so a submission is reported as
 * sent rather than as confirmed.
 */

const ENDPOINT = import.meta.env.VITE_WAITLIST_URL as string | undefined;
const SECRET = import.meta.env.VITE_WAITLIST_SECRET ?? '';

const form = document.getElementById('waitlist-form') as HTMLFormElement | null;
const status = document.getElementById('waitlist-status');

function setStatus(text: string, kind: 'ok' | 'error' | '' = '') {
  if (!status) return;
  status.textContent = text;
  status.className = `status${kind ? ` ${kind}` : ''}`;
}

if (!ENDPOINT) {
  // No endpoint configured (local dev without VITE_WAITLIST_URL, or it simply
  // isn't set up yet) — disable rather than silently drop submissions.
  form?.querySelectorAll('input, button').forEach((el) => ((el as HTMLInputElement).disabled = true));
  setStatus('Waitlist isn’t open yet — check back soon.');
} else if (form) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const email = String(data.get('email') ?? '').trim();
    const honeypot = String(data.get('company') ?? '');

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setStatus('That doesn’t look like an email address.', 'error');
      return;
    }

    const button = form.querySelector('button');
    if (button) button.disabled = true;
    setStatus('Sending…');

    try {
      await fetch(ENDPOINT, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ email, hp: honeypot, source: 'waitlist', secret: SECRET }),
      });
      setStatus('You’re on the list — see you on the floor.', 'ok');
      form.reset();
    } catch {
      setStatus('Couldn’t reach the waitlist — try again in a moment.', 'error');
      if (button) button.disabled = false;
    }
  });
}
