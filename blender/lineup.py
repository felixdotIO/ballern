"""Group shot: every character in one frame, on the same light.

    blender -b --factory-startup -P blender/lineup.py -- --res 1600
"""

import argparse
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import bpy                            # noqa: E402
from crew import build as B           # noqa: E402
from crew import studio               # noqa: E402
from crew.cast import CAST            # noqa: E402


def place_figure(spec, dx, turn=0.0, dz=0.0):
    """Build a spec, then shift and turn everything it created."""
    before = set(bpy.data.objects)
    B.build(spec)
    for ob in bpy.data.objects:
        if ob in before or ob.parent is not None:
            continue
        ob.location.x += dx
        ob.location.z += dz
        ob.rotation_euler.z += math.radians(turn)
        # turning about the figure's own axis, not the world origin
        x, y = ob.location.x - dx, ob.location.y
        a = math.radians(turn)
        ob.location.x = dx + x * math.cos(a) - y * math.sin(a)
        ob.location.y = x * math.sin(a) + y * math.cos(a)


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument('--res', type=int, default=1600)
    ap.add_argument('--samples', type=int, default=200)
    ap.add_argument('--out', default=os.path.join(HERE, 'out', 'lineup.png'))
    a = ap.parse_args(argv)

    studio.wipe()
    studio.seamless()
    studio.lights()

    # sack's head is taller, so drop it a little to line the shoulders up
    place_figure(CAST['pip'], dx=-0.95, turn=14.0)
    place_figure(CAST['sack'], dx=1.05, turn=-11.0, dz=-0.10)

    studio.camera(dist=7.4, lens=85.0, look=(0, 0, -0.34))
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    studio.render(a.out, res=a.res, res_y=int(a.res * 0.62),
                  samples=a.samples)
    print('WROTE', a.out)


main()
