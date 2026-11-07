# SinverseGames design system

The rules that make the platform feel like one place while each game keeps its own identity. Tokens live in `apps/web/src/app/globals.css`, and game colours in `apps/web/src/components/game-theme.ts`.

## Colour

| Role | Token | Value | Use |
|---|---|---|---|
| Brand primary | `brand-500` | `#7c5cff` | Links, focus, brand moments |
| Brand action | `hot` | `#ff4f8b` | The main action on a screen |
| Secondary | `sun`, `mint`, `electric`, `coral`, `aqua`, `lime` | see tokens | Accents and game identities |
| Success | `success` | mint | Paired with an icon or words |
| Warning | `warning` | sun | Paired with an icon or words |
| Error | `error` | danger | Paired with an icon or words |
| Surfaces and text | `bg`, `surface`, `surface-2`, `surface-3`, `line`, `ink`, `ink-muted`, `ink-faint` | switch with theme | All page chrome |

Rules:

- Use one main accent per screen. Several bright colours at once are for celebrations, not for layout.
- Never carry meaning by colour alone. A warning also says what is wrong.
- Body text uses `ink` or `ink-muted`. Secondary colours aren't body text on light surfaces.
- Each game owns an `accent`, `deep` and `ink` in `game-theme.ts`. Use these for frames and glows, so games look different inside the same structure.

## Type, shape and depth

- Display: Outfit, for headings and numbers. Body: Inter. Numbers that change use tabular figures.
- Radius: `xl` for controls, `2xl` and `3xl` for cards and panels.
- Primary buttons have physical depth: a solid lower edge that compresses on press.

## Motion

Use tokens rather than one-off timings.

| Token | Value | Use |
|---|---|---|
| `--motion-instant` | 90 ms | Press feedback |
| `--motion-fast` | 140 ms | Hover and focus |
| `--motion-base` | 220 ms | Route fades, small reveals |
| `--motion-slow` | 380 ms | Entrances, staggered lists |
| `--motion-stage` | 650 ms | Game moments such as reveals |
| `--ease-out` | | Things arriving, the default |
| `--ease-spring` | | Small playful overshoot on rewards |
| `--ease-in-out` | | Looping or moving between two points |

Rules:

1. **Animation reflects the game. It never decides it.** Nothing in a renderer may write to game state, scores or clocks. Game engines have no animation code.
2. **Input is never blocked.** Exits aren't animated. Long sequences, such as judging, can be skipped.
3. **Animate `transform` and `opacity`.** Avoid layout properties. Don't put a transform on a wrapper around game screens, because it breaks `position: fixed`; route fades are opacity only for that reason.
4. **Loop only while something is really happening.** Idle pages shouldn't keep moving, apart from small character life during play.
5. **Save big effects for big moments:** a win, a promotion, a new record. Never run confetti on routine actions.
6. **Never show fake progress.** Loading is indeterminate unless real progress is known.

Tools, in order of preference:

| Need | Use |
|---|---|
| Hover, press, entrances, loops | CSS with the tokens above |
| Enter and exit of React elements, shared layout | `motion`, already a dependency |
| Real game effects | The game's own renderer (canvas, or Three.js in Sinverse Cricket only) |

Don't add another animation library.

Reusable pieces:

| Piece | Where |
|---|---|
| Route fade | `app/template.tsx`, `.sg-page` |
| Staggered list | `.sg-stagger` on a grid or list |
| Branded loading | `components/ui/brand-loader.tsx` |
| Modal, toast, buttons | `components/ui` |
| Chef character | `games/chef-rivals/chef.tsx` |

## Levels of motion

| Mode | How it turns on | What changes |
|---|---|---|
| Full | Default | Everything |
| Low effects | Settings, or automatically on data saver or very low memory | Decorative loops and blur removed. Feedback, state changes and meaningful transitions stay |
| Reduced motion | Settings or the OS preference | Movement and scaling stop. State changes are instant |

Every new animation needs to behave correctly in all three, including keyboard use. New decorative loops also need adding to the `.low-effects` rule.

## Accessibility

- Every control works by keyboard, with a visible focus ring.
- Touch targets are at least 44 px unless the layout genuinely can't allow it on small phones, and game controls stay inside the viewport.
- Anything shown by animation is also available as text, as with chef actions in their labels and patience as a labelled meter.
- Status changes use `role="status"` or `aria-live`.
