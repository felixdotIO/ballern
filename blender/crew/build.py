"""build(spec) -> scene objects. The head sits at the origin, facing -Y."""

import math
import random

import bpy
from mathutils import Vector

from . import geom as g
from . import mats


def _palette(s):
    if s.shell == 'paper':
        shell = mats.paper(f'{s.name}_shell', s.mask_col)
    elif s.shell == 'cloth':
        shell = mats.cloth(f'{s.name}_shell', s.mask_col, rough=0.88)
    else:
        shell = mats.knit(f'{s.name}_shell', s.mask_col, ribs=s.ribs,
                          depth=s.rib_depth, axis=s.rib_axis, tilt=s.rib_tilt,
                          fade=s.rib_fade, extent=s.head[2])
    return {
        'shell': shell,
        'skin': mats.skin(f'{s.name}_skin', s.skin_col),
        'lid': mats.skin(f'{s.name}_lid',
                         tuple(c * s.lid_shade for c in s.skin_col)),
        'neck': (mats.skin(f'{s.name}_neckskin', s.skin_col)
                 if s.shell == 'bare'
                 else mats.skin(f'{s.name}_neck', s.neck_col, rough=0.7)),
        'cloth': mats.cloth(f'{s.name}_cloth', s.garment_col),
        'eye': mats.plain(f'{s.name}_eye', s.eye_col, rough=0.28, coat=0.5),
        'iris': mats.plain(f'{s.name}_iris', s.iris_col, rough=0.22, coat=0.9),
        'limbal': mats.plain(f'{s.name}_limbal', s.limbal, rough=0.16, coat=0.9),
        'catch': mats.plain(f'{s.name}_catch', (0.95, 0.95, 0.96), rough=0.10, coat=0.9),
        'card': mats.paper(f'{s.name}_card', tuple(c * 0.92 for c in s.mask_col), crease=0.4),
        'legs': mats.cloth(f'{s.name}_legs', s.legs_col, rough=0.85),
        'hat': mats.knit(f'{s.name}_hat', s.hat_col, depth=0.0, rough=0.90),
        'cans': mats.plain(f'{s.name}_cans', s.cans_col, rough=0.40, coat=0.3),
        'hair': mats.hair(f'{s.name}_hair', s.hair_col),
        'lens': mats.glass(f'{s.name}_lens', s.lens_col, tint=s.lens_tint),
        'lip': mats.skin(f'{s.name}_lip', tuple(c * 0.72 for c in s.skin_col)),
        'paper': mats.plain(f'{s.name}_cigp', (0.88, 0.87, 0.845), rough=0.75),
        'ember': mats.plain(f'{s.name}_ember', (0.62, 0.16, 0.05), rough=0.55),
        'muzzle': mats.skin(f'{s.name}_muzzle', s.muzzle_col),
        'snout': mats.plain(f'{s.name}_snout', s.snout_col, rough=0.28, coat=0.6),
        'teeth': mats.plain(f'{s.name}_teeth', (0.925, 0.915, 0.895), rough=0.28),
        'maw': mats.plain(f'{s.name}_maw', (0.155, 0.075, 0.080), rough=0.55),
        'frame': mats.plain(f'{s.name}_frame', s.frame_col, rough=0.22, coat=0.6),
        'accent': mats.plain(f'{s.name}_accent', s.accent, rough=0.35, coat=0.4),
        'shoe': mats.plain(f'{s.name}_shoe', s.shoe_col, rough=0.42, coat=0.25),
        # the ears are a plain knitted panel: the rib pattern is a meridian
        # field and would burst at the ear's own axis. With no mask on they are
        # skin, not knit.
        'ear': (mats.skin(f'{s.name}_earskin', s.skin_col) if s.shell == 'bare'
                else mats.knit(f'{s.name}_ear', s.mask_col, depth=0.0)),
    }


# ------------------------------------------------------------------ head

def _cranium(s, name, shrink=0.0, seg=104, ring=60):
    """The head silhouette, offset inward by `shrink`. The shell and the face
    underneath it must go through here or they intersect."""
    r = tuple(v - shrink for v in s.head)

    def prof(t):
        up = max(0.0, t) ** 1.4
        dn = max(0.0, -t) ** 1.5
        return 1.0 + (s.head_crown - 1.0) * up - (1.0 - s.head_chin) * dn

    ob = g.blob(name, r=r, e=s.head_e, seg=seg, ring=ring, profile=prof)
    ry = s.head[1]
    if s.face_flat:
        def flatten(co):
            if co.y >= 0:
                return co
            return Vector((co.x, co.y * (1.0 - s.face_flat * (-co.y / ry) ** 2),
                           co.z))

        g.deform(ob, flatten)

    # A blank egg with two holes in it is the uncanny read. Both the mask and
    # the head under it come through here, so the mask drapes over a nose and a
    # brow the way a real balaclava does, and the eyes sit in dished sockets
    # instead of floating in a shell.
    def feature(co):
        if co.y >= 0:
            return co
        front = min(1.0, (-co.y / ry)) ** 2
        dy = 0.0

        if s.nose > 0:
            dx = co.x / s.nose_w
            dz = (co.z - s.nose_at) / (s.nose_w * 1.5)
            dy -= s.nose * math.exp(-(dx * dx + dz * dz) * 1.6)

        if s.brow > 0:
            bx = co.x / (s.eye_gap * 2.6)
            bz = (co.z - (s.eye_z + s.eye_h * 0.85)) / (s.eye_h * 0.55)
            dy -= s.brow * math.exp(-(bx * bx * 0.7 + bz * bz) * 1.5)

        if s.socket > 0:
            for side in (-1, 1):
                sx = (co.x - side * s.eye_gap) / (s.eye_w * 1.9)
                sz = (co.z - s.eye_z) / (s.eye_h * 1.5)
                dy += s.socket * math.exp(-(sx * sx + sz * sz) * 1.5)

        return Vector((co.x, co.y + dy * front, co.z))

    g.deform(ob, feature)
    return ob


