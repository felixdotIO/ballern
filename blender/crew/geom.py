"""Mesh primitives built from math, not bpy.ops.

Everything is a dense quad grid generated analytically so that later steps
(deform, boolean, material tagging) are deterministic and don't depend on
modifier evaluation order or editmode context.
"""

import math

import bpy
from mathutils import Vector


# ---------------------------------------------------------------- utilities

def _obj(name, verts, faces):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.validate()
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def _sc(w, m):
    c = math.cos(w)
    return math.copysign(abs(c) ** m, c)


def _ss(w, m):
    s = math.sin(w)
    return math.copysign(abs(s) ** m, s)


# --------------------------------------------------------------- primitives

def blob(name, r=(1, 1, 1), e=(1.0, 1.0), seg=72, ring=40, profile=None):
    """Superellipsoid. e near 1 is a sphere, e near 0.25 is a rounded box.

    profile(t) -> xy scale, where t is the vertical parameter in [-1, 1].
    """
    rx, ry, rz = r
    e1, e2 = e
    verts, faces, rows = [], [], []

    for i in range(1, ring):
        u = -math.pi / 2 + math.pi * i / ring
        cu, su = _sc(u, e1), _ss(u, e1)
        z = rz * su
        s = profile(su) if profile else 1.0
        row = []
        for j in range(seg):
            v = -math.pi + 2 * math.pi * j / seg
            verts.append((rx * cu * _sc(v, e2) * s, ry * cu * _ss(v, e2) * s, z))
            row.append(len(verts) - 1)
        rows.append(row)

    south = len(verts)
    verts.append((0, 0, -rz))
    north = len(verts)
    verts.append((0, 0, rz))

    for a, b in zip(rows, rows[1:]):
        for j in range(seg):
            k = (j + 1) % seg
            faces.append((a[j], a[k], b[k], b[j]))
    for j in range(seg):
        k = (j + 1) % seg
        faces.append((south, rows[0][k], rows[0][j]))
        faces.append((north, rows[-1][j], rows[-1][k]))

    return _obj(name, verts, faces)


def cap(name, r=1.0, half_angle=90.0, seg=64, ring=20):
    """Spherical cap opening around +Z, used for eyelids."""
    a0 = math.radians(90.0 - half_angle)
    verts, faces, rows = [], [], []
    for i in range(ring + 1):
        u = a0 + (math.pi / 2 - a0) * i / ring
        cu, su = math.cos(u), math.sin(u)
        if i == ring:
            break
        row = []
        for j in range(seg):
            v = 2 * math.pi * j / seg
            verts.append((r * cu * math.cos(v), r * cu * math.sin(v), r * su))
            row.append(len(verts) - 1)
        rows.append(row)
    top = len(verts)
    verts.append((0, 0, r))
    for a, b in zip(rows, rows[1:]):
        for j in range(seg):
            k = (j + 1) % seg
            faces.append((a[j], a[k], b[k], b[j]))
    for j in range(seg):
        k = (j + 1) % seg
        faces.append((top, rows[-1][j], rows[-1][k]))
    return _obj(name, verts, faces)


def prism(name, a=1.0, b=1.0, y=(-1.0, 0.0), p=0.45, seg=64, taper=1.0):
    """Superellipse cross-section in XZ, extruded along Y from y[0] to y[1].

    p == 1 is an ellipse, p -> 0 approaches a rectangle. The origin sits at
    y == 0, so eye cutters can pivot around the socket floor.
    """
    y0, y1 = y
    verts, faces = [], []
    front, back = [], []
    for j in range(seg):
        t = 2 * math.pi * j / seg
        x, z = a * _sc(t, p), b * _ss(t, p)
        verts.append((x, y0, z))
        front.append(len(verts) - 1)
        verts.append((x * taper, y1, z * taper))
        back.append(len(verts) - 1)
    for j in range(seg):
        k = (j + 1) % seg
        faces.append((front[j], back[j], back[k], front[k]))
    cf = len(verts)
    verts.append((0, y0, 0))
    cb = len(verts)
    verts.append((0, y1, 0))
    for j in range(seg):
        k = (j + 1) % seg
        faces.append((cf, front[k], front[j]))
        faces.append((cb, back[j], back[k]))
    ob = _obj(name, verts, faces)
    ob["se"] = (a, b, y0, y1, p, taper)
    return ob


