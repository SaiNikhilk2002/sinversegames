# Licences of the athlete assets

Each file `apps/web/public/sinverse-cricket/athletes/athlete-*.glb` contains only assets from the MakeHuman community's own asset packs. The pack pages list every item as **CC0** (public domain dedication).

MakeHuman's FAQ states:

- The core and system assets are CC0.
- Models made with MPFB may be used in closed-source and commercial games, with no separate licence.

The CC0 status doesn't extend to community assets downloaded separately from MakeHuman's user repositories. None of those are used.

The athletes are fictional. None is based on a real person or on a real cricketer's likeness.

| Model | Skin | Hair | Eyebrows | Eye colour | Shape |
|---|---|---|---|---|---|
| athlete-01 | toigo_light_skin_male_bronze | short02 | eyebrow002 | brown | 9 face targets, 1 body |
| athlete-02 | young_african_male | none (cropped in the shader) | eyebrow006 | brown | 8 face targets, 2 body |
| athlete-03 | toigo_light_skin_male_freckles | short01 | eyebrow004 | bluegreen | 10 face targets |
| athlete-04 | middleage_asian_male | short04 | eyebrow009 | brown | 10 face targets, 1 body |
| athlete-05 | young_african_male | afro01 | eyebrow001 | brownlight | 9 face targets, 1 body |
| athlete-06 | mindfront_skin_male_african_middleage | none (cropped in the shader) | eyebrow011 | brown | 10 face targets |
| athlete-07 | middleage_caucasian_male | short02 | eyebrow008 | grey | 9 face targets |
| athlete-08 | young_caucasian_male2 | short04 | eyebrow010 | brown | 10 face targets, 1 body |
| athlete-09 | young_asian_male | short01 | eyebrow012 | brown | 10 face targets |
| athlete-10 | middleage_african_male | none (cropped in the shader) | eyebrow005 | brown | 9 face targets, 2 body |

Every model also uses:

- Body proxy `male_muscle_13290` for the detailed models, or `male1591` for the `-lo` models
- Eyes `high-poly` (detailed) or `low-poly` (light), with the eye colour from MakeHuman's eye materials
- Eyelashes `eyelashes03` (detailed models only)
- Shoes `shoes05`
- MPFB's built-in `mixamo` rig, which is MPFB data
- Face and body targets from MPFB's own target library (the "Shape" column), including its asymmetry targets

**The kit is not a library asset.** The build cuts it from the `helper-tights` geometry that is part of MakeHuman's CC0 basemesh, then reshapes it in code (collar, hems, ease, folds). No clothing texture is used; the game colours it per team in a shader. The facial hair and scalp masks are computed from the CC0 basemesh's own vertex groups and joint markers.

**In-game materials and equipment are original code**: the skin, eye, hair and kit shaders in `apps/web/src/games/sinverse-cricket/athlete-look.ts`, and the helmet, pads, gloves and bat generated in `realistic.ts`. No texture, model or material is downloaded for them.

## Sources

| Source | Licence |
|---|---|
| https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html | CC0, all items |
| https://static.makehumancommunity.org/assets/assetpacks/skins01.html, skins02.html, skins03.html | CC0, all items |
| https://static.makehumancommunity.org/mpfb/faq/use_in_closed_source.html | Use in closed-source games |
| https://static.makehumancommunity.org/about/license.html | Code GPL-3.0, assets CC0 |

## Motion clips

`apps/web/public/sinverse-cricket/motion/ual1.glb` and `ual2.glb` hold clips extracted (with `extract_motion.py`, skeleton only, no meshes) from Quaternius's **Universal Animation Library** and **Universal Animation Library 2**, Standard editions. Both packs' own `License.txt` files say **CC0 1.0 Universal**. The author's pack page says they are "free to use in personal, educational and commercial projects".

| Library | Clips used |
|---|---|
| Universal Animation Library | Idle_Loop, Walk_Loop, Jog_Fwd_Loop, Sprint_Loop, Crouch_Idle_Loop, Roll, Dance_Loop, Jump_Start, Jump_Land, Idle_Talking_Loop |
| Universal Animation Library 2 | OverhandThrow, LayToIdle, Slide_Start, Slide_Loop, Slide_Exit, Yes, Idle_FoldArms_Loop, Idle_No_Loop, NinjaJump_Land |

| Source | Licence |
|---|---|
| https://quaternius.com/packs/universalanimationlibrary.html | CC0 |
| https://opengameart.org/content/universal-animation-library | CC0 (download used) |
| https://opengameart.org/content/universal-animation-library-2 | CC0 (download used) |

## Not used, and why

| Asset or service | Reason |
|---|---|
| Mixamo animations | Royalty-free in games, but Adobe doesn't permit redistributing the raw files. A browser game's model files can be downloaded by anyone, so this is a grey area that needs the owner's decision |
| Community MakeHuman assets outside the official packs | Licences vary, often CC-BY |
| Paid packs, MetaHuman, Ready Player Me | Not free, unclear outside Unreal, or shut down |
