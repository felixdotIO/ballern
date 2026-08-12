"""Named specs. Add a character by adding an entry, not by editing build.py."""

from .spec import Spec


PIP = Spec(
    name='pip',
    shell='knit',
    head=(0.605, 0.570, 0.645),
    head_e=(0.80, 0.88),
    head_chin=0.855,
    head_crown=0.975,
    face_flat=0.16,
    eye_gap=0.212, eye_z=-0.010, eye_w=0.126, eye_h=0.182,
    eye_corner=0.72, eye_splay=9.0,
    cut_end=-0.10, socket_taper=0.86,
    shell_t=0.052, face_gap=0.012,
    eyeball=0.165, eye_out=-0.107, ball_dz=-0.014,
    lid_drop=-10.0, lid_slant=-7.0, lid_low=14.0,
    iris=0.46, catch=0.15, gaze=(7.0, -4.0),
    ears='flop', ear=(0.152, 0.082, 0.74), ear_e=(0.62, 0.72),
    ear_at=(0.545, -0.060, 0.34), ear_out=18.0, ear_curl=22.0,
    collar='tee',
    mask_col=(0.560, 0.560, 0.565),
    garment_col=(0.052, 0.054, 0.060),
    skin_col=(0.880, 0.585, 0.420),
    neck_col=(0.210, 0.170, 0.150),
    lid_shade=0.96,
    ribs=30, rib_depth=0.20, rib_tilt=0.0, rib_fade=(0.55, 0.93),
    rib_relief=0.018,
    rim=0.036, rim_out=0.009, rim_squash=0.80,
    height=1.66, heads=3.95, shoulder=1.02, waist=1.06,
    girth=1.40, leg=0.96, foot=1.28,
    legs_col=(0.150, 0.165, 0.205), shoe_col=(0.105, 0.110, 0.125),
    cam_dist=4.75, cam_z=-0.26,
)


SACK = Spec(
    name='sack',
    shell='paper',
    head=(0.545, 0.500, 0.735),
    head_e=(0.22, 0.25),
    head_chin=0.935,
    head_crown=1.00,
    eye_gap=0.178, eye_z=0.045, eye_w=0.104, eye_h=0.168,
    eye_corner=0.42, eye_splay=4.0,
    cut_end=-0.06, socket_taper=1.0,
    shell_t=0.026, face_gap=0.014,
    eyeball=0.128, eye_out=-0.072, ball_dz=-0.010,
    lid_drop=-14.0, lid_slant=-5.0, lid_low=13.0,
    iris=0.46, catch=0.14, gaze=(5.0, -3.0),
    lid_shade=0.95,
    ears='none',
    collar='tee',
    mask_col=(0.700, 0.590, 0.435),
    garment_col=(0.780, 0.775, 0.762),
    skin_col=(0.470, 0.350, 0.250),
    eye_col=(0.880, 0.865, 0.840),
    extras=('handle', 'fold'),
    height=1.74, heads=4.15, shoulder=1.08, waist=1.10,
    girth=1.34, leg=1.00, foot=1.22,
    legs_col=(0.205, 0.200, 0.190), shoe_col=(0.130, 0.128, 0.122),
    cam_dist=6.6, cam_z=-0.40,
)


CAST = {'pip': PIP, 'sack': SACK}

# ---------------------------------------------------------------- the roster
#
# Named by role, not by first name: a game character in an office is read as a
# job before they are read as a person, and the game's own cast in
# src/crew/spec.ts is named the same way. Each one is also an argument about one
# dial — mask type, hat, ears, value contrast — so when a choice turns out to be
# wrong there is a character on the sheet who fails visibly.

def _v(key, name, **over):
    base = SACK if over.pop('paper', False) else PIP
    return key, base.tweak(name=name, **over)


