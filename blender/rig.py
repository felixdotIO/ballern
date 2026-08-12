"""Rig a character and export the game's driver asset.

    blender -b --factory-startup -P blender/rig.py -- --who dog --out public/kit/driver.glb

The game binds by bone *name* (src/render/driverRig.ts) and throws if any are
missing, so the armature here is built to that contract exactly:

    hips > spine > chest > neck > head
    chest > upperarm.L/R > lowerarm.L/R > hand.L/R
    hips  > thigh.L/R > shin.L/R > foot.L/R
    head  > cable.1 > cable.2 > cable.3

Weights are assigned procedurally rather than by bone heat. The figure is a pile
of separate rigid primitives, so almost every part belongs wholly to one bone —
and for the one part that doesn't, the welded garment, a rule beats automatic
weights because we know exactly where the shoulders and the waist are.
"""

import argparse
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import bpy                            # noqa: E402
from mathutils import Vector          # noqa: E402

from crew import build as B           # noqa: E402
from crew import studio               # noqa: E402
from crew.cast import CAST            # noqa: E402


# Which bone each part of the figure belongs to, matched on the object name
# after the character's own prefix. Order matters: first hit wins.
RIGID = [
    ('_neck', 'neck'),
    ('_pelvis', 'hips'),
    ('_upper', 'upperarm'), ('_sleeve', 'upperarm'),
    ('_fore', 'lowerarm'), ('_hand', 'hand'),
    ('_thigh', 'thigh'), ('_calf', 'shin'), ('_foot', 'shoe'),
    ('_cable.1', 'cable.1'), ('_cable.2', 'cable.2'), ('_cable.3', 'cable.3'),
    ('_plug', 'cable.3'),
]

# Everything on the head rides the head bone.
HEAD_PARTS = (
    '_head', '_face', '_ball', '_iris', '_limb', '_pupil', '_catch', '_lid',
    '_rim', '_ear', '_hair', '_bob', '_crop', '_beard', '_tache', '_nose',
    '_mouth', '_teeth', '_muzzle', '_snout', '_lens', '_gframe', '_garm',
    '_bridge', '_beanie', '_brim', '_cap', '_peak', '_capknob', '_hpband',
    '_cup', '_mark', '_stud', '_cig', '_ember', '_fold', '_handle', '_bun',
)


def _side_of(name):
    if name.endswith('1') or name.endswith('L'):
        return 'L'
    return 'R'


def build_armature(s, j, joints, name='rig'):
    arm = bpy.data.armatures.new(name)
    ob = bpy.data.objects.new(name, arm)
    bpy.context.scene.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode='EDIT')

    H = j['H']
    made = {}

    def bone(bname, head, tail, parent=None, connect=False):
        b = arm.edit_bones.new(bname)
        b.head, b.tail = Vector(head), Vector(tail)
        if parent:
            b.parent = made[parent]
            b.use_connect = connect
        made[bname] = b
        return b

    # spine chain
    bone('hips', (0, 0, j['crotch'] + 0.10 * H), (0, 0, j['waist']))
    bone('spine', (0, 0, j['waist']), (0, 0, j['chest']), 'hips', True)
    bone('chest', (0, 0, j['chest']), (0, 0, j['shoulder']), 'spine', True)
    bone('neck', (0, 0, j['shoulder']), (0, 0, j['neck_top']), 'chest', True)
    bone('head', (0, 0, j['neck_top']), (0, 0, s.head[2] * 0.9), 'neck', True)

    for tag in ('L', 'R'):
        k = joints[tag]
        bone(f'upperarm.{tag}', k['top'], k['elbow'], 'chest')
        bone(f'lowerarm.{tag}', k['elbow'], k['wrist'], f'upperarm.{tag}', True)
        bone(f'hand.{tag}', k['wrist'], k['hand'], f'lowerarm.{tag}', True)
        bone(f'thigh.{tag}', k['hip'], k['knee'], 'hips')
        bone(f'shin.{tag}', k['knee'], k['ankle'], f'thigh.{tag}', True)
        bone(f'foot.{tag}', k['ankle'], k['toe'], f'shin.{tag}', True)

    # the cable, hanging off the left can
    hx, hy, hz = s.head
    p = Vector((hx * 1.10, 0.02, hz * 0.02 - 0.15))
    prev = 'head'
    for i in range(3):
        nxt = p + Vector((0.020, 0.030, -0.185))
        bone(f'cable.{i + 1}', p, nxt, prev, i > 0)
        prev = f'cable.{i + 1}'
        p = nxt

    bpy.ops.object.mode_set(mode='OBJECT')
    return ob


