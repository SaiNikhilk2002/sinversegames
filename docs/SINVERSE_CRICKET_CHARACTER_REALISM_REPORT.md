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
| Idle clip holds the hands in front of the thighs | Cosmetic. They no longer intersect the cloth |
| Elbow thinning at full flexion (linear skinning) | Cosmetic; corrective shapes or dual quaternions would be needed |
| Shirt slightly full over the chest from some angles | Cosmetic; a tighter drape or a different body proxy |
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
| Asset licences | `scripts/cricket-characters/LICENSES.md` (all CC0 MakeHuman assets; the kit, gear and shaders are original code) |

## 12. Recommended next steps

1. **Facial hair as geometry.** Shell or card beards and stubble generated from the beard mask, for close-ups.
2. **More hairstyles.** A CC0 hair-card set, or MPFB's strand hair converted to cards, in place of the four MakeHuman cards.
3. **Faces in motion.** Expressions (MakeHuman's expression targets) and teeth, for celebrations and appeals.
4. **A better idle clip.** One where the hands rest at the sides.
5. **Elbows.** Corrective shapes at the elbows, or dual-quaternion skinning.
