/**
 * Resolution that gives way before the frame rate does.
 *
 * Everything expensive in this renderer is paid per fragment: the area lights,
 * the ambient occlusion, the bloom chain. That makes buffer resolution the one
 * dial that moves all of them at once and moves nothing about how the game
 * plays — a chair at 1.5× and a chair at 1× steer identically, and only one of
 * them misses the corner because the frame arrived 40 ms late.
 *
 * So the pixel ratio is not a constant. It is held as high as the machine can
 * carry at a steady 60, and dropped a step at a time when it cannot. The rule
 * this obeys is the one that matters in a racing game and nowhere else quite so
 * much: input-to-photon latency is the product, and a soft frame that arrives on
 * the beat beats a sharp one that does not.
 *
 * What it must never do is oscillate. A controller that reacts to a single slow
 * frame will resize the entire post chain — which is itself a stall — and then
 * react to that. Hence the median rather than the mean, the dead band, the
 * asymmetric thresholds, and the cooldown after every change.
 */

export type Quality = {
  /**
   * Feed it every frame's wall-clock delta, in seconds.
   *
   * `downOnly` lets a scene defend its own frame rate without being trusted to
   * raise anybody else's. The character select needs exactly that: it must be
   * able to notice that the rung it opened on is one this machine cannot hold,
   * but it must not be the thing that decides the race looks good at 2×, for
   * every reason in the note above the call site in main.ts.
   *
   * Downward is safe in a way upward is not, and the asymmetry is not arbitrary:
   * the menu is the *cheaper* scene — one figure, no field, no simulation — so a
   * menu that cannot hold the beat is proof the race cannot either. The reverse
   * says nothing at all.
   */
  sample(dt: number, downOnly?: boolean): void;
  /** Current buffer scale, for the readout. */
  ratio(): number;
  /** Median frame time over the recent window, in milliseconds. */
  frameMs(): number;
  /**
   * Take it off the automatic and move it a rung.
   *
   * There is a limit to how well a heuristic can guess what somebody wants to
   * look at, and this project has now hit it twice from opposite directions —
   * once tuned down until the image was soft, once tuned up until the frame
   * dropped. The person looking at the screen can see both of those instantly
   * and the controller can see neither, so they get the dial.
   */
  step(direction: 1 | -1): void;
  /** Hand it back to the controller. */
  auto(): void;
  /** False once the player has touched it. */
  automatic(): boolean;
  /**
   * Put a lid on it.
   *
   * Not the same dial as `step`, and the difference matters: `step` is a player
   * picking an image and taking the controller off the automatic to get it,
   * whereas this leaves the controller running and only tells it how much of the
   * machine it is welcome to spend. Underneath the lid it still measures, still
   * drops on a miss, still climbs on a win — it simply stops climbing sooner.
   *
   * That is what the graphics dial in settings.ts wants, because "Quiet" is not
   * a request for a particular buffer size. It is a request to leave the fans
   * alone on a machine whose speed nobody has measured yet.
   */
  limit(max: number): void;
};

type Options = {
  /** Never go below this. Past it the image stops being worth looking at. */
  min?: number;
  /** Never go above this, however fast the machine is. */
  max?: number;
  /** The beat we are trying to hold, in milliseconds. */
  target?: number;
  apply(ratio: number): void;
};

/** Frames of history the median is taken over. Half a second at 60. */
const WINDOW = 32;

/** Seconds to wait after a change before believing the numbers again. */
const COOLDOWN = 0.75;

/**
 * The ladder, coarse on purpose, and with a floor under it.
 *
 * Continuous scaling sounds better and is worse: every distinct value is a
 * fresh set of render targets and a fresh set of shader recompiles for the
 * passes that bake resolution into a define. Five rungs cover the range from a
 * laptop iGPU to a discrete card, and once the controller settles on one it can
 * stay there for the whole session.
 *
 * The bottom two rungs are gone. On a 2× display, 1.0 is a buffer at half the
 * screen's linear resolution being upscaled to reach it, and 0.75 is worse —
 * they are not "lower quality", they are a visibly pixelated image, and no
 * frame rate buys that back. If the machine cannot hold 1.25 the honest answer
 * is to render fewer things, not fewer pixels, which is what the light budget
 * in lights.ts now exists to do.
 */
const LADDER = [1.0, 1.25, 1.5, 1.75, 2.0] as const;

