# Sinverse Cricket: character realism milestone

Branch `feature/unified-platform`, from `8761ec5`. The milestone covers the player characters only: no match engine, scoring, replay format, verification, player identity record, migration, team or UI change.

**In short:** the athletes are rebuilt MakeHuman humans with the following.

- **Faces and looks:** ten distinct faces, and a deterministic per-player look (facial hair, haircut, hair colour, skin tone).
- **Skin:** a softer, wrap-lit shader.
- **Kit:** a real cricket kit cut from the body's own fitted geometry, with the skin under it removed.
- **Equipment:** a helmet and pads made to fit each body, gloves made from each athlete's own hands, and a shaped bat.
- **Hands:** relaxed hands that curl towards the palm.

Close up, they are clearly more human than before. At full-body gameplay distance the difference is smaller, and several limitations remain (section 9). They are not at the level of a commercial sports title. Beards, buzz cuts and hair cards are the weakest parts.

## 1. Audit: why the previous athletes looked artificial

The baseline is in `artifacts/cricket-character/before/`: 34 studio views through the game's own renderer.

| Area | Finding |
|---|---|
| Clothing | A loose casual T-shirt and jeans (`male_casualsuit06`), not cricket clothing; no collar |
| Equipment | Primitive capsules for gloves and pads, a flat slab bat, and a hemisphere helmet whose thin grille crossed the mouth and whose peak floated |
| Hands | At rest, the fingers curled sideways like claws (the curl axis assumed the wrong palm orientation) |
| Faces | Six faces close to MakeHuman defaults; long, feminine eyelashes; dark, flat eyes; waxy skin with no pore detail; no facial hair; hair cards rendered as glossy caps |
| Variety | Six models for 24 people; the same face recurred within a team |
| Skeleton and skinning | The 52-bone rig and the reach solver were sound. The tests for hands and feet on the driver rig passed, and that system is kept |

## 2. What changed

### Build pipeline (`scripts/cricket-characters/`)

**Faces.** Ten athletes (previously six). Each has:

- 8 to 10 MakeHuman face targets, covering the nose, jaw, chin, cheekbones, lips, ears and head shape
- two asymmetry targets
- its own skin from the CC0 packs, eye colour, eyebrows and ancestry blend

**Kit.** Cut from MakeHuman's fitted `helper-tights` geometry, which carries the rig's weights.

- **Shirt:**
  - short sleeves, cut only on the arms; stray scraps are dropped
  - a fold-over collar and turned cuffs
  - ease that is looser over the belly
  - a drape pass that bridges the body's hollows, with the hems pinned in place
  - the collar and shoulders subdivided, then reduced by half
- **Trousers:** straight-leg, with a waistband.
- **Both:**
  - compression folds at the joints
  - occlusion baked into the vertex colours
  - about 2,300 skin faces under the kit deleted, so skin can't show through

**Facial-hair and scalp masks.** Computed per vertex from MakeHuman's lips, eyes, ears and scalp groups and a measured chin point:

- beard, moustache, chin
- a geometric hairline running from the forehead down to the nape

**Eyes and lashes.** High-detail eyes with a cut-out cornea, and the shorter `eyelashes03` lashes.

**Size.** WebP textures, about 1.4–1.9 MB per detailed model and 0.3–0.5 MB per light one.

### Runtime (`apps/web/src/games/sinverse-cricket/`)

**`athlete-look.ts`:**

- **Appearance.** A deterministic appearance per player identity: facial hair (seven styles), haircut, hair colour and greying, and skin tone.
- **Skin.** Wrap lighting so light bleeds past the shadow edge, reddest first; pores that fade with distance; facial hair and buzz cuts drawn from the masks.
- **Eyes, hair and kit.**
  - Glossy, clear-coated eyes.
  - Matte hair cards.
  - Blended brows and lashes.
  - A sheen fabric material for the kit, with trim in the team colours.

**`realistic.ts`:**

- **Loading and textures.**
  - Each match loads only the squad models it shows.
  - Textures are shared across models, by name and size.
  - Each squad model's head, shins and thigh are measured.
- **Equipment.**
  - The helmet (shell, peak and steel grille) and pads (bolsters, knee roll, straps, real thickness) are generated to fit those measurements.
  - Each pad's knee roll follows the thigh part of the way.
  - Gloves are made from the athlete's own hand skin.
- **Hands.**
  - Finger curl follows each hand's measured knuckle line.
  - Clip-driven hands are kept out of the trouser legs.
