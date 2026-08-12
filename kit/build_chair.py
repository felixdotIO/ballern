"""
Task chair — the hero asset.

It is on screen every single frame, it is the thing being driven, and it is
also every second prop in the room, so it justifies more care than anything
else in the kit.

Dimensions match office/metrics.ts exactly: seat pad 470 × 440, seat height
470, five-star base Ø 660, castors Ø 50, backrest 550 tall. If those move in
the game, they move here too.

Built to the conventions the game expects: origin on the floor at the centre of
the base, facing -Z.

    blender --background --factory-startup --python kit/build_chair.py -- out.glb
    blender --background --factory-startup --python kit/build_chair.py -- out.glb --race

The armless variant is the one being *driven*. The cast sits with its hands
forward in its lap — that is how `crew/build.py` poses a seated figure, and it is
how anybody sits on a chair with no arms — so on a chair that has them the
forearms pass straight through both pads. Measured in-game before this variant
existed: 195 figure vertices inside the post, 254 inside the pad, on every frame
of every race. Every other chair in the building keeps its armrests, because
every other chair in the building has somebody working at a desk in it.
"""

import math
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import kitlib as K  # noqa: E402

# --- dimensions, mirrored from office/metrics.ts ---------------------------
RACE = '--race' in sys.argv

# Seat height. 470 is the real one and what `office/metrics.ts` says a task chair
# is, and it is what every chair standing at a desk keeps.
#
# The chair being *driven* is wound down to its lowest, 380, and that is the cast's
# doing rather than a style choice. `blender/rig.py` reports each character's own
# seat height as it exports: they run 350 to 363 mm, because the cast is stylised at
# about 1.44 m tall and a seated figure's hip lands at a fixed fraction of its
# height. Sit one of them on a 470 cushion and either the backside is 100 mm inside
# it or the soles are 100 mm off the carpet — and the soles cannot move, because the
# driver animation pushes off the floor with them.
#
# A gas lift at the bottom of its travel is the one explanation that costs nothing
# and is true of every office in the world: whoever had this chair before wound it
# all the way down.
#
# 320 rather than the 380 the reported hip height suggests, and the 60 mm between
# them is the difference between a joint and a surface: the hip lands at 353, but the
# backside and thigh mass hangs about 65 below that, so a cushion at 380 met the hip
# and left the soles 70 mm off the carpet. The number that matters is where the
# figure's lowest point is, which `garage.ts` measures off the posed mesh.
SEAT_H = 0.32 if RACE else 0.47
SEAT_W = 0.47
SEAT_D = 0.44
BASE_R = 0.33
CASTOR_R = 0.025
BACK_H = 0.55

K.reset()

FABRIC = K.material("Fabric", K.srgb(0x3E6B6B), roughness=0.92)
PLASTIC = K.material("Plastic", K.srgb(0x2E2E30), roughness=0.45)
ALU = K.material("Aluminium", K.srgb(0xB6B8BA), roughness=0.34, metallic=0.85)

parts = []

# ---------------------------------------------------------------------------
# Five-star base
# ---------------------------------------------------------------------------
# One arm, tapered outward and dropped at the tip so it sweeps down to the
# castor the way a real cast base does, then repeated five times. This is the
# one place in a chair where identical repetition is correct — it is a single
# moulding.

ARM_LEN = BASE_R - 0.03
arm = K.box("BaseArm", (ARM_LEN, 0.055, 0.05), (ARM_LEN / 2, 0, 0.062))
K.taper(arm, axis='X', at=1, scale=(0.62, 0.55), shift=-0.018)
K.taper(arm, axis='X', at=-1, scale=(1.5, 1.35))
K.bevel(arm, width=0.008, segments=3)
K.shade_smooth(arm)
K.assign(arm, PLASTIC)

for a in K.radial(arm, 5):
    parts.append(a)

hub = K.cylinder("BaseHub", 0.062, 0.085, (0, 0, 0.078), segments=16)
K.bevel(hub, width=0.006, segments=2)
K.shade_smooth(hub)
parts.append(K.assign(hub, PLASTIC))