def _head_shell(s, pal):
    """A real shell: the mask has thickness, so the eye holes have an edge."""
    dense = 208 if s.rib_relief > 0 else 104
    head = _cranium(s, f'{s.name}_head', seg=dense, ring=76)
    if s.rib_relief > 0:
        g.rib_relief(head, s.ribs, s.rib_relief, fade=s.rib_fade,
                     extent=s.head[2], floor=-s.head[2] * 0.72)
    g.set_mats(head, [pal['shell']])
    g.solidify(head, s.shell_t, offset=-1.0)
    return head


def _face(s, pal, shrink=None):
    """What you see through the holes: the head underneath the mask."""
    if shrink is None:
        shrink = s.shell_t + s.face_gap
    face = _cranium(s, f'{s.name}_face', shrink=shrink, seg=76, ring=46)
    g.set_mats(face, [pal['skin']])
    g.smooth(face, angle=60)
    return face


def _sockets(s, head):
    """Punch the eye holes clean through the front wall of the shell."""
    for side in (-1, 1):
        # origin at the inner end of the hole so splay pivots there, not at
        # the far end of a 1.5-unit cutter
        c = g.prism(f'{s.name}_cut{side}', a=s.eye_w, b=s.eye_h,
                    y=(-1.4, 0.0), p=s.eye_corner, seg=72,
                    taper=s.socket_taper)
        g.place(c, loc=(side * s.eye_gap, s.cut_end, s.eye_z),
                rot=(0, side * s.eye_tilt, side * s.eye_splay))
        bpy.context.view_layer.update()
        g.cut(head, c)
        bpy.data.objects.remove(c, do_unlink=True)
    return head


def _rims(s, pal):
    """The soft collars around the eye holes — the character's whole face."""
    if s.rim <= 0:
        return []
    out = []
    for side in (-1, 1):
        r = g.se_torus(f'{s.name}_rim{side}',
                       a=s.eye_w + s.rim * 0.55, b=s.eye_h + s.rim * 0.55,
                       p=s.eye_corner, tube=s.rim, seg=80, ring=22,
                       squash=s.rim_squash)
        g.set_mats(r, [pal['skin']])
        depth = -s.head[1] * (1.0 - s.face_flat * 0.55) + s.rim_out
        g.place(r, loc=(side * s.eye_gap, depth, s.eye_z),
                rot=(0, side * s.eye_tilt, side * s.eye_splay))
        g.smooth(r, angle=60)
        out.append(r)
    return out


def _eye(s, pal, side, face):
    """Eyeball, iris, catchlight and two lids.

    The first pass read as a doll: a small bead pupil sitting proud of a big
    white ball with sclera showing all round it. The fixes are a wide iris laid
    flat on the ball as a spherical cap, and a lower lid — an eye with white
    visible under it as well as over it is the thing that looks wrong.
    """
    x, z = side * s.eye_gap, s.eye_z + s.ball_dz
    bpy.context.view_layer.update()
    hit, loc, _, _ = face.ray_cast(Vector((x, -3.0, z)), Vector((0, 1, 0)))
    surface = loc.y if hit else -s.head[1] * 0.7
    centre = Vector((x, surface - s.eye_out, z))

    ball = g.blob(f'{s.name}_ball{side}', r=(s.eyeball,) * 3, seg=48, ring=32)
    g.set_mats(ball, [pal['eye']])
    g.place(ball, loc=centre)
    out = [ball]

    yaw, pitch = s.gaze
    look = Vector((math.sin(math.radians(side * s.eye_splay + yaw)),
                   -math.cos(math.radians(side * s.eye_splay + yaw)),
                   math.sin(math.radians(pitch)))).normalized()

    def on_ball(name, mat, direction, width, lift):
        half = math.degrees(math.asin(min(0.985, width)))
        c = g.cap(name, r=s.eyeball * lift, half_angle=half, seg=44, ring=12)
        g.set_mats(c, [mat])
        c.location = centre
        c.rotation_euler = direction.to_track_quat('Z', 'Y').to_euler()
        g.smooth(c, angle=70)
        return c

    # limbal ring under the iris, then the pupil on top: a single flat disc
    # reads as a printed dot, and the ring is most of what sells a real eye
    out.append(on_ball(f'{s.name}_limb{side}', pal['limbal'], look,
                       min(0.97, s.iris * 1.10), 1.003))
    out.append(on_ball(f'{s.name}_iris{side}', pal['iris'], look,
                       min(0.95, s.iris), 1.006))
    out.append(on_ball(f'{s.name}_pupil{side}', pal['limbal'], look,
                       min(0.9, s.iris * 0.46), 1.009))

    if s.catch > 0:
        spark = look.copy()
        spark.z += 0.28
        spark.x += side * 0.13
        out.append(on_ball(f'{s.name}_catch{side}', pal['catch'],
                           spark.normalized(), s.catch, 1.012))

    lid = g.cap(f'{s.name}_lid{side}', r=s.eyeball * 1.035, half_angle=90,
                seg=48, ring=16)
    g.set_mats(lid, [pal['lid']])
    g.place(lid, loc=centre,
            rot=(s.lid_drop, side * s.lid_slant, -side * s.eye_splay))
    g.solidify(lid, 0.016, offset=1.0)
    out.append(lid)

    if s.lid_low > 0:
        low = g.cap(f'{s.name}_lidlow{side}', r=s.eyeball * 1.035,
                    half_angle=s.lid_low, seg=48, ring=10)
        g.set_mats(low, [pal['lid']])
        g.place(low, loc=centre,
                rot=(180.0 - s.lid_low * 0.22, side * s.lid_slant * 0.4,
                     -side * s.eye_splay))
        g.solidify(low, 0.014, offset=1.0)
        out.append(low)

    for o in out:
        g.smooth(o, angle=60)
    return out


def _face_y(s, z):
    """Roughly where the front of the face sits at a given height."""
    return -s.head[1] * (1.0 - s.face_flat * 0.5) * 0.94


