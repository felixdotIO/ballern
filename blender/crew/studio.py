"""Neutral seamless studio: soft key, broad fill, square portrait crop."""

import math

import bpy
from mathutils import Vector

from . import geom as g
from . import mats


def wipe():
    for coll in (bpy.data.objects, bpy.data.meshes, bpy.data.materials,
                 bpy.data.lights, bpy.data.cameras):
        for item in list(coll):
            coll.remove(item, do_unlink=True)


def seamless(y_wall=3.4, z_floor=-3.4, radius=1.6, width=11.0, mat=None):
    """Curved cyclorama swept along X."""
    pts = [(-10.0, z_floor), (y_wall - radius, z_floor)]
    for i in range(1, 13):
        a = math.pi / 2 * i / 12
        pts.append((y_wall - radius + radius * math.sin(a),
                    z_floor + radius * (1 - math.cos(a))))
    pts.append((y_wall, 10.0))

    verts, faces = [], []
    for x in (-width, width):
        for y, z in pts:
            verts.append((x, y, z))
    n = len(pts)
    for i in range(n - 1):
        faces.append((i, i + 1, n + i + 1, n + i))
    me = bpy.data.meshes.new('backdrop')
    me.from_pydata(verts, [], faces)
    me.validate()
    ob = bpy.data.objects.new('backdrop', me)
    bpy.context.scene.collection.objects.link(ob)
    for p in ob.data.polygons:
        p.use_smooth = True
    ob.data.materials.append(mat or mats.backdrop('backdrop'))
    return ob


def stage(aim=(0, 0, 0.95)):
    """Metre-scale stage for a landed full figure: floor at z = 0."""
    seamless(y_wall=2.9, z_floor=0.0, radius=1.1, width=9.0)
    out = [
        _area('key', (-2.5, -2.8, 2.9), aim, 3.6, 300.0),
        _area('fill', (2.9, -2.4, 1.0), aim, 4.2, 85.0),
        _area('rim', (1.5, 2.0, 2.7), aim, 1.6, 110.0),
        _area('wash', (0.0, -2.6, 1.2), (0, 2.7, 1.2), 7.0, 65.0, spread=100),
    ]
    world = bpy.data.worlds.new('w')
    bpy.context.scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes['Background']
    bg.inputs[0].default_value = (0.62, 0.63, 0.66, 1)
    bg.inputs[1].default_value = 0.08
    return out


def _area(name, loc, aim, size, power, shape='SQUARE', size_y=None, spread=None):
    d = bpy.data.lights.new(name, 'AREA')
    d.shape = shape
    d.size = size
    if size_y:
        d.size_y = size_y
    d.energy = power
    if spread is not None:
        d.spread = math.radians(spread)
    ob = bpy.data.objects.new(name, d)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = loc
    direction = (Vector(aim) - Vector(loc)).normalized()
    ob.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    return ob


def lights(key=310.0, fill=52.0, rim=118.0, wash=48.0, ambient=0.06,
           aim=(0, 0, -0.05), scale=1.0):
    out = [
        _area('key', (-2.9, -3.3, 2.30), aim, 4.2, key * scale),
        _area('fill', (3.3, -2.7, 0.10), aim, 5.0, fill * scale),
        _area('rim', (1.7, 2.0, 2.60), aim, 1.8, rim * scale),
        _area('wash', (0.0, -3.0, 0.60), (0, 3.2, 0.4), 8.0, wash * scale,
              spread=100),
    ]
    world = bpy.data.worlds.new('w')
    bpy.context.scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes['Background']
    bg.inputs[0].default_value = (0.62, 0.63, 0.66, 1)
    bg.inputs[1].default_value = ambient
    return out


def camera(dist=4.6, lens=85.0, look=(0, 0, -0.22), height=None, orbit=0.0):
    d = bpy.data.cameras.new('cam')
    d.lens = lens
    ob = bpy.data.objects.new('cam', d)
    bpy.context.scene.collection.objects.link(ob)
    a = math.radians(orbit)
    z = look[2] if height is None else height
    loc = Vector((math.sin(a) * dist, -math.cos(a) * dist, z))
    ob.location = loc
    ob.rotation_euler = (Vector(look) - loc).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.camera = ob
    return ob


def render(path, res=900, samples=128, transparent=False, view='Standard',
           look=None, exposure=-0.5, bounces=5, res_y=None):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'GPU'
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'METAL'
    prefs.get_devices()
    for dev in prefs.devices:
        dev.use = dev.type == 'METAL'

    sc.cycles.samples = samples
    sc.cycles.use_adaptive_sampling = True
    sc.cycles.adaptive_threshold = 0.012
    sc.cycles.use_denoising = True
    sc.cycles.denoiser = 'OPENIMAGEDENOISE'
    sc.cycles.max_bounces = bounces
    sc.cycles.diffuse_bounces = bounces
    sc.cycles.glossy_bounces = 2
    sc.cycles.transmission_bounces = 2
    sc.cycles.caustics_reflective = False
    sc.cycles.caustics_refractive = False
    sc.view_settings.exposure = exposure

    sc.render.resolution_x = res
    sc.render.resolution_y = res_y or res
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = transparent
    sc.render.filter_size = 1.4
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA' if transparent else 'RGB'

    try:
        sc.view_settings.view_transform = view
    except TypeError:
        sc.view_settings.view_transform = 'Standard'
    if look:
        try:
            sc.view_settings.look = look
        except TypeError:
            print('  (look not available:', look, ')')

    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path
