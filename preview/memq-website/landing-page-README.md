# MemQ website preview

This folder contains the static website preview. Serve it from an HTTP server and open `index.html`; the support and policy pages load shared navigation and footer components and should not be checked via a `file://` URL.

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

`img/current/today-demo.png` is a simulator capture of the app's own `website-preview` route, which renders the Today screen with example content and no personal data. Retake it whenever that screen changes: open `memq://website-preview`, capture with `xcrun simctl io <udid> screenshot`, and crop above the dev-client's floating button — the mock frame shows more of the image than its CSS height suggests, so the button lands inside it otherwise.

The hero character is rigged like Today's, not animated as one picture. It is an
inline SVG in `index.html` with the parts in their own groups — sparks, tail, horns,
body, eyes, pupils — each on its own clock, because what made the old version wrong
was that everything moved together. The numbers come from `todayIdle` in
`components/mascot/state.ts`: roll ±1.1° at 0.46, breath ±0.028/±0.042 at 1.3, tail
±3° at 1.6× the lean, gaze `MASCOT_LOOK` (−0.667, 0.086) with `GAZE_EYE` and
`GAZE_PUPIL` moving the eye and the pupil by different distances, blink 2800–6200ms,
and neutral three times per happy on a 4000–8000ms hold. The lags (`hornLag`,
`tailLag`) are springs in the app and animation delays here, which is an
approximation, not the same thing.

The closed-eye face is struck over this drawing's own eye centres rather than
borrowed from the happy artwork: that drawing sits its face left of its body centre
and this one sits it right, so mapping by the body put the smile beside the eyes.

An earlier version used the app's hop for the `happy` mood, which was the wrong mood
for this screen — Today does not hop: the keyframes in `@keyframes mascot-hop` were generated from the trajectory in `components/mascot/state.ts` (height 0.030, crouch 0.012, squash 0.095, beats 0.17/0.23/0.26/0.14/0.2) with the breath from `squash: [1, 0.018, 2.1]` on top. One loop is three seconds: three hops, and one breath to within 0.3%. If those numbers change in the app, regenerate rather than nudge by eye.

The `oauth/` pages are local authorization prototypes. Their presence here does not mean the MCP service or authorization flow is deployed or ready for production. See `docs/mcp/README.md` in the MemQ repository for the current testing and release limitations.

Before publishing, compare this preview with the existing website source, verify asset and link paths on the target host, and check desktop and mobile layouts. A local preview or copied source is not evidence that the public website has been deployed.