def torus(name, R=1.0, r=0.3, squash=1.0, seg=72, ring=28):
    """Ring around the Z axis. squash flattens the tube vertically."""
    verts, faces, rows = [], [], []
    for i in range(seg):
        u = 2 * math.pi * i / seg
        cu, su = math.cos(u), math.sin(u)
        row = []
        for j in range(ring):
            v = 2 * math.pi * j / ring
            rad = R + r * math.cos(v)
            verts.append((rad * cu, rad * su, r * math.sin(v) * squash))
            row.append(len(verts) - 1)
        rows.append(row)
    for i in range(seg):
        a, b = rows[i], rows[(i + 1) % seg]
        for j in range(ring):
            k = (j + 1) % ring
            faces.append((a[j], a[k], b[k], b[j]))
    return _obj(name, verts, faces)


def tube(name, out=(1.0, 1.0), inn=(0.8, 0.8), depth=0.2, p=0.5, seg=72):
    """Flat closed ring (the paper-bag handle), superellipse profile in XZ."""
    verts, faces = [], []
    o_f, o_b, i_f, i_b = [], [], [], []
    for j in range(seg):
        t = 2 * math.pi * j / seg
        ox, oz = _sc(t, p), _ss(t, p)
        for scale, lf, lb in ((out, o_f, o_b), (inn, i_f, i_b)):
            x, z = scale[0] * ox, scale[1] * oz
            verts.append((x, -depth / 2, z))
            lf.append(len(verts) - 1)
            verts.append((x, depth / 2, z))
            lb.append(len(verts) - 1)
    for j in range(seg):
        k = (j + 1) % seg
        faces.append((o_f[j], o_b[j], o_b[k], o_f[k]))       # outer wall
        faces.append((i_f[k], i_b[k], i_b[j], i_f[j]))       # inner wall
        faces.append((o_f[k], i_f[k], i_f[j], o_f[j]))       # front face
        faces.append((o_b[j], i_b[j], i_b[k], o_b[k]))       # back face
    return _obj(name, verts, faces)


# ------------------------------------------------------------------ editing

def deform(ob, fn):
    """Move every vertex through fn(Vector) -> Vector, in local space."""
    for v in ob.data.vertices:
        v.co = fn(Vector(v.co))
    ob.data.update()


def bend_z(t0, t1, amount, axis='X'):
    """Progressive rotation applied as height goes from t0 to t1. For ears."""
    def fn(co):
        f = max(0.0, min(1.0, (co.z - t0) / (t1 - t0) if t1 != t0 else 0.0))
        ang = amount * f * f
        c, s = math.cos(ang), math.sin(ang)
        if axis == 'X':
            return Vector((co.x, co.y * c - co.z * s, co.y * s + co.z * c))
        return Vector((co.x * c - co.z * s, co.y, co.x * s + co.z * c))
    return fn