def _hair(s, pal):
    """Hair for the unmasked ones. The afro is a cluster of lumps on a dome —
    a smooth blob reads as a swim cap, the lumps are the whole character."""
    if s.hair == 'none':
        return []
    hx, hy, hz = s.head
    out = []
    if s.hair == 'afro':
        rng = random.Random(7)
        golden = math.pi * (3.0 - math.sqrt(5.0))
        for i in range(s.hair_n):
            t = (i + 0.5) / s.hair_n
            pz = 1.0 - 2.0 * t * s.hair_drop
            pr = math.sqrt(max(0.0, 1.0 - pz * pz))
            a = i * golden
            px, py = pr * math.cos(a), pr * math.sin(a)
            # cull the whole front arc, not just dead centre, or lumps land
            # on the cheeks
            if py < 0.34 and pz < s.hairline:
                continue
            k = 0.86 + 0.30 * rng.random()
            lump = g.blob(f'{s.name}_hair{i}', r=(s.hair_lump * k,) * 3,
                          seg=18, ring=14)
            g.set_mats(lump, [pal['hair']])
            g.place(lump, loc=(px * hx * s.hair_r, py * hy * s.hair_r,
                               pz * hz * s.hair_r + s.hair_at * hz))
            g.smooth(lump, angle=60)
            out.append(lump)
    elif s.hair in ('bob', 'bun'):
        # a shell over the skull with the face cut out of the front, so it can
        # hang past the jaw. Neither a lump cluster nor a smooth cap can frame
        # a face — the cluster has no edge and the cap has no opening.
        r = (hx * s.hair_r, hy * s.hair_r, hz * s.hair_r)

        def prof(t):
            up = max(0.0, t) ** 1.4
            dn = max(0.0, -t) ** 1.5
            return 1.0 + (s.head_crown - 1.0) * up - (1.0 - s.head_chin) * dn * 0.35

        ob = g.blob(f'{s.name}_bob', r=r, e=s.head_e, seg=92, ring=56,
                    profile=prof)
        g.deform(ob, lambda co: Vector(
            (co.x, co.y, co.z * (s.hair_long if co.z < 0 else 1.0))))
        g.set_mats(ob, [pal['hair']])
        g.solidify(ob, s.hair_t, offset=-1.0)

        fw, fh, fz = s.hair_face
        # two cuts: an oval for the face, then clear the whole front below the
        # jaw. Without the second one the hair closes under the chin and the
        # whole thing reads as a hood rather than as hair.
        lo = s.hair_open * hz
        px, roll = s.hair_part
        for a, b, z, p, dx, rr in (
                (hx * fw, hz * fh, fz, 0.90, hx * px, roll),
                (hx * 1.55, hz * 1.60 - lo * 0.5, lo - hz * 1.60, 0.16, 0.0, 0.0)):
            cutter = g.prism(f'{s.name}_bobcut', a=a, b=b, y=(-2.4, 0.0),
                             p=p, seg=72)
            g.place(cutter, loc=(dx, -hy * 0.18, z), rot=(0, rr, 0))
            bpy.context.view_layer.update()
            g.cut(ob, cutter)
            bpy.data.objects.remove(cutter, do_unlink=True)
        g.smooth(ob, angle=55)
        out.append(ob)

        if s.hair == 'bun':
            br, by, bz = s.bun
            knot = g.blob(f'{s.name}_bun', r=(br, br * 0.92, br * 0.86),
                          e=(0.88, 0.94), seg=32, ring=22)
            g.set_mats(knot, [pal['hair']])
            g.place(knot, loc=(0, hy * by, hz * bz))
            g.smooth(knot, angle=55)
            out.append(knot)
    elif s.hair == 'crop':
        cap = g.blob(f'{s.name}_crop', r=(hx * 1.035, hy * 1.035, hz * 0.62),
                     e=s.head_e, seg=72, ring=44)
        g.set_mats(cap, [pal['hair']])
        g.place(cap, loc=(0, -0.01, hz * 0.46))
        g.smooth(cap, angle=55)
        out.append(cap)
    return out


def _glasses(s, pal):
    if s.glasses == 'none':
        return []
    hx, hy, hz = s.head
    lw, lh = s.lens
    lift = hz * 0.46 if s.glasses_up else 0.0
    tip = -22.0 if s.glasses_up else 0.0
    fy = _face_y(s, s.eye_z) + (0.055 if s.glasses_up else 0.0)
    p = 0.34 if s.glasses == 'shades' else 0.95
    out = []
    for side in (-1, 1):
        # clear spectacles are just the frame: even a transmissive lens greys
        # the eyes out behind it, and the eyes are the whole face
        if s.lens_tint >= 0.25:
            glass = g.blob(f'{s.name}_lens{side}', r=(lw, 0.020, lh),
                           e=(p * 0.9, p), seg=36, ring=24)
            g.set_mats(glass, [pal['lens']])
            g.place(glass, loc=(side * s.eye_gap, fy - 0.045, s.eye_z + lift),
                    rot=(tip, 0, 0))
            g.smooth(glass, angle=50)
            out.append(glass)

        rim = g.se_torus(f'{s.name}_gframe{side}', a=lw + 0.012, b=lh + 0.012,
                         p=p, tube=0.020, seg=64, ring=14)
        g.set_mats(rim, [pal['frame']])
        g.place(rim, loc=(side * s.eye_gap, fy - 0.045, s.eye_z + lift),
                rot=(tip, 0, 0))
        g.smooth(rim, angle=60)
        out.append(rim)

        arm = g.link(f'{s.name}_garm{side}',
                     (side * (s.eye_gap + lw), fy - 0.035, s.eye_z + 0.02 + lift),
                     (side * hx * 1.01, hy * 0.30, s.eye_z + 0.05 + lift * 0.7),
                     0.016, 0.014, seg=12, cap=4)
        g.set_mats(arm, [pal['frame']])
        g.smooth(arm, angle=60)
        out.append(arm)

    bridge = g.link(f'{s.name}_bridge',
                    (-s.eye_gap + lw * 0.7, fy - 0.048, s.eye_z + 0.03 + lift),
                    (s.eye_gap - lw * 0.7, fy - 0.048, s.eye_z + 0.03 + lift),
                    0.016, 0.016, seg=12, cap=4)
    g.set_mats(bridge, [pal['frame']])
    g.smooth(bridge, angle=60)
    out.append(bridge)
    return out