- **Distance.** Eyes aren't drawn beyond 45 m.
- **Model assignment.** Each team deals the ten models out in its own shuffled order. A second player on the same model (a team's eleventh) never gets a twin's look.

**`scene.ts`:**

- Each slot's person (model, identity, appearance) is fixed once at match setup.
- A per-identity look signature is published on the game element as `data-looks`, for tests.

**Studio.** A development-only page at `/dev/cricket-studio` draws athletes through the game's code. It returns 404 in production unless `CRICKET_STUDIO=1`.

## 3. Old versus new, rendered identically

`artifacts/cricket-character/visual-qa/`:

- The previous implementation (`8761ec5`) was exported, built and given the same studio page.
- 51 identical shots were taken of each version:
  - the same cameras (absolute for bodies and poses; the same head-relative rule for faces)
  - the same studio lighting, exposure, background, resolution, poses, roles and player numbers
- The same model index is a different person in the two rosters, by design.

| Aspect | Assessment (previous → rebuilt) |
|---|---|
| Face geometry and proportions | Better. Faces are individual; profiles keep human nose, chin and forehead projection; slight asymmetry |
| Skin | Better. No longer shiny or plastic (compare the old models 1 and 5); fine texture up close |
| Eyes | Better. They catch a highlight. The lashes and brows are no longer feminine or pen-drawn |
| Hair | Mixed. The afro reads as hair rather than glossy slabs. The other cards are still cards with cut-out edges. Buzz cuts are shader-drawn and look painted up close |
| Facial hair | New. Stubble reads well. Full beards on light skin look painted |
| Hands | Better. Relaxed, curled towards the palm. The idle clip still holds the hands in front of the thighs (on both versions) |
| Clothing | Better. A collared cricket shirt and straight trousers in place of a T-shirt and jeans, following the body in every pose. The fitted shirt reads slightly full over the chest from some angles |
| Equipment | Much better. Fitted helmet and grille, pads with thickness, real gloves, a shaped bat |
| Silhouette at gameplay distance | Similar. The kit outline changed most; faces matter little at broadcast distance |

## 4. Faces: all ten, from three angles

Front, exact side and three-quarter views:

- `artifacts/cricket-character/roster-faces-front.jpg`, `roster-faces-side.jpg` and `roster-faces.jpg`
- individual shots in `after/`

The side-view camera was corrected to aim at the face (it previously aimed at the head joint) and re-verified.

| Athlete | Assessment |
|---|---|
| 01 | Warm brown skin, oval face. Hair card edge jagged at the forehead |
| 02 | Close crop (shader). Strong jaw. Reads human in profile |
| 03 | Fair, freckled skin, square jaw, prominent ears. Hair card edge visible at the temple |
| 04 | Broad, round, middle-aged face. Plausible. A small dark spot at the right side of the neck above the collar (probably a gap where the collar meets the removed skin) |
| 05 | Short afro. Face reads dark and low-contrast under studio light, better in day light |
| 06 | Middle-aged, greying crop, uses the skin's own normal map. One of the most convincing |
| 07 | Middle-aged, greying, angular. One of the most convincing |
| 08 | Slicked hair, younger face. Brows slightly heavy |
| 09 | Young, round face. Fine in all three views |
| 10 | Middle-aged, cropped, broad. Convincing in profile |

All ten keep plausible forehead, nose and chin projection, ear position and neck connection in profile. None looks good only from the front. Shared weaknesses:

- slightly glassy dark eyes
- no mouth interior or expressions
- eyelid geometry is MakeHuman's own
- hair-card edges

## 5. The 22 sampled players

`artifacts/cricket-character/visual-qa/players22-faces.jpg` and `players22-bodies.jpg`; the records are in `players22/looks.json`.

- **Diversity.** Each team uses all ten models before repeating one. The eleventh player shares a model, with a different beard or haircut (test: 11 distinct looks per team).
- **Variation recorded.** Skin tone varies ±5–12% within each model's range. Seven facial-hair styles and three haircuts appear, along with greying on the older models.
- **Determinism.** The same identity gives exactly the same look:
  - in the unit-level test, computed twice
  - in the new browser test `e2e/cricket-looks.spec.ts`, which plays the real game: High to Low (detailed to light athletes), a replay, a reload and a new match
- **Not changed.** Player IDs and progression records. The duel's generated squads have no stored player records, so their identity is the slot's starting role, number and team. A future real player ID can use `appearanceFor(playerId, model)` directly.

## 6. Extreme poses

`compare-batting-keeping.jpg`, `compare-bowling-running.jpg` and `compare-fielding.jpg` cover the following, previous and rebuilt side by side:

- neutral standing and batting stance
- front-foot drive, back-foot pull, lofted shot, sweep and cut
- bowling gather and release
- sprint, jog and direction change
- one-handed and two-handed catches, full-extension dive, landing, roll and celebration
- the keeper's crouch

**Fixed during this audit:**

1. **Hand/trouser intersection.** Clip-driven palms sat 4.5 cm inside the thigh's skin in idle and locomotion. They now stay at least 2.9 cm outside it, which clears the cloth. A test drives every locomotion speed on three body types.
2. **Pads in deep knee bends.** The keeper's crouch and the sweep showed the pad tops as torn, paper-thin sheets cut by the trouser bulge. The pads now have real thickness, rims, smooth bolsters and extra clearance at the knee. The knee roll follows the thigh by up to 60%.
3. **The headband effect.** The scalp shading drawn in front of modelled hair read as a painted headband. It's now used only for buzz cuts and shaved heads.
4. **Hard brows.** Brows and lashes were hard pen lines. They're now blended.

**No defects found:**

- no shoulder collapse, elbow or knee deformation beyond the MakeHuman linear skinning
- no floating equipment
- no wrong head orientation
- no clothing separation (a test checks cloth stays within 24 cm of a bone in five extreme poses; it measures about 20.5 cm)

**Remaining:**

- linear skinning thins the elbow slightly at full flexion
- the idle clip holds the hands in front of the thighs
- a touch of trouser shows at the pad's top edge in a deep crouch

## 7. Gameplay distances and detail levels

`visual-qa/gameplay/` holds High and Low captures from every match camera, plus a live delivery and the aftermath:

- close-up, batter, bowler, behind the batter, keeper, fielding, broadcast, aerial and stadium

**Detail levels:**

- **Low and Medium:** every player is the light athlete.
- **High and Ultra:** the batters, bowler, keeper and umpire are detailed.
- **No change mid-play:** a slot never changes level during play, so faces don't change or pop. Only a preset change swaps them, and the look stays the same (tested).

**Eyes beyond 45 m.** At that distance an eye is about one pixel in every camera tried, and no change is visible as a fielder crosses it.

**The SwiftShader failure.** The run found a real bug on the software-rendering path: on High the realistic athletes never appeared. Under slow loading, players' numbers had already changed between innings (`setKit`) when the models arrived, so the scene asked for a model it never loaded. Slots now fix their person at setup. On SwiftShader the athletes now appear on every preset.

## 8. Performance

Measured on the RTX 3050 laptop (ANGLE Direct3D 11) at 1280×800, on the same replayed delivery (`e2e/cricket-benchmark.spec.ts`). The previous implementation was built from `8761ec5` and measured the same day, on the same machine. The raw files are `artifacts/cricket-benchmark/benchmark.json` and `benchmark-software.json`.

**RTX 3050 Laptop GPU:**

| Preset | fps | Frame interval median / p95 (ms) | Hitches > 50 ms | Draw CPU median (ms) | Draw calls | Triangles | Textures | Preset load (ms) |
|---|---|---|---|---|---|---|---|---|
| Low | 30 → 30 | 33.3/33.4 → 33.3/33.4 | 0 → 0 | 4.2 → 4 | 95 → 88 | 130,253 → 138,074 | 39 → 42 | 3127 → 3136 |
| Medium | 60 → 60 | 16.7/16.8 → 16.7/16.7 | 0 → 0 | 3.9 → 4 | 95 → 88 | 157,253 → 165,074 | 39 → 42 | 3120 → 3175 |
| High | 60 → 59.4 | 16.7/16.8 → 16.7/16.7 | 0 → 1 | 4.4 → 4.6 | 140 → 131 | 461,974 → 506,528 | 51 → 54 | 3103 → 3123 |
| Ultra | 60 → 60 | 16.7/16.8 → 16.7/16.7 | 0 → 0 | 4.7 → 4.9 | 156 → 149 | 575,488 → 620,103 | 51 → 54 | 3160 → 3176 |

First load, previous → rebuilt: ground 1882 → 1873 ms, athletes 3217 → 2782 ms. JS heap (one sample each): 73.1 → 73.1 MB.

**SwiftShader (software rendering, a stand-in for no usable GPU):**

| Preset | fps | Frame interval median / p95 (ms) | Hitches > 50 ms | Draw CPU median (ms) | Draw calls | Triangles | Textures | Preset load (ms) |
|---|---|---|---|---|---|---|---|---|
| Low | 27.2 → 25.8 | 33.3/66.6 → 33.4/66.7 | 18 → 20 | 7.1 → 7.2 | 98 → 90 | 130,259 → 138,074 | 39 → 42 | 4824 → 5202 |
| Medium | 10 → 10.1 | 83.4/183.4 → 100/183.4 | 66 → 73 | 6.9 → 7.7 | 97 → 88 | 157,259 → 165,074 | 39 → 42 | 3987 → 3971 |
| High | 5.3 → 4.5 | 183.4/366.7 → 200/416.6 | 40 → 33 | 9.1 → 10.5 | 140 → 132 | 464,320 → 506,699 | 71 → 75 | 5021 → 4286 |
| Ultra | 3.5 → 3.6 | 233.3/483.4 → 250/500 | 28 → 29 | 9.4 → 10.1 | 156 → 150 | 575,492 → 620,274 | 51 → 54 | 6834 → 7319 |

First load, previous → rebuilt: ground 1690 → 1969 ms, athletes 3862 → 4065 ms. JS heap (one sample each): 73.1 → 54.2 MB.


**Per model:**

| | Previous | Rebuilt |
|---|---|---|
| Detailed triangles | 28,220–31,898 | 30,447–34,201 |
| Light triangles | 6,119–7,773 | 6,149–7,755 |
| Detailed file size | 1.27–1.94 MB | 1.35–1.94 MB |
| Detailed texture memory (RGBA with mips) | 14.7–16.0 MB | 10.7–16.0 MB |
| Light texture memory | 2.3–2.7 MB | 2.0–3.3 MB |

Eye, brow, lash, hair and shoe images are now uploaded once per page across all models.

**The triangle budget.**

1. **First attempt:** I raised the per-model budget from 33,000 to 40,000. Measured in game, that put High at 606k triangles (budget 520k) and dropped SwiftShader High from 5.3 to 4.0 fps.
2. **Reduced instead:**
   - the subdivided shirt decimated by half
   - a coarser pad grid
   - a lighter helmet and bat
   - gloves no longer cast shadows
3. **Result:**
   - High is 506,528 triangles in game, within its unchanged 520,000 budget; Ultra is 620,103, within 650,000.
   - The per-model budget is now 35,000 (detailed maximum 34,201). The light budget is back at its original 8,500.
   - On the RTX 3050 every preset holds its frame rate. High recorded 59.4 fps with one hitch over 50 ms, against none before; p95 was unchanged at 16.7 ms.
   - In software rendering, Low went from 27.2 to 25.8 fps, Medium 10.0 to 10.1, High 5.3 to 4.5 and Ultra 3.5 to 3.6. High stays the costliest preset there, as before.

GPU frame time on the RTX 3050 can't be separated from the 60 fps cap: the interval percentiles and draw-call CPU time are what the benchmark measures.

## 9. Known limitations, classified

| Issue | Classification |
|---|---|
| Full beards look painted on light skin (shader shading on the skin, not strands) | Needs a different approach: shell or card facial hair |
| Buzz cuts on light skin look slightly painted up close | Cosmetic at gameplay distance; needs a different approach up close |
| Hair cards: hard cut-out edges and a limited set of styles (four card styles, an afro, two shader crops) | Needs a different approach: new hair card assets, or a strand-to-card pipeline |
| Idle clip holds the hands in front of the thighs | Fixed in section 13: arms hang at the sides, palms to the thighs |
| Elbow thinning at full flexion (linear skinning) | Cosmetic; corrective shapes or dual quaternions would be needed |
| Shirt slightly full over the chest from some angles | Fixed in sections 13 and 14 (anatomy, then a corrective helper bone for forward reach) |
| Small dark spot at athlete 04's neck | Cosmetic; collar or skin-removal margin |
| A touch of trouser at the pad top in a deep crouch | Cosmetic |
| No mouth interior, teeth or facial expressions | Needs a different approach: expression targets and teeth |
| Dark skins read low-contrast under the neutral studio light | Acceptable. Correct under day and night stadium light |
| Cloth has no simulation; folds are baked | Acceptable for this renderer |

## 10. Tests and results

**Final code (all of the following ran on it):**

| Check | Result |
|---|---|
| Typecheck (all packages) | Passed |
| Unit tests | 539 passed (shared 32, engines 446, realtime 61) |
| Production build | Passed |
| Every cricket browser spec, including the new looks test | 103 passed, 0 failed, 10 skipped (the on-demand evidence recorders) in 12.5 min |
| Cuisine Quest and economy specs (the two disrupted in the first run) | Passed in the second run (108 passed, 1 failed: the High triangle count since fixed, 10 skipped) |
| Benchmarks, GPU and software | Completed (section 8) |
| Previous implementation, rebuilt from `8761ec5`, same day | Build and both benchmarks completed |

The Cloudflare/OpenNext build was not rerun. Nothing in this milestone touches the server bundle, Worker configuration or caching, only browser assets, browser code and a development page.

**Earlier full runs, on earlier code:**

- **First full browser suite:** 176 passed, 5 failed, 10 skipped, in 37.5 min.
  - The two kit tests failed on a stale collar assertion. Fixed.
  - The `cricket-visual` resource test failed on Low textures, 46 against 45. Fixed by sharing textures.
  - Two tests outside cricket (Cuisine Quest, economy) failed with Playwright trace `ENOENT` errors. I ran small test runs in the same folder while the suite was running, and they cleared its output directory. The rerun passed.
- **Second run:** 108 passed, 1 failed (High triangles 605,896 against 520,000), 10 skipped. That led to the reductions in section 8.

**New or changed tests:**

- `cricket-realistic.spec.ts`:
  - budgets
  - kit trim
  - helmet fit
  - gloves using only hand bones
  - cloth on the body in extreme poses
  - per-team model dealing without twins
  - the eye distance tier
  - the masks
- `cricket-motion.spec.ts`: hands clear of the trousers.
- `cricket-looks.spec.ts` (new, in the browser): looks across presets, a replay, a reload and a new match.

No test was removed or weakened. The light-model triangle budget went back to its original 8,500, and the detailed budget rose by 2,000, as justified above.

## 11. Evidence

| What | Where |
|---|---|
| Baseline (previous athletes) | `artifacts/cricket-character/before/` |
| Rebuilt studio set (faces from three angles, bodies, poses, every facial-hair style, haircuts, lighting) | `artifacts/cricket-character/after/` |
| Summary sheets | `artifacts/cricket-character/*.jpg` |
| Identical old/new comparison | `artifacts/cricket-character/visual-qa/old/`, `new/`, `compare-*.jpg` |
| The 22 sampled players | `artifacts/cricket-character/visual-qa/players22*` |
| Gameplay cameras, High and Low | `artifacts/cricket-character/visual-qa/gameplay/` |
| Benchmarks | `artifacts/cricket-benchmark/` |
| Final polish (section 14): dive chest three-way comparison and close-ups, standing hands, every motion sequence, final before/after for all ten bodies, lineups | `artifacts/cricket-character/final-polish/` |
| Anatomy, posture and stance refinement (section 13): bare bodies, neutral and action poses for all ten, chest in motion, lineups, chest target study, the sleeve defect found | `artifacts/cricket-character/anatomy-posture/` |
| Asset licences | `scripts/cricket-characters/LICENSES.md` (all CC0 MakeHuman assets; the kit, gear and shaders are original code) |

## 12. Recommended next steps

1. **Facial hair as geometry.** Shell or card beards and stubble generated from the beard mask, for close-ups.
2. **More hairstyles.** A CC0 hair-card set, or MPFB's strand hair converted to cards, in place of the four MakeHuman cards.
3. **Faces in motion.** Expressions (MakeHuman's expression targets) and teeth, for celebrations and appeals.
4. **A better idle clip.** Done in section 13 by correcting the stock clip. A captured or authored cricket-specific idle would still add natural weight shifts.
5. **Elbows.** Corrective shapes at the elbows, or dual-quaternion skinning.

## 13. Anatomy, posture and stance refinement

A focused pass after the milestone: male anatomy, body proportions, posture, cricket stances and clothing fit. No change to triangle budgets, textures, levels of detail, appearances, scoring, identities, replays or verification.

### What was wrong, and why

Each problem was traced to its source before it was fixed.

| Problem seen | Cause |
|---|---|
| Rounded, breast-like chest under the shirt, worst in bowling and diving | Four causes together: (1) the realistic rig bent the whole chest at one vertebra (Spine1 followed Spine rigidly and Spine2 took all of the driver's chest rotation), so skin and shirt weighted between them folded into a shelf under the pectorals; (2) collarbones stayed fixed as an arm went overhead, so the arm dragged the side of the chest up into the armpit; (3) on the broader bodies the lower edge of the pectorals drooped in a rounded curve with a shadow under it; (4) the shirt was eased 1.6 cm off the belly and pinched in over the 4 cm tuck, so it ballooned between the chest and the waist |
| Slumped standing pose: forward head, bent knees, hands cupped in front of the thighs, wide stance | The CC0 library's idle clip itself. Measured: trunk 6.4° forward, neck 16.3°, elbows 42.7°, knees about 24°, feet 39 cm apart |
| Sprinter curled over with the head hanging | The library's sprint clip: trunk 40.5°, neck 51.2° |
| Batting guard close to a squat (knees 58°) | The stance hip height in `batting.ts` |
| Large heads and soft torsos on athletes 01, 08 and 09; athletes 04 and 09 1.62 to 1.64 m tall | MakeHuman `age` below 0.5 blends in its child shape (9% child at 0.47); low `height` values |
| Rounded chests and bellies level with the chest on 04, 06, 07, 10 | `weight` 0.58 to 0.62 adds soft chest volume to MakeHuman's male body; waist-increase targets on 04 and 10 |

### What changed

- **Bodies at the source** (`athletes/*.json`):
  - Every athlete is an adult shape (`age` ≥ 0.52) and at most `weight` 0.55.
  - Heights now run 1.75 to 1.93 m.
  - Chest targets lift and square the lower pectoral edge without flattening the muscle. The study sheet compares five combinations on the two worst bodies.
  - A flatter stomach for all; athlete 09's head is 2.5% smaller.
  - Identities, faces and build differences are kept: the broad builds stay broad through `muscle` and the V-shape and waist targets.
- **Shirt** (`build_athlete.py`): falls straight from the chest (belly ease 1.6 → 1.1 cm, eased into the tuck over 10 cm instead of 4).
- **Rig** (`realistic.ts`, `share`):
  - The lower chest vertebra takes half of the chest's bend, so the back curves through its length.
  - Each collarbone rises with its arm once the arm passes about 63° from hanging, up to a quarter of the lift overhead (about 35° at full stretch, within the human range).
  - The chest, arms and hands keep the driver's exact rotations, so grips, release points and planted feet are unchanged.
- **Posture** (`motion.ts`, `carriage`): corrects every locomotion pose towards an athlete's carriage.
  - Per gait, it sets the forward lean of the lower back, mid back, chest and neck, and keeps the eyes level on the field.
  - Standing, the arms hang free of the sides with a relaxed 12° elbow and palms to the thighs, the knees are soft, and the feet are under the hips.
  - It changes pitch only, so each gait keeps its own sway and rhythm.
- **Batting guard** (`batting.ts`): knees about 30° flexed, more for a batter whose style crouches low, instead of a squat. Presentation only: the batting outcome never reads the pose.
- **Bowling, keeping and fielding**: the keyed clips were measured and kept. At release the front leg is braced with the hips over it and the trunk 17° forward; the keeper squats with the back inclined about 49° and the head up. They benefit from the rig changes above.

### Measured before and after (all ten bodies, the game's own renderer)

Degrees, averaged over the ten athletes. Lean is forward from upright.

| Pose | Measure | Before | After |
|---|---|---|---|
| Standing | trunk lean | 6.4 | 1.0 |
| Standing | neck lean | 16.3 | 8.1 |
| Standing | elbow bend (hands in front) | 42.7 | 14.3 |
| Standing | knee bend, left / right | 26.6 / 21.7 | 7.1 / 6.0 |
| Standing | feet apart | 39 cm | 27 cm |
| Sprinting | trunk lean | 40.5 | 20.0 |
| Sprinting | neck lean | 51.2 | 11.2 |
| Batting guard | knee bend | 58.0 | 43.2 |
| Bowling release | trunk lean | 16.9 | 17.2 (kept) |
| Keeper crouch | trunk lean / knee bend | 48.7 / 118.7 | 49.4 / 118.6 (kept) |

Bare bodies (Blender, before kit):

- The nipple line no longer projects 0.8 to 0.9 cm ahead of the sternum. That forward point is what read as breast-like.
- Head size relative to height now ranges from 0.136 to 0.145, down from 0.136 to 0.152.

### Visual inspection

All views were rendered through the game's own code, with identical cameras for `52ee6fb` and the new build. Inspected sheets are in `artifacts/cricket-character/anatomy-posture/`.

- Every one of the ten bodies, before and after: front, side, three-quarter and back; chest close-ups from three-quarter and side; batting guard from the side and front; bowling front-foot landing and release; keeper crouch from two angles; sprinting; and a diving catch.
- **Confirmed:**
  - No athlete shows a breast-like chest at rest or in the extreme poses. The bowling release went from a pronounced rounded bulge to a flat male chest line.
  - Bare chests stay muscular and defined.
  - Standing posture is upright and relaxed on all ten.
  - The batting guard reads as a professional's set-up.
  - The shirt follows the chest and stays clear of the trousers.
- **One defect was introduced and fixed during the pass.** The taller bodies left scraps of shirt on the backs of the elbows on five athletes (`defect-sleeve-scraps-found.jpg`). A thin strip of cloth had joined them to the sleeve until decimation severed it.
  - Fix: the sleeve cut now reaches 14 cm from the arm's line, up from 11, and scraps are dropped again after decimation.
  - A new test checks that every shirt is one piece. It fails on a shirt built the old way (3 pieces) and passes on all 20 models.

### Tests added

- `cricket-motion.spec.ts`, "standing and running carry a professional athlete's posture":
  - Over a full idle loop and a sprint on three bodies, it asserts trunk, neck, knee and elbow limits, the stance width and level hips.
  - It fails on the old clips (trunk 8.1°, knees 27.4°, elbows 46.5°, sprint trunk 40.5°).
- `cricket-realistic.spec.ts`, "a bending back curves through the spine, and the collarbones rise with the arms": the bend is shared between the two chest vertebrae, and the collarbones lift about 35° with the arms overhead.
- `cricket-realistic.spec.ts`, "every hi/lo shirt is one piece of cloth".

No test was removed or weakened, and no budget changed.

### Results on the final code

| Check | Result |
|---|---|
| Typecheck (all packages) | Passed |
| Unit tests | 539 passed (shared 32, engines 446, realtime 61) |
| Production build | Passed |
| Every cricket browser spec (mesh, rig, hand and foot, motion, looks, visual, gameplay) | 107 passed, 0 failed, 10 skipped (the on-demand evidence recorders), in 12.7 min. These are the earlier 103 plus the 4 new tests |
| Benchmarks, GPU and software, this build and `52ee6fb` rebuilt in the same session | All four completed |

The suite rewrites the tracked Phase 6 images in `artifacts/cricket-2`; they were restored with `git restore`. The Cloudflare build was not rerun: only browser assets and browser code changed.

**Benchmarks, `52ee6fb` → this build, same session:**

| Preset | RTX 3050 fps | p95 interval (ms) | Draw CPU median (ms) | Triangles | Software fps |
|---|---|---|---|---|---|
| Low | 30 → 30 | 33.4 → 33.4 | 3.8 → 4.4 | 137,898 → 136,874 | 26 → 27 |
| Medium | 60 → 60 | 16.7 → 16.7 | 3.7 → 4.1 | 164,724 → 164,048 | 9.8 → 10.4 |
| High | 60 → 60 | 16.8 → 16.7 | 4.6 → 4.7 | 506,524 → 502,935 | 4.4 → 4.2 |
| Ultra | 59.5 → 60 (hitches 1 → 0) | 16.7 → 16.7 | 4.6 → 5.1 | 619,925 → 615,860 | 3.8 → 3.6 |

- Textures are unchanged (42 on Low and Medium, 54 on High and Ultra), and the GPU heap fell from 82 to 73 MB.
- Athletes load in 2.8 s on the GPU, as before.
- The draw-CPU median rose by 0.1 to 0.6 ms. The posture correction runs per player per frame, and some of the rise is run-to-run noise.
- Software-rendering differences go both ways and are within that noise.
- No budget changed.

### Remaining limitations

- A gentle rounded underside to the chest remains in the diving catch, with both arms reaching forward. It comes from linear skinning; corrective shapes would be needed.
- From the side, the standing hands sit slightly forward with open fingers. They no longer cup in front of the thighs.
- Batting, bowling and keeping poses are keyed and procedural, not motion captured. Their joint angles are now inside professional ranges, but subtle per-player style is limited to the existing batter styles.

## 14. Final polish and release readiness

Last pass before PR #5: the remaining diving-chest shape, the standing hands, and a review of every cricket motion sequence. No new features, and no change to budgets, scoring, identities, replays or verification.

### Diving chest: a corrective helper bone

- **The shape:** with both arms reaching forward, the side of the chest just below the armpit swelled into a rounded bulge.
- **The cause:** the tights the shirt is cut from weight that cloth about 60% to the upper-arm bone, so it swung forward with the arm.
- **The fix** (`shoulderWeights` and `RealisticBody.share` in `realistic.ts`):
  - Shirt cloth on the torso, more than a sleeve's radius from the upper-arm bone, hands its upper-arm weight to the collarbone, eased over 5 to 13 cm and keeping 15% on the arm so the armpit stretches rather than creases.
  - The collarbone now follows the arm's swing relative to the chest in every direction, by up to 22%. It protracts as the arm reaches forward, about 11° in the diving catch, and rises overhead, about 35° at full stretch as before.
  - The sleeves themselves are untouched.
- **Why not a morph target:** three.js stores morph targets in a texture per geometry. With about ten models on the light preset, that would break its 45-texture budget. A helper bone adds no triangles, textures, draw calls or shader work.
- **Result** (`dive-chest-three-way.jpg`, `dive-chest-closeups.jpg`): from the side the torso runs smooth from armpit to hip, and from the front the chest is square. The overhead catch, the bowling release and the standing pose are unchanged.

### Standing hands

- The relaxed hands sat 14.5 cm ahead of the hip joint, with fingers splayed.
- The shoulders sit a little ahead of the hips, so the upper arm now hangs about 6° back with a 10° elbow. The hands come to rest beside the front of the thighs, 5.5 cm ahead of the hip joint.
- Ungloved players curl their fingers 0.42 rad instead of 0.28, which reads as a relaxed hand. Catching hands still read as open.
- Hands still clear the trousers: the existing clearance test passes.
- Evidence: `standing-hands-three-way.jpg` and `standing-hands-closeups.jpg`.

### Animation review

Every sequence was rendered at 8 to 12 points: drive and pull from guard to follow-through, fast and spin deliveries from gather to follow-through, the keeper's crouch, rise, low and high takes, a full sprint cycle, the dive and the get-up (`animation-sequences.jpg`). Two defects were found, both in the get-up after a diving catch, and both were fixed:

1. **A snap when the diver started to get up.** The `recover` clip did not begin where `dive` ends: hands jumped 40 cm and feet 35 cm across the 0.16 s clip cross-fade. It now starts on the dive's last key. A new test checks that every clip the game hands over directly meets its predecessor; it fails on the old clip (a 0.95 gap) and passes now.
2. **A diver rolled from face-down to face-up in a quarter of a second.** Pre-existing. At 1.2 s after a diving catch the scene blended in the motion library's `LayToIdle`, which starts lying on the back, while every dive ends face down. The diver now gets up with the `recover` clip (face down, push up, kneel, stand) and stays busy until it ends, 2.3 s after the dive. `LayToIdle` is no longer used.

Batting, bowling, keeping and sprinting showed no visible defect at these sample points.

### Complete regression run on the final code

| Check | Result |
|---|---|
| Typecheck, all packages | Passed |
| Unit and integration tests | 539 passed (shared 32, engines 446, realtime 61) |
| Real PostgreSQL tests (local `*_test` database) | 65 passed in 6 files |
| Production build | Passed |
| Full browser suite (every spec, every game) | **188 passed, 0 failed, 10 skipped** (the on-demand evidence and footage recorders), in 40.3 min |
| Linux OpenNext/Cloudflare build (WSL, clean copy with no `.env`, nothing uploaded) | Passed; Worker emitted, 31 MB of static assets including all 20 athlete models |
| Character benchmarks, GPU and software, final build and `52ee6fb`, each run twice | All completed |

The suite rewrites the tracked Phase 6 images in `artifacts/cricket-2`; they were restored with `git restore`.

**Identity, progression, scoring and replay compatibility.**
- The accumulated changes touch no file in `packages/` or `apps/realtime/`. The engines, scoring, replay format, verification, database schema, identity and economy are byte for byte as on the remote branch.
- They are also verified by behaviour:
  - the 446 engine tests, including replay verification
  - the 65 database tests: ledger, campaign, identity, sessions and rollbacks
  - the browser suite's identity, economy, Cuisine Quest campaign, cricket server-verified match and scorebook, and replay specs
  - the looks spec: a player looks the same across presets, replays, reloads and matches

**Benchmarks, `52ee6fb` → final, run twice, old and new alternating:**

| Preset | RTX 3050 fps | p95 interval (ms) | Draw CPU median (ms), runs 1 / 2 | Triangles | Software fps, runs 1 / 2 |
|---|---|---|---|---|---|
| Low | 30 → 30 | 33.4 → 33.4 | 4.2→4.1 / 4.3→4.3 | 137,724 → 137,046 | 23.5→21.9 / 22.2→22.7 |
| Medium | 60 → 60 | 16.7 → 16.7 | 4.5→4.2 / 4.3→4.2 | 164,724 → 163,874 | 8.7→8.6 / 7.7→8.5 |
| High | 60 → 60 | 16.7 → 16.7 | 5.1→4.7 / 5.0→4.8 | 506,700 → 503,109 | 3.8→4.0 / 3.8→3.8 |
| Ultra | 60 → 60 | 16.8 → 16.7 | 4.8→5.1 / 5.3→5.1 | 619,925 → 616,032 | 3.1→3.1 / 3.1→3.1 |

- Textures are unchanged: 42 on Low and Medium, 54 on High and Ultra.
- No hitches over 50 ms on the GPU, in either build.
- **Investigated:** the first run showed athletes loading in 3,010 ms against 2,702, and software Low and Medium a little slower. The repeat reversed or erased both (2,709 against 2,709 ms; Low 22.2→22.7 and Medium 7.7→8.5 fps). The only new load-time work, the corrective weights, is one pass over the cloth vertices. There is no measurable regression.

### Outstanding limitations

- **Hair and beards** (section 9): beards and buzz cuts are painted in the shader; hair cards have hard edges and few styles. These need different assets.
- **Faces:** no expressions, teeth or mouth interior.
- **Elbows:** thin at full flexion. This is linear skinning; corrective shapes or dual quaternions would fix it.
- **Diving catch:** a slight softness remains where the shirt meets the underarm at full forward reach. It is no longer a bulge.
- **Cricket motion:** batting, bowling and keeping are keyed and procedural, not motion captured. Joint angles are within professional ranges, but per-player style comes only from the batter styles.
- **The diver's get-up** is procedural, not captured.
- **Performance:** all figures are from one laptop (RTX 3050) and SwiftShader. No physical phone, Safari or console was tested.
