"""
The driver — a man dressed for a holiday, scooting an office chair with his feet.

Designed as the *dressed figure*, which is how a game character is actually
built. Two earlier approaches failed for the same underlying reason and are
worth naming, because the shape of this file is a direct answer to both:

  - Painting a costume onto a nude anatomical mesh gives a naked man in
    emulsion. From behind you read deltoids, shoulder blades and the groove of
    a spine straight through the "shirt". Colour cannot fix an absent garment.
  - Cutting garments as inflated copies of that body gives cloth with his exact
    shape and no slack — a base layer, not a shirt — and it cannot survive a
    fold: skin and cloth ride the same weights at different radii, so closing
    his hips drags the shirt through his own waist.

So there is no body here. The mesh *is* the clothes: the sleeve is the arm, the
trouser leg is the leg, the shirt is the torso. Skin exists only where skin
shows — head, neck, hands. A garment has volume of its own, which is what makes
cloth read as cloth: the shirt is cut wider than the man at the waist and hangs
over the belt, the sleeve is a tube around a thinner arm, the trouser breaks
over the shoe.

He is in a loud shirt, shorts, slippers, a straw hat, headphones and shades,
which is the joke: the building is a real 2004 German office and he is dressed
for a beach that is nowhere near it. The costume is also chosen to survive the
only camera the game has. From directly behind at 3.4 m a collar and a tie are
four pixels; a hat brim and a pair of headphone cans break the silhouette on
either side of his head and read instantly, and bare arms and legs give the
figure two long skin-coloured shapes that move against the seat back.

Proportions are designed, not measured: 1.72 m over a 382 mm head, four and a
half heads. An earlier version of this file was built at life proportions —
1.78 m, seven and a half heads — on the argument that a real man in a real
office is funnier than a mascot. It was not. Life proportions only read as
healthy when you can afford the anatomy that sells them: muscle, fat, shading,
a face. With flat clay materials and a head thirty pixels tall there is no
anatomy to read, and a small head on a long body is the silhouette of illness
and age in every culture on earth. The figure looked ill, which is the one
thing he must never look.

So the numbers here come from the appeal recipe instead, which is short and
mechanical: a cranium far too big for the jaw, eyes set *below* the middle of
the head and wide apart, a small nose and a short chin, hands and feet a size
too large, and limbs that swell and pinch — a smooth monotonic taper is a
stick, and the file used to be full of them. The rest is contrast: shoulders
half again the width of the head, a waist narrower than both, and one hero
colour that is nobody else's.

Everything below is solved rather than measured, so the reproportioning is
safe: `SIT_Z` iterates until his backside is on the cushion and the arms IK
onto the armrest pads wherever those end up.

The pose is a scoot. To drag a wheeled chair forward you reach a foot out,
plant it and pull the chair to it, alternating — so one leg is extended and
planted while the other is folded back under the seat, mid-recovery. Both feet
stay near the chair. An earlier version had a leg swept out past the castors
with a pointed toe, which is a dance position and reads as one.

Bone names match the joints `src/game/driver.ts` emits angles for and
`src/render/driverRig.ts` drives.

    blender --background --factory-startup --python kit/build_character.py -- out.glb
"""

import json
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import kitlib as K  # noqa: E402

# ---------------------------------------------------------------------------
# The man
# ---------------------------------------------------------------------------
# Joint centres, standing, in metres. x is his left; he faces -Y. Everything
# below — skeleton and geometry alike — is generated from these, so the two
# cannot drift apart.

HEIGHT = 1.720
# Wider than it is tall. This is the correction that mattered most: at 382 tall
# by 300 wide, with the cranium stretched and the jaw tapered, the head was an
# egg — widest at the temples, narrowing to a rounded point — and an egg with
# two big dark eyes low on it is not a mascot, it is a Roswell grey. Every head
# anybody has ever found friendly is at least as wide as it is tall.
HEAD_H, HEAD_W, HEAD_D = 0.352, 0.336, 0.344
CHIN_Z = HEIGHT - HEAD_H

# The head is stretched about its own centre after it is built — cranium up,
# jaw down — so its centre is not its midpoint. Everything that has to sit on
# the head is placed off `head_z`, and `head_z` is placed off the chin. Only
# slightly asymmetric now: pushed further it is the same egg by another route.
SKULL_UP, SKULL_DOWN = 1.08, 0.92

NECK_Z = 1.277                       # base of the neck; short, so the head sits on him
SHOULDER_Z, SHOULDER_X = 1.242, 0.168
CHEST_Z = 1.115
WAIST_Z = 0.963
HIP_Z, HIP_X = 0.825, 0.092
ELBOW_Z = 0.995
WRIST_Z = 0.782
KNEE_Z = 0.449
ANKLE_Z = 0.073

# Girth, as (half-width, half-depth). A shirt is not a body: these are the
# outside of the cloth, cut with ease so it hangs rather than clings, which is
# the single strongest signal that a torso is dressed.
#
# It now has a waist. The previous cut was widest at the hem and straight all
# the way up — "untucked, no waist at all" — which is true of a real camp shirt
# and fatal here, because a silhouette with no narrowest point has no shape to
# recognise. Shoulders, waist and hem now go wide, narrow, wide.
TORSO = [
    (0.788, 0.196, 0.150),           # hem, flaring a little over the shorts
    (0.836, 0.190, 0.145),
    (WAIST_Z, 0.182, 0.138),         # the narrowest of the trunk
    (1.048, 0.196, 0.147),           # ribs
    (CHEST_Z, 0.208, 0.156),         # chest
    (1.186, 0.212, 0.150),           # yoke
    (1.230, 0.206, 0.140),           # deltoid, carrying the sleeve
    (SHOULDER_Z + 0.035, 0.166, 0.115),   # shoulder line, rolling over
    # Two more stations to roll it over *onto* the shoulders instead of stopping
    # dead. A lofted tube ends in a flat cap, and a flat cap this wide is a
    # shelf: from behind he had a square plate across the top of him where the
    # trapezius should be, which is the one silhouette the chase camera sees.
    (SHOULDER_Z + 0.062, 0.134, 0.098),
    (SHOULDER_Z + 0.080, 0.106, 0.080),
]
BROAD_TO = 1.210                     # where the shoulder broadening tops out

SLEEVE = {"shoulder": 0.086, "bicep": 0.080, "elbow": 0.066, "forearm": 0.060,
          "cuff": 0.054}
TROUSER = {"seat": 0.126, "thigh": 0.114, "knee": 0.094, "shin": 0.078,
           "hem": 0.072}
SHORT_HEM = 0.122                    # a shorts leg hangs off the thigh, not on it
# A size too large, deliberately. Big hands and big feet are half the recipe:
# they give the figure two pairs of terminals that read at any distance and
# they make the middle of him look compact by comparison.
HAND = {"length": 0.150, "width": 0.120, "thickness": 0.066}
SHOE = {"length": 0.250, "width": 0.132, "sole": 0.030, "upper": 0.078}

# --- where he sits, in the chair's own coordinates -------------------------
# From build_chair.py rather than eyeballed: seat pad top at 512, armrest pads
# at x=±255 and 647 high, castors out to a radius of 330.
SEAT_TOP = 0.5125
ARMREST = (0.255, 0.647)
SIT_Y = -0.020                       # a little forward of centre on the pad
SEAT_CONTACT = SEAT_TOP - 0.010      # the cushion takes his weight
SIT_Z = 0.560                        # a starting guess; solved for below

LIFT_Z = HIP_Z - SIT_Z
LIFT_Y = -SIT_Y


def at(x, y, z):
    """A point given in final chair coordinates, in the rest frame."""
    return Vector((x, y + LIFT_Y, z + LIFT_Z))


# --- the pose ---------------------------------------------------------------
# Upright, not folded. You sit up to scoot a chair: the pull comes from the
# hamstring, not from the back. A deep racer's crouch on office furniture looked
# like a man being crushed by it.
AIM = {
    "hips": (0, -0.10, 1),
    "spine": (0, -0.30, 1),          # 17° — a lean into it, no more
    "chest": (0, -0.14, 1),
    "neck": (0, -0.06, 1),
    # Chin up, not level. A big head hung forward on a leaning body is a slump
    # however upright the spine is, and a slump is the pose of somebody having
    # a bad time. Only just up, though: past about ten degrees he stops looking
    # down the corridor and starts looking at the ceiling tiles.
    "head": (0, 0.12, 1),
}
TWIST = {"spine": 2, "chest": 4, "neck": 3, "head": 4}
ORDER = ["hips", "spine", "chest", "neck", "head"]

# Feet, in chair coordinates. The right leg is extended and planted flat, about
# to pull; the left is folded back under the seat with the heel up, having just
# finished its pull. Both stay close to the chair — a scoot is a short, busy
# stroke, not a stride.
FEET = {
    "R": {"ankle": (-0.215, -0.265), "sole": 0.004,    # planted, flat, ahead
          "knee": (-0.26, -0.92, 0.28), "toe": (-0.05, -0.97, -0.22)},
    "L": {"ankle": (0.200, 0.045), "sole": 0.062,      # folded back, heel up
          "knee": (0.28, -0.90, 0.34), "toe": (0.06, 0.62, -0.78)},
}

