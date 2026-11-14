# MemQ website preview

This folder contains the static website preview. Serve it from an HTTP server and open `index.html`; the support and policy pages load shared navigation and footer components and should not be checked via a `file://` URL.

The home page uses `site.css` and `site.js`, Geist and Oswald, the current lime and purple palette, and the Today screen capture in `img/current/today-demo.png`. The capture uses example course content. Animations respect the visitor's reduced-motion setting, and page content remains available without JavaScript.

## Keeping it current

`img/current/today-demo.png` is a simulator capture of the app's own `website-preview` route, which renders the Today screen with example content and no personal data. Retake it whenever that screen changes: open `memq://website-preview`, capture with `xcrun simctl io <udid> screenshot`, and crop above the dev-client's floating button — the mock frame shows more of the image than its CSS height suggests, so the button lands inside it otherwise.

The hero character's animation is the app's own hop for the `happy` mood, not a hand-made float: the keyframes in `@keyframes mascot-hop` were generated from the trajectory in `components/mascot/state.ts` (height 0.030, crouch 0.012, squash 0.095, beats 0.17/0.23/0.26/0.14/0.2) with the breath from `squash: [1, 0.018, 2.1]` on top. One loop is three seconds: three hops, and one breath to within 0.3%. If those numbers change in the app, regenerate rather than nudge by eye.

The `oauth/` pages are local authorization prototypes. Their presence here does not mean the MCP service or authorization flow is deployed or ready for production. See `docs/mcp/README.md` in the MemQ repository for the current testing and release limitations.

Before publishing, compare this preview with the existing website source, verify asset and link paths on the target host, and check desktop and mobile layouts. A local preview or copied source is not evidence that the public website has been deployed.
