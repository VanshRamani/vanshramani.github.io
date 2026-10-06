# Vansh Ramani — personal website

A static GitHub Pages site built with HTML, CSS and vanilla JavaScript ES modules. All artwork, fonts, molecular coordinates and libraries are served locally. There is no build step, backend or external API call.

## Preview locally

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Open http://127.0.0.1:8000/. ES modules need an http origin, so `file://` won't work.

## Structure

- `index.html`: the homepage, in this order: news strip, hero with the caffeine research map, ramAIn, illustrated research gallery and publication index, About with the research-experience timeline, Writing, and Contact. All content is in the HTML and readable without JavaScript.
- `assets/css/`: `flex.css` holds the design tokens, type, layout and responsive rules. The other files hold one feature each.
- `assets/js/`: `main.js` loads each feature module in isolation, so one failure never breaks the page. `core.js` is the shared runtime (smooth scroll, a single animation ticker, the pause-motion state, visibility helpers).
- `assets/vendor/`: self-hosted three.js r169, GSAP 3.12.5 with ScrollTrigger, and Lenis 1.1.13.
- `images/posters/`: eight standalone vector illustrations, one for each paper and ramAIn. `images/` also holds the original paper figures.
- `js/caffeine-data.js`: atom coordinates and bonds from [PubChem CID 2519](https://pubchem.ncbi.nlm.nih.gov/compound/2519). Caffeine has 24 atoms including hydrogens, and the bond indices are 0-based.
- `content/`: writing, projects, coursework, achievements, personal notes, experience and news pages. They keep their own styles in `css/` and `js/`.
- `fonts/`: self-hosted typefaces and their open-font licenses.

## Interactions

- **Caffeine research map:**
  - The molecule is rendered in WebGL. It sits on a promolecular-density slice drawn in the molecule's own plane.
  - Hover or tap an atom, or use the 01–06 key under it. The contours spread outward bond by bond in that research direction's colour, and a card links to the related papers. Click to pin; press Escape to clear.
  - Drag or use the arrow keys to rotate. On page load the same wave plays once from a single atom.
  - Without WebGL2, a 2D canvas renderer provides the same interactions.
- **Posters:** each poster acts out its own idea when it first comes into view and again on hover, then rests exactly on the authored illustration. Clicking a poster opens a framed explainer. It moves across the poster stage by stage and ends with the original paper figure, authors and links. The ramAIn poster plays an illustrative Observe → Reason → Act → Verify loop, and the ↺ in its caption replays it.
- **Publication index:** filters slide between categories and rows expand with their figure. Every `#paper-*` link opens its row.
- **Search:** the header icon, Cmd/Ctrl+K or `/` opens search. Arrow keys select and Enter opens.
- **News:** the banner rotates every eight seconds after the first eight. It pauses on hover, focus, off-screen and in hidden tabs.
- **Pause motion:** the control stops everything that moves on its own and remembers the choice.

## Accessibility and performance

- The page is complete without JavaScript. `prefers-reduced-motion` gets a calm but complete version.
- Focus rings are visible everywhere. Dialogs trap and return focus. Touch targets are at least 44px on phones.
- There is no horizontal scroll from 360px up.
- The device pixel ratio is capped. Rendering pauses off-screen and in hidden tabs, and Three.js loads only after first paint.

The previous design is preserved in Git history.
