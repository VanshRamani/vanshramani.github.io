# claude-flex — design brief (v2, after critique)

v1 was attacked by three independent critics: an Awwwards juror, a template guardian and a creative-dev engineer. Everything v1 specified as a default rather than a decision was revised. A changelog is at the bottom.

## What this is
The same site as `/index.html`: same tokens, type, poster language, sections, order and facts. It is pushed to its limit in **one** place, and everywhere else it gets disciplined, print-like refinement. At rest, it must pass a side-by-side check against the current site.

## Audience
1. **Researchers** arrive from Scholar, arXiv or a talk, often on a phone. They need papers, venues, authors and links within 10 seconds.
2. **Founders, investors and customers** come for ramAIn (YC W26). They need "computer-use agents" and the link within one screen.
3. **Students and recruiters** look for the About section, the timeline and contact details.

## Mood
*A lab notebook printed by a type foundry.* Cool paper, near-black ink and a family of print blues. Motion behaves like an instrument: calibrated, quick and settled. Posters stay flat, printed vector figures. Motion explains them and never restyles them, and their final frame is always the authored poster.

## The one memorable thing — *see what a graph neural network sees*
The caffeine molecule is real WebGL, built from the PubChem coordinates in `js/caffeine-data.js` (0-based bonds). It rests nearly face-on: caffeine is planar, so a continuous spin would turn it edge-on. It sits on **its own promolecular-density slice**, drawn as isolines in the molecule's plane from a sum of per-element Gaussians and labelled `PROMOLECULAR DENSITY · ILLUSTRATIVE`.

- **At rest**, the full-molecule isolines are faint, in the same `#8fabe8` family as `molecular-field.svg`, so the panel reads as today's calm field made honest. The field moves only because the molecule moves: a bounded wobble of yaw ±0.45 and pitch ±0.2 over about 14s.
- **On hover**, the field re-weights by **graph hop distance** in the colour of that atom's research direction: hop 0 at 0ms, hop 1 at +110ms, hop 2 at +220ms. This is the receptive field of a message-passing layer, which is Bonsai's computation-tree idea made visible. The neighbourhood lifts, other atoms recede, a computed readout appears (e.g. `N · HOP 2 · 11 ATOMS`) and the research card slides in. A click pins it; Escape or Unpin clears it.
- **The intro is the same wave.** The hero square stamps onto the baseline, then the atoms appear in BFS order from one root (atom 5: 7 waves of 90ms), so the first second teaches the interaction.
- **The takeaway a visitor repeats:** *"I hovered an atom and saw what a GNN layer sees."*

This is the only 3D and the only bold motion on the page.

## The motif — the blue square
Archivo Black's period is a square. It becomes a real element, `<i class="sq">` (ink box .212×.199em on the baseline). It is used for:
- the hero full stop;
- the full stops on the giant Archivo Black headings `Research.`, `A bit about me.` and `Writing.` (these two move to Archivo Black so the vocabulary is consistent);
- the 6px bullet on section labels;
- the desktop nav's active marker (one literal hand-off: as the hero leaves, its period travels into the nav and becomes the marker, scrubbed and reversible);
- the explainer's step dots.

Each square **stamps** in once (0→1, back.out(1.6), 0.35s) when it enters. Nothing else uses it.

## Motion budget (everything not listed is static)
1. **Hero field**: the intro wave, the hop expansion and drag rotation, which eases back to face-on on release.
2. **Square stamps**: as above, plus the hero→nav hand-off.
3. **Poster gestures**: each poster acts out its own idea in ≤1.6s. A gesture plays once when the card is first ≥50% in view and replays on hover (fine pointers). It is also the explainer's opening step. The resting frame is pixel-identical to the `<img>`.
4. **ramAIn demo**: plays once on entering view and holds on Verify. The caption's ↺ becomes a replay button. Observe snaps hairline bounding boxes onto UI elements (grounding), Reason draws a dotted path, Act moves the poster's own cursor to fill the field and press SAVE RECORD, and Verify draws a check. The caption highlights the active step and is labelled *illustrative*.
5. **Explainer**: a framed, near-full-screen dialog (template frame: 1px `#8fa5ce`, 12px offset shadow, `#10192dd9` backdrop, header with Esc ×, disclaimer footer). Only the vector poster FLIPs from its card. A viewBox camera moves stage by stage, using each poster's own stage labels as step titles and the page's own paper text. The last step shows the original figure, venue, authors and only the links that exist. The ramAIn variant ends at "Visit ramain.ai ↗".

**Micro (≤0.4s, no stagger):**
- Print boxes **register their offset shadow** from 0 to 7, 9 or 12px when they enter, like a print being laid down.
- The filter's square blue block slides (0.2s).
- Rows collapse together (0.18s).
- Detail rows animate their height.
- Search scales from its button (0.18s).
- News items mask-slide.
- The timeline rail draws once.
- The portrait linework draws once.
- Each writing-card illustration acts out its idea on hover.
- Contact contour lines draw in with scroll once, then drift very slowly (≥20s). They do not react to the cursor.

**Cut after critique:** custom cursor, magnetic period, per-letter splitting of the name, split-line parallax, clip-path band "prints", poster tilt and layer parallax, hover-follow thumbnails, count ticks, staggered results, the news timer hairline, the terminal log strip, the endless ramAIn loop, a cursor-bending field, depth-of-field blur, the contact shader field and portrait drift.

