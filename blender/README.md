# crew — Blender character sandbox

Scripted character design for Chair Force One, outside the game's core. Nothing
here is modelled by hand: a character is a `Spec` object and `build(spec)` is a
pure function of it, so a design change is a dial, not a mesh edit.

## Run

```bash
blender -b --factory-startup -P blender/render.py -- --who pip --res 1000 --samples 220
```

Useful flags: `--orbit 34` (turn the camera), `--set lid_drop=44` (override any
`Spec` field for one render, repeatable), `--save-blend out/pip.blend` (drop out
into the GUI to look around), `--dist / --look-z` (override the spec's framing).

Variant sheets — several dial settings in one Blender process, which is how the
current cast was tuned:

```bash
blender -b --factory-startup -P blender/sheet.py -- --who pip --tag ear \
  --var "ear_out=18.0;ear_curl=22.0" --var "ear_out=28.0;ear_curl=10.0"
```

`_light`, `_exposure`, `_view` and `_orbit` work inside `--var` as studio
overrides alongside the spec fields.

## The cast

`PIP` and `SACK` are the two base specs — knit balaclava and kraft bag. The
roster is written as tweaks of those, named by role rather than by first name,
the same convention as the game's own cast in `src/crew/spec.ts`:

| key          | name             | head                                    |
| ------------ | ---------------- | --------------------------------------- |
| `newone`     | The new one      | hot pink knit balaclava, headphones     |
| `facilities` | Facilities       | kraft paper bag, handle, folded top     |
| `dog`        | The office dog   | muzzle, black nose, flop ears, grin     |
| `intern`     | The intern       | copper bob with a fringe, cans, grin    |
| `boss`       | The boss         | bald, thick specs, flat line of a mouth |
| `sales`      | The sales guy    | afro, shades, moustache, cigarette      |
| `designer`   | The designer     | black side-part bob, specs pushed up    |

**Everyone wears the same white tee, the same trousers, the same shoes and the
same frame.** Only the head changes. That is the point of a character sheet: if
two of them are hard to tell apart it is a design problem, not a wardrobe one,
and a uniform body makes that impossible to hide behind. `BODY` in `cast.py`
holds the shared kit and every roster row splats it.

Each is also an argument about one dial — mask type, hat, ears, value contrast —
so a wrong choice fails visibly on the sheet rather than drifting quietly.

```bash
blender -b --factory-startup -P blender/roster.py -- --res 620 --samples 110
```

renders all of them on one light and one framing, which is the only way the
comparison means anything. `--bare` strips the mask, hat, kit and extras and
shows the head underneath — see below. Add a character by adding a row to `ROSTER` in
`crew/cast.py`; only reach into `crew/build.py` when one needs a part that
doesn't exist yet.

## Parts

`hat` ('none' | 'beanie'), `cans` (headphones), `ears` ('flop' | 'round' |
'none'), `shell` ('knit' | 'paper' | 'cloth' | 'bare'), `extras` ('handle',
'fold'). For the unmasked ones: `hair` ('afro' | 'crop'), `glasses` ('shades' |
'round'), `tache`, `beard`, `mouth`, and a real `_nose` — the `nose` deform
makes a ridge a mask can drape over, but on a bare face it is not a feature on
its own.

Curl density is `hair_n` against `hair_lump`: the lumps have to overlap or the
scalp shows between them. Fibonacci spacing is roughly `2·sqrt(pi/n)` in
normalised units, so halving the lump radius means roughly quadrupling the
count. The designer's perm is 230 lumps at 0.090 — and that is ~37k tris after
decimation, most of it hair, which is the one place this cast is expensive.

Three hair builds, because they are three different problems. **`afro`** is a
lump cluster on a fibonacci spiral — a smooth blob reads as a swim cap.
**`bob`/`bun`** is a shell over the skull with *two* cuts: an oval for the face,
then the whole front cleared below the jaw. Skip the second cut and the hair
closes under the chin and reads as a hood, which is what the first attempt did.
Dropping the oval's `z` below the brow gives a fringe, which is most of what
makes a bob read as hair rather than a helmet.
**`crop`** is a plain cap. A **beard is the opposite**: it hugs the jaw, so it is a
scaled spherical cap solidified into a shell that follows the skull. Built as
lumps it reads as a bunch of grapes stuck to the chin, which is exactly what the
first attempt looked like. The rule is about volume, not about hair: lumps for
a mass standing off the head, a shell for anything lying against it.

The afro is a fibonacci-spiral cluster of lumps on a dome rather than one smooth
blob, which is the difference between hair and a swim cap. Clear spectacles are
frame-only: even a transmissive lens greys out the eyes behind it, and the eyes
are the whole face.
The beanie is a ribbed dome plus a rolled brim, both with real rib relief; the
headphone band arcs over whatever is already on the head.

`mouth_style` is `line`, `grin` (dark maw plus a band of teeth) or `oh`. One lip
blob is the same blank expression on everybody; the teeth are what let a face
act. `muzzle` + `snout` make anyone who is not a person — the office dog is the
knit character's floppy ears from the very first build, reused on a snout.

`smile` curves the mouth blob by `x²`. Two hundredths of a unit is the whole
difference between a character you like and one you don't.

Props: `cig` (cigarette in the corner of the mouth), `pet_collar` (band and
tag), `earring`, `glasses_up` (specs pushed onto the forehead). A single prop carries more personality than any amount of proportion
tuning — the cigarette did more for the sales guy than his whole head shape.

The cap peak has to be sized off *itself*, not off the head: at `hy * brim_len`
it was a flat plate covering the whole crown. It is a small tongue hanging off
the front, and `cap_back` just spins it round.

### Why the arms used to look glued on

**Overlapping primitives always leave a crease along their intersection curve.**
It does not matter how far you push a deltoid ball into a torso — the seam is
still there, which is what makes a shoulder read as a ball stuck to a box. The
only fix is to stop having two surfaces.

So `geom.fuse` joins the torso, the deltoids, the sleeves and the neckline, runs
a **voxel remesh** over them and relaxes the result. The intersection is thrown
away and one skin is rebuilt, so the joint gets a real fillet. Everything fused
has to share a material — which the white tee does, and which is most of why a
single garment colour was the right call.

Two supporting pieces that are still separate: a **hem ring** caps each sleeve
where the capsule would otherwise round off into a sausage, and the torso
cross-section is a rounder superellipse (`p` 0.78, not 0.62 — at 0.62 the tee
was a slab with hard side edges).

Three things the upper body kept getting wrong, all connected:

- **No neck.** The shoulder dome's top ring had crept up to `shoulder + 0.17 H`,
  which is the chin. It has to stop well below — `+0.07 H` — and the neck itself
  needs real length. A bare character's neck is also *skin*: `neck_col` is the
  dark shadow a mask needs, and it was being used on faces with nothing on them.
- **A triangle chest.** Shoulder 0.575 tapering to waist 0.43 is a wedge. A tee
  is close to a tube: 0.585 / 0.560 / 0.515 / 0.530.
- **Arms in the wrong place.** The joint sat at `0.395 H` inside a `0.585 H`
  shoulder, so the arm hung out of the middle of the ribcage. It belongs near
  the outer edge, at `0.470 H` — and it has to sit low enough (`shoulder −
  0.26 H`) that the *sleeve's own end cap* stays under the shoulder line.
  Above it, the cap is a shoulder pad no matter how small the deltoid is.

The shirt hem tore for a while and it was not the remesh: **the thigh capsules
were breaching it.** Their rounded tops rose above the hem line and they were
wider than the trousers, so what looked like a ragged edge was two rounded caps
cutting through the shirt. Three constraints hold it together now, and changing
any leg dial can break them again:

    thigh top      <  shirt hem            (hem = crotch + 0.42 H)
    thigh outer    <  trouser half-width
    trouser width  <  shirt hem width

The shirt's own bottom is a rounded lip on the same superellipse profile rather
than a flat n-gon cap, which voxelises far more cleanly.

`collar` is `tee` — the whole cast wears one. The `shirt`, `jacket` and `hood`
builders that came before the uniform body have been removed; they are in the
git history if a garment is ever wanted again.

```bash
blender -b --factory-startup -P blender/roster.py -- --only newone,boss
python3 blender/contact.py
```

`--only` re-renders part of the sheet; `contact.py` tiles and labels it.

## How a head is put together

The mask is a real shell, not a painted-on hole. That is what gives the eye
openings a visible edge:

1. `_cranium` generates the head silhouette as a superellipsoid with a vertical
   profile function (chin taper, crown width) and an optional face flattening.
2. `_head_shell` runs it through Solidify, so the mask has `shell_t` thickness.
3. `_sockets` punches the eye holes clean through the front wall with a
   superellipse prism whose origin sits at the *inner* end of the hole — the
   splay pivots there rather than at the far end of a long cutter.
4. `_face` regenerates the same cranium shrunk by `shell_t + face_gap`. This is
   what you see through the holes, so both meshes must come from `_cranium` or
   they intersect.
5. `_eye` raycasts the face mesh to find the actual surface depth and anchors
   the eyeball to it, so reshaping the head can't bury the eyes.

## Getting the reference's read

Three things carry the look, and none of them is lighting:

- **The eye rims are modelled.** `_rims` sweeps a tube along a superellipse
  (`geom.se_torus`) to make a soft rounded-rectangle collar that stands proud of
  the mask. A flat cut hole reads as a hole; the collar reads as a face.
- **The ribs are geometry, not bump.** `geom.rib_relief` pushes real ridges along
  the vertex normals, so the knit breaks the silhouette at the edge of the head.
  A bump map cannot do that, which is why the first pass looked like plastic.
- **Value contrast.** Light grey mask against a near-black garment. When mask,
  garment and backdrop all sat within a few percent of each other, nothing read
  regardless of how good the geometry was.

## There has to be a face under the mask

The single biggest cause of the uncanny read was that there wasn't one: a blank
egg with two holes punched in it. `_cranium` now deforms in a **nose bulge, a
brow ridge and dished eye sockets**, and because both the mask shell and the head
under it come through that same function, the mask *drapes over* those features
the way a real balaclava does. The nose showing through the knit is what stops
it looking like a shell with eyes rattling around inside.

Two supporting fixes from the same pass: eyes moved closer together (set too
wide, a face reads as alien), and less blank mask below the eye line — a long
empty chin is the other half of the effect.

## The eyes

The first version read as creepy, and it was three specific things stacking, not
a vague vibe:

- **A bead pupil sitting proud of the ball.** Now the iris is built from three
  spherical caps laid flat *on* the ball (`on_ball` in `_eye`): a dark limbal
  ring, the coloured iris inside it, then the pupil. The limbal ring does most
  of the work — a single flat disc reads as a printed dot.
- **No lower lid.** An eye with white showing under it as well as over it looks
  wrong on any face. `lid_low` adds a shallow cap around the bottom pole.
- **White above the iris.** The real tell. A downward gaze with a small iris
  leaves sclera between the lid and the iris, which is the classic unsettling
  face. The fix is a wide iris (`iris` ~0.46 of the ball) sitting *under* the lid
  edge, so the lid touches the iris and no white shows above it.

Watch the ratios: the visible eye is the *rim opening*, not the ball, and the
ball is wider than the opening. An iris of 0.6 looked correct against the ball
and completely filled the window. Coverage arithmetic for the lids is
`(90 + lid_drop) / 180` for the upper and roughly `lid_low / 180` for the lower —
they will meet in the middle and close the eye if you set both generously.

## Into the game

```bash
blender -b --factory-startup -P blender/rig.py -- --who dog --out public/kit/driver.glb
```

The game does **not** load a static mesh: `src/render/kit.ts` fetches
`/kit/driver.glb` and `src/render/driverRig.ts` binds a skeleton **by bone name**,
throwing if any is missing. So the asset has to satisfy that contract exactly:

    hips > spine > chest > neck > head
    chest > upperarm.L/R > lowerarm.L/R > hand.L/R
    hips  > thigh.L/R > shin.L/R > foot.L/R
    head  > cable.1 > cable.2 > cable.3

`cable.*` is the headphone cable — `spec.cable` builds three segments and a plug
off the left can. Without them the game refuses to start, which is why the
driver spec forces `cans=True, cable=True, pose='sit'`.

Notes that cost time:

- **`limb_joints()` is the single source of truth.** The mesh and the armature
  have to agree exactly or the skin slides off the bones, so `_arms`, `_legs`
  and `rig.py` all read the joints from there rather than each recomputing them.
- **Weights are procedural, not bone heat.** The figure is a pile of rigid
  primitives, so almost every part belongs wholly to one bone. Only the welded
  garment spans several, and for that a rule (blend hips/spine/chest by height,
  hand anything near an arm to that shoulder) beats automatic weights, because
  we know where the shoulders are and bone heat has to guess.
- **Decimate before skinning.** Vertex groups are per index, so collapsing after
  assigning them shuffles the weights onto the wrong vertices.
- Blender convention: the figure faces −Y, so **+X is its left** — `.L` is `+X`.
  The game turns it a half turn to face down the track.

Swap the driver with `--who sales` / `--who intern` and so on. The previous
asset is kept at `public/kit/driver-previous.glb`.

## Game export (static, no rig)

```bash
blender -b --factory-startup -P blender/export.py -- --who pip --pose sit --decimate 0.35
```

Metres, soles on y = 0, +Y up. Verified loading in the project's own three.js
via `glb-check.html` — one node with a primitive per colour rather than a single
draw call, 11-12 material slots. The rib relief roughly doubled the budget: it
is ~42k tris per character at `--decimate 0.35`, which is fine for the driver
and too heavy for a floor full of people. That is the price of ribs that survive
in silhouette, and the way out is a normal-map bake, not a lower decimate ratio.

`--frame full` on `render.py` renders the landed figure at game scale instead of
the portrait crop.

## Materials

All procedural, no image textures. The knit rib is a radial gradient turned into
a sine bump — the ribs are meridians, so they converge at the gradient's pole.
`rib_fade` damps them out before they get there, otherwise the crown reads as a
sunburst; the ears take a plain knit for the same reason. Crossed with the ribs
is a second, higher-frequency wave along Z — the courses. Ribs on their own read
as moulded rubber; the stitch rows are what make it look knitted.

## Studio

Neutral cyclorama, soft key front-left, broad fill, rim, and a wash on the
backdrop. `Standard` view transform at −0.5 EV — AgX desaturated the beige
palette into white. Cycles on Metal, adaptive sampling, OIDN.

## What is under the mask

`--bare` answers it, and the answer is: nothing. There is no brow, no nose, no
mouth — six characters that are clearly different people with their masks on
collapse into the same egg with eyes on it once the mask comes off. That is not
a bug to fix so much as a fact about the design to decide about: **the mask is
not decoration on a character, it is the entire character.** Everything that
distinguishes the cast lives in the shell, the rim, the ears and the hat.

Two consequences worth deciding on before the game needs them: a character can
never take the mask off on screen, and any expression the game wants has to be
carried by the eyes, the head tilt and the body — there is no face to animate.

## Chill, not sad

The first cast read as miserable, and it was three cues stacking again: heavy
lids, a downward gaze, *and* the outer corner of each lid dropping. Any one is
fine; all three is a sad dog. The cast now runs a level gaze with a few degrees
of yaw — looking slightly off-axis rather than straight down the lens reads as
relaxed — a negative `lid_slant` so the outer corner sits level or a touch high,
and a lighter lower lid.

## Known rough edges

- **The head is an egg**, where the reference is closer to a rounded cube with a
  cheek pinch.
- The `nose` deform shows through a mask as a ridge between the eyes, which
  looked wrong on the new one's wide-set rims, so it is off for her. Whether a
  masked character wants a nose under it is a per-character call, not global.
- The bob's cut edge is clean where real hair would be thick and soft.
- The arm's shoulder cap used to breach the torso dome and read as two hills
  above the shoulder line; it is tucked under now, but the joint has no real
  deltoid — it is a capsule end.
- **The eye rims are a separate object** floating in front of the mask. In the
  reference that ring is the face's own skin pushing through the opening,
  continuous with the head; generating it from the face mesh is the fix.
- The jacket's shirt front reads as a dickie rather than a shirt on the
  narrower characters.
- **Procedural bump does not survive glTF.** The rib relief does (it is geometry)
  but the paper creases and fibre grain do not; they need a normal-map bake.
- `sack`'s torso is a plain mass with a shoulder profile — no real hoodie
  structure — and its bust framing drifted when the body was rebuilt.
- The hoodie's pocket and the jacket's lower body sit below the bust crop, so
  they only pay off in `--frame full`.
- No skeleton. Poses are baked per export, so the game gets `stand` and `sit` as
  separate meshes rather than one rigged character.