# Hands on the armrests. Only where along the pad each sits is authored: the
# wrist target is solved, because the hand bone's head is the wrist joint and
# the hand itself reaches well past it.
HANDS = {
    "L": {"along": -0.062, "elbow": (0.30, 0.52, -0.80), "fingers": (0.04, -0.96, -0.26)},
    "R": {"along": 0.052, "elbow": (-0.38, 0.36, -0.85), "fingers": (-0.04, -0.94, -0.34)},
}

K.reset()

# ---------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------

SKIN = K.material("Skin", K.srgb(0xC08A6C), roughness=0.66)
# The shirt is three materials, not one. A Hawaiian shirt is a *pattern*, and a
# pattern needs either a texture or more than one colour on the mesh; splitting
# the polygons between three flat colours costs nothing at export, needs no UVs,
# and at chase-camera distance reads as a print.
#
# Red, because the chair is teal. The first version of this shirt was teal too,
# and from the chase camera his torso and the backrest merged into one shape —
# the costume was being eaten by the prop he sits on. The shirt is the thing that
# moved: the chair is the same asset as every other chair in the building.
ALOHA = K.material("Aloha", K.srgb(0xC0392B), roughness=0.80)
ALOHA_FLOWER = K.material("AlohaFlower", K.srgb(0xE8B33A), roughness=0.80)
ALOHA_LEAF = K.material("AlohaLeaf", K.srgb(0x2F6E4F), roughness=0.80)
# Dark, where they used to be khaki. Khaki is what a man on holiday wears and it
# was the wrong call anyway: it sat at the same value as his skin, so his shorts,
# his thighs and his forearms were one continuous pale mass with the shirt
# floating on top of it. Dark shorts give the figure a value sandwich — pale
# hat, bright shirt, dark middle, skin limbs, dark slides — and a value sandwich
# survives any distance, any lighting and the clay regrade.
SHORTS = K.material("Shorts", K.srgb(0x35486B), roughness=0.88)
SHORTS_TRIM = K.material("ShortsTrim", K.srgb(0x2B3B58), roughness=0.88)
RUBBER = K.material("Rubber", K.srgb(0x2A2E33), roughness=0.72)
STRAP = K.material("Strap", K.srgb(0xB8443C), roughness=0.62)
STRAW = K.material("Straw", K.srgb(0xD9BE84), roughness=0.90)
BAND = K.material("HatBand", K.srgb(0x2E4636), roughness=0.78)
PLASTIC = K.material("Plastic", K.srgb(0x26262A), roughness=0.44)
FOAM = K.material("Foam", K.srgb(0x141416), roughness=0.92)
LENS = K.material("Lens", K.srgb(0x101418), roughness=0.18)
HAIR = K.material("Hair", K.srgb(0x2E2119), roughness=0.80)
CABLE = K.material("Cable", K.srgb(0x1A1A1C), roughness=0.60)
# The eye is two materials: a dark mass and a catchlight on it. `EyeWhite` is
# not a sclera and must never be used as one — see the face section for why the
# whites had to go. It keeps the name so the garage's costume rail, which paints
# by material name, does not have to know that the design changed underneath it.
EYES = K.material("Eyes", K.srgb(0x241F1C), roughness=0.28)
EYE_WHITE = K.material("EyeWhite", K.srgb(0xFBF6EF), roughness=0.30)
MOUTH = K.material("Mouth", K.srgb(0x6B3A34), roughness=0.62)

# ---------------------------------------------------------------------------
# Surfaces
# ---------------------------------------------------------------------------


def loft(name, stations, segments=24, cap_start=True, cap_end=True, square=0.0):
    """
    A closed surface lofted through a stack of oval sections.

    `stations` is a list of (centre, half_width, half_depth). `square` bends the
    section from an ellipse toward a rounded rectangle, which is what separates
    a trouser leg from a sausage: real garments have a flat front and a flat
    back with corners between, and a pure ellipse reads as inflated rubber.

    The cross-section frame is carried along the path rather than rebuilt at each
    station, so the surface cannot twist where the path bends.
    """
    bm = bmesh.new()
    up = Vector((0, 1, 0))
    rings = []
    centres = [Vector(c) for c, _, _ in stations]
    for i, (centre, half_w, half_d) in enumerate(stations):
        centre = Vector(centre)
        ahead = centres[min(i + 1, len(centres) - 1)]
        behind = centres[max(i - 1, 0)]
        along = (ahead - behind).normalized()
        side = up.cross(along)
        side = side.normalized() if side.length > 1e-4 else Vector((1, 0, 0))
        face = along.cross(side).normalized()

        ring = []
        for s in range(segments):
            angle = s / segments * math.tau
            cos_a, sin_a = math.cos(angle), math.sin(angle)
            # Superellipse blend: |cos|^(2/n) keeps the corners fuller as n rises.
            if square > 0.0:
                power = 1.0 / (1.0 + square)
                cos_a = math.copysign(abs(cos_a) ** power, cos_a)
                sin_a = math.copysign(abs(sin_a) ** power, sin_a)
            ring.append(bm.verts.new(centre + side * cos_a * half_w + face * sin_a * half_d))
        rings.append(ring)

    for near, far in zip(rings, rings[1:]):
        for j in range(segments):
            k = (j + 1) % segments
            bm.faces.new((near[j], near[k], far[k], far[j]))
    if cap_start:
        bm.faces.new(rings[0][::-1])
    if cap_end:
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return K.mesh_from_bmesh(bm, name)


def ease(value, low, high):
    """0 below `low`, 1 above `high`, smooth between."""
    if high <= low:
        return 0.0 if value < low else 1.0
    t = min(max((value - low) / (high - low), 0.0), 1.0)
    return t * t * (3 - 2 * t)


def taper_chain(start, end, radii, steps):
    """Stations evenly along a line, radii interpolated between two ends."""
    start, end = Vector(start), Vector(end)
    out = []
    for i in range(steps + 1):
        t = i / steps
        a, b = radii
        out.append((start.lerp(end, t), a + (b - a) * t, a + (b - a) * t))
    return out


def profile_chain(start, end, profile):
    """
    Stations along a line whose radius is authored at named points along it.

    `profile` is a list of `(t, radius)` from 0 at `start` to 1 at `end`, and
    one station is emitted per entry.

    This exists because `taper_chain` can only shrink or grow, and a limb that
    only shrinks is a stick. Every limb on a figure anybody likes swells and
    pinches — bicep out, elbow in, forearm out, wrist in — and that rhythm is
    most of what separates an arm from a length of dowel. It is also what makes
    a limb read as *thin* rather than *ill*: a straight taper has no elbow in
    it, so the eye has nothing to measure the thinness against.
    """
    start, end = Vector(start), Vector(end)
    return [(start.lerp(end, t), r, r) for t, r in profile]