def _cig(s, pal):
    """A cigarette in the corner of the mouth. One prop, whole personality."""
    if not s.cig:
        return []
    z = s.nose_at - 0.230
    fy = _face_y(s, z)
    a = Vector((0.055, fy + 0.010, z))
    b = Vector((0.235, fy - 0.150, z - 0.055))
    out = []
    stick = g.link(f'{s.name}_cig', a, b, 0.021, 0.020, seg=14, cap=3)
    g.set_mats(stick, [pal['paper']])
    g.smooth(stick, angle=60)
    out.append(stick)
    ember = g.blob(f'{s.name}_ember', r=(0.023, 0.023, 0.023), seg=16, ring=12)
    g.set_mats(ember, [pal['ember']])
    g.place(ember, loc=b + (b - a).normalized() * 0.018)
    g.smooth(ember, angle=60)
    out.append(ember)
    return out


def _earrings(s, pal):
    if s.earring <= 0 or s.shell != 'bare':
        return []
    out = []
    for side in (-1, 1):
        st = g.blob(f'{s.name}_stud{side}', r=(s.earring,) * 3, seg=18, ring=12)
        g.set_mats(st, [pal['accent']])
        g.place(st, loc=(side * (s.ear_at[0] + 0.012), s.ear_at[1] - 0.02,
                         s.ear_at[2] - 0.085))
        g.smooth(st, angle=60)
        out.append(st)
    return out


def _nose(s, pal):
    """A bare face needs a real nose. The `nose` deform makes a ridge that a
    mask can drape over, but on its own it is not a feature."""
    if s.shell != 'bare' or s.nose <= 0:
        return []
    z = s.nose_at
    fy = _face_y(s, z)
    n = g.blob(f'{s.name}_nose',
               r=(s.nose_w * 0.56, s.nose * 1.15, s.nose_w * 0.92),
               e=(0.78, 0.86), seg=30, ring=22,
               profile=lambda t: 1.0 - 0.42 * max(0.0, t) ** 1.1)
    g.set_mats(n, [pal['skin']])
    g.place(n, loc=(0, fy - s.nose * 0.42, z), rot=(-8, 0, 0))
    g.smooth(n, angle=60)
    return [n]


def _muzzle(s, pal):
    """A snout, for anyone who isn't a person."""
    if s.muzzle[0] <= 0:
        return []
    mw, md, mh = s.muzzle
    z = s.muzzle_at
    fy = _face_y(s, z)
    out = []
    m = g.blob(f'{s.name}_muzzle', r=(mw, md, mh), e=(0.80, 0.88),
               seg=40, ring=28,
               profile=lambda t: 1.0 - 0.22 * max(0.0, t) ** 1.2)
    g.set_mats(m, [pal['muzzle']])
    g.place(m, loc=(0, fy - md * 0.52, z), rot=(-4, 0, 0))
    g.smooth(m, angle=60)
    out.append(m)

    if s.snout > 0:
        n = g.blob(f'{s.name}_snoutn',
                   r=(s.snout * 1.30, s.snout * 0.90, s.snout * 0.86),
                   e=(0.72, 0.82), seg=28, ring=20)
        g.set_mats(n, [pal['snout']])
        g.place(n, loc=(0, fy - md * 1.18, z + mh * 0.46), rot=(-10, 0, 0))
        g.smooth(n, angle=60)
        out.append(n)
    return out


def _mouth(s, pal):
    """line, grin or oh. A single lip blob is the same blank expression on
    everybody; the teeth are what let a face act."""
    if s.mouth <= 0 or s.shell != 'bare':
        return []
    w = s.mouth
    z = s.nose_at - 0.235 if s.muzzle[0] <= 0 else s.muzzle_at - s.muzzle[2] * 0.42
    fy = _face_y(s, z) - (s.muzzle[1] * 1.05 if s.muzzle[0] > 0 else 0.0)
    out = []

    if s.mouth_style == 'oh':
        m = g.blob(f'{s.name}_mouth', r=(w * 0.72, 0.055, w * 0.86),
                   e=(0.92, 0.96), seg=28, ring=20)
        g.set_mats(m, [pal['maw']])
        g.place(m, loc=(0, fy + 0.010, z))
        g.smooth(m, angle=60)
        return [m]

    if s.mouth_style == 'grin':
        m = g.blob(f'{s.name}_mouth', r=(w * 1.28, 0.055, w * 0.58),
                   e=(0.50, 0.58), seg=34, ring=22)
        g.deform(m, lambda co: Vector(
            (co.x, co.y, co.z + s.smile * (co.x / (w * 1.28)) ** 2)))
        g.set_mats(m, [pal['maw']])
        g.place(m, loc=(0, fy + 0.008, z))
        g.smooth(m, angle=60)
        out.append(m)

        teeth = g.blob(f'{s.name}_teeth', r=(w * 1.10, 0.040, w * 0.24),
                       e=(0.42, 0.50), seg=32, ring=18)
        g.deform(teeth, lambda co: Vector(
            (co.x, co.y, co.z + s.smile * (co.x / (w * 1.10)) ** 2)))
        g.set_mats(teeth, [pal['teeth']])
        g.place(teeth, loc=(0, fy - 0.010, z + w * 0.30))
        g.smooth(teeth, angle=60)
        out.append(teeth)
        return out

    m = g.blob(f'{s.name}_mouth', r=(w, 0.045, w * 0.32),
               e=(0.55, 0.62), seg=30, ring=18)
    if s.smile:
        g.deform(m, lambda co: Vector(
            (co.x, co.y, co.z + s.smile * (co.x / w) ** 2)))
    g.set_mats(m, [pal['lip']])
    g.place(m, loc=(0, fy + 0.005, z))
    g.smooth(m, angle=60)
    return [m]


