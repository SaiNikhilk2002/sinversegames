# Sinverse Cricket athletes

This folder builds the realistic cricketers that Sinverse Cricket draws in 3D. Each athlete is a fictional person made from CC0 MakeHuman assets in Blender, and exported as a GLB to `apps/web/public/sinverse-cricket/athletes/`.

The game doesn't animate these models on their own. The existing procedural rig keeps doing the animation, and `apps/web/src/games/sinverse-cricket/realistic.ts` copies its motion onto each model's skeleton. That rig already handles the bat grip, the bowling release point and planted feet, and is tested for them. See [How the game uses them](#how-the-game-uses-them).

## Tools

All the tools are free.

| Tool | Version | Licence | Notes |
|---|---|---|---|
| Blender | 4.5.16 LTS, the portable Windows zip | GPL-3.0 | The GPL covers Blender itself, not the files you make with it. SHA-256 `e258e90a1ebc14798ad65b3426bc5f11f5e0e013541c61cc7c3ee9bbf4ca0ce6` |
| MPFB (MakeHuman plugin for Blender) | 2.0.18, from extensions.blender.org | GPL-3.0-or-later, code only | It isn't shipped with the game. SHA-256 `c075b3e9b94b8e5556a5f03f4653602d02ea306de08126e8f55ed6dee28a2dad` |
| MakeHuman system assets | Asset pack | CC0 | Body, proxies, eyes, eyebrows, eyelashes, hair, clothes, shoes |
| MakeHuman skins | Packs `skins01`, `skins02`, `skins03` | CC0 | |

On Windows, MPFB's deep folder paths exceed the 260-character limit during `blender --command extension install-file`. Unzip it into `<blender>/portable/extensions/user_default/mpfb` instead, and enable `bl_ext.user_default.mpfb`.

Unzip the asset packs into MPFB's user data folder. To find that folder, run Blender with MPFB enabled and call `LocationService.get_user_data()`.

## Building

Rebuild every athlete, both levels of detail, with `build_all.sh` (about 2.5 minutes):

```sh
BLENDER=/path/to/blender scripts/cricket-characters/build_all.sh
```

Or one at a time:

```sh
blender -b --python-exit-code 1 -P scripts/cricket-characters/build_athlete.py -- scripts/cricket-characters/athletes/athlete-01.json apps/web/public/sinverse-cricket/athletes/athlete-01.glb hi
blender -b --python-exit-code 1 -P scripts/cricket-characters/build_athlete.py -- scripts/cricket-characters/athletes/athlete-01.json apps/web/public/sinverse-cricket/athletes/athlete-01-lo.glb lo
blender -b -P scripts/cricket-characters/preview_athlete.py -- <athlete.glb> <output prefix>
```

To add a squad model, add a JSON file to `athletes/` and its name to `SQUAD` in `realistic.ts`, and a row to `TRAITS` in `athlete-look.ts`. The JSON file sets:

- body shape: `age`, `muscle`, `weight`, `height`, `proportions`, and optional `body` targets (for example `torso-vshape-incr`)
- ancestry blend: `race`
- the face: `face`, a map of MakeHuman target names to weights (nose, jaw, chin, cheeks, mouth, ears, head shape), including a couple of `asym-*` targets so no face is perfectly symmetric
- skin, `eye` colour (a MakeHuman eye material: brown, brownlight, bluegreen, grey and so on), eyebrows and hair (empty for a close crop, drawn by the skin shader)

`height` is steep: 0.5 is about 1.70 m, and 0.58 is about 1.88 m. The squad runs from about 1.75 to 1.93 m.

Body rules every athlete follows (see the anatomy section of `docs/SINVERSE_CRICKET_CHARACTER_REALISM_REPORT.md`):

- `age` at least 0.5. Below that, MakeHuman blends in its child shape (a larger head, a softer torso): at 0.47 the body is 9% child.
- `weight` at most about 0.55. Above it the male chest gathers soft volume that reads as rounded under a shirt; give heavier builds their size with `muscle` and waist targets instead.
- Every athlete carries the chest targets `breast-volume-vert-up`, `breast-point-decr` and `measure-bust-circ-decr` (full strength on broad builds, 60% on lean ones) and `stomach-pregnant-decr` 0.6. They lift and square the lower edge of the pectorals, which otherwise droops in a rounded curve with a shadow under it, without flattening the muscle.

## What the build does

| Step | Why |
|---|---|
| `HumanService.refit` with detailed helpers on | Without the helpers, MPFB places the skeleton for the default body, so the joints don't match the athlete's shape |
| Face and body targets per athlete | Ten distinct faces (nose, jaw, chin, cheekbones, lips, ears, head shape) with small asymmetries, rather than one face recoloured |
| **Cricket kit cut from the `helper-tights` geometry** | The tights follow the athlete's exact shape and carry the rig's weights. They are cut into a shirt (short sleeves, neckline) and trousers (waist to ankle). The sleeve cuts only remove arm geometry, and stray scraps are dropped, again after the shirt's last decimation (a scrap joined to the sleeve by a thin strip is severed only then) |
| Ease, drape and folds | The shirt is eased off the body (barely looser over the belly, eased in over 10 cm to the tuck, so it falls straight from the chest rather than ballooning), then smoothed and pushed back outside its own eased shape, so it bridges the hollows under the chest and down the spine instead of clinging. Openings are pinned so hems stay put. Trousers hang straight below the knee. Compression folds are added across the elbows, waist, knees and ankles |
| Collar, cuffs, waistband | A two-row fold-over collar (higher at the back), turned hems on the sleeves and ankles, and a waistband. The collar and cuffs are marked as trim, which the game colours in the team's accent |
| Shirt subdivision (detailed only) | The collar and shoulders are seen up close in every batting and bowling shot. Trousers stay at the tights' density |
| Skin under the kit removed | About 2,300 body faces covered by the kit are deleted, so skin can never show through cloth when a limb bends |
| Baked occlusion | Cycles bakes ambient occlusion into the kit's vertex colours (folds, armpits, under the collar) |
| Kit vertex colours | `COLOR_0` = (trim, occlusion, part/2, 1); part is 0 for trousers and 1 for the shirt |
| Facial hair and scalp masks | From the basemesh's lips, eyes, ears and scalp groups and a measured chin point: beard (jaw, cheeks, sideburns, under the chin), moustache, scalp (the artist-drawn hairline) and chin, copied to the body by nearest vertex as its `COLOR_0` |
| High-detail eyes and natural lashes (detailed only) | MakeHuman's `high-poly` eyes, with a cut-out cornea, and the shorter `eyelashes03` |
| Game-engine materials, alpha only on hair, brows, lashes and eyes | MakeHuman routes every texture's alpha into the shader. Without this, glTF exports skin and clothes as blended, and their back faces show through in patches |
| WebP textures, capped at 1024 px for skin and hair, 512 px for the rest | About 1.9 to 2.3 MB per detailed model and 0.3 to 0.5 MB per light one |
| Mixamo-compatible rig, 52 bones including fingers | The game maps the procedural rig onto these bone names |
| `lo` level: `male1591` body, low-poly eyes, kit and hair decimated, no brows or lashes, textures halved, no normal maps | About 6,600 to 9,000 triangles, against about 36,000 to 40,000 for `hi` |

## Licences

[LICENSES.md](LICENSES.md) lists every asset in each model and its source.

## How the game uses them

- **Two skeletons per player.** The procedural rig still runs every pose with its IK. It's moved to a layer the camera doesn't draw.
- **Retargeting.** Each realistic skeleton is first set into the procedural rig's rest pose, with limbs hanging and the spine upright. After that, each bone copies its driver bone's rotation.
- **Sizing and hips.** Each body is sized by leg length, and the pelvis is placed so the real hip joints sit on the driver's hip joints.
- **Arm length.** Arms are lengthened at most 12% (`ARM_STRETCH_MAX`) to match the procedural rig's reach.
- **Hands and feet.** A two-bone reach then pulls the real wrists and ankles onto the driver's, so the bat stays in the hands and planted feet don't slide.
- **Fingers.** Each hand's curl axis is measured from its own knuckle line and thumb at rest, so fingers bend towards the palm. Fielders get a graded, relaxed curl; batters and keepers an even grip.
- **Appearance per player** (`athlete-look.ts`). A player's identity picks, deterministically:
  - facial hair: clean, stubble, short or full beard, moustache, goatee or chin strap
  - haircut: the model's own, a buzz cut, or shaved
  - hair colour and greying
  - a small skin tone shift

  The skin shader draws facial hair and buzz cuts from the masks. The same player looks the same in every match and replay.
- **Materials.**
  - Skin is wrap-lit, so light bleeds softly past the terminator, reddest first, with fine pores up close.
  - Eyes are glossy with a clear coat.
  - Hair is matte cut-out cards, with alpha-to-coverage where there is multisampling.
  - The kit is a sheen fabric material with the baked occlusion.
- **Equipment.**
  - The bat stays on the driver's bat bone, so contact is unchanged.
  - The helmet (shell, peak, steel grille) and pads (bolsters, knee rolls, straps) are generated to fit each model's measured head and shins. They are rigidly skinned to the head and shins.
  - Gloves are each athlete's own hand skin, thickened and skinned to the same finger bones, so they bend with the fingers.
- **Detail levels.**
  - On Low and Medium everyone wears the light (`lo`) athlete.
  - On High and Ultra, the batters, bowler, keeper, umpire and toss captains wear the detailed (`hi`) one.
  - Past 45 m from the camera a player's eyes aren't drawn.
  - Only the models a match uses are downloaded.
- **Draw calls.**
  - Each athlete's meshes share one skeleton, which also means one bone texture on the GPU.
  - The shirt, trousers and shoes are one mesh. A `kitInfo` vertex attribute selects the colour in the shader.
  - A batter adds four meshes (bat, helmet, pads, gloves).
- **Fallback.** Models load in the background. Until they arrive, or if they can't be loaded, the procedural bodies are drawn as before.
- **Textures.** Embedded textures are decoded through `<img>`, because the site's Content-Security-Policy blocks `fetch()` of `blob:` URLs.
- **Tests.** `apps/web/e2e/cricket-realistic.spec.ts` covers:
  - the models and their budgets
  - the kit and the fit of the gear
  - cloth staying on the body in extreme poses
  - the masks and appearance variety
  - the reach accuracy
- **Review.** The development page `/dev/cricket-studio` draws athletes through the game's own code in studio, day or night light, for close-up review. It returns 404 in production unless `CRICKET_STUDIO=1` is set.

## Motion clips

`apps/web/public/sinverse-cricket/motion/ual1.glb` and `ual2.glb` are skeleton-only extracts of Quaternius's Universal Animation Library 1 and 2 (CC0, see [LICENSES.md](LICENSES.md)), made with `extract_motion.py`:

```
blender -b --python-exit-code 1 -P scripts/cricket-characters/extract_motion.py -- "<UAL1>/Godot/AnimationLibrary_Godot_Standard.glb" apps/web/public/sinverse-cricket/motion/ual1.glb "Idle_Loop,Walk_Loop,Jog_Fwd_Loop,Sprint_Loop,Crouch_Idle_Loop,Roll,Dance_Loop,Jump_Start,Jump_Land,Idle_Talking_Loop"
blender -b --python-exit-code 1 -P scripts/cricket-characters/extract_motion.py -- "<UAL2>/Unreal-Godot/UAL2_Standard.glb" apps/web/public/sinverse-cricket/motion/ual2.glb "OverhandThrow,LayToIdle,Slide_Start,Slide_Loop,Slide_Exit,Yes,Idle_FoldArms_Loop,Idle_No_Loop,NinjaJump_Land"
```

On Windows pass the library paths as `D:/...`, not Git Bash's `/d/...`; Blender can't read the latter.

The library's idle slumps (head forward, knees bent, hands cupped in front of the thighs) and its sprint curls the back with the head hanging, so `carriage()` in `motion.ts` corrects every locomotion pose towards an athlete's carriage: trunk and neck pitch per gait, eyes level, and, standing, arms hanging free with palms to the thighs, soft knees and feet under the hips. It changes pitch only, so each gait keeps its sway.

The libraries have no cricket-specific motion (no strokes, keeping or bowling), so those are procedural: `batting.ts`, `fielding.ts` and the keyed poses in `animation.ts`, solved onto the ball with IK.
