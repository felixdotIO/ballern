"""Render the whole roster on one light, then tile it into a contact sheet.

    blender -b --factory-startup -P blender/roster.py -- --res 560
"""

import argparse
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

from crew import build as B          # noqa: E402
from crew import studio              # noqa: E402
from crew.cast import ROSTER         # noqa: E402


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument('--res', type=int, default=560)
    ap.add_argument('--samples', type=int, default=90)
    ap.add_argument('--dist', type=float, default=6.4)
    ap.add_argument('--look-z', type=float, default=-0.46)
    ap.add_argument('--only', default=None, help='comma-separated keys')
    ap.add_argument('--bare', action='store_true',
                    help='strip the mask and the kit — what is underneath')
    a = ap.parse_args(argv)

    # one framing for everybody: a character sheet is only useful if the
    # figures can be compared without the camera moving between them
    keys = a.only.split(',') if a.only else list(ROSTER)
    sub = 'bare' if a.bare else ''
    for key in keys:
        spec = ROSTER[key]
        if a.bare:
            # extras are mask furniture too — the bag's fold and handle have to
            # come off with it or 'bare' is a lie
            spec = spec.tweak(shell='bare', rim=0.0, hat='none', cans=False,
                              rib_relief=0.0, extras=())
        studio.wipe()
        studio.seamless()
        studio.lights()
        studio.camera(dist=a.dist, lens=85.0, look=(0, 0, a.look_z))
        B.build(spec)
        out = os.path.join(HERE, 'out', 'roster', sub, f'{key}.png')
        os.makedirs(os.path.dirname(out), exist_ok=True)
        studio.render(out, res=a.res, samples=a.samples)
        print('ROSTER', key, spec.name, '->', out)


main()