def _beard(s, pal):
    """A beard hugs the jaw, so it is a shell that follows the skull — not a
    lump cluster. The afro works as lumps because it is a volume standing off
    the head; the same trick on a chin reads as a bunch of grapes.
    """
    if s.beard == 'none' or s.shell != 'bare':
        return []
    hx, hy, hz = s.head
    c = g.cap(f'{s.name}_beard', r=1.0, half_angle=s.beard_span,
              seg=72, ring=20)
    g.set_mats(c, [pal['hair']])
    g.place(c, rot=(180.0 - s.beard_tilt, 0, 0),
            scale=(hx * 1.012, hy * 1.012, hz * 1.012))
    g.solidify(c, s.beard_t, offset=1.0)
    g.smooth(c, angle=60)
    return [c]


def _tache(s, pal):
    if s.tache == 'none':
        return []
    z = s.nose_at - 0.135
    fy = _face_y(s, z) - s.nose * 0.62
    out = []
    for side in (-1, 1):
        lobe = g.blob(f'{s.name}_tache{side}', r=(0.115, 0.066, 0.048),
                      e=(0.62, 0.70), seg=28, ring=20)
        g.set_mats(lobe, [pal['hair']])
        g.place(lobe, loc=(side * 0.072, fy, z), rot=(0, 0, side * -8))
        g.smooth(lobe, angle=60)
        out.append(lobe)
    return out


def _hat(s, pal):
    """A ribbed beanie, or a ball cap worn either way round."""
    hx, hy, hz = s.head
    out = []

    if s.hat in ('cap', 'cap_back'):
        crown = g.blob(f'{s.name}_cap', r=(hx * 1.045, hy * 1.045, hz * 0.52),
                       e=(s.head_e[0] * 0.94, s.head_e[1]), seg=72, ring=44)
        g.set_mats(crown, [pal['hat']])
        g.place(crown, loc=(0, 0, hz * 0.52))
        g.smooth(crown, angle=52)
        out.append(crown)

        face = -1.0 if s.hat == 'cap' else 1.0
        # the peak is a small tongue off the front of the crown; sized off the
        # whole head it just reads as a flat plate sitting on top
        plen = hy * 0.52 * s.brim_len
        peak = g.blob(f'{s.name}_peak', r=(hx * 0.74, plen, 0.030),
                      e=(0.58, 0.64), seg=48, ring=18,
                      profile=lambda t: 1.0 - 0.34 * max(0.0, -t) ** 1.1)
        g.deform(peak, lambda co: Vector(
            (co.x, co.y, co.z - 0.115 * max(0.0, -co.y / plen) ** 1.8)))
        g.set_mats(peak, [pal['hat']])
        g.place(peak, loc=(0, face * (hy * 0.88 + plen * 0.55), hz * 0.145),
                rot=(0, 0, 0 if face < 0 else 180))
        g.smooth(peak, angle=45)
        out.append(peak)

        knob = g.blob(f'{s.name}_capknob', r=(0.034, 0.034, 0.030), seg=18, ring=12)
        g.set_mats(knob, [pal['accent']])
        g.place(knob, loc=(0, 0, hz * 0.955))
        g.smooth(knob, angle=60)
        out.append(knob)
        return out

    if s.hat != 'beanie':
        return []

    dome = g.blob(f'{s.name}_beanie', r=(hx * 1.045, hy * 1.045, hz * s.beanie_h),
                  e=(s.head_e[0] * 0.95, s.head_e[1]), seg=168, ring=64)
    g.rib_relief(dome, s.beanie_ribs, s.beanie_relief,
                 fade=(0.86, 1.02), extent=hz * s.beanie_h)
    g.set_mats(dome, [pal['hat']])
    g.place(dome, loc=(0, 0, hz * s.beanie_at))
    g.smooth(dome, angle=48)
    out.append(dome)

    brim = g.se_torus(f'{s.name}_brim', a=hx * 1.035, b=hy * 1.035,
                      p=s.head_e[1] * 0.80, tube=s.brim, seg=168, ring=26,
                      squash=1.25)
    # the sweep lands in XZ; lay it flat so the ribs run across the roll
    g.deform(brim, lambda co: Vector((co.x, co.z, -co.y)))
    g.rib_relief(brim, s.beanie_ribs, s.beanie_relief * 0.55, fade=None)
    g.set_mats(brim, [pal['hat']])
    g.place(brim, loc=(0, 0, hz * s.brim_at))
    g.smooth(brim, angle=48)
    out.append(brim)
    return out


def _cans(s, pal):
    """Headphones: a band arcing over the crown and a cup on each side."""
    if not s.cans:
        return []
    hx, hy, hz = s.head
    # the band has to arc over whatever is already on the head
    lift = hz * (s.beanie_at + s.beanie_h) * 1.04 if s.hat == 'beanie' else hz * 1.06
    out = []

    band = g.se_torus(f'{s.name}_hpband', a=hx * 1.14, b=lift, p=0.72,
                      tube=0.046, seg=80, ring=18,
                      span=(math.radians(14), math.radians(166)))
    g.set_mats(band, [pal['cans']])
    g.smooth(band, angle=50)
    out.append(band)

    for side in (-1, 1):
        cup = g.blob(f'{s.name}_cup{side}', r=(0.062, 0.150, 0.180),
                     e=(0.55, 0.60), seg=36, ring=26)
        g.set_mats(cup, [pal['cans']])
        g.place(cup, loc=(side * hx * 1.10, -0.01, hz * 0.02))
        g.smooth(cup, angle=50)
        out.append(cup)

        mark = g.blob(f'{s.name}_mark{side}', r=(0.016, 0.045, 0.045),
                      seg=24, ring=16)
        g.set_mats(mark, [pal['accent']])
        g.place(mark, loc=(side * hx * 1.155, -0.01, hz * 0.02))
        g.smooth(mark, angle=60)
        out.append(mark)

    if s.cable:
        # Three segments so the wind can curl it rather than swing it like a
        # plank. The game drives these by name: cable.1 / .2 / .3
        pts = [Vector((hx * 1.10, 0.02, hz * 0.02 - 0.15))]
        for i in range(3):
            pts.append(pts[-1] + Vector((0.020, 0.030, -0.185)))
        for i in range(3):
            seg = g.link(f'{s.name}_cable.{i + 1}', pts[i], pts[i + 1],
                         0.024, 0.022, seg=12, cap=4)
            g.set_mats(seg, [pal['cans']])
            g.smooth(seg, angle=60)
            out.append(seg)
        plug = g.blob(f'{s.name}_plug', r=(0.032, 0.032, 0.050),
                      e=(0.5, 0.6), seg=20, ring=14)
        g.set_mats(plug, [pal['cans']])
        g.place(plug, loc=pts[-1])
        g.smooth(plug, angle=60)
        out.append(plug)
    return out


