/**
 * The waitlist form's only job: get an email address into the sheet behind it.
 *
 * There is no backend. The page posts to a published Google Form whose responses
 * are linked to the "Chairforce" spreadsheet; Google appends the row. Posted with
 * `mode: 'no-cors'` because Forms sends no CORS headers, so the response is
 * opaque: a submission is reported as sent, not as confirmed.
 */

const FORM = 'https://docs.google.com/forms/d/e/1FAIpQLScbnjxvemx7knM89uKC3JDNOhDhPQQoZhze9HMTm5hi9xbmGg/formResponse';
const EMAIL_FIELD = 'entry.2068798860';

const form = document.getElementById('waitlist-form') as HTMLFormElement | null;
const status = document.getElementById('waitlist-status');

function setStatus(text: string, kind: 'ok' | 'error' | '' = '') {
  if (!status) return;
  status.textContent = text;
  status.className = `status${kind ? ` ${kind}` : ''}`;
}

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const email = String(data.get('email') ?? '').trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    setStatus('That doesn’t look like an email address.', 'error');
    return;
  }

  // A bot filled the hidden field: look successful, send nothing.
  if (String(data.get('company') ?? '')) {
    setStatus('You’re on the list. See you on the floor.', 'ok');
    form.reset();
    return;
  }

  const button = form.querySelector('button');
  if (button) button.disabled = true;
  setStatus('Sending…');

  try {
    await fetch(FORM, { method: 'POST', mode: 'no-cors', body: new URLSearchParams({ [EMAIL_FIELD]: email }) });
    setStatus('You’re on the list. See you on the floor.', 'ok');
    form.reset();
  } catch {
    setStatus('Couldn’t reach the waitlist. Try again in a moment.', 'error');
  }
  if (button) button.disabled = false;
});

// The calls to action further down the page land in the field, not just near it.
document.querySelectorAll<HTMLAnchorElement>('a[href="#join"]').forEach((link) =>
  link.addEventListener('click', () => {
    window.setTimeout(() => document.getElementById('email')?.focus({ preventScroll: true }), 450);
  }),
);

// The slim bar with the button arrives once the hero, and its form, are off screen.
const bar = document.getElementById('bar');
const hero = document.getElementById('top');
if (bar && hero) {
  let shown = false;
  const update = () => {
    const on = window.scrollY > hero.offsetHeight * 0.7;
    if (on === shown) return;
    shown = on;
    bar.classList.toggle('on', on);
    bar.setAttribute('aria-hidden', String(!on));
    bar.querySelector('a')?.setAttribute('tabindex', on ? '0' : '-1');
  };
  window.addEventListener('scroll', update, { passive: true });
  update();
}

// Sections settle in as they arrive. Added from here so the page is complete without script.
if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const groups = ['.head', '.player', '.row', '.extras > div', '.prize-grid > *', '.entrant', '.finish .wrap > *'];
  const seen = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('in');
        seen.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
  );
  for (const selector of groups) {
    document.querySelectorAll<HTMLElement>(selector).forEach((el, i) => {
      el.classList.add('reveal');
      el.style.setProperty('--d', `${(i % 4) * 80}ms`);
      seen.observe(el);
    });
  }
}

// The key art leans a few pixels after the pointer, which is enough to read as depth.
const art = document.querySelector<HTMLElement>('.hero .art');
if (art && hero && window.matchMedia('(pointer: fine)').matches && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  hero.addEventListener('pointermove', (event) => {
    const x = event.clientX / window.innerWidth - 0.5;
    const y = event.clientY / window.innerHeight - 0.5;
    art.style.setProperty('--px', `${(-x * 18).toFixed(1)}px`);
    art.style.setProperty('--py', `${(-y * 12).toFixed(1)}px`);
  });
  hero.addEventListener('pointerleave', () => {
    art.style.setProperty('--px', '0px');
    art.style.setProperty('--py', '0px');
  });
}

// The teaser starts muted, as browsers insist; one tap turns the score on and restarts it.
const teaser = document.getElementById('teaser-video') as HTMLVideoElement | null;
const sound = document.getElementById('sound');
const playpause = document.getElementById('playpause');

// Pause and play from the button or by clicking the picture itself.
function syncPlay() {
  if (!teaser || !playpause) return;
  playpause.setAttribute('aria-pressed', String(teaser.paused));
  playpause.setAttribute('aria-label', teaser.paused ? 'Play the teaser' : 'Pause the teaser');
  teaser.parentElement?.classList.toggle('paused', teaser.paused);
}
if (teaser && playpause) {
  const toggle = () => (teaser.paused ? void teaser.play() : teaser.pause());
  playpause.addEventListener('click', toggle);
  // On touch there is no hover, so the first tap shows the controls and only a tap while they show pauses.
  const player = teaser.parentElement;
  let touch = false;
  let hide = 0;
  teaser.addEventListener('pointerdown', (event) => { touch = event.pointerType === 'touch'; });
  teaser.addEventListener('click', () => {
    if (touch && player && !player.classList.contains('poke') && !teaser.paused) {
      player.classList.add('poke');
    } else toggle();
    if (touch && player) {
      window.clearTimeout(hide);
      hide = window.setTimeout(() => player.classList.remove('poke'), 3000);
    }
  });
  teaser.addEventListener('play', syncPlay);
  teaser.addEventListener('pause', syncPlay);
  syncPlay();
}

// The timeline follows the picture, and dragging it moves the picture.
const seek = document.getElementById('seek') as HTMLInputElement | null;
const time = document.getElementById('teaser-time');
if (teaser && seek) {
  let dragging = false;
  const clock = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  const paint = () => {
    const frac = teaser.duration ? teaser.currentTime / teaser.duration : 0;
    if (!dragging) seek.value = String(Math.round(frac * 1000));
    seek.style.setProperty('--p', `${(Number(seek.value) / 10).toFixed(2)}%`);
    if (time) time.textContent = clock(teaser.currentTime);
  };
  const tick = () => { paint(); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  seek.addEventListener('input', () => {
    dragging = true;
    if (teaser.duration) teaser.currentTime = (Number(seek.value) / 1000) * teaser.duration;
  });
  seek.addEventListener('change', () => { dragging = false; });
}
if (teaser && sound) {
  sound.addEventListener('click', () => {
    const on = teaser.muted;
    teaser.muted = !on;
    if (on) { teaser.currentTime = 0; void teaser.play(); }
    syncPlay();
    sound.setAttribute('aria-pressed', String(on));
    const label = sound.querySelector('span');
    if (label) label.textContent = on ? 'Sound off' : 'Sound on';
  });
}

export {};
