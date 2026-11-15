#!/usr/bin/env python3
"""Check local HTML/CSS references in the static MemQ website preview."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit
import re
import sys

ROOT = (Path(__file__).resolve().parents[1] / 'preview/memq-website').resolve()


class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.references = []
        self.ids = set()

    def handle_starttag(self, tag, attributes):
        attributes = dict(attributes)
        if attributes.get('id'):
            self.ids.add(attributes['id'])
        for name in ('href', 'src'):
            if name in attributes:
                self.references.append(attributes[name])


pages = {}
for file in ROOT.rglob('*.html'):
    page = Page()
    page.feed(file.read_text(encoding='utf-8'))
    pages[file] = page

errors = []
checked = 0


def check(source, ref, base, check_fragment=True):
    global checked
    url = urlsplit(ref)
    if url.scheme or url.netloc or ref.startswith('//'):
        return
    path = (base / unquote(url.path)).resolve() if url.path else source
    if path.is_dir():
        path /= 'index.html'
    checked += 1
    if not path.is_relative_to(ROOT) or not path.is_file():
        errors.append(f'{source.relative_to(ROOT)}: missing local reference {ref}')
    elif check_fragment and url.fragment and path in pages and unquote(url.fragment) not in pages[path].ids:
        errors.append(f'{source.relative_to(ROOT)}: missing anchor {ref}')


for file, page in pages.items():
    # Shared fragments are injected into root-level support pages, so their
    # relative URLs resolve against those pages rather than components/.
    base = ROOT if file.parent == ROOT / 'components' else file.parent
    for reference in page.references:
        check(file, reference, base)

for file in ROOT.rglob('*.css'):
    for reference in re.findall(r'url\(\s*[\'"]?([^\'")]+)', file.read_text(encoding='utf-8')):
        check(file, reference.strip(), file.parent, check_fragment=False)

for name in ('navbar', 'footer'):
    for suffix in ('html', 'css'):
        check(ROOT / 'components/load-components.js', f'components/{name}.{suffix}', ROOT)

if errors:
    print('\n'.join(errors), file=sys.stderr)
    sys.exit(1)
print(f'{len(pages)} HTML files and {checked} local references checked; no missing files or anchors.')
