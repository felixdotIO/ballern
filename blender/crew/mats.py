"""Procedural materials. No textures on disk, everything is nodes."""

import math

import bpy


def _set(b, name, val):
    if name in b.inputs:
        b.inputs[name].default_value = val


def _base(name, flat=None):
    m = bpy.data.materials.get(name)
    if m:
        return m, m.node_tree, m.node_tree.nodes['Principled BSDF']
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    out.location = (400, 0)
    b = nt.nodes.new('ShaderNodeBsdfPrincipled')
    b.name = 'Principled BSDF'
    b.location = (100, 0)
    nt.links.new(b.outputs['BSDF'], out.inputs['Surface'])
    if flat is not None:
        # glTF cannot bake a procedural Base Color, so keep the intended value
        # on the material and let export.py flatten to it
        m['flat'] = list(flat)
    return m, nt, b


def _noise_bump(nt, scale, detail, strength, feed=None, distortion=0.0):
    tex = nt.nodes.new('ShaderNodeTexNoise')
    tex.inputs['Scale'].default_value = scale
    tex.inputs['Detail'].default_value = detail
    tex.inputs['Distortion'].default_value = distortion
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = strength
    nt.links.new(tex.outputs['Fac'], bump.inputs['Height'])
    if feed:
        nt.links.new(feed, bump.inputs['Normal'])
    return tex, bump.outputs['Normal']


def knit(name, color, ribs=34, depth=0.26, rough=0.86, axis='Z', tilt=0.0,
         fade=(0.60, 0.97), extent=1.0):
    """Ribbed knit. The ribs are meridians of the gradient axis, so they
    converge at that axis' pole; `tilt` swings the pole back out of frame the
    way a real balaclava's crown decrease sits behind the face."""
    m, nt, b = _base(name, flat=color)
    _set(b, 'Base Color', (*color, 1))
    _set(b, 'Roughness', rough)
    _set(b, 'Sheen Weight', 0.55)
    _set(b, 'Sheen Roughness', 0.35)
    _set(b, 'Specular IOR Level', 0.22)

    tc = nt.nodes.new('ShaderNodeTexCoord')
    mp = nt.nodes.new('ShaderNodeMapping')
    rx = math.radians(tilt)
    ry = math.radians(-90) if axis == 'X' else 0.0
    mp.inputs['Rotation'].default_value = (rx, ry, 0)
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])

    grad = nt.nodes.new('ShaderNodeTexGradient')
    grad.gradient_type = 'RADIAL'
    nt.links.new(mp.outputs['Vector'], grad.inputs['Vector'])

    mul = nt.nodes.new('ShaderNodeMath')
    mul.operation = 'MULTIPLY'
    mul.inputs[1].default_value = ribs * 2 * math.pi
    nt.links.new(grad.outputs['Fac'], mul.inputs[0])

    sine = nt.nodes.new('ShaderNodeMath')
    sine.operation = 'SINE'
    nt.links.new(mul.outputs[0], sine.inputs[0])

    # the ribs are meridians, so they pile up at the pole; fade them out
    # before they get there or the crown reads as a sunburst
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(mp.outputs['Vector'], sep.inputs['Vector'])
    az = nt.nodes.new('ShaderNodeMath')
    az.operation = 'ABSOLUTE'
    nt.links.new(sep.outputs['Z'], az.inputs[0])
    ramp = nt.nodes.new('ShaderNodeMapRange')
    ramp.interpolation_type = 'SMOOTHSTEP'
    ramp.inputs['From Min'].default_value = fade[0] * extent
    ramp.inputs['From Max'].default_value = fade[1] * extent
    ramp.inputs['To Min'].default_value = 1.0
    ramp.inputs['To Max'].default_value = 0.0
    nt.links.new(az.outputs[0], ramp.inputs['Value'])
    damp = nt.nodes.new('ShaderNodeMath')
    damp.operation = 'MULTIPLY'
    nt.links.new(sine.outputs[0], damp.inputs[0])
    nt.links.new(ramp.outputs['Result'], damp.inputs[1])

    # rows of stitches across the ribs. Ribs alone read as moulded rubber;
    # the courses are what make it look knitted.
    rows = nt.nodes.new('ShaderNodeMath')
    rows.operation = 'MULTIPLY'
    rows.inputs[1].default_value = ribs * 3.4 * math.pi
    nt.links.new(sep.outputs['Z'], rows.inputs[0])
    rsin = nt.nodes.new('ShaderNodeMath')
    rsin.operation = 'SINE'
    nt.links.new(rows.outputs[0], rsin.inputs[0])
    rmix = nt.nodes.new('ShaderNodeMath')
    rmix.operation = 'MULTIPLY'
    rmix.inputs[1].default_value = 0.34
    nt.links.new(rsin.outputs[0], rmix.inputs[0])
    weave = nt.nodes.new('ShaderNodeMath')
    weave.operation = 'ADD'
    nt.links.new(damp.outputs[0], weave.inputs[0])
    nt.links.new(rmix.outputs[0], weave.inputs[1])

    rib = nt.nodes.new('ShaderNodeBump')
    rib.inputs['Strength'].default_value = depth
    rib.inputs['Distance'].default_value = 0.05
    nt.links.new(weave.outputs[0], rib.inputs['Height'])

    # fine fibre grain layered on top of the ribs
    _, nrm = _noise_bump(nt, 420, 6, 0.16, feed=rib.outputs['Normal'])
    nt.links.new(nrm, b.inputs['Normal'])

    # slight tonal drift so the flat colour doesn't read as plastic
    var = nt.nodes.new('ShaderNodeTexNoise')
    var.inputs['Scale'].default_value = 6.0
    var.inputs['Detail'].default_value = 3.0
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    mix.inputs['Factor'].default_value = 0.10
    mix.inputs[6].default_value = (*color, 1)
    mix.inputs[7].default_value = (color[0] * 0.82, color[1] * 0.80, color[2] * 0.78, 1)
    nt.links.new(var.outputs['Fac'], mix.inputs['Factor'])
    nt.links.new(mix.outputs[2], b.inputs['Base Color'])
    return m


