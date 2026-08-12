/**
 * The start line, and only the start line.
 *
 * It is the building's own: nobody installs a start line in an Empfang, so
 * somebody went to the facilities store on the evening they decided the floor
 * was a circuit, took out the chequered tape that marks off a wet floor, laid a
 * chequer across the stone, and dragged the belt posts out to stop it being
 * ambiguous where the line is.
 *
 * The checkpoints used to live here too — first as bands of hazard tape at every
 * gate, then as pink rings hanging at head height. Both are gone, and the second
 * one is the interesting removal: the rings worked, and they were still deleted,
 * because the clay skin's donuts (`skins/clay/donuts.ts`) are the same idea done
 * once more and better, and two pieces of arcade furniture marking the same
 * eleven planes is one piece of furniture and one bug waiting to disagree with
 * it. A checkpoint should have exactly one appearance.
 *
 * So this builds a line, and the thing you aim at is somebody else's job.
 */

import * as THREE from 'three';

import { GATES } from './plan';
import { beltPost } from './props/hall';
import { collapse } from '../render/batch';

/** Depth of the taped band at the line, along the direction of travel. */
const DEPTH = 0.5;
/** One square. Two rows of these across the line is a chequer. */
const SQUARE = 0.25;

/**
 * Lifted off the floor and biased in the depth buffer.
 *
 * Either one alone fails: 6 mm of air is enough to z-fight at the far end of a
 * twenty-six metre hall where the depth buffer's precision has run out, and
 * polygon offset alone leaves the tape visibly floating when the sun rakes
 * across it and the shadow of a belt post crosses the gap.
 */
const LIFT = 0.006;

const tape = (color: number, bias: number) =>
  new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: 0.68,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: bias,
    polygonOffsetUnits: bias,
  });

/** Gaffer tape, not paint: the dark is a warm near-black, never a pure one, and
 *  the light is off-white cloth rather than the traffic paint out on the deck. */
const DARK = tape(0x24221d, -2);
const LIGHT = tape(0xe6e2d6, -4);

/** Where the tape for the line goes, in the line's own frame. */
function frameOf(gate: (typeof GATES)[number]) {
  const across = new THREE.Vector2(-gate.normal[1], gate.normal[0]);
  return {
    across,
    /** The floor this gate's tape is stuck to. */
    floor: gate.y ?? 0,
    /** Spin a plane laid flat so it squares up with the gate. */
    yaw: Math.atan2(gate.normal[0], gate.normal[1]),
    at: (u: number, v: number): [number, number, number] => [
      gate.at[0] + gate.normal[0] * u + across.x * v,
      gate.y ?? 0,
      gate.at[1] + gate.normal[1] * u + across.y * v,
    ],
  };
}

/** A flat rectangle of tape, lying on the floor and square to a gate. */
function strip(
  width: number,
  depth: number,
  material: THREE.Material,
  yaw: number,
  at: [number, number, number],
  y: number,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.rotation.z = -yaw;
  mesh.position.set(at[0], y, at[2]);
  mesh.receiveShadow = true;
  return mesh;
}

function buildStartLine(group: THREE.Group): void {
  const gate = GATES[0]!;
  const f = frameOf(gate);

  const rows = Math.round(DEPTH / SQUARE);
  const columns = Math.round((gate.halfWidth * 2) / SQUARE);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      // The chequer: light squares only, laid over one continuous dark band.
      // Cutting both colours into squares doubles the geometry to draw the same
      // image, and leaves a hairline of floor down every seam.
      if ((r + c) % 2 === 1) continue;
      const u = (r + 0.5) * SQUARE - DEPTH / 2;
      const v = (c + 0.5) * SQUARE - gate.halfWidth;
      group.add(strip(SQUARE, SQUARE, LIGHT, f.yaw, f.at(u, v), f.floor + LIFT + 0.001));
    }
  }

  group.add(strip(gate.halfWidth * 2, DEPTH, DARK, f.yaw, f.at(0, 0), f.floor + LIFT));

  // Belt posts, one either end, standing just outside the taped width so they
  // are unmistakable and unhittable.
  for (const side of [-1, 1]) {
    const post = beltPost();
    const [x, , z] = f.at(0, (gate.halfWidth + 0.35) * side);
    post.position.set(x, f.floor, z);
    group.add(post);
  }
}

export type TrackMarks = {
  group: THREE.Group;
};


export function buildTrackMarks(): TrackMarks {
  const group = new THREE.Group();
  group.name = 'trackmarks';

  const line = new THREE.Group();
  buildStartLine(line);
  // Thirty little planes and two posts, arriving as three draws.
  group.add(collapse(line));

  return { group };
}