# Twin-wheel castors: a stem, a yoke, and two wheels. The twin wheel is the
# period-correct detail — single-wheel castors read as a modern chair.
castor_parts = []
stem = K.cylinder("CastorStem", 0.011, 0.05, (ARM_LEN, 0, 0.045), segments=8)
castor_parts.append(stem)
yoke = K.box("CastorYoke", (0.05, 0.055, 0.022), (ARM_LEN, 0, 0.028))
K.bevel(yoke, width=0.004, segments=2)
castor_parts.append(yoke)
for side in (-1, 1):
    wheel = K.cylinder("CastorWheel", CASTOR_R, 0.016, (ARM_LEN, side * 0.022, CASTOR_R),
                       segments=10, rotation=(90, 0, 0))
    castor_parts.append(wheel)

castor = K.join(castor_parts, "Castor")
K.shade_smooth(castor)
K.assign(castor, PLASTIC)
for c in K.radial(castor, 5):
    parts.append(c)

# ---------------------------------------------------------------------------
# Gas lift
# ---------------------------------------------------------------------------
# Two telescoping sections: a wider bellows cover over a polished ram.

LIFT = SEAT_H - 0.47   # how far the whole column moves with the seat

cover = K.cylinder("LiftCover", 0.036, 0.17 + LIFT * 0.4, (0, 0, 0.19 + LIFT * 0.4), segments=14, radius_top=0.031)
K.bevel(cover, width=0.004, segments=2)
K.shade_smooth(cover)
parts.append(K.assign(cover, PLASTIC))

ram = K.cylinder("LiftRam", 0.023, 0.20 + LIFT * 0.6, (0, 0, 0.35 + LIFT), segments=14)
K.bevel(ram, width=0.003, segments=2)
K.shade_smooth(ram)
parts.append(K.assign(ram, ALU))

# Synchron mechanism housing under the seat, with the tilt-tension knob.
mech = K.box("Mechanism", (0.20, 0.24, 0.07), (0, 0.01, SEAT_H - 0.075))
K.bevel(mech, width=0.008, segments=3)
K.shade_smooth(mech)
parts.append(K.assign(mech, PLASTIC))

knob = K.cylinder("TensionKnob", 0.028, 0.05, (0, -0.13, SEAT_H - 0.085), segments=10, rotation=(90, 0, 0))
K.bevel(knob, width=0.003, segments=2)
K.shade_smooth(knob)
parts.append(K.assign(knob, PLASTIC))

lever = K.cylinder("HeightLever", 0.011, 0.13, (0.13, -0.06, SEAT_H - 0.075), segments=8, rotation=(0, 90, 0))
K.bevel(lever, width=0.003, segments=2)
K.shade_smooth(lever)
parts.append(K.assign(lever, PLASTIC))

# ---------------------------------------------------------------------------
# Seat
# ---------------------------------------------------------------------------
# The cushion gets the upholstery treatment: a wide chamfer then one
# subdivision, so the top face stays flat and only the rim rolls over. The
# front edge is then dropped into a waterfall, which is the shape that stops a
# seat pad reading as a slab.

seat = K.box("SeatCushion", (SEAT_W, SEAT_D, 0.085), (0, 0, SEAT_H), cuts=2)
for v in seat.data.vertices:
    if v.co.y < -SEAT_D * 0.4:          # waterfall front edge
        v.co.z -= 0.022
        v.co.y -= 0.006
    if v.co.y > SEAT_D * 0.4:           # slight rear scoop
        v.co.z -= 0.006
# Side bolsters: the pad dishes very slightly toward the middle.
K.arc(seat, along='X', into='Z', amount=0.008, power=2.2)
K.soften(seat, bevel_width=0.016, segments=3, sub=1)
parts.append(K.assign(seat, FABRIC))

