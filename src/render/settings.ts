/**
 * The two dials that decide how hard the machine works.
 *
 * Everything else in this renderer answers the question "how fast is this
 * machine?" — the ladder in quality.ts measures it and spends whatever it finds.
 * That is the right instinct for a desktop and the wrong one for a laptop, and
 * the difference is not performance, it is heat. A controller whose only goal is
 * to hold 60 will climb until it *cannot*, which means a machine with headroom
 * ends every session pinned at 100% of its GPU with the fans at full song. The
 * frame rate is fine. The room is not.
 *
 * So there are two things here that the automatic controller cannot decide for
 * itself, because neither is a question about speed:
 *
 *  - **How much of the machine the game is welcome to use.** A ceiling on the
 *    ladder rather than a replacement for it. The controller still measures and
 *    still adapts underneath; it simply stops climbing before the fans do.
 *
 *  - **How many frames are worth drawing.** The simulation runs at a fixed
 *    120 Hz and has done since physics.ts was written — see FIXED_STEP — so the
 *    render rate buys smoothness and nothing else. Handling, input latency and
 *    collision fidelity are all identical at 60 as at 144, because none of them
 *    are on this clock.
 *
 * Both are remembered, and both are the player's rather than a heuristic's, for
 * the reason the resolution dial in quality.ts already exists: the person
 * looking at the screen — and listening to the machine — can judge this and the
 * controller cannot.
 */

/* -- storage --------------------------------------------------------------- */

/**
 * Wrapped, because a page served from a file:// URL or in a locked-down context
 * throws on the first touch of localStorage, and a graphics preference is not
 * worth a blank screen over. Same bargain quality.ts makes with the same
 * apology: the dials still work for this session, they just do not survive it.
 */
function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* no storage, no memory. */
  }
}

/* -- graphics -------------------------------------------------------------- */

/**
 * Three rungs, named for what they cost rather than for what they look like.
 *
 * "High" is the game exactly as it was before this file existed: the ladder runs
 * to the top of the display's own pixel ratio and the post chain runs whole.
 * The other two are ceilings under it, and they are deliberately coarse — a
 * slider with eleven positions is ten questions the player cannot answer, and
 * the honest answer to nine of them is "it depends what room you are in".
 */
export type Graphics = 'quiet' | 'balanced' | 'high';

export const GRAPHICS = ['quiet', 'balanced', 'high'] as const;

const GRAPHICS_LABEL: Record<Graphics, string> = {
  quiet: 'Quiet',
  balanced: 'Balanced',
  high: 'High',
};

export const graphicsLabel = (tier: Graphics): string => GRAPHICS_LABEL[tier];

/**
 * What each rung is allowed to ask of the ladder.
 *
 * These are pixel ratios, and they land on rungs that already exist in
 * quality.ts's LADDER — 1.0, 1.25, 1.5, 1.75, 2.0 — because a ceiling between
 * two rungs is just the lower rung with extra arithmetic. The mapping from a
 * settled ratio to how many post passes run is left exactly where it was, in
 * main.ts, and is not second-guessed here: it is a considered piece of look
 * design and this is a volume knob, not a re-grade.
 *
 * The consequence worth stating plainly is that Balanced drops the buffer to
 * 1.5, which on a 2× panel is 56% of the fragments — and the post chain is paid
 * per fragment, nine tenths of the frame — for an image whose softening is
 * mostly invisible in motion at 60 km/h through an office.
 */
const CEILING: Record<Graphics, number> = {
  quiet: 1.0,
  balanced: 1.5,
  high: 2.0,
};

/**
 * The shadow map, which is the one number in the game that was plainly too big.
 *
 * There is exactly one shadow-casting light — the key, in lighting.ts — and its
 * camera is a 32 m box that follows the player, so the map is re-rendered from
 * scratch every frame over every casting object in the building. At 4096 that is
 * a 16.7-megapixel depth pass per frame for 7.8 mm texels, which is finer than
 * the PCF radius of 1.5 that is then deliberately blurring them. 2048 gives
 * 15.6 mm, still under the blur, and costs a quarter as much.
 *
 * It is the cheapest quarter of a frame this renderer has ever given back, and
 * the reason it is on the graphics dial rather than simply lowered is that a
 * still screenshot on a 4K monitor can tell 2048 from 4096 at a wall corner. A
 * lap cannot.
 */
const SHADOW: Record<Graphics, number> = {
  quiet: 1024,
  balanced: 2048,
  high: 4096,
};

export const ceilingFor = (tier: Graphics): number => CEILING[tier];
export const shadowFor = (tier: Graphics): number => SHADOW[tier];

/* -- frame rate ------------------------------------------------------------ */

/**
 * 0 means "whatever the display does". Anything else is a ceiling in frames per
 * second.
 *
 * The default is 60 and that is a change in behaviour, so it is worth defending.
 * A bare requestAnimationFrame renders at the panel's refresh rate, which on a
 * ProMotion MacBook or any gaming laptop is 120 or 144 — while the quality
 * controller's own target has always been 1000/60. The game was spending double
 * the power to beat a target it had already set, and then spending the frames it
 * won on a ladder that climbed until the power ran out. Two mechanisms, pulling
 * the same direction, neither aware of the other.
 *
 * Uncapping is one row away for anyone with a high-refresh panel and the thermal
 * budget to enjoy it. The default is the one that does not set a laptop on fire
 * in a Firefox tab.
 */
export type FrameCap = 0 | 60;

export const FRAME_CAPS = [60, 0] as const;

export const frameCapLabel = (cap: FrameCap): string => (cap === 0 ? 'Display' : String(cap));

/* -- the dials themselves -------------------------------------------------- */

const GRAPHICS_KEY = 'ballern.graphics';
const FRAME_KEY = 'ballern.framecap';

function savedGraphics(): Graphics {
  const value = read(GRAPHICS_KEY);
  return GRAPHICS.includes(value as Graphics) ? (value as Graphics) : 'high';
}

function savedCap(): FrameCap {
  return read(FRAME_KEY) === 'display' ? 0 : 60;
}

let graphics: Graphics = savedGraphics();
let frameCap: FrameCap = savedCap();

/**
 * One listener, not a list.
 *
 * There is exactly one thing that needs to know when these move — the frame loop
 * in main.ts, which owns the ladder and the lights — and an event bus for a
 * single subscriber is machinery pretending to be architecture.
 */
let listener: (() => void) | null = null;

export const onSettingsChange = (fn: () => void): void => {
  listener = fn;
};

export const currentGraphics = (): Graphics => graphics;
export const currentFrameCap = (): FrameCap => frameCap;

/** Walk the graphics dial by one, wrapping. What the menu row does. */
export function cycleGraphics(direction: 1 | -1): void {
  const at = GRAPHICS.indexOf(graphics);
  const next = (at + direction + GRAPHICS.length) % GRAPHICS.length;
  graphics = GRAPHICS[next]!;
  write(GRAPHICS_KEY, graphics);
  listener?.();
}

/** And the frame rate, which is two positions and so wraps immediately. */
export function cycleFrameCap(direction: 1 | -1): void {
  const at = FRAME_CAPS.indexOf(frameCap);
  const next = (at + direction + FRAME_CAPS.length) % FRAME_CAPS.length;
  frameCap = FRAME_CAPS[next]!;
  write(FRAME_KEY, frameCap === 0 ? 'display' : String(frameCap));
  listener?.();
}
