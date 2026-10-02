# Vansh Ramani — personal website

A static GitHub Pages website built with HTML, CSS, and vanilla JavaScript. All artwork, fonts, and molecular coordinates are served locally. No build step, backend, runtime packages, or external API calls.

## Preview locally

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Open http://127.0.0.1:8000/.

## Design and files

- `index.html`: caffeine opening, ramAIn, illustrated research gallery, publication index, an editorial biography and research-experience index, illustrated writing, and contact.
- `images/posters/`: eight standalone vector illustrations, one for each research paper and ramAIn. These illustrate concepts; original paper figures remain in publication details.
- `images/molecular-field.svg`: custom contour field behind the molecule.
- `js/caffeine-data.js`: local atom coordinates and bonds from [PubChem CID 2519](https://pubchem.ncbi.nlm.nih.gov/compound/2519), downloaded from the PUG REST 3D record. Caffeine contains 24 atoms including hydrogens and 25 bonded atom pairs.
- `js/molecule.js`: perspective projection, shaded atoms and bonds, pointer and keyboard rotation, atom picking, neighborhood contour fields, research-direction cards, and automatic rotation.
- `css/site.css`, `css/portfolio.css`, `css/lower-site.css`, `css/mobile.css`: responsive typography, color fields, layouts, motion, and phone controls.
- `js/site.js`: local search, navigation, poster enlargement, and publication filtering.
- `content/`: original writing, projects, coursework, achievements, personal notes, and experience/news.
- `content/news.html`: all 12 original announcements, plus SC³’s NeurIPS 2026 acceptance, in chronological order.
- `js/news.js` and `css/news.css`: the rotating announcement banner and News page. Banner headlines link to their full entries.
- `fonts/`: self-hosted typefaces and open-font licenses.

## Interactions

- The news banner advances every eight seconds. Hover, keyboard focus, leaving the viewport, and hidden browser tabs suspend rotation. The banner has no controls; reduced motion keeps the latest headline static. The News archive uses compact dated rows without duplicate summaries. The full archive is static HTML and works without JavaScript.

- Hover an atom to highlight its bonded neighborhood with smooth contour fields and a small research card on the right. Click the atom to pin it; use Unpin, the close button, or Escape to clear it. On touch screens, tapping pins the view. Six focusable atom targets provide keyboard access: focus previews and Enter pins.
- Drag the molecule or focus it and use the arrow keys to rotate. Rotation pauses while exploring an atom.
- Open any poster to view it at a larger size. Escape closes the viewer. The publication link opens its entry in the index; ramAIn links to the company.
- Search with the header icon, Cmd/Ctrl+K, or `/`. Arrow keys select results; Enter opens them; Escape closes search.
- Category filters narrow the publication index.

The atom-to-research mapping is a navigation metaphor; the molecular geometry and local bonded neighborhoods come from the stored caffeine record. Contours follow the projected positions of the selected atom and its nearby bonded atoms. They are a visual navigation aid, not a physical force-field calculation.


Phone navigation keeps all five destinations visible. Touch controls use larger tap targets, vertical swipes scroll past the molecule, and horizontal swipes rotate it. Search uses a 16px input to avoid automatic zoom on iOS; open viewers contain scrolling.

Motion respects reduced-motion preferences. The molecule stops rendering off-screen or in a hidden tab. Without JavaScript, a static caffeine model replaces the canvas, poster links open their SVGs, and native publication details remain usable. Existing `/content/` and `/space/` URLs remain available. The original site is preserved in Git history.