# Everyone wears the same white tee, the same trousers and the same shoes, and
# stands on the same frame. Only the head changes — which is the point of a
# character sheet: if two of them are hard to tell apart, that is a design
# problem and not a wardrobe one.
BODY = dict(
    collar='tee', sleeve=0.44,
    garment_col=(0.905, 0.902, 0.890),
    legs_col=(0.225, 0.240, 0.285),
    shoe_col=(0.885, 0.880, 0.865),
    height=1.70, heads=4.05, shoulder=1.02, waist=1.02,
    girth=1.30, leg=0.98, foot=1.20,
)


ROSTER = dict([
    # ---- masked ----------------------------------------------------------
    _v('newone', 'The new one', **BODY,
       nose=0.0, brow=0.030,
       head=(0.598, 0.572, 0.600), head_e=(0.90, 0.94), head_chin=0.920,
       head_crown=1.00, face_flat=0.10,
       eye_gap=0.200, eye_w=0.134, eye_h=0.192, eye_z=-0.020,
       rim=0.040, iris=0.50, lid_drop=-20.0, lid_low=13.0, lid_slant=-10.0,
       gaze=(9.0, -2.0),
       ribs=26, rib_relief=0.020,
       mask_col=(0.880, 0.330, 0.470),
       skin_col=(0.900, 0.620, 0.470),
       hat='none', cans=True, ears='none', accent=(0.98, 0.72, 0.10)),

    _v('facilities', 'Facilities', paper=True, **BODY,
       head=(0.580, 0.532, 0.700), head_e=(0.20, 0.23),
       eye_gap=0.186, eye_w=0.118, eye_h=0.182, eye_z=0.050,
       eyeball=0.140, eye_out=-0.082, iris=0.48, lid_drop=-16.0, lid_low=12.0,
       lid_slant=-4.0, gaze=(6.0, -3.0),
       mask_col=(0.720, 0.600, 0.430),
       hat='none', cans=False, accent=(0.92, 0.72, 0.12)),

    # ---- the office dog --------------------------------------------------
    _v('dog', 'The office dog', **BODY,
       shell='bare', rim=0.0, rib_relief=0.0,
       head=(0.618, 0.582, 0.558), head_e=(0.92, 0.95), head_chin=0.935,
       head_crown=0.985, face_flat=0.10,
       nose=0.0, brow=0.024, socket=0.046,
       muzzle=(0.212, 0.188, 0.148), muzzle_at=-0.170,
       muzzle_col=(0.915, 0.860, 0.775), snout=0.074,
       snout_col=(0.085, 0.068, 0.070),
       eye_gap=0.214, eye_z=0.058, eyeball=0.152, eye_out=-0.088,
       iris=0.58, lid_drop=-30.0, lid_slant=-9.0, lid_low=10.0,
       catch=0.18, gaze=(11.0, -2.0),
       mouth=0.076, mouth_style='grin', smile=0.030,
       skin_col=(0.770, 0.545, 0.330),
       ears='flop', ear=(0.152, 0.080, 0.62), ear_e=(0.62, 0.72),
       ear_at=(0.520, -0.030, 0.235), ear_out=16.0, ear_curl=26.0,
       hair='none', glasses='none', tache='none', beard='none',
       hat='none', cans=False,
       pet_collar=0.052, accent=(0.860, 0.215, 0.180)),

    # ---- no mask ---------------------------------------------------------
    _v('intern', 'The intern', **BODY,
       shell='bare', rim=0.0, rib_relief=0.0,
       head=(0.578, 0.556, 0.612), head_e=(0.90, 0.94), head_chin=0.830,
       head_crown=0.985, face_flat=0.15,
       nose=0.096, nose_at=-0.142, nose_w=0.100, brow=0.032, socket=0.046,
       eye_gap=0.184, eye_z=-0.010, eyeball=0.152, eye_out=-0.086,
       iris=0.56, lid_drop=-34.0, lid_slant=-12.0, lid_low=9.0,
       catch=0.18, gaze=(11.0, 1.0),
       mouth=0.058, mouth_style='grin', smile=0.014,
       skin_col=(0.890, 0.630, 0.475),
       hair='bob', hair_col=(0.560, 0.215, 0.075), hair_r=1.135,
       hair_t=0.082, hair_long=1.74, hair_face=(0.90, 0.58, -0.155),
       hair_open=-0.40,
       glasses='none', tache='none', beard='none', earring=0.028,
       ears='round', ear=(0.062, 0.098, 0.158), ear_at=(0.556, 0.048, -0.036),
       hat='none', cans=True,
       accent=(0.98, 0.80, 0.15), cans_col=(0.085, 0.088, 0.098)),

    _v('boss', 'The boss', **BODY,
       shell='bare', rim=0.0, rib_relief=0.0,
       head=(0.672, 0.622, 0.586), head_e=(0.86, 0.92), head_chin=0.965,
       head_crown=0.920, face_flat=0.20,
       nose=0.152, nose_at=-0.132, nose_w=0.144, brow=0.058, socket=0.050,
       eye_gap=0.196, eye_z=-0.022, eyeball=0.126, eye_out=-0.070,
       iris=0.42, lid_drop=-2.0, lid_slant=-9.0, lid_low=12.0,
       catch=0.12, gaze=(-6.0, -2.0), mouth=0.070, mouth_style='line',
       skin_col=(0.855, 0.590, 0.445),
       hair='none', tache='none', beard='none',
       glasses='shades', lens=(0.168, 0.120), lens_tint=0.10,
       frame_col=(0.045, 0.045, 0.050),
       ears='round', ear=(0.078, 0.118, 0.192), ear_at=(0.640, 0.055, -0.046),
       hat='none', cans=False),

    _v('sales', 'The sales guy', **BODY,
       shell='bare', rim=0.0, rib_relief=0.0,
       head=(0.615, 0.585, 0.615), head_e=(0.86, 0.92), head_chin=0.900,
       head_crown=0.960, face_flat=0.18,
       nose=0.150, nose_at=-0.145, nose_w=0.135, brow=0.055, socket=0.050,
       eye_gap=0.196, eye_z=-0.020, eyeball=0.132, eye_out=-0.074,
       iris=0.46, lid_drop=-4.0, lid_slant=-9.0, lid_low=12.0,
       catch=0.13, gaze=(9.0, -2.0),
       skin_col=(0.850, 0.585, 0.430),
       hair='afro', hair_col=(0.030, 0.028, 0.030),
       hair_r=1.18, hair_at=0.24, hair_n=62, hairline=0.14, hair_lump=0.162,
       hair_drop=0.80,
       glasses='shades', lens=(0.180, 0.108), lens_col=(0.135, 0.048, 0.042),
       lens_tint=1.0, tache='walrus', cig=True,
       ears='round', ear=(0.075, 0.115, 0.190), ear_at=(0.590, 0.055, -0.045),
       hat='none', cans=False),

    _v('designer', 'The designer', **BODY,
       shell='bare', rim=0.0, rib_relief=0.0,
       head=(0.596, 0.570, 0.600), head_e=(0.88, 0.93), head_chin=0.870,
       face_flat=0.16,
       nose=0.112, nose_at=-0.138, nose_w=0.108, brow=0.038, socket=0.048,
       eye_gap=0.186, eye_z=-0.012, eyeball=0.144, eye_out=-0.080,
       iris=0.54, lid_drop=-24.0, lid_slant=-11.0, lid_low=11.0,
       catch=0.17, gaze=(-10.0, -2.0), mouth=0.064, smile=0.020,
       skin_col=(0.795, 0.540, 0.395),
       hair='bob', hair_col=(0.058, 0.050, 0.054), hair_r=1.10,
       hair_t=0.076, hair_long=1.62, hair_face=(0.90, 0.74, -0.055),
       hair_open=-0.34, hair_part=(0.17, -13.0),
       glasses='round', glasses_up=True, lens=(0.132, 0.122), lens_tint=0.05,
       frame_col=(0.130, 0.105, 0.085),
       tache='none', beard='none', earring=0.024,
       ears='round', ear=(0.064, 0.100, 0.162), ear_at=(0.560, 0.048, -0.038),
       hat='none', cans=False, accent=(0.86, 0.42, 0.28)),
])

CAST.update(ROSTER)

