"""blender -b --factory-startup -P blender/render.py -- --who pip --out out/pip.png

Overrides let you turn a dial without editing the cast:
    -- --who pip --set lid_drop=44 --set ear_curl=10
"""

import argparse
import ast
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

from crew import build as B          # noqa: E402
from crew import studio              # noqa: E402
from crew.cast import CAST           # noqa: E402


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument('--who', default='pip')
    ap.add_argument('--out', default=None)
    ap.add_argument('--res', type=int, default=900)
    ap.add_argument('--samples', type=int, default=128)
    ap.add_argument('--orbit', type=float, default=0.0)
    ap.add_argument('--dist', type=float, default=None)
    ap.add_argument('--lens', type=float, default=None)
    ap.add_argument('--look-z', type=float, default=None)
    ap.add_argument('--view', default='Standard')
    ap.add_argument('--contrast', default=None)
    ap.add_argument('--set', action='append', default=[])
    ap.add_argument('--save-blend', default=None)
    ap.add_argument('--frame', default='bust', choices=('bust', 'full'))
    a = ap.parse_args(argv)

    spec = CAST[a.who]
    for kv in a.set:
        k, _, v = kv.partition('=')
        spec = spec.tweak(**{k: ast.literal_eval(v)})

    studio.wipe()
    if a.frame == 'full':
        # game scale: metres, soles on the floor, whole figure in shot
        fig = B.build(spec)
        info = B.finish(fig, spec)
        studio.stage()
        mid = info['height'] * 0.52
        studio.camera(dist=a.dist or info['height'] * 2.55, lens=a.lens or 55.0,
                      look=(0, 0, mid), orbit=a.orbit)
        print('FIGURE height=%.3fm scale=%.4f seat=%s'
              % (info['height'], info['scale'], info['seat']))
    else:
        studio.seamless()
        studio.lights()
        studio.camera(dist=a.dist or spec.cam_dist, lens=a.lens or 85.0,
                      look=(0, 0, spec.cam_z if a.look_z is None else a.look_z),
                      orbit=a.orbit)
        B.build(spec)

    out = a.out or os.path.join(HERE, 'out', f'{a.who}.png')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    if a.save_blend:
        import bpy
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(a.save_blend))
    studio.render(out, res=a.res, samples=a.samples,
                  view=a.view, look=a.contrast)
    print('WROTE', out)


main()
