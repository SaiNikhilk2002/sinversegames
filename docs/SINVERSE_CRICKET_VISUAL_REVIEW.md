# Sinverse Cricket visual review — 2026-11-05

Review basis: actual local production-browser play and headless Chromium WebGL2 captures. [Gameplay clip](../artifacts/cricket/duel-desktop.webm), [batting](../artifacts/cricket/batting-live.png), [replay](../artifacts/cricket/replay-side.png), [High stadium](../artifacts/cricket/high-stadium.png), [320 controls](../artifacts/cricket/controls-320.png), [tactical play](../artifacts/cricket/tactical-430.png). The cover SVG is promotional art and is not evidence of gameplay rendering.

The first slice has a consistent navy/mint/gold interface, original team palettes, terraces/floodlights/rope/creases/screens, shaped articulated players with equipment, generated jersey names/numbers and real ball movement. Batting and bowling cameras establish before release; event tracking and replay use the actual trajectory. The scoreboard remains readable and touch controls fit the tested widths. Reduced motion suppresses automatic cinematic replay.

This is stylized procedural art, with visible production limits. Faces and silhouettes remain angular; shoulder/hand/bat alignment, keeper reach, body orientation during scrubbing, foot contact and dive/throw blends need a character pass. Crowd figures and turf/stand materials are simple. There is no photorealistic cloth, facial animation, motion capture or complete broadcast presentation. Do not describe this milestone as visual parity with a premium console cricket game.

Profiling changed the implementation: medium shadow/spotlight cost was removed, contact shadows retained, and detailed shadow casters were reduced to torso/trouser silhouettes after High exceeded its 500-call budget. The final 1280 × 900 establishing-view sample is:

| Quality | Draw calls | Triangles | Textures | Median / p95 frame interval, ms |
| --- | ---: | ---: | ---: | ---: |
| Low | 434 | 29,894 | 20 | 66.6 / 66.7 |
| Medium | 434 | 40,894 | 20 | 83.3 / 100.0 |
| High | 460 | 60,094 | 22 | 133.4 / 150.1 |
| Ultra | 460 | 82,094 | 22 | 150.0 / 166.7 |
| Low after replacement | 434 | 29,894 | 20 | 50.0 / 66.7 |

These are **SwiftShader software-GPU measurements**, not physical-device GPU evidence. Draw/triangle/texture budgets pass, but measured frame rates miss the 30/60 fps aspirations. No hardware-performance acceptance is claimed. The tactical fallback remains playable; physical mobile/Safari testing, adaptive LOD/material batching and real GPU measurements are required before claiming flagship rendering readiness. The unchanged resource counts after returning to Low, canvas removal and zero observed page errors support replacement cleanup; they do not prove absence of every memory leak. [Raw measurements](../artifacts/cricket/render-performance.json).

Next visual gate: improve rig/contact/foot placement and material/crowd depth, then capture live batting, keeper, diving catch, close run-out and actual six sequences on physical desktop/mobile devices. Keep every outcome driven by the simulation. Do not replace weak animation with pre-rendered gameplay or copy commercial sports assets. Full rules, persistence, test results and remaining limits are in [QA](SINVERSE_CRICKET_QA_REPORT.md).