## First two seconds
| t | event |
|---|---|
| 0 | First paint: the full layout and all text. The name lines run the template's own CSS `name-enter` clip-rise (0.85s, line 2 at +0.1s). |
| ~0.8s | The hero square stamps onto the baseline. The molecule panel's offset shadow registers. |
| ~1.1–1.8s | The BFS atom wave from atom 5 plays. |
| 8s | The first news rotation (nothing moves above the hero during the intro). |

## Static lock (rest-state parity)
- **Tokens (effective values):** paper `#fafbff`, line `#ccd3e3`, ink `#101116`, blue `#2457ff`, muted `#626571`.
- **Darks:** nav and ramAIn `#141a2a` (border `#303b53`). Contact is a `#0c2039→#112b50` gradient with a radial glow. `#0e1017` is the search backdrop only.
- **Section accents are kept:** About `#3159e8`, Writing `#2458c5`/`#2454ac`, footer `#285ed0`, news `#2451cb`/`#193d92`, nav `#b1caff`, Contact cyan `#a9e5ed` (the second line of the contact name is mandatory).
- **Shadows:** molecule panel 7px `#d7e1f8`, building visual 7px `#334267`, experience 9px `#e0e6f8`, photo mat 12px `#dfe5f8`, dialogs 10–12px. Gallery cards and paper rows have none.
- **Headings:**
  - Hero: Archivo Black with a blue square.
  - `Caffeine.`: Space Grotesk 500 with a round blue dot (unchanged).
  - `ramAIn`: Space Grotesk 500, no period.
  - `Research.`, `A bit about me.` and `Writing.`: Archivo Black with a square.
  - `Research experience`: Archivo Black, no period.
  - Contact: Space Grotesk 700 with a cyan second line.
  - `Find something.`: Space Grotesk.
- **Kept as is:** the nav (76px; 92px two-row on phones), the lavender news strip, the hero-status chip, the blue CTA, the molecule panel (with `molecular-field.svg`, 18px corner brackets and the "HOVER AN ATOM · CLICK TO FREEZE" hint), the 12-column gallery (spans 6/6/4/4/4/6/6), card tints, the 34px ↗ caption squares and the "View poster ↗" chip.
- **No:** border-radius beyond existing circles, glass, grain, bloom, a preloader or new colours.

## Facts locked
- DISSOLVR authors: *Vansh Ramani, Akhil Arora, D. Kuchhal, Sayan Ranu, Tarak Karmakar*.
- ReasonBENCH authors: *Vansh Ramani, N. Potamitis, H. A. Arora, D. Kuchhal, L. H. Klein, Akhil Arora*. No other initial is expanded.
- Timeline, in chronological order with dates: IIT Delhi 2023 — present, University of Copenhagen summer 2024, Carnegie Mellon summer 2025, CLAN Aarhus 2025 — present. News items stay verbatim.

## Quality floor
- **No JS:** readable and complete at first paint. The motion layer has a 2.6s failsafe.
- **Responsive:** 390px+ with no horizontal scroll, 44px targets and visible `:focus-visible`. Dialogs use `showModal` (background inert) and return focus to their opener.
- **Reduced motion:** no Lenis, no scrub and no loops; posters at their authored frame. Every feature works.
- **No WebGL:** a 2D canvas renderer with identical interactions. It also renders until the WebGL frame is ready, then crossfades at identical framing.
- **WebGL:** devicePixelRatio ≤2, isolines antialiased with `fwidth` at one CSS pixel. Rendering pauses off-screen, in hidden tabs and when idle and settled. Nothing initialises below 32×32 px. Animation pauses on keyboard focus (WCAG 2.2.2).
- **Touch:** `pan-y` on the canvas, with the axis locked after 8px (horizontal rotates only under 30°).
- **Budget:** LCP is the name. First-load JS is ≤160KB excluding the lazy Three.js chunk. 60fps at 4× CPU throttle on the hero and ramAIn band.

## Changelog v1 → v2
1. The field was cursor-bent screen-space noise. It is now an honest in-plane promolecular slice with hop-by-hop message passing.
2. Continuous spin became a bounded wobble, because caffeine is planar.
3. Letter-split kinetic name became the template's own line rise plus one square stamp. Splitting broke the Va kerning.
4. Seven autoplaying posters became one ≤1.6s gesture each, with a pixel-identical rest frame.
5. The ramAIn endless loop became play-once, hold, and ↺ replay.
6. The full-screen tinted takeover became the template's framed dialog, enlarged.
7. Shared-system tropes were cut (see the cut list).
8. The token baseline was corrected to the effective values, and the shadow and heading tables were locked.

## v3 — owner direction after the first build
The owner reviewed the build and asked for a classier, more striking name and a new logo. Those requests override the v2 restraint on the hero type.
- **Name:** Space Grotesk Bold (the template's own sans) at -0.07em tracking, ending in the blue square. Instrument Serif was also tried, and the owner chose the grotesk.
- **No entrance animation:** the name is static type from the first frame. The owner preferred it over two animated versions, a terminal decode/scramble and a line-drawn computer that morphed into the letters, so both were removed.
- **Logo:** the favicon's blue "vr" tile plus a mono name. The footer mark uses the same tile.
- **Second review round:** five lenses, each finding checked by a skeptic. It produced 18 confirmed fixes, all applied and re-verified in Brave (phone cascade parity, focus and Tab paths, reduced-motion scroll, sticky nav under dialogs, poster dissolve, contour long task, explainer controls at tablet widths).