def ball(name, size, location, segments=(20, 12)):
    """A sphere squashed to a box and moved into place."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segments[0], v_segments=segments[1],
                              radius=0.5)
    obj = K.mesh_from_bmesh(bm, name)
    for v in obj.data.vertices:
        v.co.x *= size[0]
        v.co.y *= size[1]
        v.co.z *= size[2]
    K.shade_smooth(obj, angle=60)
    obj.data.transform(Matrix.Translation(Vector(location)))
    return obj


def block(name, size, location, cuts=0, tapers=(), bevel=None, angle=65, smooth=55,
          tilt=None):
    """
    A box, shaped, then moved into place — in that order, and the order matters.

    `K.taper` scales the far end of a box about the *world origin*, not about the
    box. On a box already sitting at hip height that does not narrow a toe, it
    drags the whole end downward: a hand built 42 mm thick came out 264 mm tall
    and a shoe came out a flipper. Everything here is therefore shaped at the
    origin, where scaling about the origin is scaling about the centre, and
    translated afterwards. `tilt`, degrees about x/y/z, is applied there too —
    a brow angle and a pair of shades pushed up onto a forehead are both a few
    degrees of rotation and nothing else.
    """
    obj = K.box(name, size, (0, 0, 0), cuts=cuts)
    for axis, at, scale in tapers:
        K.taper(obj, axis=axis, at=at, scale=scale)
    if bevel:
        K.bevel(obj, width=bevel[0], segments=bevel[1], angle=angle)
    K.shade_smooth(obj, angle=smooth)
    K.apply_modifiers([obj])
    if tilt:
        spin = Matrix.Identity(4)
        for axis, degrees in zip('XYZ', tilt):
            if degrees:
                spin = Matrix.Rotation(math.radians(degrees), 4, axis) @ spin
        obj.data.transform(spin)
    obj.data.transform(Matrix.Translation(Vector(location)))
    return obj


def paint(obj, weights):
    """
    Give an object its vertex groups, from the shape's own construction.

    Weighting by hand here rather than asking Blender to infer it from proximity
    is what makes the deformation predictable — an inferred palm came out 40%
    owned by the forearm and collapsed through an armrest.
    """
    groups = {}
    for vertex in obj.data.vertices:
        for bone_name, weight in weights(vertex.co).items():
            if weight <= 0.0005:
                continue
            if bone_name not in groups:
                groups[bone_name] = obj.vertex_groups.new(name=bone_name)
            groups[bone_name].add([vertex.index], weight, 'REPLACE')
    return obj


parts = []

# --- shirt ------------------------------------------------------------------
# Squared off a little in section, and widened across the shoulders after the
# loft: a tube gives sloping bottle shoulders, and the shoulder line is most of
# what says "person" in a silhouette seen from behind.

# Denser than the shape needs, because the print is painted per *polygon* and a
# polygon is the smallest thing a print can have in it. On the old coarse loft
# the motifs came out as big grid-aligned rectangles — Tetris, not Honolulu —
# and no amount of tuning the pattern function fixes a resolution problem.
torso_stations = [((0, 0, z), w, d) for z, w, d in TORSO]
dense = []
for i in range(len(torso_stations) - 1):
    (c0, w0, d0), (c1, w1, d1) = torso_stations[i], torso_stations[i + 1]
    for k in range(6):
        t = k / 6
        dense.append((Vector(c0).lerp(Vector(c1), t), w0 + (w1 - w0) * t, d0 + (d1 - d0) * t))
dense.append(torso_stations[-1])

shirt = loft("Shirt", dense, segments=40, square=0.22)
for v in shirt.data.vertices:
    broad = ease(v.co.z, CHEST_Z, BROAD_TO) * (1.0 - 0.55 * ease(v.co.z, BROAD_TO, SHOULDER_Z + 0.035))
    # 10%, where it used to be 22%. The head is two thirds wider than it was and
    # the target is shoulders about half again the width of it — past that he
    # stops being sturdy and becomes a wardrobe with a face on top.
    v.co.x *= 1.0 + 0.10 * broad
    v.co.y *= 1.0 - 0.04 * broad
    # A shirt hangs off the shoulders and falls away from the small of the back,
    # so it is fullest at the hem rather than following him in.
    v.co.y -= 0.014 * ease(v.co.z, 1.02, 0.90) * (1 if v.co.y > 0 else -1) * 0
K.shade_smooth(shirt, angle=60)
# The print. A deterministic wobble in space, thresholded twice: big soft blobs
# for the flowers and a finer band for the leaves between them. Deterministic
# rather than random so the shirt is the same shirt on every build.
shirt.data.materials.clear()
for m in (ALOHA, ALOHA_FLOWER, ALOHA_LEAF):
    shirt.data.materials.append(m)
def bloom_at(c):
    """
    An irregular blotch field.

    Deliberately not a product of two axis-aligned sines: that is a regular
    lattice, and on a quad mesh it painted a tidy grid of rectangles that read as
    gaffer tape stuck to him rather than as a print. These waves run at angles to
    each other and to the mesh, so the shapes come out uneven and unaligned, and
    the pattern has no visible repeat at the distance it is seen from.
    """
    a = math.sin(c.x * 49.1 + c.z * 37.7 + 0.7)
    b = math.sin(c.x * -28.3 + c.z * 62.5 + 2.1)
    d = math.sin((c.x * 0.71 + c.y * 1.29 + c.z * 0.93) * 79.0)
    return a * b + 0.55 * d + 0.35 * a * d


# Thresholds well off zero, so most of the shirt stays the ground colour and the
# motifs are scattered across it. Even coverage between three colours is not a
# print, it is camouflage.
for poly in shirt.data.polygons:
    bloom = bloom_at(poly.center)
    poly.material_index = 1 if bloom > 0.74 else (2 if bloom < -0.86 else 0)
paint(shirt, lambda co: {
    "hips": 1.0 - ease(co.z, HIP_Z, WAIST_Z),
    "spine": ease(co.z, HIP_Z, WAIST_Z) * (1.0 - ease(co.z, WAIST_Z, CHEST_Z)),
    "chest": ease(co.z, WAIST_Z, CHEST_Z),
})
parts.append(shirt)

# --- trousers ---------------------------------------------------------------
# Seat and both legs as one surface: modelled as separate tubes they leave a gap
# at the crotch that no amount of overlap closes.

# Seat and both thigh tops as one surface: modelled as separate tubes they leave
# a gap at the crotch that no amount of overlap closes.
seat = loft("Seat", [((0, 0, HIP_Z - 0.087), 0.178, 0.136),
                     ((0, 0.004, HIP_Z - 0.030), 0.184, 0.142),
                     ((0, 0.002, HIP_Z + 0.037), 0.176, 0.134)],
            segments=24, square=0.30)
K.shade_smooth(seat, angle=60)
K.assign(seat, SHORTS)
paint(seat, lambda co: {"hips": 1.0})
parts.append(seat)

waistband = loft("Waistband", [((0, 0.002, HIP_Z + 0.013), 0.182, 0.140),
                               ((0, 0.002, HIP_Z + 0.041), 0.184, 0.142)],
                 segments=24, square=0.30, cap_start=False, cap_end=False)
K.shade_smooth(waistband, angle=60)
K.assign(waistband, SHORTS_TRIM)
paint(waistband, lambda co: {"hips": 1.0})
parts.append(waistband)

for side, s in (("L", 1), ("R", -1)):
    hip = Vector((s * HIP_X, 0, HIP_Z - 0.025))
    knee = Vector((s * (HIP_X + 0.006), 0, KNEE_Z))
    ankle = Vector((s * (HIP_X + 0.010), -0.010, ANKLE_Z - 0.018))

    # Shorts: down to just above the knee, and cut wide — a leg opening hangs
    # away from the thigh, which is the whole difference between shorts and
    # cycling shorts.
    short_hem = hip.lerp(knee, 0.74)
    short = loft(f"Short.{side}",
                 taper_chain(hip, short_hem, (TROUSER["seat"], SHORT_HEM), 4),
                 segments=18, square=0.26, cap_end=False)
    K.shade_smooth(short, angle=60)
    K.assign(short, SHORTS)
    paint(short, lambda co: {f"thigh.{side}": 1.0})
    parts.append(short)

    # A turn-up at the hem. Without it the leg opening is a rigid ring cutting
    # across the thigh, and the whole garment reads as underwear rather than
    # shorts — a hem is most of what tells you which one you are looking at.
    turn = loft(f"Turnup.{side}",
                taper_chain(short_hem.lerp(hip, 0.10), short_hem,
                            (SHORT_HEM + 0.006, SHORT_HEM + 0.008), 2),
                segments=18, square=0.26, cap_start=False, cap_end=False)
    K.shade_smooth(turn, angle=60)
    K.assign(turn, SHORTS_TRIM)
    paint(turn, lambda co: {f"thigh.{side}": 1.0})
    parts.append(turn)

    # The leg itself, bare from inside the shorts to the ankle — and the single
    # worst offender in the old figure, because it was two straight tapers end
    # to end and a straight taper is a stick. It now has a knee to pinch at and
    # a calf to swell after it, which is what the eye is actually looking for
    # when it decides whether a leg belongs to somebody well.
    leg = loft(f"Leg.{side}",
               profile_chain(hip.lerp(knee, 0.42), knee,
                             [(0.00, 0.100), (0.45, 0.092), (0.80, 0.084)])
               + profile_chain(knee, ankle,
                               [(0.00, 0.078),   # the knee itself, pinched
                                (0.30, 0.088),   # calf
                                (0.60, 0.072),
                                (0.86, 0.052),   # ankle, pinched again
                                (1.00, 0.050)]),
               segments=16, square=0.06)
    K.shade_smooth(leg, angle=60)
    K.assign(leg, SKIN)
    paint(leg, lambda co, k=KNEE_Z: {
        f"thigh.{side}": 1.0 - ease(-co.z, -k - 0.06, -k + 0.06),
        f"shin.{side}": ease(-co.z, -k - 0.06, -k + 0.06),
    })
    parts.append(leg)

# --- sleeves and hands ------------------------------------------------------

for side, s in (("L", 1), ("R", -1)):
    shoulder = Vector((s * SHOULDER_X, 0, SHOULDER_Z))
    elbow = Vector((s * (SHOULDER_X + 0.020), 0, ELBOW_Z))
    wrist = Vector((s * (SHOULDER_X + 0.034), 0, WRIST_Z))

    # Short sleeve: it stops a third of the way down the upper arm and stands
    # off it, because a camp shirt sleeve is a tube the arm hangs inside rather
    # than a casing around it.
    # It starts a little *below* the shoulder joint. Started at the joint, its
    # cap cleared the top of the shirt and read from behind as a shoulder pad —
    # the shirt now rolls over the shoulder, and the sleeve has to hang off that
    # roll rather than sit on top of it.
    cuff_at = shoulder.lerp(elbow, 0.64)
    sleeve = loft(f"Sleeve.{side}",
                  taper_chain(shoulder.lerp(elbow, 0.13), cuff_at,
                              (SLEEVE["shoulder"], SLEEVE["shoulder"] * 0.94), 3),
                  segments=16, square=0.15, cap_start=False, cap_end=False)
    K.shade_smooth(sleeve, angle=60)
    sleeve.data.materials.clear()
    for m in (ALOHA, ALOHA_FLOWER, ALOHA_LEAF):
        sleeve.data.materials.append(m)
    for poly in sleeve.data.polygons:
        bloom = bloom_at(poly.center)
        poly.material_index = 1 if bloom > 0.74 else (2 if bloom < -0.86 else 0)
    paint(sleeve, lambda co: {f"upperarm.{side}": 1.0})
    parts.append(sleeve)

    # The arm itself, bare from inside the sleeve to the wrist. Same rhythm as
    # the leg: bicep out, elbow in, forearm out, wrist in — and then the hand,
    # which is deliberately far too big for the wrist it hangs off.
    arm = loft(f"Arm.{side}",
               profile_chain(shoulder.lerp(elbow, 0.30), elbow,
                             [(0.00, 0.064), (0.50, 0.060), (0.85, 0.054)])
               + profile_chain(elbow, wrist,
                               [(0.00, 0.052),   # elbow, pinched
                                (0.32, 0.060),   # forearm
                                (0.70, 0.050),
                                (1.00, 0.044)]), # wrist, pinched again
               segments=14, square=0.05)
    K.shade_smooth(arm, angle=60)
    K.assign(arm, SKIN)
    paint(arm, lambda co, e=ELBOW_Z: {
        f"upperarm.{side}": 1.0 - ease(-co.z, -e - 0.05, -e + 0.05),
        f"lowerarm.{side}": ease(-co.z, -e - 0.05, -e + 0.05),
    })
    parts.append(arm)

    # Hand: a palm with a thumb, no fingers. This rig has no finger joints, so
    # modelled fingers can only ever be frozen apart — which read as a dropped
    # glove on every armrest they touched.
    hand = block(f"Hand.{side}", (HAND["width"], HAND["length"], HAND["thickness"]),
                 (s * (SHOULDER_X + 0.040), -HAND["length"] / 2 + 0.018, WRIST_Z - 0.032),
                 cuts=3, angle=70, bevel=(0.026, 4),
                 tapers=(('Y', -1, (0.82, 0.76)),      # knuckles round over
                         ('Y', 1, (0.80, 0.88))))      # into the much thinner wrist
    K.assign(hand, SKIN)
    paint(hand, lambda co: {f"hand.{side}": 1.0})
    parts.append(hand)

    thumb = block(f"Thumb.{side}", (0.042, 0.078, 0.050),
                  (s * (SHOULDER_X + 0.040) - s * 0.054, -0.028, WRIST_Z - 0.036),
                  angle=70, bevel=(0.019, 3), tapers=(('Y', -1, (0.72, 0.72)),))
    K.assign(thumb, SKIN)
    paint(thumb, lambda co: {f"hand.{side}": 1.0})
    parts.append(thumb)

# --- neck, head -------------------------------------------------------------

# Slim, and mostly buried. A wide neck under a wide head gave the figure a pale
# column between the two that read as a plinth — and a head on a plinth is a
# bust, which is a statue, which is a thing with no life in it.
neck = loft("Neck", taper_chain(Vector((0, 0.002, NECK_Z - 0.070)),
                                Vector((0, 0.014, NECK_Z + 0.060)),
                                (0.072, 0.062), 4),
            segments=16)
K.shade_smooth(neck, angle=60)
K.assign(neck, SKIN)
paint(neck, lambda co: {"neck": 1.0})
parts.append(neck)

# Collar: a band round the neck with its points sitting on the yoke.
collar = loft("Collar", [((0, 0.004, NECK_Z - 0.060), 0.104, 0.096),
                         ((0, 0.006, NECK_Z - 0.020), 0.098, 0.090),
                         ((0, 0.010, NECK_Z + 0.006), 0.091, 0.083)],
              segments=18, cap_start=False, cap_end=False)
K.shade_smooth(collar, angle=60)
K.assign(collar, ALOHA)
paint(collar, lambda co: {"neck": 0.35, "chest": 0.65})
parts.append(collar)

# Head. A sphere squashed to a skull, stretched up about its own centre so the
# cranium is bigger than the jaw, then given a jaw: narrower below the ear line,
# flat at the back of the cheeks, with a chin.
#
# The stretch is the appeal, and it is worth being precise about why. An adult
# skull is roughly half cranium and half face; an infant's is about two thirds
# cranium, and every character anybody has ever put on a lunchbox borrows that
# ratio. `SKULL_UP`/`SKULL_DOWN` buy it for two lines: the head keeps its full
# height and its chin stays exactly on `CHIN_Z`, but 57% of it is now above the
# eyes instead of 50%.
head_z = CHIN_Z + HEAD_H * 0.5 * SKULL_DOWN
bm = bmesh.new()
# Denser than a smooth-shaded sphere needs, because the hair is cut out of a
# copy of it face by face and a coarse skull leaves that cut visibly ragged — a
# dotted line straight across the forehead, which is the one place on the whole
# asset a stray edge cannot be.
bmesh.ops.create_uvsphere(bm, u_segments=36, v_segments=24, radius=0.5)
head_mesh = K.mesh_from_bmesh(bm, "Head")
for v in head_mesh.data.vertices:
    v.co.x *= HEAD_W
    v.co.y *= HEAD_D
    v.co.z *= HEAD_H * (SKULL_UP if v.co.z > 0 else SKULL_DOWN)
    # Barely any jaw, and no chin at all. An earlier pass narrowed it by a third
    # and pushed a chin forward, on the reasoning that "a rounded box reads as a
    # thumb and a bare sphere as a ball on a stick; the jaw is what makes it a
    # head". That is true, and it is exactly the problem: a recognisably human
    # head, stylised almost but not quite enough, is the definition of the
    # uncanny valley, and the result read as a mask. A soft round skull is not
    # trying to be a person and so is never a wrong one.
    below = ease(-v.co.z, -HEAD_H * 0.05, HEAD_H * 0.30)
    v.co.x *= 1.0 - 0.05 * below
    v.co.y *= 1.0 - 0.03 * below
    if v.co.y < 0:
        v.co.y *= 0.96                                # the face is a little flatter
    v.co.z += head_z
K.shade_smooth(head_mesh, angle=60)
K.assign(head_mesh, SKIN)
paint(head_mesh, lambda co: {"head": 1.0})
parts.append(head_mesh)


def face_y(x, z):
    """
    Roughly where the front of the face is, at a point on it.

    The same arithmetic the head loop above does, run forwards instead of over
    a vertex list, so that things stuck to the face — eyes, nose, mouth — land
    on it rather than hovering in front or sinking into it. Approximate on
    purpose: everything placed with it is also pushed a few millimetres proud,
    so a millimetre of error is invisible and a sign error is not.
    """
    dz = z - head_z
    half_h = HEAD_H * 0.5 * (SKULL_UP if dz > 0 else SKULL_DOWN)
    inside = 1.0 - (x / (HEAD_W * 0.5)) ** 2 - (dz / half_h) ** 2
    depth = HEAD_D * 0.5 * math.sqrt(max(inside, 0.04))
    below = ease(-dz, -HEAD_H * 0.05, HEAD_H * 0.30)
    return -depth * (1.0 - 0.03 * below) * 0.96


# --- the face ---------------------------------------------------------------
# Made by removing things, which is the whole lesson of this section and was
# learned the expensive way. The version before this one had a white sclera, a
# dark pupil, a brow, a nose, a mouth and a pair of ears, all carefully placed,
# and it was frightening. Every feature added made it worse, because each one
# was another human landmark rendered *almost* right, and a face that is almost
# right is a face something is wrong with.
#
# What the loved ones actually do — Animal Crossing, Fall Guys, Crossy Road,
# every one of them — is carry two big solid dark eyes and essentially nothing
# else. Specifically:
#
#   - **No whites.** A sclera means the dark part is a pupil, a pupil ringed by
#     white is a widened eye, and a widened eye is fear. It is also the feature
#     that survives worst at distance: the whites stay bright when the dark part
#     has blurred away, so a face reduces to two staring eggs.
#   - **A catchlight.** One small pale dot, high and outboard. Without it a dark
#     eye is a hole in a head; with it the eye is wet, and wet is alive. It is
#     four millimetres of geometry and it is the difference.
#   - **No nose.** A nose is the feature that protrudes, so it is the feature
#     that casts a shadow, and a shadow down the middle of a face at chase
#     distance is a snout.
#   - **No mouth.** A dark line low on a face reads as a wound at rest and as a
#     rictus when it curves. Characters with no mouth are read as calm; the
#     viewer supplies the expression, and what they supply is always kinder than
#     what the geometry can say.
#
# `KIT_FACE` overrides any of it as JSON, because this is the part of the asset
# that gets iterated on twenty times an afternoon and rebuilding to compare two
# eye sizes should not mean editing the file:
#
#     KIT_FACE='{"mouth": 0.055}' blender --background ... kit/build_character.py
# `eye_z` is measured from the centre of the *skull*, which is not the centre of
# the face anybody sees. The hat brim crosses the forehead and the chin is a long
# way down, so the visible band of skin runs from roughly `head_z + 0.03` to the
# chin, and its middle is about 65 mm below `head_z`. Placed at the skull's
# centre the eyes sat up at the temples beside the headphone cans, read as ears,
# and left a blank expanse of face under them — which is most of what made the
# thing frightening. They belong just below the middle of the *visible* face.
#
# `eye_x` follows the old sign-painter's proportion: about one eye of gap
# between the two, and about one eye of skull outboard of each. Pushed further
# apart than that they stop converging on anything and the face goes vacant.
FACE = {
    "eye_x": 0.064,
    "eye_z": -0.070,
    "eye_w": 0.082,
    "eye_h": 0.098,       # a touch taller than wide: an oval, not a bead
    "eye_out": 0.032,
    # How far the eye's *centre* sits in front of the skin. It has to be more
    # than the skull's sagitta across the width of the eye, or the ball's widest
    # cross-section is partly buried and what shows is the crescent where the
    # two surfaces intersect — which came out as a teardrop tapering to a point,
    # and read as a leech stuck to his face. Clear of the surface, the whole
    # ellipse shows and an eye is an eye.
    "eye_proud": 0.009,
    "catch": 0.024,       # the one thing that must not be removed
    "brow": 0.0,
    "nose": 0.0,
    "mouth": 0.0,
}
FACE.update(json.loads(os.environ.get("KIT_FACE", "{}")))

EYE_Z = head_z + FACE["eye_z"]

for s in (1, -1):
    eye_y = face_y(FACE["eye_x"], EYE_Z) - FACE["eye_proud"]
    eye = ball(f"Eye.{s}", (FACE["eye_w"], FACE["eye_out"], FACE["eye_h"]),
               (s * FACE["eye_x"], eye_y, EYE_Z))
    K.assign(eye, EYES)
    paint(eye, lambda co: {"head": 1.0})
    parts.append(eye)

    if FACE["catch"]:
        # Both catchlights sit on the same side of the face, not mirrored
        # outboard on each eye. There is one sun in the building, so there is
        # one direction for a highlight to come from; mirrored dots read as two
        # eyes lit by two different lights, which is the sort of wrongness
        # nobody can name and everybody feels.
        catch = ball(f"EyeWhite.{s}",
                     (FACE["catch"], FACE["catch"] * 0.7, FACE["catch"]),
                     (s * FACE["eye_x"] + FACE["eye_w"] * 0.21,
                      eye_y - FACE["eye_out"] * 0.58,
                      EYE_Z + FACE["eye_h"] * 0.24),
                     segments=(12, 8))
        K.assign(catch, EYE_WHITE)
        paint(catch, lambda co: {"head": 1.0})
        parts.append(catch)

    if FACE["brow"]:
        brow_z = EYE_Z + FACE["eye_h"] * 0.78
        brow = block(f"Brow.{s}", (FACE["brow"], 0.024, FACE["brow"] * 0.28),
                     (s * FACE["eye_x"], face_y(FACE["eye_x"], brow_z) + 0.008, brow_z),
                     bevel=(0.008, 3), angle=70, tilt=(0, -9 * s, 0))
        K.assign(brow, HAIR)
        paint(brow, lambda co: {"head": 1.0})
        parts.append(brow)

if FACE["mouth"]:
    mouth_z = EYE_Z - 0.084
    mouth_path = []
    for i in range(9):
        u = i / 8 * 2 - 1
        mx = FACE["mouth"] * u
        mz = mouth_z + FACE["mouth"] * 0.42 * u * u
        mouth_path.append(((mx, face_y(mx, mz) - 0.002, mz), 0.011, 0.011))
    mouth = loft("Mouth", mouth_path, segments=10)
    K.shade_smooth(mouth, angle=60)
    K.assign(mouth, MOUTH)
    paint(mouth, lambda co: {"head": 1.0})
    parts.append(mouth)

if FACE["nose"]:
    nose_z = EYE_Z - 0.040
    nose = block("Nose", (FACE["nose"], FACE["nose"] * 0.72, FACE["nose"] * 0.84),
                 (0, face_y(0, nose_z) - 0.002, nose_z),
                 angle=70, bevel=(FACE["nose"] * 0.36, 4), cuts=1)
    K.assign(nose, SKIN)
    paint(nose, lambda co: {"head": 1.0})
    parts.append(nose)

# No ears. They sit exactly where the headphone cans sit, so they were never
# visible, and every polygon on a face has to earn its place.

# Hair: the skull in a slightly larger skin, cut to a hairline that falls at the
# temples. Faded by distance from the hairline rather than cut at a hard
# threshold — a hard cut on a coarse skull leaves a staircase at the temple.
hair_mesh = head_mesh.data.copy()
hair = bpy.data.objects.new("Hair", hair_mesh)
K.link(hair)
bm = bmesh.new()
bm.from_mesh(hair_mesh)
bm.faces.ensure_lookup_table()
bm.normal_update()


def hairline(point):
    """Height of the hairline at a point: lower at the back, high at the brow."""
    forward = (point.y + HEAD_D / 2) / HEAD_D          # 0 at the face, 1 at the back
    # Just under the hat brim at the brow. It was briefly much higher than this,
    # to hide a ragged cut edge that was crossing the forehead — but four of the
    # five riders take the hat off, and what a high hairline gives them is male
    # pattern baldness. The ragged edge was a resolution problem and is fixed
    # where resolution problems are fixed, on the sphere.
    return head_z + HEAD_H * 0.22 - HEAD_H * 0.56 * forward


doomed = [f for f in bm.faces if f.calc_center_median().z < hairline(f.calc_center_median())]
bmesh.ops.delete(bm, geom=doomed, context='FACES')
bm.normal_update()
for v in bm.verts:
    thickness = 0.019 * (0.45 + 0.55 * ease(v.co.z, hairline(v.co) - 0.016, hairline(v.co) + 0.098))
    v.co += v.normal * thickness
bm.to_mesh(hair_mesh)
bm.free()
K.shade_smooth(hair, angle=60)
K.assign(hair, HAIR)
paint(hair, lambda co: {"head": 1.0})
parts.append(hair)

# --- hat, headphones, shades ------------------------------------------------
# These three are the costume's whole job at the chase camera. From directly
# behind, a collar and a tie are four pixels of nothing; a brim throws a
# horizontal line wider than his shoulders, and the cans put two dark blocks
# either side of his head where there is otherwise only hair. Everything here is
# weighted rigidly to the head, so it turns when he looks into a corner.

# Sized off the head rather than off the old head's numbers. Keeping the former
# ratios — a brim two and a half times the width of the skull — on a skull two
# thirds bigger gives a sombrero, and the joke is a man dressed for a beach, not
# a man dressed as a punchline. The brim now lands at about shoulder width,
# which is the rule of thumb worth keeping: a hat reads as a hat when it breaks
# the silhouette and stops reading as one when it swallows it.
hat_z = head_z + HEAD_H * 0.24
CROWN_W, CROWN_D = HEAD_W / 2 + 0.010, HEAD_D / 2 + 0.012
BRIM_W, BRIM_D = HEAD_W / 2 + 0.068, HEAD_D / 2 + 0.070

# Straw hat: a shallow crown and a brim that sags, because a straw brim always
# does — a flat disc reads as a plate on his head. The crown is short and every
# station is a fraction of the head, so that shortening the skull cannot leave
# the hat hovering above it, which is exactly what it did the first time.
crown = loft("HatCrown", [((0, 0.004, hat_z - HEAD_H * 0.055), CROWN_W, CROWN_D),
                          ((0, 0.004, hat_z + HEAD_H * 0.142), CROWN_W * 0.98, CROWN_D * 0.97),
                          ((0, 0.004, hat_z + HEAD_H * 0.278), CROWN_W * 0.84, CROWN_D * 0.83),
                          ((0, 0.004, hat_z + HEAD_H * 0.352), CROWN_W * 0.59, CROWN_D * 0.60)],
             segments=22, square=0.05, cap_start=False)
K.shade_smooth(crown, angle=60)
K.assign(crown, STRAW)
paint(crown, lambda co: {"head": 1.0})
parts.append(crown)

brim = loft("HatBrim", [((0, 0.004, hat_z - HEAD_H * 0.016), CROWN_W * 1.02, CROWN_D * 1.02),
                        ((0, 0.004, hat_z - HEAD_H * 0.074), (CROWN_W + BRIM_W) * 0.5,
                         (CROWN_D + BRIM_D) * 0.5),
                        ((0, 0.004, hat_z - HEAD_H * 0.170), BRIM_W, BRIM_D),
                        ((0, 0.004, hat_z - HEAD_H * 0.222), BRIM_W * 0.97, BRIM_D * 0.97)],
            segments=22, square=0.02, cap_start=False, cap_end=False)
K.shade_smooth(brim, angle=70)
K.assign(brim, STRAW)
paint(brim, lambda co: {"head": 1.0})
parts.append(brim)

band = loft("HatBand", [((0, 0.004, hat_z + HEAD_H * 0.016), CROWN_W * 1.02, CROWN_D * 1.02),
                        ((0, 0.004, hat_z + HEAD_H * 0.110), CROWN_W * 1.01, CROWN_D * 1.01)],
            segments=22, square=0.05, cap_start=False, cap_end=False)
K.shade_smooth(band, angle=60)
K.assign(band, BAND)
paint(band, lambda co: {"head": 1.0})
parts.append(band)

# Headphones: two cans on a band over the crown, under the hat brim line.
for s in (1, -1):
    can = block(f"Can.{s}", (0.040, 0.108, 0.114),
                (s * (HEAD_W / 2 + 0.018), 0.014, head_z + 0.006),
                cuts=2, bevel=(0.022, 4), angle=70)
    K.assign(can, PLASTIC)
    paint(can, lambda co: {"head": 1.0})
    parts.append(can)

    pad = block(f"Pad.{s}", (0.018, 0.092, 0.098),
                (s * (HEAD_W / 2 + 0.001), 0.014, head_z + 0.006),
                cuts=2, bevel=(0.018, 3), angle=70)
    K.assign(pad, FOAM)
    paint(pad, lambda co: {"head": 1.0})
    parts.append(pad)

# The band, as an arc of small blocks over the top of the skull.
for i in range(9):
    t = i / 8
    angle = math.pi * t
    arc = Vector((math.cos(angle) * (HEAD_W / 2 + 0.012), 0.014,
                  head_z + 0.038 + math.sin(angle) * (HEAD_H * 0.46)))
    link = block(f"Band.{i}", (0.030, 0.034, 0.032), arc, bevel=(0.010, 2))
    K.assign(link, PLASTIC)
    paint(link, lambda co: {"head": 1.0})
    parts.append(link)

# Shades: two lenses, a bridge and two temple arms — worn pushed up into his
# hair, not over his eyes.
#
# On his face they were the correct costume and the wrong design. A pair of
# opaque lenses is a hole where the two features that carry every ounce of a
# character's likeability used to be, and nobody has ever loved a face they
# could not find the eyes in. Pushed up they do the same costume job — they are
# still shades, he is still dressed for a beach — and they buy a second thing
# on top of it, which is that a man with his sunglasses up is a man mid-task.
SHADE_Z = head_z + 0.135
for s in (1, -1):
    lens = block(f"Lens.{s}", (0.078, 0.022, 0.044),
                 (s * 0.072, -0.118, SHADE_Z),
                 bevel=(0.009, 3), tilt=(-22, 0, 0))
    K.assign(lens, LENS)
    paint(lens, lambda co: {"head": 1.0})
    parts.append(lens)

    temple = block(f"Temple.{s}", (0.014, 0.115, 0.016),
                   (s * 0.142, -0.014, SHADE_Z - 0.008),
                   bevel=(0.005, 2), tilt=(-14, 0, 0))
    K.assign(temple, LENS)
    paint(temple, lambda co: {"head": 1.0})
    parts.append(temple)

bridge = block("Bridge", (0.040, 0.018, 0.014), (0, -0.142, SHADE_Z + 0.006),
               bevel=(0.005, 2), tilt=(-22, 0, 0))
K.assign(bridge, LENS)
paint(bridge, lambda co: {"head": 1.0})
parts.append(bridge)

# --- feet and slippers ------------------------------------------------------
# A slide, not a dress shoe: a thick rubber sole and one wide strap over the
# instep, with a bare foot in it. It is a better silhouette than a shoe from
# behind — the sole is a hard dark bar and the toes catch the light in front of
# it — and it is the single most legible thing about the whole costume when a
# foot swings up on the recovery.

for side, s in (("L", 1), ("R", -1)):
    cx = s * (HIP_X + 0.010)
    cy = -SHOE["length"] / 2 + 0.074          # the foot reaches ahead of the ankle
    base = 0.0

    sole = block(f"Sole.{side}", (SHOE["width"] + 0.010, SHOE["length"], 0.032),
                 (cx, cy, base + 0.016), cuts=4, bevel=(0.009, 3),
                 tapers=(('Y', -1, (0.76, 1.0)), ('Y', 1, (0.84, 1.0))))
    for v in sole.data.vertices:
        if v.co.y < cy - SHOE["length"] * 0.34:
            v.co.z += 0.006                    # the toe end lifts off the floor
    K.assign(sole, RUBBER)
    paint(sole, lambda co: {f"foot.{side}": 1.0})
    parts.append(sole)

    # The foot: a wedge from heel to toes, sitting on the sole.
    foot = block(f"Foot.{side}", (SHOE["width"] - 0.014, SHOE["length"] - 0.048, 0.072),
                 (cx, cy + 0.010, base + 0.032 + 0.032), cuts=4, bevel=(0.019, 4),
                 tapers=(('Y', -1, (0.86, 0.36)),     # toes, flattening forward
                         ('Y', 1, (0.80, 0.86)),      # heel
                         ('Z', 1, (0.90, 0.76))))     # instep rises to the ankle
    K.assign(foot, SKIN)
    paint(foot, lambda co: {f"foot.{side}": 1.0})
    parts.append(foot)

    strap = block(f"Strap.{side}", (SHOE["width"] + 0.014, 0.062, 0.068),
                  (cx, cy - 0.026, base + 0.032 + 0.034), cuts=2, bevel=(0.011, 3),
                  tapers=(('Z', 1, (1.0, 0.62)),))
    K.assign(strap, STRAP)
    paint(strap, lambda co: {f"foot.{side}": 1.0})
    parts.append(strap)

# ---------------------------------------------------------------------------
# One mesh
# ---------------------------------------------------------------------------
# Joined before rigging: vertex groups survive a join by name, so every part
# keeps the weights it was built with.

for _p in parts:
    _zs = [v.co.z for v in _p.data.vertices]
    print("KIT_PIECE %-12s n=%4d z=[%.3f,%.3f] groups=%s"
          % (_p.name, len(_p.data.vertices), min(_zs), max(_zs),
             sorted(g.name for g in _p.vertex_groups)))

body = K.join(parts, "Driver")

# ---------------------------------------------------------------------------
# Armature
# ---------------------------------------------------------------------------

arm_data = bpy.data.armatures.new("DriverRig")
rig = bpy.data.objects.new("DriverRig", arm_data)
K.link(rig)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT')


def bone(name, head, tail, parent=None):
    b = arm_data.edit_bones.new(name)
    b.head = Vector(head)
    b.tail = Vector(tail)
    if parent:
        b.parent = arm_data.edit_bones[parent]
        b.use_connect = False
    return b


bone("hips", (0, 0, HIP_Z), (0, 0, WAIST_Z))
bone("spine", (0, 0, WAIST_Z), (0, 0, CHEST_Z), "hips")
bone("chest", (0, 0, CHEST_Z), (0, 0, SHOULDER_Z), "spine")
bone("neck", (0, 0, NECK_Z - 0.050), (0, 0, NECK_Z + 0.050), "chest")
bone("head", (0, 0, NECK_Z + 0.050), (0, 0, HEIGHT), "neck")

for side, s in (("L", 1), ("R", -1)):
    bone(f"clavicle.{side}", (s * 0.024, 0, SHOULDER_Z - 0.022), (s * SHOULDER_X, 0, SHOULDER_Z), "chest")
    bone(f"upperarm.{side}", (s * SHOULDER_X, 0, SHOULDER_Z),
         (s * (SHOULDER_X + 0.020), 0, ELBOW_Z), f"clavicle.{side}")
    bone(f"lowerarm.{side}", (s * (SHOULDER_X + 0.020), 0, ELBOW_Z),
         (s * (SHOULDER_X + 0.034), 0, WRIST_Z), f"upperarm.{side}")
    bone(f"hand.{side}", (s * (SHOULDER_X + 0.034), 0, WRIST_Z),
         (s * (SHOULDER_X + 0.040), -HAND["length"], WRIST_Z - 0.032), f"lowerarm.{side}")
    bone(f"thigh.{side}", (s * HIP_X, 0, HIP_Z - 0.025), (s * (HIP_X + 0.006), 0, KNEE_Z), "hips")
    bone(f"shin.{side}", (s * (HIP_X + 0.006), 0, KNEE_Z),
         (s * (HIP_X + 0.010), 0, ANKLE_Z), f"thigh.{side}")
    bone(f"foot.{side}", (s * (HIP_X + 0.010), 0, ANKLE_Z),
         (s * (HIP_X + 0.010), -0.140, 0.018), f"shin.{side}")

bpy.ops.object.mode_set(mode='OBJECT')

body.parent = rig
body.matrix_parent_inverse = rig.matrix_world.inverted()
body.modifiers.new("Armature", 'ARMATURE').object = rig

group_name = {g.index: g.name for g in body.vertex_groups}
unweighted = sum(1 for v in body.data.vertices if not v.groups)
print("KIT_BIND weighted=%d unweighted=%d groups=%d"
      % (len(body.data.vertices) - unweighted, unweighted, len(body.vertex_groups)))
if unweighted:
    raise SystemExit("KIT_BIND_FAIL %d vertices carry no weights" % unweighted)

dominant = {}
for v in body.data.vertices:
    if v.groups:
        dominant[v.index] = group_name.get(max(v.groups, key=lambda g: g.weight).group, "")

for _g in ("hand.L", "hand.R", "foot.L"):
    _c = [body.data.vertices[i].co for i, n in dominant.items() if n == _g]
    if _c:
        print("KIT_PART %-7s n=%4d rest x=[%.3f,%.3f] y=[%.3f,%.3f] z=[%.3f,%.3f]"
              % (_g, len(_c), min(c.x for c in _c), max(c.x for c in _c),
                 min(c.y for c in _c), max(c.y for c in _c),
                 min(c.z for c in _c), max(c.z for c in _c)))

# ---------------------------------------------------------------------------
# Sit down
# ---------------------------------------------------------------------------

bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='POSE')


def aim(pb, direction, twist_deg=0.0):
    """
    Point a pose bone along a world-space direction, then roll it about itself.

    The aim alone leaves roll unconstrained — `rotation_difference` gives the
    minimal rotation from wherever the bone currently is — so anything needing a
    specific roll must say so, and anything measuring a range of rolls must reset
    between candidates or they compound.
    """
    target = Vector(direction).normalized()
    m = pb.matrix.copy()
    along = m.col[1].to_3d().normalized()      # bone local Y runs head to tail
    rotated = along.rotation_difference(target).to_matrix().to_4x4() @ m
    if twist_deg:
        rotated = Matrix.Rotation(math.radians(twist_deg), 4, target) @ rotated
    rotated.translation = m.translation        # pivot about the head
    pb.matrix = rotated
    bpy.context.view_layer.update()


def reach(upper_name, lower_name, end_name, target, outward, end_aim):
    """
    Two-bone IK: put the hand or foot *on* the target rather than near it.

    Aiming limbs by hand-picked directions cannot work here: the torso lean has
    carried the shoulders forward of the hips and the pelvic tilt has swung both
    hip joints, so the same direction lands each limb somewhere different.
    """
    upper = rig.pose.bones[upper_name]
    lower = rig.pose.bones[lower_name]
    end = rig.pose.bones[end_name]

    origin = upper.head.copy()
    l1 = (upper.tail - upper.head).length
    l2 = (lower.tail - lower.head).length
    to_target = Vector(target) - origin
    span = min(to_target.length, (l1 + l2) * 0.995)
    if span < 1e-4:
        return
    straight = to_target.normalized()

    cos_a = (l1 * l1 + span * span - l2 * l2) / (2 * l1 * span)
    angle = math.acos(max(-1.0, min(1.0, cos_a)))
    pole = Vector(outward)
    pole -= straight * pole.dot(straight)      # only the perpendicular part steers
    axis = straight.cross(pole)
    axis = axis.normalized() if axis.length > 1e-5 else Vector((0, 0, 1))

    best = None
    for sign in (1, -1):
        candidate = (Matrix.Rotation(sign * angle, 4, axis) @ straight).normalized()
        joint = origin + candidate * l1
        score = (joint - origin).dot(pole)
        if best is None or score > best[0]:
            best = (score, candidate)

    aim(upper, best[1])
    aim(lower, Vector(target) - lower.head)    # the joint has moved; re-read it
    aim(end, end_aim)


def rigid_points(bone_name):
    """Where a rigidly-weighted part is now. Exact, because it cannot bend."""
    pb = rig.pose.bones[bone_name]
    delta = pb.matrix @ pb.bone.matrix_local.inverted()
    return [delta @ body.data.vertices[i].co
            for i, name in dominant.items() if name == bone_name]


def plant(side, spec):
    """
    Solve one leg, then slide the ankle until the *sole* is at the wanted height.

    The IK puts the ankle where it is told, and nobody looks at ankles. What
    reads is whether the shoe is on the carpet, and the offset between the two
    changes with every adjustment to how the foot is angled.
    """
    height = spec["sole"] + ANKLE_Z
    for _ in range(8):
        reach(f"thigh.{side}", f"shin.{side}", f"foot.{side}",
              at(*spec["ankle"], height), spec["knee"], spec["toe"])
        error = min(p.z for p in rigid_points(f"foot.{side}")) - LIFT_Z - spec["sole"]
        if abs(error) < 0.0015:
            break
        height -= error


def grip(side, spec):
    """
    Solve one arm, then slide the wrist until the hand is on the armrest.

    Same loop, same reason: what has to be right is where the hand is, and what
    the IK can be told is where the wrist joint is.
    """
    sign = 1 if side == "L" else -1
    pad = Vector((sign * ARMREST[0], spec["along"], ARMREST[1]))
    target = pad + Vector((0, 0, 0.10))

    for _ in range(12):
        reach(f"upperarm.{side}", f"lowerarm.{side}", f"hand.{side}",
              at(*target), spec["elbow"], spec["fingers"])
        cloud = rigid_points(f"hand.{side}")
        contact = Vector((sum(p.x for p in cloud) / len(cloud),
                          sum(p.y for p in cloud) / len(cloud) - LIFT_Y,
                          min(p.z for p in cloud) - LIFT_Z))
        error = contact - pad
        if error.length < 0.003:
            break
        target -= error * 0.7      # damped: the forearm swings as the target moves


def posed_points():
    """World-space vertices of the deformed body, in whatever frame it is in."""
    bpy.context.view_layer.update()
    deps = bpy.context.evaluated_depsgraph_get()
    ev = body.evaluated_get(deps)
    me = ev.to_mesh()
    points = [body.matrix_world @ v.co.copy() for v in me.vertices]
    ev.to_mesh_clear()
    if len(points) != len(body.data.vertices):
        raise SystemExit("KIT_EVAL_FAIL evaluates to %d vertices, not %d — a modifier "
                         "is changing the topology" % (len(points), len(body.data.vertices)))
    return points


def region(points, *names):
    """The subset of a posed mesh belonging to the named bones."""
    keep = set(names)
    return [p for i, p in enumerate(points)
            if keep & {dominant.get(i, ""), dominant.get(i, "").split(".")[0]}]


def strike_the_pose():
    """Torso, then legs, then arms — every aim and every solve, top down."""
    for stem in ORDER:
        aim(rig.pose.bones[stem], AIM[stem], TWIST.get(stem, 0))
    for side, spec in FEET.items():
        plant(side, spec)
    for side, spec in HANDS.items():
        grip(side, spec)


# Sit him down until the cushion takes his weight. SIT_Z is where the hip joint
# goes; what has to be right is where his backside is, and the gap between them
# changes with every edit to the pose, so it is measured and closed.
for attempt in range(6):
    strike_the_pose()
    contact = min(p.z for p in region(posed_points(), "hips")) - LIFT_Z
    error = contact - SEAT_CONTACT
    print("KIT_SIT pass=%d hip=%.4f contact=%.4f error=%+.4f" % (attempt, SIT_Z, contact, error))
    if abs(error) < 0.002:
        break
    SIT_Z -= error
    LIFT_Z = HIP_Z - SIT_Z

bpy.ops.object.mode_set(mode='OBJECT')

# ---------------------------------------------------------------------------
# Headphone cable
# ---------------------------------------------------------------------------
# It hangs off the left can and down to his pocket. The game blows it about at
# runtime; the asset's job is the shape it takes when nothing is happening.
#
# This is the tie's bone chain, repurposed and renamed. The problem is identical
# — something soft hanging off him that the wind moves — so the three bones, the
# arc weighting and the runtime offsets all carry over unchanged.


def bone_axis(name, rest_direction):
    """Where a bone-local direction ends up once the bone is posed."""
    pb = rig.pose.bones[name]
    local = pb.bone.matrix_local.to_3x3().inverted() @ Vector(rest_direction)
    return (pb.matrix.to_3x3() @ local).normalized()


front = bone_axis("chest", (0, -1, 0))
front.z = 0
front.normalize()
left = Vector((0, 0, 1)).cross(front)
neck_base = rig.matrix_world @ rig.pose.bones["neck"].head
# Out of the bottom of the left can, not off his shoulder blade. The first
# version started at neither end of anything and stopped in mid-air, which reads
# as an aerial. A cable has to come out of the thing it belongs to.
can_bottom = (rig.matrix_world @ rig.pose.bones["head"].head) + Vector((0, 0, 0.078))
anchor = can_bottom + left * 0.156 + front * 0.012

plug = block("CablePlug", (0.016, 0.018, 0.024), (0, 0, 0), bevel=(0.005, 2))
plug.location = anchor


def ribbon(name, path, widths, thickness=0.010, roll=Vector((0, 0, 1))):
    """A flat strip swept along a path. `roll` is which way its flat faces."""
    bm = bmesh.new()
    rings = []
    for i, point in enumerate(path):
        ahead = path[min(i + 1, len(path) - 1)]
        behind = path[max(i - 1, 0)]
        along = (ahead - behind).normalized()
        across = along.cross(roll)
        across = across.normalized() if across.length > 1e-4 else Vector((1, 0, 0))
        face = across.cross(along).normalized()
        half_w, half_t = widths[i] / 2, thickness / 2
        rings.append([bm.verts.new(point + across * sx * half_w + face * sy * half_t)
                      for sx, sy in ((1, 1), (1, -1), (-1, -1), (-1, 1))])
    for near, far in zip(rings, rings[1:]):
        for j in range(4):
            bm.faces.new((near[j], near[(j + 1) % 4], far[(j + 1) % 4], far[j]))
    bm.faces.new(rings[0])
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return K.mesh_from_bmesh(bm, name)


UP = Vector((0, 0, 1))
BLADE_STEPS = 20
HANG = 0.420
_p0 = anchor + left * 0.002 - UP * 0.006
_p1 = anchor + left * 0.034 - front * 0.020 - UP * (HANG * 0.58)
_p2 = anchor - left * 0.028 - front * 0.086 - UP * HANG

path, widths = [], []
for i in range(BLADE_STEPS + 1):
    t = i / BLADE_STEPS
    point = _p0 * (1 - t) ** 2 + _p1 * 2 * (1 - t) * t + _p2 * t ** 2
    point += left * 0.020 * math.sin(t * 3.4) + front * 0.012 * math.sin(t * 5.1)
    path.append(point)
    widths.append(0.011)          # a cable is a cable all the way down

blade = ribbon("CableRun", path, widths, thickness=0.010, roll=front)
K.bevel(blade, width=0.003, segments=2)
K.shade_smooth(blade, angle=60)
K.apply_modifiers([blade])

# A spine for it, so the game can flap it. Built in the *rest* frame, because
# that is where a skeleton lives: everything above happened in the posed frame,
# so it is carried back through the chest's own pose to get there.
CABLE_BONES = 3
_head = rig.pose.bones["head"]
to_rest = (_head.matrix @ _head.bone.matrix_local.inverted()).inverted()

blade.data.transform(to_rest)
spine_points = [to_rest @ path[round(i * BLADE_STEPS / CABLE_BONES)] for i in range(CABLE_BONES + 1)]

bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT')
for i in range(CABLE_BONES):
    b = arm_data.edit_bones.new(f"cable.{i + 1}")
    b.head = spine_points[i]
    b.tail = spine_points[i + 1]
    b.parent = arm_data.edit_bones["head" if i == 0 else f"cable.{i}"]
    b.use_connect = i > 0
bpy.ops.object.mode_set(mode='OBJECT')

groups = [blade.vertex_groups.new(name=f"cable.{i + 1}") for i in range(CABLE_BONES)]
rest_path = [to_rest @ p for p in path]
for v in blade.data.vertices:
    nearest = min(range(len(rest_path)), key=lambda i: (rest_path[i] - v.co).length)
    u = min(max(nearest / BLADE_STEPS, 0.0), 0.999) * CABLE_BONES
    seg, blend = int(u), u % 1.0
    groups[seg].add([v.index], 1.0 - blend, 'REPLACE')
    if seg + 1 < CABLE_BONES:
        groups[seg + 1].add([v.index], blend, 'REPLACE')

blade.data.materials.clear()
blade.data.materials.append(CABLE)
blade.parent = rig
blade.matrix_parent_inverse = rig.matrix_world.inverted()
blade.modifiers.new("Armature", 'ARMATURE').object = rig


def parent_to_bone(obj, bone_name):
    """
    Rigidly attach something to one bone.

    Blender parents to the bone's *tail*, so the parent inverse is taken from a
    matrix translated there — otherwise the object jumps the length of the bone
    the moment it is parented.
    """
    pb = rig.pose.bones[bone_name]
    bone_mat = pb.matrix.copy()
    bone_mat.translation = pb.tail
    obj.parent = rig
    obj.parent_type = 'BONE'
    obj.parent_bone = bone_name
    obj.matrix_parent_inverse = (rig.matrix_world @ bone_mat).inverted()


plug.data.materials.clear()
plug.data.materials.append(PLASTIC)
parent_to_bone(plug, "head")

rig.location = (0, -LIFT_Y, -LIFT_Z)
bpy.context.view_layer.update()

# ---------------------------------------------------------------------------
# Does he fit the chair?
# ---------------------------------------------------------------------------

posed = posed_points()
seat_contact = min(p.z for p in region(posed, "hips"))
knees = [max(abs(p.x) for p in region(posed, f"thigh.{s}", f"shin.{s}")) for s in ("L", "R")]
soles = {s: min(p.z for p in region(posed, f"foot.{s}")) for s in ("L", "R")}
print("KIT_SEAT contact=%.3f (pad %.3f)  knees=%.3f/%.3f  soles L=%.3f R=%.3f"
      % (seat_contact, SEAT_TOP, knees[0], knees[1], soles["L"], soles["R"]))

if not (SEAT_TOP - 0.035 <= seat_contact <= SEAT_TOP + 0.008):
    raise SystemExit("KIT_SEAT_FAIL he is not sitting on the cushion (%.3f vs %.3f)"
                     % (seat_contact, SEAT_TOP))
if not (-0.004 <= soles["R"] <= 0.012):
    raise SystemExit("KIT_SEAT_FAIL planted foot is not on the floor (%.3f)" % soles["R"])
if soles["L"] < 0.020:
    raise SystemExit("KIT_SEAT_FAIL recovering foot is not lifted (%.3f)" % soles["L"])
if min(knees) < 0.150:
    raise SystemExit("KIT_SEAT_FAIL a knee is inside the seat pad (%.3f)" % min(knees))

PAD_HALF = (0.0275, 0.1075)
for side, sign in (("L", 1), ("R", -1)):
    hand = region(posed, f"hand.{side}")
    over = [p for p in hand
            if abs(p.x - sign * ARMREST[0]) < PAD_HALF[0] + 0.050 and abs(p.y) < PAD_HALF[1] + 0.050]
    low = min(p.z for p in hand)
    print("KIT_GRIP %s palm=%.3f (pad top %.3f) verts_over_pad=%d/%d box x=[%.3f,%.3f] y=[%.3f,%.3f]"
          % (side, low, ARMREST[1], len(over), len(hand),
             min(p.x for p in hand), max(p.x for p in hand),
             min(p.y for p in hand), max(p.y for p in hand)))
    if low > ARMREST[1] + 0.012:
        raise SystemExit("KIT_GRIP_FAIL %s hand floats %.0f mm above the armrest"
                         % (side, (low - ARMREST[1]) * 1000))
    if low < ARMREST[1] - 0.035:
        raise SystemExit("KIT_GRIP_FAIL %s hand is buried in the armrest (%.3f)" % (side, low))
    if len(over) < len(hand) * 0.70:
        raise SystemExit("KIT_GRIP_FAIL %s hand is not over the pad (%d/%d)"
                         % (side, len(over), len(hand)))

nose_idx = min((v for v in body.data.vertices if v.co.z > CHIN_Z), key=lambda v: v.co.y).index
facing = posed[nose_idx] - (rig.matrix_world @ rig.pose.bones["head"].head)
print("KIT_FACING nose_offset=(%.3f,%.3f,%.3f)" % (facing.x, facing.y, facing.z))
if facing.y >= -0.02:
    raise SystemExit("KIT_FACING_FAIL he is not looking where he is going")

K.assert_bounds(body, {
    "width":  (0.40, 0.90),
    "depth":  (0.45, 0.95),
    "height": (1.10, 1.55),
    "floor":  (-0.010, 0.010),
})

bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(
    filepath=sys.argv[-1],
    export_format='GLB',
    export_apply=False,          # keep the armature; modifiers must not bake
    export_yup=True,
    use_selection=True,
    export_skins=True,
    # Without this the exporter writes the armature's REST position and quietly
    # discards the pose — the driver arrives standing in a T-pose no matter what
    # the bones were set to, which is exactly what happened the first time.
    export_rest_position_armature=False,
    export_materials='EXPORT',
)
print("KIT_EXPORT_OK driver", sys.argv[-1])
