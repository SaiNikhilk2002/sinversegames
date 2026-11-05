# Sinverse Cricket assets and rights

## Default provenance

| Content | Source | Provenance |
| --- | --- | --- |
| Harbour Lights / Ember Kites, 22 names and kit palettes | `packages/engines/src/sinverse-cricket/content.ts` | Newly authored fictional catalogue; no official player likeness, team logo or uniform |
| Lantern Oval / Tideglass Park | `apps/web/src/games/sinverse-cricket/scene.ts` | Original procedural terraces, roofs, screens, pitch, lights and boards; no extracted stadium model |
| Articulated players, equipment and fabric/name textures | `scene.ts` | Original cross-section geometry, bone hierarchy, procedural poses and generated texture canvases; no purchased model/mocap |
| Cover | `apps/web/public/sinverse-cricket/cover.svg` | Original code-native vector composition; promotional art, not substituted gameplay |
| Effects, crowd texture and motif | shared `sound.ts` / `cricket-game.tsx` | Synthesized original sounds/notes; no broadcast recordings, voice clones or copied commentary |
| Three.js 0.187.0 | installed package / MIT notice | Open-source rendering code, not a licensed cricket content pack |

All default asset manifests mark content original and fictional. `licensedContent` requires an explicitly enabled grant, scope `commercial-interactive` plus the exact content ID, start/expiry and a permission reference. Missing, expired or out-of-scope permission falls back to original content. This mechanism is metadata enforcement, not proof that a supplied rights claim is truthful. No licensed catalogue or external asset upload path is exposed in this slice.

## Rights boundaries

General sporting mechanics are distinct from the copyrighted wording/illustrations of a law book. Historical facts are distinct from permission to associate an athlete or official organization with a commercial interactive game. Names/logos may carry trademark rights; artwork, recordings, broadcasts, models, music and animation can carry copyright; player names/likenesses/voices may involve publicity, personality, endorsement and contractual rights. Rights differ by territory and cannot be inferred solely because a name is factual. [WIPO sports branding](https://www.wipo.int/en/web/sports/branding) and [WIPO esports overview](https://www.wipo.int/web-publications/intellectual-property-and-esports/assets/91262/Intellectual-Property-and-Esports-web-en.pdf) provide the research basis.

Future real players/teams/stadium reproductions require asset-specific written permissions, commercial interactive use, territories, platforms, duration, attribution, modification/distribution scope and expiry/removal handling. Professional review is also appropriate for final commercial naming/mark clearance, including fictional names that might coincide with existing brands. This implementation is not legally certified. No official IPL/BCCI/ICC/franchise marks, national kits, real player photographs/likenesses or proprietary broadcast layouts are included.

## Asset pipeline

Keep engine content/provenance separate from browser assets. Default geometry/textures are generated locally with no runtime asset CDN. Character upgrades should retain a documented mesh/rig/animation origin and license file, reuse LOD/materials and have a measured mobile budget before replacing this procedural slice. Licensed-content enablement is a deliberate owner change, never an automatic fallback from a remote URL.

The current art direction uses shaped articulated meshes and readable equipment. It has no licensed mocap, facial animation library, cloth solver, crowd character animation pack or photorealistic material set. Those remain art/animation milestones rather than hidden placeholders.
