# App Store assets — 3.0.0

The set that replaces `docs/app-store/2.0.0/`. Made from the strip in
`store-concepts/memq-app-store` (`set.html` → `frames/`), six frames read as one
picture: the first two are the hook, the rest each show one real screen.

## What to upload, and where

App Store Connect → the 3.0.0 version → **Previews and Screenshots**.

| Folder | Size | Upload as |
|---|---|---|
| `iPhone-large-1320x2868/` | 1320 × 2868 | iPhone 6.9" |
| `iPhone-medium-1206x2622/` | 1206 × 2622 | iPhone 6.3" |

Six screenshots each, `01`–`06`, in that order — the order is the point: 01 and
02 are one spread, and search shows only the first three.

Those two sizes cover every iPhone the app ships to; App Store Connect scales
them down for the older displays. There is no iPad set, since the app is
iPhone-only (`supportsTablet: false`).

## creative/

Not uploaded anywhere. `MemQ-Header-3840x1646.png` and
`MemQ-Search-Results-3840x2560.png` are renders of how the product page and the
search result come out with this set — for deciding whether they work at the
size people actually meet them at, which is the search result, not the page.