def _ears(s, pal):
    if s.ears == 'none':
        return []
    if s.ears == 'round':
        hx, hy, hz = s.head
        out = []
        for side in (-1, 1):
            e = g.blob(f'{s.name}_ear{side}',
                       r=(s.ear[0], s.ear[1], s.ear[2] * 0.5),
                       e=(0.85, 0.90), seg=36, ring=26)
            g.set_mats(e, [pal['ear']])
            g.place(e, loc=(side * s.ear_at[0], s.ear_at[1], s.ear_at[2]))
            g.smooth(e, angle=60)
            out.append(e)
        return out
    ex, ey, ez = s.ear
    out = []
    for side in (-1, 1):
        def prof(t):
            # pinched where it joins the head, full and round at the tip
            return (1.0 - 0.46 * max(0.0, t) ** 1.15
                    - 0.12 * max(0.0, -t) ** 2.2)

        e = g.blob(f'{s.name}_ear{side}', r=(ex, ey, ez / 2), e=s.ear_e,
                   seg=48, ring=36, profile=prof)
        # hang from the top: origin at the attach point, body below it
        g.deform(e, lambda co: Vector((co.x, co.y, co.z - ez / 2)))
        # curl the tip forward
        g.deform(e, g.bend_z(0.0, -ez, math.radians(s.ear_curl), axis='X'))
        g.set_mats(e, [pal['ear']])
        g.place(e, loc=(side * s.ear_at[0], s.ear_at[1], s.ear_at[2]),
                rot=(0, -side * s.ear_out, 0))
        g.smooth(e, angle=60)
        out.append(e)
    return out


# ------------------------------------------------------------------ body

def _skeleton(s):
    """Joint heights in build units, head at the origin.

    Everything is expressed in head-heights (H) so the frame dials read the same
    way as src/crew/spec.ts: one measurement in metres, the rest proportions.
    """
    H = 2.0 * s.head[2]
    chin = -s.head[2] * s.head_chin
    crown = s.head[2]
    floor = crown - s.heads * H

    base_crotch = chin - 1.52 * H
    j = {
        'H': H,
        'chin': chin,
        'neck_top': chin - s.gap,
        'shoulder': chin - 0.20 * H,
        'chest': chin - 0.58 * H,
        'waist': chin - 1.06 * H,
        'hip': chin - 1.36 * H,
        'floor': floor,
    }
    # the leg dial moves the crotch, not the floor
    j['crotch'] = floor + (base_crotch - floor) * s.leg
    return j


def limb_joints(s, j):
    """Where the arm and leg joints sit, in build units.

    The mesh and the armature have to agree exactly or the skin slides off the
    bones, so both read the joints from here rather than each computing them.
    Blender convention: the figure faces -Y, so +X is its **left**.
    """
    H, gi, sh = j['H'], s.girth, s.shoulder
    out = {}
    for side, tag in ((1, 'L'), (-1, 'R')):
        top = Vector((side * 0.470 * H * sh, 0.01 * H, j['shoulder'] - 0.26 * H))
        if s.pose == 'sit':
            elbow = Vector((side * 0.58 * H * sh, 0.02 * H, j['waist'] - 0.08 * H))
            wrist = Vector((side * 0.47 * H * sh, -0.50 * H, j['hip'] - 0.02 * H))
        else:
            elbow = Vector((side * 0.615 * H * sh, -0.02 * H, j['waist'] - 0.14 * H))
            wrist = Vector((side * 0.655 * H * sh, 0.0, j['hip'] - 0.26 * H))

        hip = Vector((side * 0.185 * H, 0.0, j['crotch'] + 0.08 * H))
        stand_ankle = Vector((side * 0.200 * H, 0.0,
                              j['floor'] + 0.135 * H * s.foot))
        span = hip.z - stand_ankle.z
        thigh_len, shin_len = span * 0.52, span * 0.48
        if s.pose == 'sit':
            knee = hip + Vector((0.0, -thigh_len, -0.06 * H - s.seat_drop * H))
            ankle = knee + Vector((0.0, 0.10 * H, -shin_len))
        else:
            knee = Vector(((hip.x + stand_ankle.x) / 2, -0.025 * H,
                           hip.z - thigh_len))
            ankle = stand_ankle

        out[tag] = {
            'side': side,
            'top': top, 'elbow': elbow, 'wrist': wrist,
            'hand': wrist + (wrist - elbow).normalized() * (0.115 * H),
            'hip': hip, 'knee': knee, 'ankle': ankle,
            'toe': ankle + Vector((0.0, -0.24 * H * s.foot, -0.045 * H)),
        }
    return out


