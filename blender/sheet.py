"""Render several variants in one Blender process, then tile them.

    blender -b --factory-startup -P blender/sheet.py -- \
        --who pip --tag look \
        --var "" --var "lid_drop=44" --var "rib_depth=0.12,ribs=44"
"""

import argparse
import ast
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import bpy                            # noqa: E402
from crew import build as B           # noqa: E402
from crew import studio               # noqa: E402
from crew.cast import CAST            # noqa: E402


def parse(kvs):
    out = {}
    for kv in kvs.split(';'):
        kv = kv.strip()
        if not kv:
            continue
        k, _, v = kv.partition('=')
        out[k.strip()] = ast.literal_eval(v.strip())
    return out


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument('--who', default='pip')
    ap.add_argument('--tag', default='v')
    ap.add_argument('--var', action='append', default=[''])
    ap.add_argument('--res', type=int, default=520)
    ap.add_argument('--samples', type=int, default=48)
    ap.add_argument('--orbit', type=float, default=0.0)
    ap.add_argument('--dist', type=float, default=None)
    ap.add_argument('--look-z', type=float, default=None)
    ap.add_argument('--view', default='Standard')
    ap.add_argument('--contrast', default=None)
    ap.add_argument('--exposure', type=float, default=-0.5)
    ap.add_argument('--light', type=float, default=1.0)
    a = ap.parse_args(argv)

    outs = []
    for i, kvs in enumerate(a.var):
        over = parse(kvs)
        light = over.pop('_light', a.light)
        expo = over.pop('_exposure', a.exposure)
        view = over.pop('_view', a.view)
        orbit = over.pop('_orbit', a.orbit)
        spec = CAST[a.who].tweak(**over)

        studio.wipe()
        studio.seamless()
        studio.lights(scale=light)
        studio.camera(dist=a.dist or spec.cam_dist,
                      look=(0, 0, spec.cam_z if a.look_z is None else a.look_z),
                      orbit=orbit)
        B.build(spec)

        path = os.path.join(HERE, 'out', f'{a.who}_{a.tag}_{i}.png')
        studio.render(path, res=a.res, samples=a.samples, view=view,
                      look=a.contrast, exposure=expo)
        print('VARIANT', i, kvs or '(base)', '->', path)
        outs.append(path)

    print('SHEET ' + ' '.join(outs))


main()
