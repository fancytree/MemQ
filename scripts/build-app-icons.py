"""Build the app icons from the Figma export.

    python3 scripts/build-app-icons.py

Source: docs/app-icon/app-icon.svg, exported from Figma (MemQ, node 70:7229,
"Icon"). Writes assets/images/icon.png and icon-ios-{light,dark,tinted}.png at
1024 x 1024, and favicon.png at 196 x 196. Needs rsvg-convert and Pillow.

Also writes the website's icons into preview/memq-website: favicon.ico (16, 32,
48), favicon-32.png and icon.svg for browser tabs, which are given the design's
rounded corners, and apple-touch-icon.png (180, square: iOS rounds it itself).

The frame draws its background as a plain square, which is what iOS wants: it
masks every icon itself and rejects artwork with transparency. A browser tab
does no masking, so the website's copies get the corner radius put back.

Dark and tinted follow the convention the icon set has always used: the mascot
as light line art on a dark field, the sparks kept in colour (dark) or grey
(tinted).
"""
import os, re, subprocess, sys, tempfile
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'images')
SITE = os.path.join(ROOT, 'preview', 'memq-website')
SVG = os.path.join(ROOT, 'docs', 'app-icon', 'app-icon.svg')

SRC = open(SVG, encoding='utf8').read()
INK, BG, SPARK = '#4B2C78', '#F0E4FC', '#FFBA00'
# The design's corner, for the places that draw their own: 54 of 256.
RADIUS = 54

# The mascot's outline and the tail, in the export's own ids.
INK_IDS = ['Vector_2', 'horn L', 'horn R', 'Body', 'Eyeball L', 'Eyeball R']
STROKED = ['Vector']            # the tail curve is a stroke with no fill
HOLLOW = ['Body']               # keeps its outline, the field shows through
EYES = ['Eye L', 'Eye R']       # whites drop out, so the eyes read as pupils
SPARKS = ['Rectangle 1', 'Rectangle 3', 'Rectangle 4']


def recolor(svg, by_id):
    """by_id: {element id: {'fill': colour, 'stroke': colour}}"""
    def edit(m):
        tag = m.group(0)
        pid = re.search(r'id="([^"]*)"', tag)
        if not pid or pid.group(1) not in by_id:
            return tag
        for attr, value in by_id[pid.group(1)].items():
            if re.search(rf' {attr}="[^"]*"', tag):
                tag = re.sub(rf' {attr}="[^"]*"', f' {attr}="{value}"', tag, count=1)
            else:
                tag = tag.replace('<path', f'<path {attr}="{value}"', 1)
        return tag
    return re.sub(r'<path[^>]*>', edit, svg)


def field(svg, colour):
    """The background square. It carries no id, so it is matched by shape."""
    out, n = re.subn(r'(<rect width="256" height="256" fill=")[^"]*(")',
                     rf'\g<1>{colour}\g<2>', svg, count=1)
    assert n == 1, 'background square not found'
    return out


def rounded(svg):
    """Put the corner radius back, for the places that are not masked for us."""
    out = field(svg, BG).replace('<rect width="256" height="256" fill="%s"/>' % BG,
                                 '<rect width="256" height="256" rx="%d" fill="%s"/>' % (RADIUS, BG), 1)
    # The clip the frame already carries is what keeps the body inside the tile.
    return out.replace('<rect width="256" height="256" fill="white"/>',
                       '<rect width="256" height="256" rx="%d" fill="white"/>' % RADIUS, 1)


def line_art(bg, line, spark):
    m = {}
    for i in INK_IDS:
        m[i] = {'fill': line, 'stroke': line}
    for i in STROKED:
        m[i] = {'stroke': line}
    for i in HOLLOW:
        m[i] = {'fill': bg, 'stroke': line}
    for i in EYES:
        m[i] = {'fill': bg}
    for i in SPARKS:
        m[i] = {'fill': spark}
    return m


variants = {
    'light': SRC,
    'dark': field(recolor(SRC, line_art(INK, '#FFFFFF', SPARK)), INK),
    'tinted': field(recolor(SRC, line_art('#000000', '#FFFFFF', '#A6A6A6')), '#000000'),
}
FILES = {'light': ['icon.png', 'icon-ios-light.png'],
         'dark': ['icon-ios-dark.png'],
         'tinted': ['icon-ios-tinted.png']}


def render(svg, size, path, work):
    src = os.path.join(work, 'frame.svg')
    open(src, 'w', encoding='utf8').write(svg)
    subprocess.run(['rsvg-convert', '-w', str(size), '-h', str(size), '-o', path, src], check=True)
    return Image.open(path).convert('RGBA')


with tempfile.TemporaryDirectory() as work:
    for name, svg in variants.items():
        img = render(svg, 1024, os.path.join(work, f'{name}.png'), work)
        lo, _ = img.getchannel('A').getextrema()
        if lo != 255:
            sys.exit(f'{name}: not opaque everywhere (alpha min {lo}); the background must cover the square')
        rgb = img.convert('RGB')
        for file in FILES[name]:
            rgb.save(os.path.join(OUT, file), optimize=True)
            print('wrote assets/images/' + file)
        if name == 'light':
            rgb.resize((196, 196), Image.LANCZOS).save(os.path.join(OUT, 'favicon.png'), optimize=True)
            print('wrote assets/images/favicon.png')
            rgb.resize((512, 512), Image.LANCZOS).save(os.path.join(ROOT, 'docs', 'app-icon', 'preview.png'), optimize=True)
            print('wrote docs/app-icon/preview.png')

# ── Website ─────────────────────────────────────────────────────
# A browser tab shows the icon as drawn, so these keep the design's rounded
# corners and transparency; only the home-screen icon is squared, like the app's.
with tempfile.TemporaryDirectory() as work:
    tile = rounded(SRC)
    big = render(tile, 512, os.path.join(work, 'rounded.png'), work)
    big.save(os.path.join(SITE, 'favicon.ico'), sizes=[(16, 16), (32, 32), (48, 48)])
    big.resize((32, 32), Image.LANCZOS).save(os.path.join(SITE, 'favicon-32.png'), optimize=True)
    Image.open(os.path.join(OUT, 'icon-ios-light.png')).convert('RGB').resize((180, 180), Image.LANCZOS) \
        .save(os.path.join(SITE, 'apple-touch-icon.png'), optimize=True)
    open(os.path.join(SITE, 'icon.svg'), 'w', encoding='utf8').write(tile)
    for f in ['favicon.ico', 'favicon-32.png', 'apple-touch-icon.png', 'icon.svg']:
        print('wrote preview/memq-website/' + f)