def _legs(s, pal, j):
    H, gi = j['H'], s.girth
    parts = []
    J = limb_joints(s, j)
    for tag in ('L', 'R'):
        side = J[tag]['side']
        hip, knee, ankle = J[tag]['hip'], J[tag]['knee'], J[tag]['ankle']

        thigh = g.link(f'{s.name}_thigh{side}', hip, knee,
                       0.183 * H * gi, 0.148 * H * gi, seg=26)
        calf = g.link(f'{s.name}_calf{side}', knee, ankle,
                      0.148 * H * gi, 0.108 * H * gi, seg=26)
        for ob in (thigh, calf):
            g.set_mats(ob, [pal['legs']])
        parts += [thigh, calf]

        foot = g.blob(f'{s.name}_foot{side}',
                      r=(0.132 * H, 0.255 * H * s.foot, 0.092 * H),
                      e=(0.60, 0.62), seg=36, ring=24,
                      profile=lambda t: 1.0 - 0.22 * max(0.0, t) ** 1.4)
        g.set_mats(foot, [pal['shoe']])
        g.place(foot, loc=(ankle.x, ankle.y - 0.085 * H * s.foot,
                           ankle.z - 0.045 * H))
        parts.append(foot)
    return parts


def _arms(s, pal, j, weld):
    """Arm, sleeve, and the two bits that stop it looking glued on.

    A capsule butted against a domed torso shows its intersection as a hard
    seam, and its end cap reads as a sausage. So: a deltoid mass bridges the
    shoulder into the sleeve, and a hem ring caps the sleeve where the capsule
    would otherwise round off.
    """
    H, gi, sh = j['H'], s.girth, s.shoulder
    parts = []
    J = limb_joints(s, j)
    for tag in ('L', 'R'):
        side = J[tag]['side']
        top, elbow, wrist = J[tag]['top'], J[tag]['elbow'], J[tag]['wrist']

        bare = s.collar == 'tee'
        skin_mat = pal['skin'] if bare else pal['cloth']

        upper = g.link(f'{s.name}_upper{side}', top, elbow,
                       0.150 * H * gi, 0.118 * H * gi, seg=26)
        fore = g.link(f'{s.name}_fore{side}', elbow, wrist,
                      0.118 * H * gi, 0.096 * H * gi, seg=26)
        for ob in (upper, fore):
            g.set_mats(ob, [skin_mat])
        parts += [upper, fore]

        # the deltoid: a rounded mass sitting over the joint, overlapping both
        # the torso and the sleeve so neither edge is ever visible
        delt = g.blob(f'{s.name}_delt{side}',
                      r=(0.170 * H * gi, 0.166 * H * gi, 0.164 * H * gi),
                      e=(0.86, 0.92), seg=36, ring=26)
        g.set_mats(delt, [pal['cloth']])
        g.place(delt, loc=(side * 0.452 * H * sh, 0.005 * H,
                           j['shoulder'] - 0.235 * H))
        weld.append(delt)

        if bare:
            axis = (elbow - top).normalized()
            cuff = top + (elbow - top) * s.sleeve
            sleeve = g.link(f'{s.name}_sleeve{side}',
                            top - axis * (0.03 * H), cuff,
                            0.166 * H * gi, 0.148 * H * gi, seg=26)
            g.set_mats(sleeve, [pal['cloth']])
            weld.append(sleeve)

            hem = g.torus(f'{s.name}_hem{side}', R=0.139 * H * gi,
                          r=0.020 * H * gi, squash=0.85, seg=40, ring=14)
            g.set_mats(hem, [pal['cloth']])
            hem.location = cuff
            hem.rotation_euler = axis.to_track_quat('Z', 'Y').to_euler()
            parts.append(hem)

        hand = g.blob(f'{s.name}_hand{side}', r=(0.105 * H, 0.088 * H, 0.130 * H),
                      e=(0.70, 0.75), seg=28, ring=20)
        g.set_mats(hand, [pal['skin']])
        g.place(hand, loc=J[tag]['hand'])
        parts.append(hand)
    return parts


def _body(s, pal, j):
    H, sh, wa = j['H'], s.shoulder, s.waist
    depth = 0.30 * H
    parts = []

    nr = 0.152 * H
    neck = g.blob(f'{s.name}_neck', r=(nr, nr * 0.95, 0.22 * H), e=(0.40, 1.0),
                  seg=32, ring=20)
    g.set_mats(neck, [pal['neck']])
    g.place(neck, loc=(0, 0.015 * H, j['neck_top'] - 0.14 * H))
    parts.append(neck)

    # the shirt stops at the hip; the pelvis below it is trousers, so the
    # figure reads as two garments rather than one long tunic
    # above the top of the thigh capsules, or their caps breach the hem and
    # the shirt edge renders as a tear
    hem = min(j['hip'] - 0.02 * H, j['crotch'] + 0.42 * H)
    # the shoulder line was a flat-topped slab with the arm caps stuck on the
    # corners; it needs to dome over instead
    torso = g.loft(f'{s.name}_torso', [
        (j['shoulder'] + 0.07 * H, 0.27 * H * sh, depth * 0.56),
        (j['shoulder'] + 0.03 * H, 0.45 * H * sh, depth * 0.84),
        (j['shoulder'] - 0.02 * H, 0.56 * H * sh, depth * 0.98),
        (j['shoulder'] - 0.08 * H, 0.585 * H * sh, depth),
        (j['chest'],               0.560 * H * sh, depth * 0.98),
        (j['waist'],               0.515 * H * wa, depth * 0.92),
        (j['hip'],                 0.530 * H * wa, depth * 0.94),
        (hem,                      0.535 * H * wa, depth * 0.92),
    ], p=0.78, seg=64)
    g.set_mats(torso, [pal['cloth']])
    weld = [torso]

    # A flat n-gon cap voxelises into stair steps, which is what made the hem
    # render as a torn edge. A rounded lip on the same superellipse profile
    # remeshes cleanly.
    lip = g.se_torus(f'{s.name}_hemlip', a=0.535 * H * wa, b=depth * 0.92,
                     p=0.78, tube=0.032 * H, seg=72, ring=16, squash=0.80)
    g.deform(lip, lambda co: Vector((co.x, co.z, -co.y)))
    g.set_mats(lip, [pal['cloth']])
    g.place(lip, loc=(0, 0, hem))
    weld.append(lip)

    # The trousers must sit clearly inside the shirt: at matching radii the two
    # lofts cross and the hem renders as a torn edge, and the remesh relaxes the
    # shirt inward a little on top of that.
    pelvis = g.loft(f'{s.name}_pelvis', [
        (hem + 0.16 * H, 0.430 * H * wa, depth * 0.70),
        (j['crotch'] + 0.14 * H, 0.455 * H * wa, depth * 0.76),
        (j['crotch'] + 0.02 * H, 0.425 * H * wa, depth * 0.72),
    ], p=0.76, seg=52)
    g.set_mats(pelvis, [pal['legs']])
    parts.append(pelvis)

    shoulder_z = j['shoulder']
    if s.collar == 'tee':
        band = g.torus(f'{s.name}_tee', R=nr * 1.30, r=nr * 0.16, squash=1.5,
                       seg=56, ring=16)
        g.set_mats(band, [pal['cloth']])
        g.place(band, loc=(0, 0.02 * H, shoulder_z + 0.075 * H), rot=(-5, 0, 0))
        weld.append(band)





    if s.pet_collar > 0:
        ring = g.torus(f'{s.name}_petcollar', R=nr * 1.12, r=s.pet_collar,
                       squash=1.0, seg=56, ring=18)
        g.set_mats(ring, [mats.plain(f'{s.name}_petc', s.accent, rough=0.45)])
        g.place(ring, loc=(0, 0.02 * H, j['neck_top'] - 0.11 * H), rot=(-4, 0, 0))
        parts.append(ring)
        tag = g.blob(f'{s.name}_tag', r=(s.pet_collar * 1.5,) * 2 +
                     (s.pet_collar * 0.45,), seg=22, ring=14)
        g.set_mats(tag, [mats.plain(f'{s.name}_tagm', (0.86, 0.70, 0.22),
                                    rough=0.25, coat=0.6)])
        g.place(tag, loc=(0, -nr * 1.16, j['neck_top'] - 0.20 * H), rot=(80, 0, 0))
        parts.append(tag)

    parts += _arms(s, pal, j, weld)
    parts += _legs(s, pal, j)

    for part in parts:
        g.smooth(part, angle=45)

    # torso, deltoids and sleeves are all one garment colour, so they can be
    # welded into a single skin — which is the only way the shoulder stops
    # reading as parts pushed into each other
    parts.append(g.fuse(f'{s.name}_garment', weld,
                        voxel=0.0090 * H, relax=2, mat=pal['cloth']))
    return parts