def paper(name, color, crease=0.9, rough=0.72):
    """Kraft paper: broad soft creases, fine tooth, a hint of translucency."""
    m, nt, b = _base(name, flat=color)
    _set(b, 'Base Color', (*color, 1))
    _set(b, 'Roughness', rough)
    _set(b, 'Sheen Weight', 0.2)
    _set(b, 'Specular IOR Level', 0.3)

    vor = nt.nodes.new('ShaderNodeTexVoronoi')
    vor.feature = 'DISTANCE_TO_EDGE'
    vor.inputs['Scale'].default_value = 3.1
    crease_bump = nt.nodes.new('ShaderNodeBump')
    crease_bump.inputs['Strength'].default_value = crease * 0.55
    crease_bump.inputs['Distance'].default_value = 0.05
    nt.links.new(vor.outputs['Distance'], crease_bump.inputs['Height'])

    _, n1 = _noise_bump(nt, 9, 8, 0.22, feed=crease_bump.outputs['Normal'])
    _, n2 = _noise_bump(nt, 240, 4, 0.14, feed=n1)
    nt.links.new(n2, b.inputs['Normal'])

    var = nt.nodes.new('ShaderNodeTexNoise')
    var.inputs['Scale'].default_value = 12.0
    var.inputs['Detail'].default_value = 5.0
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    mix.inputs['Factor'].default_value = 0.14
    mix.inputs[6].default_value = (*color, 1)
    mix.inputs[7].default_value = (color[0] * 0.80, color[1] * 0.76, color[2] * 0.70, 1)
    nt.links.new(var.outputs['Fac'], mix.inputs['Factor'])
    nt.links.new(mix.outputs[2], b.inputs['Base Color'])
    return m


def cloth(name, color, rough=0.9, weave=110):
    m, nt, b = _base(name, flat=color)
    _set(b, 'Base Color', (*color, 1))
    _set(b, 'Roughness', rough)
    _set(b, 'Sheen Weight', 0.4)
    _set(b, 'Specular IOR Level', 0.2)
    _, n1 = _noise_bump(nt, 14, 6, 0.10)
    _, n2 = _noise_bump(nt, weave, 3, 0.10, feed=n1)
    nt.links.new(n2, b.inputs['Normal'])
    return m


def skin(name, color, rough=0.52):
    m, nt, b = _base(name, flat=color)
    _set(b, 'Base Color', (*color, 1))
    _set(b, 'Roughness', rough)
    _set(b, 'Subsurface Weight', 0.34)
    _set(b, 'Subsurface Radius', (0.36, 0.16, 0.10))
    _set(b, 'Subsurface Scale', 0.10)
    _set(b, 'Specular IOR Level', 0.4)
    _, n1 = _noise_bump(nt, 90, 4, 0.06)
    nt.links.new(n1, b.inputs['Normal'])
    return m


def plain(name, color, rough=0.5, coat=0.0):
    m, nt, b = _base(name, flat=color)
    _set(b, 'Base Color', (*color, 1))
    _set(b, 'Roughness', rough)
    _set(b, 'Coat Weight', coat)
    _set(b, 'Coat Roughness', 0.08)
    return m


def glass(name, color, tint=0.0):
    """A spectacle lens. Clear needs transmission or the eyes vanish behind a
    white disc; sunglasses are the same shader with the tint turned up."""
    m, nt, b = _base(name, flat=color)
    _set(b, 'Base Color', (*color, 1))
    _set(b, 'Roughness', 0.04)
    _set(b, 'Transmission Weight', 1.0 - tint * 0.62)
    _set(b, 'IOR', 1.48)
    _set(b, 'Coat Weight', 0.6)
    return m


def hair(name, color):
    m, nt, b = _base(name, flat=color)
    _set(b, 'Base Color', (*color, 1))
    _set(b, 'Roughness', 0.62)
    _set(b, 'Specular IOR Level', 0.35)
    _set(b, 'Sheen Weight', 0.15)
    _, n1 = _noise_bump(nt, 55, 5, 0.14)
    nt.links.new(n1, b.inputs['Normal'])
    return m


def backdrop(name, color=(0.86, 0.86, 0.865)):
    m, nt, b = _base(name, flat=color)
    _set(b, 'Base Color', (*color, 1))
    _set(b, 'Roughness', 0.92)
    _set(b, 'Specular IOR Level', 0.1)
    return m