export function createQuality({ min = 1.25, max = 2, target = 1000 / 60, apply }: Options): Quality {
  const rungs = LADDER.filter((r) => r >= min && r <= max);
  /*
   * Start at the top and step down if the machine cannot hold it.
   *
   * This opened one rung below the ceiling, on the argument that the first second
   * of a session should not be its slowest — which is true, and is the wrong
   * trade, because of what the first second actually *is*. It is the character
   * select: a held still of one figure, with no simulation running behind it and
   * nothing moving but a slow swivel. There is no frame rate to protect there,
   * and starting a rung down means the portrait is rendered at 77% of the
   * screen's linear resolution and then visibly sharpens a second later when the
   * controller has seen enough frames to climb.
   *
   * A still image that resolves in front of you looks like a page still loading.
   * Being briefly slow during a menu costs nothing; looking unfinished costs the
   * first impression, which is the thing the old comment was trying to protect.
   */
  let index = rungs.length - 1;

  /*
   * The highest rung currently on offer, which is not always the highest rung
   * there is. `limit` moves it; everything that climbs reads it rather than
   * `rungs.length - 1`, so a ceiling is obeyed by the controller and by the
   * player's own arrow alike.
   */
  let top = rungs.length - 1;

  const history = new Float32Array(WINDOW);
  history.fill(target);
  let cursor = 0;
  let filled = 0;
  let cooldown = COOLDOWN;

  const sorted = new Float32Array(WINDOW);

  function median(): number {
    const n = Math.max(1, filled);
    sorted.set(history.subarray(0, n));
    const view = sorted.subarray(0, n);
    view.sort();
    return view[n >> 1]!;
  }

  /**
   * A chosen resolution survives a reload.
   *
   * Without this the dial is a thing you have to find and set again every time
   * the page comes back, which is worse than not having it — a setting you
   * cannot make stick is not a setting. Wrapped because a page served from a
   * file:// URL or in a locked-down context throws on the first touch of
   * localStorage, and a graphics preference is not worth a blank screen over.
   */
  const STORE = 'ballern.resolution';
  const remember = (value: string) => {
    try {
      localStorage.setItem(STORE, value);
    } catch {
      /* no storage, no memory. The dial still works for this session. */
    }
  };

  let automatic = true;
  try {
    const saved = localStorage.getItem(STORE);
    const rung = saved === null ? -1 : rungs.findIndex((r) => r === Number(saved));
    if (rung >= 0) {
      index = rung;
      automatic = false;
    }
  } catch {
    /* as above */
  }

  apply(rungs[index]!);

  return {
    limit(max) {
      let next = 0;
      for (let i = rungs.length - 1; i >= 0; i--) {
        if (rungs[i]! <= max) {
          next = i;
          break;
        }
      }
      if (next === top) return;
      top = next;

      /*
       * Where the image goes when the lid moves, which is not symmetrical.
       *
       * Lowering it has to take the picture down immediately or the setting is
       * one that appears to do nothing until the machine next happens to step.
       *
       * Raising it goes straight to the new ceiling rather than waiting for the
       * controller to climb, and that is the same rule the constructor already
       * follows for the same reason: it opens at the top and steps down if the
       * machine cannot hold it. Climbing is deliberately slow — a full window of
       * frames and a cooldown — because it is guarding against a controller that
       * hunts. Somebody who has just pressed "High" is not a measurement to be
       * distrusted, they are an instruction, and making them watch the image
       * sharpen over the next two seconds reads as a setting that did not take.
       *
       * Unless they have pinned a rung by hand, in which case the lid is only
       * ever a clamp: a ceiling is permission, not a preference, and it should
       * not overwrite one.
       */
      const wanted = automatic ? top : Math.min(index, top);
      if (wanted === index) return;
      index = wanted;
      apply(rungs[index]!);
      history.fill(target);
      filled = 0;
      cooldown = COOLDOWN;
    },

    step(direction) {
      automatic = false;
      const next = Math.max(0, Math.min(top, index + direction));
      if (next === index) return;
      index = next;
      apply(rungs[index]!);
      remember(String(rungs[index]));
      history.fill(target);
      filled = 0;
      cooldown = COOLDOWN;
    },
    auto() {
      automatic = true;
      remember('auto');
      history.fill(target);
      filled = 0;
      cooldown = COOLDOWN;
    },
    automatic: () => automatic,

    sample(dt, downOnly = false) {
      if (!automatic) return;
      /**
       * A frame nobody watched is not evidence about anything.
       *
       * requestAnimationFrame in a hidden or fully occluded window fires at
       * something like once a second, and every one of those deltas looks like a
       * catastrophically slow frame. Sampling them walked the ladder all the way
       * to the bottom while the window was in the background, so coming back to
       * the game meant coming back to the worst image it can produce and waiting
       * several seconds for it to climb out. Which is exactly backwards: the
       * frames that were slow were the ones nobody saw.
       */
      if (typeof document !== 'undefined' && document.hidden) return;

      const ms = dt * 1000;

      /**
       * And a stall is not a frame rate either.
       *
       * A shader compiling, a garbage collection, the compositor losing a beat:
       * these are single events, they are not what the next second will look
       * like, and reacting to one by resizing the entire post chain makes the
       * following frame worse. Anything past three times the target is dropped
       * rather than clamped — clamping still lets a run of them drag the median
       * down a rung. A machine genuinely running at 30 fps is well inside this
       * and is still measured honestly.
       */
      if (ms > target * 3) return;

      history[cursor] = ms;
      cursor = (cursor + 1) % WINDOW;
      if (filled < WINDOW) filled++;

      cooldown -= dt;
      if (cooldown > 0 || filled < WINDOW) return;

      const m = median();

      // Down on a clear miss, up only on a comfortable win. The asymmetry is
      // what keeps the controller from hunting across the rung it wants: the
      // cost of one step up has to fit inside the headroom before we take it.
      if (m > target * 1.12 && index > 0) {
        index--;
      } else if (m < target * 0.72 && index < top && !downOnly) {
        index++;
      } else {
        return;
      }

      apply(rungs[index]!);
      cooldown = COOLDOWN;
      // The resize itself is a stall. Forget the window rather than let it
      // trigger the opposite correction on the next frame.
      history.fill(target);
      filled = 0;
    },
    ratio: () => rungs[index]!,
    frameMs: () => median(),
  };
}