def place(ob, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    ob.location = loc
    ob.rotation_euler = [math.radians(a) for a in rot]
    ob.scale = scale
    return ob


def apply_mods(ob):
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    old = ob.data
    ob.data = me
    ob.modifiers.clear()
    if old.users == 0:
        bpy.data.meshes.remove(old)
    return ob


def cut(ob, cutter, keep=False):
    m = ob.modifiers.new('cut', 'BOOLEAN')
    m.operation = 'DIFFERENCE'
    m.solver = 'EXACT'
    m.object = cutter
    apply_mods(ob)
    if not keep:
        cutter.hide_render = True
        cutter.hide_viewport = True
    return ob


def solidify(ob, thickness, offset=-1.0):
    m = ob.modifiers.new('solid', 'SOLIDIFY')
    m.thickness = thickness
    m.offset = offset
    return apply_mods(ob)


def smooth(ob, angle=38.0):
    for p in ob.data.polygons:
        p.use_smooth = True
    if angle is not None:
        m = ob.modifiers.new('split', 'EDGE_SPLIT')
        m.split_angle = math.radians(angle)
        m.use_edge_angle = True
    return ob


def set_mats(ob, mats):
    ob.data.materials.clear()
    for m in mats:
        ob.data.materials.append(m)
    return ob


def link(name, p0, p1, r0, r1, seg=28, cap=6, body=4):
    """A tapered capsule from p0 to p1. The limb primitive."""
    p0, p1 = Vector(p0), Vector(p1)
    axis = p1 - p0
    length = axis.length
    rows = []                                   # (z, radius), radius > 0 only
    for i in range(1, cap + 1):
        a = math.pi / 2 * (cap - i) / cap
        rows.append((-r0 * math.sin(a), r0 * math.cos(a)))
    for j in range(1, body + 1):
        t = j / body
        rows.append((t * length, r0 + (r1 - r0) * t))
    for i in range(1, cap):
        a = math.pi / 2 * i / cap
        rows.append((length + r1 * math.sin(a), r1 * math.cos(a)))

    verts, faces, idx = [], [], []
    for z, rad in rows:
        ring = []
        for j in range(seg):
            t = 2 * math.pi * j / seg
            verts.append((rad * math.cos(t), rad * math.sin(t), z))
            ring.append(len(verts) - 1)
        idx.append(ring)
    lo = len(verts)
    verts.append((0, 0, -r0))
    hi = len(verts)
    verts.append((0, 0, length + r1))

    for a, b in zip(idx, idx[1:]):
        for j in range(seg):
            k = (j + 1) % seg
            faces.append((a[j], a[k], b[k], b[j]))
    for j in range(seg):
        k = (j + 1) % seg
        faces.append((lo, idx[0][k], idx[0][j]))
        faces.append((hi, idx[-1][j], idx[-1][k]))

    ob = _obj(name, verts, faces)
    ob.location = p0
    if length > 1e-6:
        ob.rotation_euler = axis.to_track_quat('Z', 'Y').to_euler()
    return ob


def bounds(obs):
    """World-space bounding box over a set of objects."""
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for ob in obs:
        if ob.type != 'MESH':
            continue
        mw = ob.matrix_world
        for corner in ob.bound_box:
            p = mw @ Vector(corner)
            for i in range(3):
                lo[i] = min(lo[i], p[i])
                hi[i] = max(hi[i], p[i])
    return lo, hi


def loft(name, rings, p=0.55, seg=48):
    """Stack of superellipse cross-sections: [(z, rx, ry), ...]. The torso."""
    verts, faces, rows = [], [], []
    for z, rx, ry in rings:
        row = []
        for j in range(seg):
            t = 2 * math.pi * j / seg
            verts.append((rx * _sc(t, p), ry * _ss(t, p), z))
            row.append(len(verts) - 1)
        rows.append(row)
    for a, b in zip(rows, rows[1:]):
        for j in range(seg):
            k = (j + 1) % seg
            faces.append((a[j], a[k], b[k], b[j]))
    lo = len(verts)
    verts.append((0, 0, rings[0][0]))
    hi = len(verts)
    verts.append((0, 0, rings[-1][0]))
    for j in range(seg):
        k = (j + 1) % seg
        faces.append((lo, rows[0][k], rows[0][j]))
        faces.append((hi, rows[-1][j], rows[-1][k]))
    return _obj(name, verts, faces)


def se_torus(name, a=1.0, b=1.0, p=0.45, tube=0.05, seg=72, ring=20, squash=1.0,
             span=None):
    """Tube swept along a superellipse in the XZ plane, opening along Y.

    The sculpted rim around an eye hole: a rounded-rectangle collar that stands
    proud of the mask instead of being a flat cut.
    """
    def path(t):
        return Vector((a * _sc(t, p), 0.0, b * _ss(t, p)))

    t0, t1 = span if span else (0.0, 2 * math.pi)
    closed = span is None
    n = seg if closed else seg + 1
    verts, faces, rows = [], [], []
    for i in range(n):
        t = t0 + (t1 - t0) * (i / seg if closed else i / seg)
        pt = path(t)
        tan = (path(t + 1e-3) - path(t - 1e-3)).normalized()
        nrm = Vector((tan.z, 0.0, -tan.x)).normalized()
        up = Vector((0.0, 1.0, 0.0))
        row = []
        for j in range(ring):
            v = 2 * math.pi * j / ring
            q = pt + nrm * (tube * math.cos(v)) + up * (tube * math.sin(v) * squash)
            verts.append(tuple(q))
            row.append(len(verts) - 1)
        rows.append(row)
    for i in range(len(rows) if closed else len(rows) - 1):
        r0, r1 = rows[i], rows[(i + 1) % len(rows)]
        for j in range(ring):
            k = (j + 1) % ring
            faces.append((r0[j], r0[k], r1[k], r1[j]))
    if not closed:                       # cap the open ends of an arc
        for row, flip in ((rows[0], False), (rows[-1], True)):
            c = len(verts)
            mid = Vector((0.0, 0.0, 0.0))
            for i in row:
                mid += Vector(verts[i])
            verts.append(tuple(mid / len(row)))
            for j in range(ring):
                k = (j + 1) % ring
                faces.append((c, row[k], row[j]) if flip else (c, row[j], row[k]))
    return _obj(name, verts, faces)


def rib_relief(ob, ribs, amp, fade=(0.55, 0.95), extent=1.0, floor=None):
    """Push real rib ridges into a mesh along its own normals.

    A bump map cannot break a silhouette; at the edge of a head that is exactly
    where the knit has to read, so the ribs are cut into the geometry instead.
    """
    n = max(1, int(round(ribs)))
    me = ob.data
    me.calc_loop_triangles()
    normals = [v.normal.copy() for v in me.vertices]
    lo, hi = (fade[0] * extent, fade[1] * extent) if fade else (0.0, 0.0)
    for i, v in enumerate(me.vertices):
        co = Vector(v.co)
        theta = math.atan2(co.y, co.x)
        wave = 0.5 - 0.5 * math.cos(n * theta)
        if fade is None:
            damp = 1.0
        else:
            t = (abs(co.z) - lo) / max(1e-6, hi - lo)
            damp = 1.0 - max(0.0, min(1.0, t)) ** 1.0
            damp = damp * damp * (3 - 2 * damp)
        if floor is not None and co.z < floor:
            damp *= max(0.0, 1.0 - (floor - co.z) / (0.25 * extent))
        v.co = co + normals[i] * (amp * (wave - 0.45) * damp)
    me.update()
    return ob


def fuse(name, obs, voxel=0.014, relax=3, mat=None):
    """Weld several objects into one continuous surface.

    Overlapping primitives leave a crease along their intersection curve no
    matter how far you push them into each other — which is what makes a
    shoulder read as a ball stuck on a box. A voxel remesh throws the
    intersection away and rebuilds one skin, so the joint gets a real fillet.
    Everything fused has to share a material; the remesh keeps only one.
    """
    bpy.ops.object.select_all(action='DESELECT')
    for ob in obs:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    bpy.ops.object.join()
    whole = bpy.context.view_layer.objects.active
    whole.name = name

    m = whole.modifiers.new('remesh', 'REMESH')
    m.mode = 'VOXEL'
    m.voxel_size = voxel
    m.use_smooth_shade = True
    apply_mods(whole)

    if relax:
        sm = whole.modifiers.new('relax', 'SMOOTH')
        sm.factor = 1.0
        sm.iterations = relax
        apply_mods(whole)

    if mat:
        set_mats(whole, [mat])
    for p in whole.data.polygons:
        p.use_smooth = True
    return whole
