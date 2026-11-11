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

```sh
blender -b --python-exit-code 1 -P scripts/cricket-characters/build_athlete.py -- scripts/cricket-characters/athletes/athlete-01.json apps/web/public/sinverse-cricket/athletes/athlete-01.glb hi
blender -b --python-exit-code 1 -P scripts/cricket-characters/build_athlete.py -- scripts/cricket-characters/athletes/athlete-01.json apps/web/public/sinverse-cricket/athletes/athlete-01-lo.glb lo
blender -b -P scripts/cricket-characters/preview_athlete.py -- <athlete.glb> <output prefix>
```

To add a player, add a JSON file to `athletes/` and its name to `SQUAD` in `realistic.ts`. The JSON file sets:

- body shape: `age`, `muscle`, `weight`, `height`, `proportions`
- ancestry blend: `race`
- skin, eyebrows and hair
- clothes

`height` is steep: 0.5 is about 1.70 m, and 0.58 is about 1.88 m.

## What the build does

| Step | Why |
|---|---|
| `HumanService.refit` with detailed helpers on | Without the helpers, MPFB places the skeleton for the default body, so the joints don't match the athlete's shape |
| Game-engine materials, alpha only on hair, brows and lashes | MakeHuman routes every texture's alpha into the shader. Without this, glTF exports skin and clothes as blended, and their back faces show through in patches |
| Kit base swapped to the suit's ambient-occlusion map | It keeps the fabric folds but drops the MakeHuman logo printed on the source shirt. The game tints it per team |
| Textures capped at 1024 px for skin and 512 px for the rest, saved as JPEG where opaque | Each model is about 1.3 to 2.0 MB, down from 13.8 MB |
| Mixamo-compatible rig, 52 bones including fingers | The game maps the procedural rig onto these bone names |
| `lo` level: `male1591` body, cloth and hair decimated, no brows or lashes, textures halved, no normal maps | About 6,100 to 7,800 triangles and 0.3 to 0.5 MB, against about 31,600 and 1.3 to 2.0 MB for `hi` |

## Licences

[LICENSES.md](LICENSES.md) lists every asset in each model and its source.

## How the game uses them

- **Two skeletons per player.** The procedural rig still runs every pose with its IK. It's moved to a layer the camera doesn't draw.
- **Retargeting.** Each realistic skeleton is first set into the procedural rig's rest pose, with limbs hanging and the spine upright. After that, each bone copies its driver bone's rotation.
- **Sizing and hips.** Each body is sized by leg length, and the pelvis is placed so the real hip joints sit on the driver's hip joints.
- **Arm length.** Arms are lengthened at most 12% (`ARM_STRETCH_MAX`) to match the procedural rig's reach.
- **Hands and feet.** A two-bone reach then pulls the real wrists and ankles onto the driver's, so the bat stays in the hands and planted feet don't slide.
- **Bat.** The bat stays on the driver's bat bone, so contact is unchanged.
- **Other equipment.** The helmet, pads and gloves attach to the realistic skeleton.
- **Detail levels.** On Low and Medium everyone wears the light (`lo`) athlete. On High and Ultra, the batters, bowler, keeper, umpire and toss captains wear the detailed (`hi`) one.
- **Draw calls.**
  - Each athlete's meshes share one skeleton, which also means one bone texture on the GPU.
  - The kit and shoes are one mesh. A `kitPart` vertex attribute selects the shirt, trouser or shoe colour in the shader.
  - The helmet, pads and gloves are one rigidly skinned mesh, and the bat is one mesh.
- **Fallback.** Models load in the background. Until they arrive, or if they can't be loaded, the procedural bodies are drawn as before.
- **Textures.** Embedded textures are decoded through `<img>`, because the site's Content-Security-Policy blocks `fetch()` of `blob:` URLs.
- **Tests.** `apps/web/e2e/cricket-realistic.spec.ts` checks the models, the kit and the reach accuracy.

## Motion clips

`apps/web/public/sinverse-cricket/motion/ual1.glb` and `ual2.glb` are skeleton-only extracts of Quaternius's Universal Animation Library 1 and 2 (CC0, see [LICENSES.md](LICENSES.md)), made with `extract_motion.py`:

```
blender -b --python-exit-code 1 -P scripts/cricket-characters/extract_motion.py -- "<UAL1>/Godot/AnimationLibrary_Godot_Standard.glb" apps/web/public/sinverse-cricket/motion/ual1.glb "Idle_Loop,Walk_Loop,Jog_Fwd_Loop,Sprint_Loop,Crouch_Idle_Loop,Roll,Dance_Loop,Jump_Start,Jump_Land,Idle_Talking_Loop"
blender -b --python-exit-code 1 -P scripts/cricket-characters/extract_motion.py -- "<UAL2>/Unreal-Godot/UAL2_Standard.glb" apps/web/public/sinverse-cricket/motion/ual2.glb "OverhandThrow,LayToIdle,Slide_Start,Slide_Loop,Slide_Exit,Yes,Idle_FoldArms_Loop,Idle_No_Loop,NinjaJump_Land"
```

On Windows pass the library paths as `D:/...`, not Git Bash's `/d/...`; Blender can't read the latter.

The libraries have no cricket-specific motion (no strokes, keeping or bowling), so those are procedural: `batting.ts`, `fielding.ts` and the keyed poses in `animation.ts`, solved onto the ball with IK.