def bone_for(obj_name, prefix):
    """Which bone a part belongs to, or None for the welded garment."""
    tail = obj_name[len(prefix):] if obj_name.startswith(prefix) else obj_name
    for frag, bone in RIGID:
        if frag in tail:
            if bone in ('upperarm', 'lowerarm', 'hand', 'thigh', 'shin'):
                return f'{bone}.{_side_of(tail)}'
            if bone == 'shoe':
                return f'foot.{_side_of(tail)}'
            return bone
    for frag in HEAD_PARTS:
        if frag in tail:
            return 'head'
    return None


def skin(ob, weights):
    """weights: list of dicts {bone: w} per vertex, already normalised."""
    groups = {}
    for w in weights:
        for bname in w:
            if bname not in groups:
                groups[bname] = ob.vertex_groups.new(name=bname)
    for i, w in enumerate(weights):
        for bname, value in w.items():
            groups[bname].add([i], value, 'REPLACE')


def garment_weights(s, j, joints, ob):
    """The one part that spans several bones.

    Blend hips / spine / chest by height, then hand any vertex close to an arm
    over to that shoulder — the sleeves are welded into this mesh and have to
    follow the arm, not the ribcage.
    """
    H = j['H']
    out = []
    for v in ob.data.vertices:
        co = ob.matrix_world @ v.co
        w = {}

        arm_w = 0.0
        for tag in ('L', 'R'):
            a, b = joints[tag]['top'], joints[tag]['elbow']
            ab = b - a
            t = max(0.0, min(1.0, (co - a).dot(ab) / ab.length_squared))
            d = (co - (a + ab * t)).length
            near = 1.0 - max(0.0, min(1.0, (d - 0.16 * H) / (0.12 * H)))
            near *= near * (3 - 2 * near)
            if near > 0.001:
                w[f'upperarm.{tag}'] = near
                arm_w = max(arm_w, near)

        rest = 1.0 - arm_w
        if rest > 0.001:
            # smooth ramp up the spine chain
            for bname, lo, hi in (('hips', j['crotch'], j['waist']),
                                  ('spine', j['waist'], j['chest']),
                                  ('chest', j['chest'], j['shoulder'])):
                span = max(1e-5, hi - lo)
                t = (co.z - lo) / span
                f = max(0.0, 1.0 - abs(t - 0.5) * 1.6)
                if f > 0.001:
                    w[bname] = w.get(bname, 0.0) + f * rest
        total = sum(w.values())
        out.append({k: val / total for k, val in w.items()} if total > 1e-6
                   else {'chest': 1.0})
    return out


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument('--who', default='dog')
    ap.add_argument('--out', default='public/kit/driver.glb')
    ap.add_argument('--decimate', type=float, default=0.16)
    a = ap.parse_args(argv)

    spec = CAST[a.who].tweak(pose='sit', cans=True, cable=True)

    studio.wipe()
    fig = B.build(spec)
    j = fig['joints']
    joints = B.limb_joints(spec, j)

    meshes = [o for o in bpy.data.objects if o.type == 'MESH']

    # Collapse before skinning, not after: the decimate changes the vertex
    # count, and vertex groups are per index.
    if a.decimate > 0:
        from crew import geom as g
        for ob in meshes:
            if len(ob.data.polygons) < 400:
                continue
            m = ob.modifiers.new('dec', 'DECIMATE')
            m.decimate_type = 'COLLAPSE'
            m.ratio = a.decimate
            g.apply_mods(ob)

    arm = build_armature(spec, j, joints)

    prefix = f'{spec.name}_'
    unbound = []
    for ob in meshes:
        bname = bone_for(ob.name, prefix)
        if bname is None:
            skin(ob, garment_weights(spec, j, joints, ob))
        else:
            grp = ob.vertex_groups.new(name=bname)
            grp.add(list(range(len(ob.data.vertices))), 1.0, 'REPLACE')
            if '_garment' in ob.name:
                unbound.append(ob.name)
        m = ob.modifiers.new('skin', 'ARMATURE')
        m.object = arm
        ob.parent = arm

    arm.parent = fig['root']
    info = B.finish(fig, spec)

    # flatten the colours the way export.py does — glTF cannot bake procedural
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

    bpy.ops.object.select_all(action='DESELECT')
    for ob in meshes + [arm]:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = arm

    out = os.path.abspath(a.out)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB',
                              use_selection=True, export_apply=False,
                              export_yup=True, export_skins=True)

    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)
    print('RIG %s -> %s' % (spec.name, out))
    print('  bones %d   meshes %d   tris %d   height %.3fm   seat %.3fm   %.0f KB'
          % (len(arm.data.bones), len(meshes), tris, info['height'],
             info['seat'] or 0.0, os.path.getsize(out) / 1024))


main()
