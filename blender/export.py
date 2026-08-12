"""Export a character as GLB, at game scale, ready for three.js.

    blender -b --factory-startup -P blender/export.py -- --who pip --pose sit

Metres, soles on y = 0, +Y up, facing -Z (three.js convention — the glTF
exporter does the Z-up to Y-up rotation). glTF splits by material, so the game gets one node with a
primitive per colour — 10-11 draw calls, not one.

Procedural bump (the knit rib, the paper creases) does not survive glTF; the
masks export as flat colour. Baking those to a normal map is the next step.
"""

import argparse
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import bpy                            # noqa: E402
from crew import build as B           # noqa: E402
from crew import geom as g            # noqa: E402
from crew import studio               # noqa: E402
from crew.cast import CAST            # noqa: E402


def counts(obs):
    v = t = 0
    for ob in obs:
        if ob.type != 'MESH':
            continue
        v += len(ob.data.vertices)
        t += sum(len(p.vertices) - 2 for p in ob.data.polygons)
    return v, t


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument('--who', default='pip')
    ap.add_argument('--pose', default=None)
    ap.add_argument('--out', default=None)
    ap.add_argument('--decimate', type=float, default=0.0,
                    help='collapse ratio, e.g. 0.4; 0 leaves the mesh alone')
    a = ap.parse_args(argv)

    spec = CAST[a.who]
    if a.pose:
        spec = spec.tweak(pose=a.pose)

    studio.wipe()
    fig = B.build(spec)
    info = B.finish(fig, spec)

    # a linked Base Color exports as white, so flatten to the recorded value
    for m in bpy.data.materials:
        if 'flat' not in m or not m.use_nodes:
            continue
        b = m.node_tree.nodes.get('Principled BSDF')
        if not b:
            continue
        sock = b.inputs['Base Color']
        for link in list(sock.links):
            m.node_tree.links.remove(link)
        sock.default_value = (*m['flat'], 1.0)

    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    raw_v, raw_t = counts(meshes)

    if a.decimate > 0:
        for ob in meshes:
            m = ob.modifiers.new('dec', 'DECIMATE')
            m.decimate_type = 'COLLAPSE'
            m.ratio = a.decimate
            g.apply_mods(ob)

    # bake the root transform down and join, so the game gets one node
    bpy.ops.object.select_all(action='DESELECT')
    for ob in meshes:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.join()
    whole = bpy.context.view_layer.objects.active
    whole.name = f'{spec.name}_{spec.pose}'

    out = a.out or os.path.join(HERE, 'out', f'{whole.name}.glb')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    kw = dict(filepath=out, export_format='GLB', use_selection=True,
              export_apply=True, export_yup=True)
    try:
        bpy.ops.export_scene.gltf(**kw)
    except TypeError:
        kw.pop('export_yup')
        bpy.ops.export_scene.gltf(**kw)

    v, t = counts([whole])
    size = os.path.getsize(out) / 1024
    print('EXPORT %s pose=%s height=%.3fm seat=%s' %
          (out, spec.pose, info['height'],
           'none' if info['seat'] is None else '%.3fm' % info['seat']))
    print('  verts %d -> %d   tris %d -> %d   materials %d   %.0f KB'
          % (raw_v, v, raw_t, t, len(whole.data.materials), size))


main()
