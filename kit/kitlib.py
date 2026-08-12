"""
Shared helpers for the Blender kit.

Every asset is built by a script rather than sculpted by hand, for the same
reason the room is: a dimension changes in one place and the whole kit can be
regenerated. Nothing here needs the GUI — these run under
`blender --background --python`.

The modelling approach throughout is bevel-then-subdivide. A bevel puts a real
chamfer on every edge so it catches a highlight, and a single subdivision level
on top rounds the result without turning flat panels into blobs. That
combination is what separates furniture from boxes, and it is why this is worth
doing in Blender at all rather than in code.
"""

import math
import bmesh
import bpy
from mathutils import Euler, Vector


# ---------------------------------------------------------------------------
# Scene
# ---------------------------------------------------------------------------

def reset():
    """Empty scene, metric units, nothing inherited from preferences."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.length_unit = 'METERS'


def link(obj):
    bpy.context.collection.objects.link(obj)
    return obj


# ---------------------------------------------------------------------------
# Primitives
# ---------------------------------------------------------------------------

def mesh_from_bmesh(bm, name):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return link(bpy.data.objects.new(name, me))


def box(name, size, location=(0, 0, 0), cuts=0):
    """
    Axis-aligned box, centred on `location`. size is (x, y, z).

    `cuts` adds loop cuts. Anything that will be curved afterwards needs them:
    shaping an 8-vertex cube into an arc produces a chevron, not a curve.
    """
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    if cuts:
        bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=cuts, use_grid_fill=True)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector(location), verts=bm.verts)
    return mesh_from_bmesh(bm, name)


def cylinder(name, radius, depth, location=(0, 0, 0), segments=24, radius_top=None, rotation=None):
    """
    Z-aligned cylinder. `radius_top` makes it a truncated cone.

    `rotation` is applied in mesh space *before* the translation, in degrees.
    That ordering matters: rotating the object afterwards spins it about the
    object origin, which for an offset mesh swings it clear across the scene
    rather than turning it in place.
    """
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm,
        cap_ends=True,
        cap_tris=False,
        segments=segments,
        radius1=radius,
        radius2=radius if radius_top is None else radius_top,
        depth=depth,
    )
    if rotation:
        bmesh.ops.rotate(
            bm,
            verts=bm.verts,
            cent=(0, 0, 0),
            matrix=Euler([math.radians(a) for a in rotation], 'XYZ').to_matrix(),
        )
    bmesh.ops.translate(bm, vec=Vector(location), verts=bm.verts)
    return mesh_from_bmesh(bm, name)


def taper(obj, axis='X', at=1, scale=(1.0, 1.0), shift=0.0):
    """
    Squeeze the verts at one end of an object.

    `at` is +1 for the positive end of `axis`, -1 for the negative. `scale` is
    applied to the two remaining axes, `shift` moves that end along Z. This is
    how the star base arms get their taper and their downward tip.
    """
    idx = 'XYZ'.index(axis)
    others = [i for i in range(3) if i != idx]
    me = obj.data
    extreme = max((v.co[idx] * at for v in me.vertices))
    for v in me.vertices:
        if abs(v.co[idx] * at - extreme) < 1e-5:
            v.co[others[0]] *= scale[0]
            v.co[others[1]] *= scale[1]
            v.co[2] += shift
    return obj


def arc(obj, along='X', into='Y', amount=0.04, power=2.0):
    """
    Bow a mesh: displace along one axis as a power of the normalised position
    along another. This is the backrest wrap and the seat's side bolsters.

    Done as explicit vertex maths rather than with a Simple Deform modifier —
    that modifier's axis semantics depend on the object's origin and rest
    orientation, and getting it subtly wrong is invisible until the asset is in
    the game. This is exact.
    """
    ai = 'XYZ'.index(along)
    bi = 'XYZ'.index(into)
    span = max((abs(v.co[ai]) for v in obj.data.vertices), default=0.0)
    if span < 1e-6:
        return obj
    for v in obj.data.vertices:
        t = abs(v.co[ai]) / span
        v.co[bi] += amount * (t ** power)
    return obj


# ---------------------------------------------------------------------------
# Modifiers
# ---------------------------------------------------------------------------

def bevel(obj, width=0.004, segments=2, angle=50):
    m = obj.modifiers.new(name="Bevel", type='BEVEL')
    m.width = width
    m.segments = segments
    m.limit_method = 'ANGLE'
    m.angle_limit = math.radians(angle)
    m.harden_normals = False
    return obj


def subsurf(obj, levels=1):
    m = obj.modifiers.new(name="Subdivision", type='SUBSURF')
    m.levels = levels
    m.render_levels = levels
    return obj


def soften(obj, bevel_width=0.012, segments=3, sub=1):
    """
    Upholstery treatment: a wide chamfer then one subdivision.

    Foam has no sharp edges but it is not a sphere either — the panel faces stay
    flat and only the rim rolls over. Subdividing without the bevel first turns
    a seat cushion into a pillow.
    """
    bevel(obj, width=bevel_width, segments=segments, angle=60)
    subsurf(obj, sub)
    shade_smooth(obj)
    return obj


def shade_smooth(obj, angle=35):
    """
    Smooth shading with a sharp-edge angle threshold.

    Blender 5 has no SMOOTH_BY_ANGLE modifier — it is a geometry-nodes asset
    driven by an operator, so this goes through the operator and falls back to
    plain smooth shading if that is unavailable.
    """
    for poly in obj.data.polygons:
        poly.use_smooth = True
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    try:
        bpy.ops.object.shade_auto_smooth(angle=math.radians(angle))
    except (RuntimeError, AttributeError, TypeError):
        pass
    return obj


# ---------------------------------------------------------------------------
# Duplication
# ---------------------------------------------------------------------------

def radial(obj, count, axis='Z'):
    """
    Copy an object evenly around an axis. Used for the five-star base and its
    castors, which is the one place in a chair where perfect repetition is
    correct — it is a single moulding.
    """
    made = [obj]
    for i in range(1, count):
        dup = obj.copy()
        dup.data = obj.data.copy()
        link(dup)
        dup.rotation_euler['XYZ'.index(axis)] = (i / count) * math.tau
        made.append(dup)
    return made


def apply_modifiers(objs):
    """
    Bake every modifier stack down to mesh data.

    This has to happen before any join: joining keeps only the *active*
    object's modifiers and throws the rest away, so every bevel and
    subdivision on the other parts would silently disappear.
    """
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.convert(target='MESH')
    return list(bpy.context.selected_objects)


def join(objs, name):
    baked = apply_modifiers(objs)
    bpy.ops.object.select_all(action='DESELECT')
    for o in baked:
        o.select_set(True)
    bpy.context.view_layer.objects.active = baked[0]
    bpy.ops.object.join()
    joined = bpy.context.active_object
    joined.name = name
    return joined


# ---------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------

def material(name, color, roughness=0.6, metallic=0.0):
    """
    Named to match the palette on the game side, so a chair's fabric can be
    recoloured per instance without hunting through mesh indices.
    """
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    return mat


def assign(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    return obj


def srgb(hex_value):
    """Hex to linear float triple, which is what Blender's inputs expect."""
    def channel(c):
        c = c / 255.0
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (
        channel((hex_value >> 16) & 0xFF),
        channel((hex_value >> 8) & 0xFF),
        channel(hex_value & 0xFF),
    )


