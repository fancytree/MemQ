"""Build the app icons from the Figma export.

    python3 scripts/build-app-icons.py

Source: docs/app-icon/app-icon.svg, exported from Figma (MemQ, node 60:5902,
"Icon"). Writes assets/images/icon.png and icon-ios-{light,dark,tinted}.png at
1024 x 1024, and favicon.png at 196 x 196. Needs rsvg-convert and Pillow.

The Figma frame draws its background as a rounded square. iOS masks every icon
itself and rejects artwork with transparency, so the background is squared off:
inside the system's mask, which is rounder than the design's 54/256 corner, the
result looks the same.

Dark and tinted follow the convention the previous icon set used: the mascot as
light line art on a dark field, the sparks kept in colour (dark) or grey (tinted).
"""
import os, re, subprocess, sys, tempfile
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'images')

SRC = open(os.path.join(ROOT, 'docs', 'app-icon', 'app-icon.svg'), encoding='utf8').read()
INK, BODY, BG, WHITE, SPARK = '#4B2C78', '#C59AF0', '#F0E4FC', 'white', '#FFBA00'
SQUARE = 'M0 0H256V256H0Z'

def recolor(svg, by_id):
    """by_id: {element id: {'fill': colour, 'stroke': colour}}"""
    def edit(m):
        tag = m.group(0)
        pid = re.search(r'id="([^"]*)"', tag)
        if not pid or pid.group(1) not in by_id: return tag
        for attr, value in by_id[pid.group(1)].items():
            if re.search(rf' {attr}="[^"]*"', tag):
                tag = re.sub(rf' {attr}="[^"]*"', f' {attr}="{value}"', tag, count=1)
        return tag
    return re.sub(r'<path[^>]*>', edit, svg)

def squared(svg):
    return re.sub(r'(<path id="Vector_3" d=")[^"]*(")', rf'\g<1>{SQUARE}\g<2>', svg, count=1)

INK_IDS = ['Vector_4', 'Vector_5', 'horn L', 'horn R', 'Body', 'Eyeball L', 'Eyeball R', 'Mouth suprise', 'hand R', 'hand L']
FILLED = ['Body', 'hand R', 'hand L']          # lavender body with an ink outline
EYES = ['Eye L', 'Eye R']                      # white
SPARKS = ['Vector_6', 'Vector_7', 'Vector_8']  # yellow strokes

def line_art(field, line, spark):
    m = {'Vector_3': {'fill': field}}
    for i in INK_IDS: m.setdefault(i, {}); m[i].update({'fill': line, 'stroke': line})
    for i in ['Vector_4']: m[i] = {'stroke': line}                     # tail outline is stroke only
    for i in FILLED: m[i] = {'fill': field, 'stroke': line}            # hollow: the field shows through
    for i in EYES: m[i] = {'fill': field}                              # eyes read as the pupils alone
    for i in SPARKS: m[i] = {'stroke': spark}
    return m

variants = {
    'light': squared(SRC),
    'dark': squared(recolor(SRC, line_art(INK, '#FFFFFF', SPARK))),
    'tinted': squared(recolor(SRC, line_art('#000000', '#FFFFFF', '#A6A6A6'))),
}
FILES = {'light': ['icon.png', 'icon-ios-light.png'], 'dark': ['icon-ios-dark.png'], 'tinted': ['icon-ios-tinted.png']}

with tempfile.TemporaryDirectory() as work:
    for name, svg in variants.items():
        svg_path, png_path = os.path.join(work, f'{name}.svg'), os.path.join(work, f'{name}.png')
        open(svg_path, 'w', encoding='utf8').write(svg)
        subprocess.run(['rsvg-convert', '-w', '1024', '-h', '1024', '-o', png_path, svg_path], check=True)
        img = Image.open(png_path).convert('RGBA')
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
