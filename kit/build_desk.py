"""
Bench desk, 1600 × 800 × 720.

DIN EN 527 worksurface on a cantilever C-frame. The details that date it are
the beech-decor melamine, the grey PVC edge banding on every exposed edge, and
the fact that the frame is RAL 7035 rather than black.

Origin on the floor at the centre of the desk, user side at -Y.

    blender --background --factory-startup --python kit/build_desk.py -- out.glb
"""

import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import kitlib as K  # noqa: E402

W = 1.60
D = 0.80
H = 0.72
TOP_T = 0.025

K.reset()

MELAMINE = K.material("Melamine", K.srgb(0xC9A87C), roughness=0.38)
EDGE = K.material("EdgeBand", K.srgb(0x8F8B82), roughness=0.5)
FRAME = K.material("Frame", K.srgb(0xD7D7D2), roughness=0.5, metallic=0.35)
TRAY = K.material("Tray", K.srgb(0x54565A), roughness=0.5, metallic=0.4)

parts = []

# Worktop. The band is modelled as separate geometry rather than painted on,
# because at chair height you are looking straight along the front edge.
top = K.box("Worktop", (W, D, TOP_T), (0, 0, H - TOP_T / 2))
K.bevel(top, width=0.002, segments=2)
parts.append(K.assign(top, MELAMINE))

for sign, axis_size, pos in (
    (-1, (W, 0.004, TOP_T + 0.001), (0, -D / 2 - 0.002, H - TOP_T / 2)),
    (1, (W, 0.004, TOP_T + 0.001), (0, D / 2 + 0.002, H - TOP_T / 2)),
):
    band = K.box("EdgeBand", axis_size, pos)
    K.bevel(band, width=0.0012, segments=2)
    parts.append(K.assign(band, EDGE))
    del sign

# Cantilever C-frames, inset from the ends the way bench systems are: foot on
# the floor running front-to-back, upright at the rear, rail under the top.
for side in (-1, 1):
    x = side * (W / 2 - 0.16)

    foot = K.box("Foot", (0.05, D - 0.10, 0.042), (x, 0.0, 0.021))
    K.taper(foot, axis='Y', at=-1, scale=(0.8, 0.7))
    K.bevel(foot, width=0.008, segments=3)
    K.shade_smooth(foot)
    parts.append(K.assign(foot, FRAME))

    upright = K.box("Upright", (0.05, 0.06, H - 0.062), (x, D / 2 - 0.09, (H - 0.062) / 2 + 0.042))
    K.bevel(upright, width=0.008, segments=3)
    K.shade_smooth(upright)
    parts.append(K.assign(upright, FRAME))

    rail = K.box("Rail", (0.05, D - 0.16, 0.05), (x, 0.0, H - TOP_T - 0.026))
    K.bevel(rail, width=0.008, segments=3)
    K.shade_smooth(rail)
    parts.append(K.assign(rail, FRAME))

    glide = K.cylinder("Glide", 0.014, 0.012, (x, -(D / 2 - 0.09), 0.006), segments=12)
    K.bevel(glide, width=0.002, segments=2)
    K.shade_smooth(glide)
    parts.append(K.assign(glide, FRAME))

# Modesty panel, set in from the back edge.
modesty = K.box("ModestyPanel", (W - 0.36, 0.018, 0.34), (0, D / 2 - 0.06, H - 0.055 - 0.17))
K.bevel(modesty, width=0.002, segments=2)
parts.append(K.assign(modesty, MELAMINE))

# Cable tray. In 2004 every desk carried a CRT, a tower and a phone, so this is
# not optional dressing — it is why the desk has a back at all.
tray = K.box("CableTray", (W - 0.50, 0.115, 0.07), (0, D / 2 - 0.20, H - TOP_T - 0.075))
K.taper(tray, axis='Z', at=-1, scale=(1.0, 0.72))
K.bevel(tray, width=0.006, segments=2)
K.shade_smooth(tray)
parts.append(K.assign(tray, TRAY))

# Grommet rings, sitting proud of the worktop.
for side in (-1, 1):
    ring = K.cylinder("Grommet", 0.036, 0.006, (side * 0.52, D / 2 - 0.09, H + 0.002), segments=20, radius_top=0.033)
    K.bevel(ring, width=0.0015, segments=2)
    K.shade_smooth(ring)
    parts.append(K.assign(ring, TRAY))

desk = K.join(parts, "BenchDesk")

K.assert_bounds(desk, {
    "width":  (1.59, 1.61),
    "depth":  (0.79, 0.82),
    "height": (0.715, 0.735),   # worktop 720 plus the grommet rings
    "floor":  (-0.002, 0.004),
})

K.export(sys.argv[-1], name="bench-desk")
