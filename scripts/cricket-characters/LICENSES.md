# Licences of the athlete assets

Each file `apps/web/public/sinverse-cricket/athletes/athlete-*.glb` contains only assets from the MakeHuman community's own asset packs. The pack pages list every item as **CC0** (public domain dedication).

MakeHuman's FAQ states:

- The core and system assets are CC0.
- Models made with MPFB may be used in closed-source and commercial games, with no separate licence.

The CC0 status doesn't extend to community assets downloaded separately from MakeHuman's user repositories. None of those are used.

The athletes are fictional. None is based on a real person or on a real cricketer's likeness.

| Model | Skin | Hair | Eyebrows | Clothes |
|---|---|---|---|---|
| athlete-01 | young_asian_male | short02 | eyebrow002 | male_casualsuit06, shoes01 |
| athlete-02 | young_african_male | short04 | eyebrow006 | male_casualsuit06, shoes01 |
| athlete-03 | young_caucasian_male | short01 | eyebrow004 | male_casualsuit06, shoes01 |
| athlete-04 | middleage_asian_male | short01 | eyebrow009 | male_casualsuit06, shoes01 |
| athlete-05 | toigo_light_skin_male_bronze | afro01 | eyebrow001 | male_casualsuit06, shoes01 |
| athlete-06 | middleage_african_male | none | eyebrow011 | male_casualsuit06, shoes01 |

Every model also uses:

- Body proxy `male_muscle_13290` for the detailed models, or `male1591` for the `-lo` models
- Eyes `low-poly`
- Eyelashes `eyelashes02`
- MPFB's built-in `mixamo` rig, which is MPFB data

The source shirt has a MakeHuman logo printed on it. The build replaces the shirt's texture with the suit's ambient-occlusion map, so the logo doesn't appear in the game.

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
| Universal Animation Library | Idle_Loop, Walk_Loop, Jog_Fwd_Loop, Sprint_Loop, Crouch_Idle_Loop, Roll, Dance_Loop |
| Universal Animation Library 2 | OverhandThrow, LayToIdle, Slide_Start, Slide_Loop, Slide_Exit, Yes |

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
