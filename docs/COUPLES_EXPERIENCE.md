# The Couples experience

A dedicated destination for two people who want to play together: on one sofa or in two cities.

**Route:** `/couples` (`apps/web/src/app/couples/page.tsx`). It's prerendered, has its own metadata, and is linked from the header, the homepage, every category navigation and the sitemap.

## The page

1. **Hero:** "Play together. Laugh together. Discover your vibe."
   - Warm coral-to-violet colours, matching the rest of the site's dark design.
   - Two calls to action: **Start a Same Wavelength room**, which opens `/play/same-wavelength?preset=couples` (a private Couples-mode room with typed answers), and **Browse couples games**.
   - The Same Wavelength cover art, and a "Same brain moment!" tag.
2. **How it works, in three steps:** pick a game, send one link (no account), play from anywhere (refresh or reconnect and you're back in).
3. **Featured couples games:** every available game assigned to Couples, each with one honest line about why it works for two:

   | Game | Why it's here |
   |---|---|
   | Same Wavelength | Couples mode is made for two |
   | Doodle Duel | Taking turns drawing and guessing |
   | Color Clash | A two-player card duel |
   | Chef Rivals | Strictly one against one |
   | Kitchen Rush Co-op | One shared kitchen as a team |

   **Not included:** Token Trail (better with more players), Bumper Blitz (a crowd brawl) and solo games. Nothing is labelled couple-friendly just to fill the page.
4. **Collections for two:** curated lists of the same canonical games, from `COLLECTIONS` in `discovery.ts`. Each item links straight to play, with the Couples preset where it applies:

   | Collection | Games |
   |---|---|
   | How well do you know each other? | Same Wavelength (Couples mode, predict-your-partner rounds) |
   | Think-alike challenges | Same Wavelength |
   | Draw together | Doodle Duel |
   | Friendly competition | Color Clash, Chef Rivals |
   | Quick date-night games | Same Wavelength, Chef Rivals, Color Clash |
   | Laugh together | Doodle Duel, Kitchen Rush Co-op, Same Wavelength |
   | Long-distance couple games | Same Wavelength, Doodle Duel, Color Clash, Kitchen Rush Co-op |

   A collection only appears with at least one playable game assigned to Couples (`collectionsFor`).
5. **"Discover how well you think alike":** a call to action, with the plain note that it's a game, not a compatibility test.
6. **Links** to the other category pages.

## Playing as a couple

| Need | How it works (existing infrastructure) |
|---|---|
| A private room | "Create private room" on the play page; the Couples preset starts it in Couples mode |
| An invitation | The lobby's room code and "Copy invite link" (`/room/<code>`). Room codes are random, and joining by code is rate-limited |
| Separate devices | Each person opens the link in their own browser |
| No registration | Guests choose a display name; neither person needs an account. Guest, email and Google identities all work unchanged |
| Reconnect after a refresh | The seat is held for the reconnect grace period, and the game resumes with your own answer intact |
| Sharing results | "Share result" creates a signed card from the recorded match. Names only if you tick "Show our names"; never answers, emails, ids or room codes (`FUN_INSIGHTS_SYSTEM.md`) |
| Privacy | Rooms and their answers are visible only to their members. Results store aggregates only. Profiles are unchanged |

## Marketing and SEO foundations

- **Unique metadata:**
  - title "Fun Games for Couples: Play Together Online";
  - its own meta description (no keyword lists);
  - canonical `/couples`;
  - Open Graph title and description.
- **Headings and internal links:** descriptive H1/H2s, and links to every game page, the play pages and the other categories.
- **Fast:** static rendering, inline SVG covers, and no game engine loaded.
- **The same structure** (`DiscoveryCategory.landing` and `href`) supports dedicated pages for Friends, Family, Party, Multiplayer and Single player later. Today they use the generic `/categories/<slug>` page.
- **No fabricated claims:** no statistics, testimonials or "scientific" compatibility language.

## Tests

`apps/web/e2e/discovery.spec.ts` (the Couples page's content, metadata and canonical, the right games and not the wrong ones, collections, the start link and the active navigation; phone width) and `same-wavelength.spec.ts` (the full couple flow from the preset link to sharing).