# ---------------------------------------------------------------------------
# Verification
# ---------------------------------------------------------------------------

def evaluated_min_z(obj):
    """Lowest world-space point of the *posed* mesh."""
    bpy.context.view_layer.update()
    deps = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(deps)
    me = ev.to_mesh()
    z = min((obj.matrix_world @ v.co).z for v in me.vertices)
    ev.to_mesh_clear()
    return z


def ground(objs, measure):
    """
    Drop a group of objects so the measured one rests on z = 0.

    Derived rather than hardcoded: posing a standing figure into a seat leaves
    it hanging in mid-air by whatever the pose happens to work out to, and a
    literal offset would silently go stale the moment the pose changes.
    """
    drop = evaluated_min_z(measure)
    for ob in objs:
        ob.location.z -= drop
    bpy.context.view_layer.update()
    return drop


def assert_bounds(obj, expect):
    """
    Fail the build if an asset does not match its intended dimensions.

    Assets that quietly drift from metrics.ts are the worst class of bug here:
    nothing errors, the chair just sits slightly wrong under every desk and the
    room looks off for reasons nobody can point at. Better to refuse to export.
    """
    # Measure the *evaluated* mesh, not the rest data. `object.bound_box` does
    # not reliably reflect an armature pose, so on a skinned character the gate
    # would quietly stop meaning anything at exactly the point it matters most.
    bpy.context.view_layer.update()
    deps = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(deps)
    me = ev.to_mesh()
    corners = [obj.matrix_world @ v.co for v in me.vertices]
    ev.to_mesh_clear()
    xs = [c.x for c in corners]
    ys = [c.y for c in corners]
    zs = [c.z for c in corners]
    actual = {
        "width": max(xs) - min(xs),
        "depth": max(ys) - min(ys),
        "height": max(zs) - min(zs),
        "floor": min(zs),
    }
    problems = []
    for key, (lo, hi) in expect.items():
        got = actual[key]
        if not (lo <= got <= hi):
            problems.append(f"{key}={got:.3f} outside [{lo}, {hi}]")
    print("KIT_BOUNDS", {k: round(v, 4) for k, v in actual.items()})
    if problems:
        raise SystemExit("KIT_BOUNDS_FAIL " + "; ".join(problems))
    return actual


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------

def _write(objs, path):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        export_apply=True,          # bake the modifier stack
        export_yup=True,            # three's convention
        use_selection=True,
        export_normals=True,
        export_texcoords=True,
        export_materials='EXPORT',
    )


def export(path, name=None, obj=None, lod=0.25):
    """
    Write the asset, plus a decimated variant beside it as `<stem>-low.glb`.

    Almost every prop in this room is background: a chair six metres away is
    visually identical at a quarter of the triangles, and there are twenty-odd
    of them. Generating the low variant here rather than by hand means it can
    never drift out of sync with the asset it stands in for.
    """
    target = obj or bpy.context.active_object
    _write([target], path)
    print("KIT_EXPORT_OK", name or path, path)

    if lod and lod < 1.0:
        low = target.copy()
        low.data = target.data.copy()
        link(low)
        m = low.modifiers.new(name="Decimate", type='DECIMATE')
        m.decimate_type = 'COLLAPSE'
        m.ratio = lod
        m.use_collapse_triangulate = True
        low_path = path[:-4] + "-low.glb" if path.endswith(".glb") else path + "-low.glb"
        _write([low], low_path)
        print("KIT_EXPORT_OK", (name or path) + " (lod)", low_path)
