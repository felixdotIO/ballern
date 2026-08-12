"""
17" CRT monitor.

The defining silhouette of the period. The thing that makes it read is the
taper: a CRT is not a box, it is a deep wedge narrowing toward the tube neck,
and the screen glass bulges outward rather than sitting flat. Get those two
wrong and it looks like a modern panel with a thick back.

Origin on the desk surface at the centre of the base, facing -Y (Blender front).

    blender --background --factory-startup --python kit/build_crt.py -- out.glb
"""

import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import kitlib as K  # noqa: E402

W = 0.405
D = 0.394
CASE_H = 0.375

K.reset()

# Warm putty ABS that yellowed over its life, and the anti-glare front glass
# when the machine is off.
CASE = K.material("CaseBeige", K.srgb(0xD6CDB6), roughness=0.55)
DARK = K.material("Bezel", K.srgb(0x6E6A5F), roughness=0.6)
GLASS = K.material("ScreenGlass", K.srgb(0x2B2F31), roughness=0.16)

parts = []

# Tilt-and-swivel foot.
foot = K.box("Foot", (W * 0.68, D * 0.60, 0.038), (0, 0.02, 0.019))
K.taper(foot, axis='Y', at=-1, scale=(0.88, 1.0))
K.bevel(foot, width=0.008, segments=3)
K.shade_smooth(foot)
parts.append(K.assign(foot, CASE))

pivot = K.cylinder("Pivot", 0.055, 0.03, (0, 0.02, 0.05), segments=20)
K.bevel(pivot, width=0.005, segments=2)
K.shade_smooth(pivot)
parts.append(K.assign(pivot, CASE))

# Main case. Tapered toward the back, where the tube narrows to its neck, and
# slightly narrowed at the top the way moulded cases are.
case = K.box("Case", (W, D, CASE_H), (0, 0.03, 0.055 + CASE_H / 2), cuts=2)
K.taper(case, axis='Y', at=1, scale=(0.60, 0.62))
K.taper(case, axis='Z', at=1, scale=(0.94, 0.97))
K.bevel(case, width=0.012, segments=3)
K.shade_smooth(case)
parts.append(K.assign(case, CASE))

# Front bezel, standing very slightly proud of the case.
bezel = K.box("BezelFrame", (W * 0.985, 0.03, CASE_H * 0.95), (0, 0.03 - D / 2 - 0.004, 0.055 + CASE_H / 2))
K.bevel(bezel, width=0.006, segments=3)
K.shade_smooth(bezel)
parts.append(K.assign(bezel, CASE))

# Screen, bulging outward. A flat rectangle here is the single biggest tell.
screen = K.box("Screen", (W * 0.82, 0.02, CASE_H * 0.76), (0, 0.03 - D / 2 - 0.012, 0.055 + CASE_H / 2), cuts=6)
K.arc(screen, along='X', into='Y', amount=-0.012, power=2.0)
K.arc(screen, along='Z', into='Y', amount=-0.008, power=2.0)
K.bevel(screen, width=0.004, segments=2)
K.shade_smooth(screen, angle=60)
parts.append(K.assign(screen, GLASS))

# Controls along the bottom bezel, and the power LED.
for i in range(4):
    btn = K.box("Button", (0.022, 0.012, 0.008), (-0.09 + i * 0.032, 0.03 - D / 2 - 0.006, 0.082))
    K.bevel(btn, width=0.002, segments=2)
    parts.append(K.assign(btn, DARK))

power = K.cylinder("PowerButton", 0.011, 0.014, (0.145, 0.03 - D / 2 - 0.004, 0.084), segments=14, rotation=(90, 0, 0))
K.bevel(power, width=0.002, segments=2)
K.shade_smooth(power)
parts.append(K.assign(power, DARK))

# Ventilation recess across the top.
vent = K.box("VentRecess", (W * 0.55, D * 0.34, 0.006), (0, 0.02, 0.055 + CASE_H - 0.004))
K.bevel(vent, width=0.002, segments=2)
parts.append(K.assign(vent, DARK))

crt = K.join(parts, "CRTMonitor")

K.assert_bounds(crt, {
    "width":  (0.40, 0.42),
    "depth":  (0.42, 0.46),
    "height": (0.42, 0.46),
    "floor":  (-0.002, 0.004),
})

K.export(sys.argv[-1], name="crt-monitor")
