"""A character is this object. build(spec) is a pure function of it."""

from dataclasses import dataclass, field, replace


@dataclass
class Spec:
    name: str = 'crew'

    # ---- head shell ------------------------------------------------ #
    head: tuple = (0.63, 0.60, 0.66)   # radii x / y / z
    head_e: tuple = (0.80, 0.85)       # squareness, 1.0 = sphere
    head_chin: float = 0.88            # xy scale at the jaw
    head_crown: float = 1.03           # xy scale at the crown
    head_lean: float = 0.0             # forward lean, degrees
    face_flat: float = 0.0             # 0..1, flattens the front of the face
    nose: float = 0.24                 # nose bulge, in build units
    nose_at: float = -0.10             # its height on the head
    nose_w: float = 0.16               # its width / length
    brow: float = 0.060                # brow ridge over the eye line
    socket: float = 0.045              # how far the eye sockets are dished in

    # ---- eye holes ------------------------------------------------- #
    eye_gap: float = 0.215             # centre offset from the midline
    eye_z: float = 0.03
    eye_w: float = 0.165
    eye_h: float = 0.215
    eye_corner: float = 0.45           # low = rectangular, 1.0 = oval
    eye_splay: float = 13.0            # yaw outward, degrees
    eye_tilt: float = 0.0              # roll, degrees
    cut_end: float = -0.10             # how far back the hole is punched
    socket_taper: float = 0.86         # narrowing of the hole with depth
    shell_t: float = 0.050             # mask thickness -> visible hole edge
    rim: float = 0.0                   # sculpted collar around each eye hole
    rim_out: float = 0.030             # how far it stands proud of the mask
    rim_squash: float = 1.0
    face_gap: float = 0.030            # recess of the face behind the mask

    # ---- eyes ------------------------------------------------------ #
    eyeball: float = 0.135
    eye_out: float = -0.05             # ball centre relative to the face
                                       # surface; negative sinks it in
    ball_dz: float = 0.0               # eye height within the socket
    lid_drop: float = 30.0
    lid_slant: float = 14.0
    iris: float = 0.52                 # iris width as a share of the ball
    catch: float = 0.13                # catchlight size, 0 for none
    lid_low: float = 28.0              # lower lid half-angle, degrees
    gaze: tuple = (2.0, -14.0)         # yaw / pitch, degrees

    # ---- kit -------------------------------------------------------- #
    hat: str = 'none'                  # 'none' | 'beanie' | 'cap' | 'cap_back'
    hat_col: tuple = (0.045, 0.046, 0.052)
    beanie_h: float = 0.42             # dome half-height, share of head rz
    beanie_at: float = 0.90            # dome centre, share of head rz
    beanie_ribs: int = 30
    beanie_relief: float = 0.026
    brim: float = 0.078                # rolled brim thickness
    brim_at: float = 0.52
    hair: str = 'none'                 # 'none' | 'afro' | 'crop' | 'bob' | 'bun'
    hair_col: tuple = (0.028, 0.026, 0.028)
    hair_r: float = 1.06               # how far the hair stands off the skull
    hair_at: float = 0.16              # vertical offset, share of head rz
    hair_lump: float = 0.150           # afro lump radius
    hair_n: int = 44
    hairline: float = 0.02             # no lumps in front below this
    hair_drop: float = 0.80            # how far the afro reaches below the crown
    hair_t: float = 0.055              # shell thickness for bob / bun
    hair_long: float = 1.34            # how far a bob hangs past the jaw
    hair_face: tuple = (0.80, 0.86, 0.02)   # face opening: w / h / z, x head r
    hair_open: float = -0.62           # clear the front below this, x head rz
    hair_part: tuple = (0.0, 0.0)      # face-cut offset / roll: a side part
    bun: tuple = (0.20, 0.30, 0.72)    # radius / back offset / height
    earring: float = 0.0               # stud radius, 0 for none
    cig: bool = False                  # cigarette in the corner of the mouth
    lanyard: bool = False              # cord and badge
    brim_len: float = 0.86             # cap peak, x head ry
    glasses: str = 'none'              # 'none' | 'shades' | 'round'
    lens: tuple = (0.185, 0.125)       # half width / half height
    lens_col: tuple = (0.120, 0.045, 0.040)
    frame_col: tuple = (0.020, 0.020, 0.022)
    tache: str = 'none'                # 'none' | 'walrus'
    beard: str = 'none'                # 'none' | 'chin'
    beard_span: float = 46.0           # half-angle from the chin, degrees
    beard_tilt: float = 14.0           # swings it forward onto the jaw
    beard_t: float = 0.026             # thickness of the shell
    lens_tint: float = 1.0             # 1 dark shades, 0 clear spectacles
    mouth: float = 0.0                 # mouth half-width, 0 for none
    mouth_style: str = 'line'          # 'line' | 'grin' | 'oh'
    muzzle: tuple = (0.0, 0.0, 0.0)    # half width / depth / half height
    muzzle_at: float = -0.16
    muzzle_col: tuple = (0.930, 0.885, 0.820)
    snout: float = 0.0                 # nose blob radius, 0 for none
    snout_col: tuple = (0.085, 0.070, 0.070)
    pet_collar: float = 0.0            # band radius, 0 for none
    hood_up: bool = False              # hood pulled over the head
    glasses_up: bool = False           # specs pushed onto the forehead
    smile: float = 0.0                 # lifts the corners of the mouth
    cans: bool = False                 # headphones
    cable: bool = False                # headphone cable, 3 segments + plug
    cans_col: tuple = (0.075, 0.078, 0.088)
    accent: tuple = (0.85, 0.42, 0.10)

    # ---- ears ------------------------------------------------------ #
    ears: str = 'flop'                 # 'flop' | 'round' | 'none'
    ear: tuple = (0.115, 0.135, 0.44)  # half-width / half-depth / length
    ear_e: tuple = (0.55, 0.68)        # squarer = a flap, rounder = a lobe
    ear_at: tuple = (0.46, 0.02, 0.30)
    ear_out: float = 24.0
    ear_curl: float = 34.0

    # ---- frame ------------------------------------------------------ #
    # Speaks the same language as src/crew/spec.ts: one measurement in metres,
    # everything else a proportion around 1.
    height: float = 1.74               # metres, crown to floor
    heads: float = 4.6                 # how many head-heights tall
    shoulder: float = 1.0
    waist: float = 1.0
    girth: float = 1.0                 # limb thickness
    leg: float = 1.0                   # leg length as a share of the whole
    foot: float = 1.0
    pose: str = 'stand'                # 'stand' | 'sit'
    seat_drop: float = 0.0             # extra slouch into the cushion

    # ---- body ------------------------------------------------------ #
    neck: tuple = (0.175, 0.30)        # radius / length
    torso: tuple = (0.58, 0.30, 0.90)  # legacy bust mass, unused by the figure
    shoulder_slope: float = 0.16
    collar: str = 'shirt'              # 'tee' | 'shirt' | 'jacket' | 'hood' | 'none'
    sleeve: float = 0.42               # how far a tee sleeve runs down the arm
    buttons: int = 3
    gap: float = 0.06                  # neck gap under the jaw

    # ---- surface --------------------------------------------------- #
    shell: str = 'knit'                # 'knit' | 'paper' | 'cloth' | 'bare'
    mask_col: tuple = (0.775, 0.720, 0.585)
    garment_col: tuple = (0.780, 0.735, 0.605)
    skin_col: tuple = (0.850, 0.560, 0.470)
    eye_col: tuple = (0.900, 0.885, 0.855)
    iris_col: tuple = (0.150, 0.105, 0.075)   # the iris proper
    limbal: tuple = (0.030, 0.026, 0.024)     # dark ring at its edge
    neck_col: tuple = (0.230, 0.185, 0.160)
    inner_col: tuple = (0.780, 0.775, 0.760)   # what shows under an open jacket
    legs_col: tuple = (0.150, 0.165, 0.200)
    shoe_col: tuple = (0.105, 0.110, 0.125)
    lid_shade: float = 0.80            # lid tone relative to the socket
    ribs: int = 34
    rib_depth: float = 0.26
    rib_axis: str = 'Z'                # 'Z' meridians (chin to crown), 'X' bands
    rib_tilt: float = 0.0              # swings the rib pole away from the crown
    rib_relief: float = 0.0            # real rib geometry, in build units
    rib_fade: tuple = (0.60, 0.97)     # fade the ribs out toward the pole
    extras: tuple = ()                 # 'handle', 'fold', ...

    # ---- framing ---------------------------------------------------- #
    cam_dist: float = 4.4
    cam_z: float = -0.22

    def tweak(self, **kw):
        return replace(self, **kw)
