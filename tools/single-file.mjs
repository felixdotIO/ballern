/**
 * The whole game as one file.
 *
 * `vite build` produces a page, a bundle and eight megabytes of assets sitting
 * beside them, which is the right shape for a web server and the wrong one for
 * anywhere that will only take a single document — an artifact, an email
 * attachment, a USB stick handed to somebody in a meeting.
 *
 * So: one HTML file with everything folded into it, and the folding is done in two
 * ways rather than one, because the two kinds of asset have different problems.
 *
 *  - **The small ones** — the face, the key art, the wordmark — become `data:`
 *    URIs, substituted into the stylesheet and the bundle wherever their path
 *    appears. Half a megabyte, and a data URI is what CSS and <img> want anyway.
 *  - **The kit** — 7.4 MB of characters, chairs and monitors — becomes base64 in
 *    a prelude that decodes it into blobs at startup and points `fetch` at them.
 *    Not data URIs: three's `GLTFLoader` asks for these over `fetch`, the paths
 *    are built at runtime (`/kit/driver-${key}.glb`), and a fetch of a data URI is
 *    the one form of this that a strict content policy is entitled to refuse.
 *    A blob is same-origin by construction, and the redirect is four lines.
 *
 * Nothing about the game changes. It is the same bundle, the same assets and the
 * same paths; only where the bytes are found is different.
 *
 *   node tools/single-file.mjs [out.html]
 */

import { readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = process.argv[2] ?? join(ROOT, 'dist', 'chair-force-one.html');

const MIME = {
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
};

const read = (path) => readFileSync(join(ROOT, path));
const b64 = (buf) => buf.toString('base64');

/** Every file under a public subdirectory, as the URL the game asks for it by. */
function under(dir) {
  const base = join(ROOT, 'public', dir);
  return readdirSync(base)
    .filter((name) => statSync(join(base, name)).isFile())
    .map((name) => `/${dir}/${name}`);
}

// ---- the page -------------------------------------------------------------

let html = read('dist/index.html').toString();

// The preloads name files that will not exist here. Left in, they are a handful of
// console errors on a page whose whole point is that it needs nothing.
html = html.replace(/^\s*<link rel="preload"[^>]*>\n/gm, '');

const script = html.match(/<script[^>]*src="([^"]+)"[^>]*><\/script>/);
if (!script) throw new Error('no module script in dist/index.html');
let bundle = read(join('dist', script[1])).toString();
html = html.replace(script[0], '');

const style = html.match(/<style>[\s\S]*?<\/style>/);
if (!style) throw new Error('no inline style in dist/index.html');
const body = html.match(/<body>([\s\S]*?)<\/body>/);
if (!body) throw new Error('no body in dist/index.html');

// ---- the small assets, as data URIs ---------------------------------------

let css = style[0];
let markup = body[1];
let inlined = 0;

for (const url of [...under('art'), ...under('fonts')]) {
  const mime = MIME[extname(url)];
  if (!mime) throw new Error(`no mime type for ${url}`);
  const data = `data:${mime};base64,${b64(read(join('public', url)))}`;
  // Global, and in all three places a path can appear: the page's own stylesheet,
  // its markup, and the bundle — `look.ts` carries a second copy of the @font-face
  // and `menu.ts` writes the wordmark into the rail.
  const find = new RegExp(url.replace(/[.]/g, '\\.'), 'g');
  for (const before of [css, markup, bundle]) if (find.test(before)) inlined++;
  css = css.replace(find, data);
  markup = markup.replace(find, data);
  bundle = bundle.replace(find, data);
}

// ---- the kit, as blobs ----------------------------------------------------

const kit = Object.fromEntries(under('kit').map((url) => [url, b64(read(join('public', url)))]));

const prelude = `
/*
 * The kit, decoded once and handed to whoever asks for it by name.
 *
 * \`fetch\` rather than a rewritten path because the loader builds some of these
 * URLs at runtime, and rather than data URIs because a blob is same-origin and a
 * data URI is a thing a content policy may decline to fetch.
 */
const KIT = ${JSON.stringify(kit)};
const AT = {};
for (const path in KIT) {
  const raw = atob(KIT[path]);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  AT[path] = URL.createObjectURL(new Blob([bytes], { type: 'model/gltf-binary' }));
  KIT[path] = '';
}
/*
 * Matched on the path, not on the string that was asked for.
 *
 * The loader is handed \`/kit/task-chair.glb\` and resolves it against the document
 * before it reaches \`fetch\`, so what arrives here is absolute — and which absolute
 * depends on where the file was opened from: \`file:///kit/...\` off a disk,
 * \`https://host/kit/...\` off a server. Keyed on the raw string this matched
 * neither, every model fell through to the network, and a page whose whole point
 * is that it has no network went looking for one.
 */
const passThrough = window.fetch.bind(window);
const pathOf = (url) => {
  try {
    return new URL(url, document.baseURI).pathname;
  } catch {
    return url;
  }
};
window.fetch = (input, init) => {
  const url = typeof input === 'string' ? input : input && input.url;
  return passThrough((url && AT[pathOf(url)]) ?? input, init);
};
`;

// ---- out ------------------------------------------------------------------

// The wrapper this lands in supplies <!doctype>, <head> and <body>, so what is
// written here is the contents of a page rather than a page.
const page = [
  '<title>Chair Force One</title>',
  css,
  // The host paints its own ground behind this, in whatever theme the reader is
  // set to. The game is graded in one register and has no light form, so it says
  // what it wants explicitly rather than inheriting a white page under a dark room.
  '<style>html, body { background: #241c15; color-scheme: dark; }</style>',
  markup.trim(),
  `<script>${prelude}</script>`,
  // `</script` inside a string in the bundle would close this tag early. It is the
  // one thing inlining a script can get wrong, and it fails at the end of a 3 MB
  // file where nothing points at the cause.
  `<script type="module">${bundle.replace(/<\/script/gi, '<\\/script')}</script>`,
].join('\n');

writeFileSync(OUT, page);

const mb = (n) => `${(n / 1e6).toFixed(2)} MB`;
console.log(`${OUT}`);
console.log(`  bundle   ${mb(bundle.length)}`);
console.log(`  kit      ${mb(Object.values(kit).reduce((n, s) => n + s.length, 0))} of base64, ${Object.keys(kit).length} files`);
console.log(`  inlined  ${inlined} data URIs`);
console.log(`  page     ${mb(page.length)}`);
