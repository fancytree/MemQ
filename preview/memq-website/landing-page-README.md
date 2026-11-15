# MemQ website preview

This folder contains the static website preview. Serve it from an HTTP server and open `index.html`; the support and policy pages load shared navigation and footer components and should not be checked via a `file://` URL.

The support and policy pages also embed fallback copies of the shared navigation and footer, so those links remain available when scripts or component fetches fail. When editing either component, update the matching fallback markup in all three pages as well. The help center shows all FAQ answers and hides its script-dependent search when JavaScript is unavailable.

The home page uses `site.css` and `site.js`, Geist and Oswald, the current lime and purple palette, and the Today screen capture in `img/current/today-demo.png`. The capture uses example course content. Animations respect the visitor's reduced-motion setting, and page content remains available without JavaScript.

## Stylesheets and markup travel together

`site.css`, `site.js`, `secondary.css` and the Today capture are requested with a `?v=` query. Bump it
in every page whenever one of them changes shape alongside the markup. Without it a
visitor holding a cached stylesheet gets it against new HTML, and the static server
here sends no `Cache-Control`, so browsers keep one for a long time: the hero laid
its two mascot drawings out one above the other down the whole page that way. The
second drawing is also `hidden` in the markup and only revealed once the rule that
stacks it is present, so the worst case is one face and no swap rather than that.

## Keeping it current

`img/current/today-demo.png` is a simulator capture of the app's own `website-preview` route, which renders the Today screen with example content and no personal data. Retake it whenever that screen changes: open `memq://website-preview` and capture with `xcrun simctl io <udid> screenshot`. The development-only route temporarily hides the dev-client floating button and restores its previous setting when leaving; verify the screenshot is the demo screen before using it.

The hero character is the app's own rig, not a copy of it. Two files are generated
from `components/mascot/rig` by `node scripts/build-website-mascot.cjs`, and neither
is edited by hand:

- `mascot-rig.js` — the solver the app runs every frame, compiled for a browser.
- the SVG between the `<!--mascot:start-->` and `<!--mascot:end-->` comments in
  `index.html` — one element per part, drawn in the rest pose, so the character is
  on the page with no script at all. Each element names the number in a frame it
  listens to: `data-m` a matrix, `data-o` an opacity, `data-d` a path, `data-rx` and
  `data-ry` a radius.

`site.js` runs the solver on `requestAnimationFrame` and hands each number to the
element that asked for it. Nothing about how the character moves is decided on the
website: when the rig changes in the app, run the script again and bump
`mascot-rig.js?v=` (and `site.css?v=` / `site.js?v=` if they changed). The script
takes `--check`, which writes nothing and fails if either file is out of date.

The hero is laid out the way the app's Today screen is: two hills, and the character
behind the near one with its paws over the edge. All of it is one drawing — the far
hill, the back half of the character, the near hill, then its face and hands — in
the character's own 256 square, so the paws cannot come off the edge however the
page is sized. Between the points marked in the build script the hills are the app's
own curves (`assets/home-figma/wave-back.svg`, `wave-front.svg`) placed as Today
places them; beyond that stretch they are carried on left and right, far past any
window, because a page does not end where a phone does. The corrections that rest
the paws on the slope and lift the tail clear of it are Today's too (`pose` in the
build script, `data-pose` on the drawing).

The mood is `todayIdle`, Today's own resting state, with the sparks the hero has
always worn asked for on top (`data-marks="spark"`). The gaze follows the pointer
instead of wandering, since a page has something worth looking at; with no pointer,
or once it has sat still for a while, it goes back to wandering as it does in the
app. The character only runs while the hero is on screen, and with reduced motion
it is drawn once at rest and left alone.

## Motion on the page

- **Ticker.** The track is twelve identical groups and moves by exactly one of them,
  so it is seamless and covers a window up to about eleven groups wide (≈6500px).
  Change the group count in `index.html` and the `12` in `@keyframes marquee`
  together.
- **Lipped buttons** (`.button`) press flat: on `:active` the face travels down by
  the height of its lip (`--lip`) and the lip goes to nothing. They do not lift on
  hover — a button that rises and one that is pressed are two different objects.
- **Parallax.** Anything with `data-parallax` drifts by that many pixels per pixel
  scrolled; positive hangs back, negative runs ahead. Layers in the first screen
  drift from where they were laid out; layers further down pass through where they
  were laid out as their section crosses the middle of the window. It is scaled down
  on phones and off with reduced motion. The near hill and the character are not
  layers: the paws are on that edge.
- **Small things**, all in the last block of `site.css`: the scroll arrow nudges,
  arrows in links and buttons lean the way they point on hover, the eyebrow dot
  pings, the two chips bob, the wordmark's star turns.

It used to be a second description of the character: the paths lifted into the page
and the motion re-typed as CSS keyframes from the app's numbers. That copy went on
being the old frame-swapping picture after the app had stopped being one, which is
why it is generated now.

The `oauth/` pages are local authorization prototypes. Their presence here does not mean the MCP service or authorization flow is deployed or ready for production. See `docs/mcp/README.md` in the MemQ repository for the current testing and release limitations.

Before publishing, compare this preview with the existing website source, verify asset and link paths on the target host, and check desktop and mobile layouts. A local preview or copied source is not evidence that the public website has been deployed.

Local source audit, 2026-11-15: the five standalone HTML pages have no missing relative files or fragment targets, and `node scripts/build-website-mascot.cjs --check` confirms the landing-page mascot matches the app rig. This does not verify links or rendering on the eventual host, the responsive layout, or live deployment.
