# Sinverse Cricket 2.0 browser evidence

Captured 2026-11-06 from local production builds on `feature/sinverse-cricket-2`. These are real browser frames and recorded game replays. No external imagery, promotional renders or generated character assets are used as gameplay evidence. Historical artifact directories are preserved.

- `00-match-setup.png` through `09-mobile-portrait-chase.png`, `toss-and-entry.webm` and `keyboard-verification.json`: `e2e/cricket-2.spec.ts`. Interactive 3D toss, explicit call/decision, entry, a complete keyboard match accepted by server replay, touch landscape and portrait chase feedback. Touch input screenshots use the tactical renderer.
- `gameplay/`: successful on-demand `e2e/cricket-evidence.spec.ts` capture on Low 3D. `gameplay-low.webm` contains a complete two-innings duel and real replay scrubbing. `events.json` records actual batting outcomes, shot/contact ticks, bowling commentary and zero page errors. Actual batting events include a six, caught wickets, dots and a four. A requested run outcome did not occur; outcome selection is not forced.
- `regression/`: original gameplay, scorebook, responsive and replay checks from `e2e/cricket.spec.ts`, now written here to preserve earlier milestone evidence.
- `visual-regression/`: animation/contact/resource/camera checks from `e2e/cricket-visual.spec.ts`. Numerical attachment alignment is not proof of natural character movement.
- `performance/`: real scene frames and `measurements.json` from `e2e/cricket-2-performance.spec.ts`. SwiftShader software GPU with viewport/CPU emulation; no physical hardware or 60 FPS claim.
- `video-metadata.json`: locally decoded dimensions/duration for the ceremony and complete gameplay videos, including sampled review timestamps. Browser recordings do not contain captured game audio.

The capture uses existing deterministic engine searches to choose plausible shot inputs, then submits those inputs through real controls. Actual inputs/digests are checked against an independent engine instance. Screenshots retain the real HUD and replay controls. Optional assist controls are expanded during the reproducible capture; they are compact by default.

The [implementation and QA report](../../docs/SINVERSE_CRICKET_2_IMPLEMENTATION.md) records test results, retained failures, visual observations, source commits, physical-device gaps and next work. Stylized faces, mitten hands and procedural animation remain visible; these recordings do not establish console-level realism.