seat_shell = K.box("SeatShell", (SEAT_W - 0.02, SEAT_D - 0.02, 0.02), (0, 0, SEAT_H - 0.045))
K.bevel(seat_shell, width=0.008, segments=3)
K.shade_smooth(seat_shell)
parts.append(K.assign(seat_shell, PLASTIC))

# ---------------------------------------------------------------------------
# Backrest
# ---------------------------------------------------------------------------
# Bent around Z so it wraps the sitter, and reclined slightly. The wrap is the
# difference between a backrest and a plank.

back = K.box("Backrest", (SEAT_W - 0.03, 0.075, BACK_H), (0, 0, BACK_H / 2), cuts=3)
for v in back.data.vertices:
    if v.co.z > BACK_H * 0.42:          # taper the shoulders
        v.co.x *= 0.86
    if abs(v.co.z) < BACK_H * 0.12:     # lumbar bulge
        v.co.y -= 0.018
# Wrap the sitter: the edges come forward relative to the centre. This is the
# difference between a backrest and a plank.
K.arc(back, along='X', into='Y', amount=-0.055, power=2.0)
K.soften(back, bevel_width=0.014, segments=3, sub=1)
K.assign(back, FABRIC)
# The mesh already spans 0..BACK_H in its own data, so this offset places the
# bottom of the backrest, not its centre — it sits just clear of the cushion.
back.location = (0, 0.20, SEAT_H + 0.005)
back.rotation_euler[0] = math.radians(-9)
parts.append(back)

# Support arm from the mechanism up to the backrest.
support = K.box("BackSupport", (0.07, 0.055, 0.30), (0, 0.20, SEAT_H + 0.03))
K.taper(support, axis='Z', at=1, scale=(0.75, 0.8))
K.bevel(support, width=0.008, segments=3)
K.shade_smooth(support)
parts.append(K.assign(support, PLASTIC))

# ---------------------------------------------------------------------------
# Armrests
# ---------------------------------------------------------------------------

ARMS = '--no-arms' not in sys.argv and not RACE

for side in (-1, 1) if ARMS else ():
    post = K.box("ArmPost", (0.032, 0.05, 0.20), (side * 0.255, 0.045, SEAT_H + 0.055))
    K.taper(post, axis='Z', at=-1, scale=(1.3, 1.2))
    K.bevel(post, width=0.006, segments=3)
    K.shade_smooth(post)
    parts.append(K.assign(post, PLASTIC))

    pad = K.box("ArmPad", (0.055, 0.215, 0.024), (side * 0.255, 0.0, SEAT_H + 0.165))
    K.taper(pad, axis='Y', at=-1, scale=(0.72, 0.9))
    K.bevel(pad, width=0.009, segments=3, angle=60)
    K.shade_smooth(pad)
    parts.append(K.assign(pad, PLASTIC))

# ---------------------------------------------------------------------------

chair = K.join(parts, "TaskChair")

# Dimension gate. The asset has to agree with office/metrics.ts or the collider,
# the camera height and every desk it is pushed under are all subtly wrong — and
# that is exactly the kind of error that is invisible until the whole room looks
# off for reasons nobody can name.
K.assert_bounds(chair, {
    # With arms, the pads set the width; without them it is the base across the
    # flats, which is genuinely narrower — 605 against 680. Two bands rather than
    # one loose one, so the gate still catches a base that has drifted.
    "width":  (0.68, 0.78) if ARMS else (0.58, 0.64),
    # fmt: off
    # A five-point star is not rotationally symmetric: across the flats is
    # genuinely narrower than across the points, so depth < width is correct.
    "depth":  (0.60, 0.74),
    # A mid-back task chair with no headrest — and 90 mm shorter when it is wound
    # down to the bottom of its travel.
    "height": (1.00, 1.10) if not RACE else (0.83, 0.95),
    "floor":  (-0.002, 0.006),
})

out = [a for a in sys.argv[sys.argv.index('--') + 1:] if not a.startswith('-')][0]
K.export(out, name="task-chair-race" if RACE else "task-chair")