def _extras(s, pal):
    out = []
    hx, hy, hz = s.head
    if 'handle' in s.extras:
        # a carry handle hanging off the bottom edge, seen face on
        h = g.tube(f'{s.name}_handle', out=(0.125, 0.150), inn=(0.088, 0.112),
                   depth=0.026, p=0.34, seg=72)
        g.set_mats(h, [pal['card']])
        g.place(h, loc=(0, -hy * 0.90, -hz * 0.92), rot=(14, 0, 0))
        g.smooth(h, angle=35)
        out.append(h)
    if 'fold' in s.extras:
        # the folded-over top of the bag, tipped a few degrees off true
        f = g.blob(f'{s.name}_fold', r=(hx * 1.02, hy * 1.02, hz * 0.10),
                   e=(0.18, 0.24), seg=64, ring=24)
        g.set_mats(f, [pal['shell']])
        g.place(f, loc=(-0.012, 0.010, hz * 0.94), rot=(1.5, 0, 2.5))
        g.smooth(f, angle=30)
        out.append(f)
    return out


# ------------------------------------------------------------------ entry

def build(s):
    pal = _palette(s)
    if s.shell == 'bare':
        # what is under the mask, for the sake of knowing
        parts = [_face(s, pal, shrink=0.0)]
        head = parts[0]
    else:
        head = _head_shell(s, pal)
        _sockets(s, head)
        g.smooth(head, angle=34 if s.shell == 'paper' else 55)
        parts = [head, _face(s, pal)]
    face = parts[-1]
    for side in (-1, 1):
        parts += _eye(s, pal, side, face)
    if s.shell != 'bare':
        parts += _rims(s, pal)
    parts += _ears(s, pal)
    parts += _hat(s, pal)
    parts += _hair(s, pal)
    parts += _muzzle(s, pal)
    parts += _nose(s, pal)
    parts += _earrings(s, pal)
    parts += _cig(s, pal)
    parts += _glasses(s, pal)
    parts += _beard(s, pal)
    parts += _tache(s, pal)
    parts += _mouth(s, pal)
    parts += _cans(s, pal)
    parts += _extras(s, pal)

    rig = bpy.data.objects.new(f'{s.name}_rig', None)
    bpy.context.scene.collection.objects.link(rig)
    for p in parts:
        p.parent = rig
        p.matrix_parent_inverse = rig.matrix_world.inverted()
    rig.rotation_euler = (math.radians(s.head_lean), 0, 0)

    j = _skeleton(s)
    body = _body(s, pal, j)

    # one root so the whole figure can be scaled and landed as a unit
    root = bpy.data.objects.new(f'{s.name}_root', None)
    bpy.context.scene.collection.objects.link(root)
    for ob in [rig] + body:
        ob.parent = root
    return {'root': root, 'rig': rig, 'head': head, 'parts': parts,
            'body': body, 'joints': j}


def finish(fig, s):
    """Scale to metres and land the figure with its soles on z = 0.

    The pose is not trusted to land itself — the built figure is measured and
    dropped, the same way src/crew/pose.ts solves for the floor.
    """
    root = fig['root']
    H = fig['joints']['H']
    k = s.height / (s.heads * H)
    root.scale = (k, k, k)
    bpy.context.view_layer.update()
    meshes = [o for o in bpy.data.objects if o.type == 'MESH' and o.name != 'backdrop']
    lo, hi = g.bounds(meshes)
    root.location.z -= lo.z
    bpy.context.view_layer.update()
    # cushion height is measured from the landed floor, not from the head
    seat = None
    if s.pose == 'sit':
        seat = fig['joints']['crotch'] * k + root.location.z
    return {'scale': k, 'height': hi.z - lo.z, 'seat': seat}
