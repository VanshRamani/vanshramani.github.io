# claude-flex

The same site as `/index.html`, with the same tokens, type, posters, sections and facts, pushed to its limit in one place. It is static HTML, CSS and ES modules with no build step.

```sh
python3 -m http.server 8000 --bind 127.0.0.1   # from the repo root
```

Open http://127.0.0.1:8000/claude-flex/. ES modules need an http origin, so `file://` won't work.

## The idea
**See what a graph neural network sees.** The caffeine molecule (PubChem CID 2519, `../js/caffeine-data.js`) is rendered in WebGL on its own promolecular-density slice. The isolines lie in the molecule's plane (caffeine is planar). Hover an atom and the field re-weights hop by hop (0 → 1 → 2) in that atom's research-direction colour: this is the receptive field of a message-passing layer. The intro plays the same wave once, as a BFS from atom 5. That is the only 3D. Everything else is restrained and print-like, and at rest the page matches the template.

**The name** is static Space Grotesk Bold (the template's own sans), tightly tracked, ending in the blue square.

Design brief, critique log and owner-directed changes: [`BRIEF.md`](BRIEF.md).

**Logo:** the favicon's blue "vr" tile, with the name in mono beside it.

## Files
| path | role |
|---|---|
| `index.html` | All content. Complete and readable without JS. |
| `css/flex.css` | Foundation: the template's tokens, type, layout and responsive rules, consolidated from the original five stylesheets. |
| `css/*.css` | One stylesheet per module. |
| `js/main.js` | Loads each module in isolation, so one failure never breaks the page. |
| `js/core.js` | Shared runtime: Lenis + ScrollTrigger, the single `gsap.ticker` loop, the pause-motion state, visibility helpers and the event bus. |
| `js/poster-svg.js` | Inlines a poster from `../images/posters/` safely. It prefixes ids, scopes the poster's own `<style>`, renames classes and strips `<title>`. The source files are never modified. |
| `js/molecule*.js` | Molecule core (state, input, picking, card, legend), a 2D canvas renderer and a Three.js/GLSL renderer. |
| `js/hero.js` | Blue-square stamps, nav marker, the hero→nav hand-off, pause-motion control. |
| `js/posters.js` | Seven poster gestures, each ≤1.6s, resting on the authored frame. |
| `js/explainer.js` | Framed poster explainer with a viewBox camera and the original paper figure. |
| `js/ramain.js` | The ramAIn poster as an illustrative Observe → Reason → Act → Verify demo. |
| `js/publications.js`, `js/search.js`, `js/news.js` | Index filtering and expansion, ⌘K search, the news strip. |
| `js/sections.js`, `js/contact-field.js` | Print-shadow registration, the timeline rail, writing-card gestures, contact contours. |
| `vendor/` | Self-hosted three r169, GSAP 3.12.5 + ScrollTrigger, Lenis 1.1.13. |

Shared assets come from the repo: `../images`, `../fonts`, `../content`, `../js/caffeine-data.js`.

## Facts corrected
- "A. Arora" on DISSOLVR and ReasonBENCH is **Akhil Arora**. "H. A. Arora" is unchanged.
- University of Copenhagen: **summer 2024**. Carnegie Mellon: **summer 2025**. The research-experience timeline now shows dates and runs in chronological order.
- `content/background.html` still says CMU ran May–Aug 2024. It lives outside `claude-flex/`, so it was left untouched. That line should be changed to the summer-2025 dates.

## Quality floor
- Readable without JS.
- `prefers-reduced-motion` gives a calm but complete version.
- A **Pause motion** control (WCAG 2.2.2) stops everything that moves on its own.
- 2D canvas fallback without WebGL2; WebGL context loss also falls back.
- devicePixelRatio is capped. Rendering pauses off-screen and in hidden tabs.
- No horizontal scroll from 360px up. Tap targets are 44px.
