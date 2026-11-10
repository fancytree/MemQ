# Split every eye variant out of the mascot's parts file, one render per eye.
#
# The pack ships each expression's eyes as a single piece spanning both. That is all a
# symmetric expression needs, and it makes an asymmetric one impossible: a wink closes
# one eye and leaves the other open, and nothing in a both-eyes piece can express that.
# The geometry is already per-eye in the .blend — every eye group holds two separate
# objects, one per side — so nothing has to be modelled, only rendered apart.
#
# Everything renders through the same camera and settings as the rest of the pack, so
# the output composites with it unchanged. The .blend is never written back.
#
#   blender --background "<parts.blend>" --python scripts/render-mascot-eye-splits.py -- <out-dir>
#
# Each render is named for the side its ink actually lands on in the image, measured
# from the rendered alpha rather than inferred from object names or world coordinates:
# which way the camera maps Blender's x is exactly the kind of assumption that silently
# mirrors a whole asset set.
import os
import sys

import bpy

OUT = sys.argv[sys.argv.index("--") + 1]
os.makedirs(OUT, exist_ok=True)

scene = bpy.context.scene
scene.camera = bpy.data.objects["Camera | Front"]
scene.render.engine = 'CYCLES'
scene.cycles.samples = 128
scene.render.film_transparent = True
scene.render.resolution_x = scene.render.resolution_y = 1024
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'

DRAWN = ('MESH', 'CURVE', 'FONT')
every = [o for o in bpy.data.objects if o.type in DRAWN]

# Group in the .blend -> the name this project knows that expression by.
GROUPS = {
    'Eyes | Idle': 'open',
    'Eyes | Surprised': 'wide',
    'Eyes | Focused': 'focused',
    'Eyes | Excited': 'squeezed',
    'Eyes | Sleepy': 'sleepy',
    'Eyes | Blink half': 'half',
    'Eyes | Blink closed': 'closed',
    'Eyes | Thinking': 'glance',
    'Eyes | Happy': 'smile',
}
# The confused group is not a symmetric pair - it is one open eye beside one winking
# one - so it is handled on its own below rather than split like the others.


def render_to(path, objects):
    for o in every:
        o.hide_render = o not in objects
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def ink_side(path):
    """Which half of the canvas the rendered pixels fall in: 'L', 'R' or 'both'."""
    img = bpy.data.images.load(path, check_existing=False)
    w, h = img.size
    px = list(img.pixels)
    xs = [i % w for i in range(w * h) if px[i * 4 + 3] > 0.02]
    bpy.data.images.remove(img)
    if not xs:
        return None, 0
    centre = sum(xs) / len(xs)
    # Blender writes images bottom-up, but only the x matters here.
    span = (min(xs), max(xs))
    if span[0] < w * 0.5 < span[1]:
        return 'both', centre
    return ('L' if centre < w * 0.5 else 'R'), centre


def mean_x(objects):
    """Mean world x of the actual geometry. An object's origin is not its position:
    every eye white in this file sits at the world origin with the offset baked into
    the mesh, so reading the origin puts both eyes on the same side."""
    xs = []
    for o in objects:
        if o.type != 'MESH':
            continue
        m = o.matrix_world
        xs.extend((m @ v.co).x for v in o.data.vertices)
    return sum(xs) / len(xs) if xs else 0.0


def pieces(parent_name):
    """The group's children, bundled per eye: a lid curve belongs with the caps that
    share its numeric suffix, and a white belongs with nothing else."""
    parent = bpy.data.objects[parent_name]
    kids = [o for o in parent.children if o.type in DRAWN]
    buckets = {}
    for o in kids:
        suffix = o.name.rsplit('.', 1)[-1] if '.' in o.name and o.name.rsplit('.', 1)[-1].isdigit() else ''
        stem = o.name.rsplit('.', 1)[0] if suffix else o.name
        # A cap belongs to the curve it was cut for; strip the "cap N" to find it.
        key = stem.replace(' cap 0', '').replace(' cap 1', '')
        buckets.setdefault((key, suffix), []).append(o)
    # Caps carry their own suffix, which may differ from the curve's; regroup by the
    # x of each bundle so the two eyes separate cleanly whatever the numbering.
    out = []
    for objs in buckets.values():
        out.append((mean_x(objs), objs))
    return out


made = []
for group, label in GROUPS.items():
    if group not in bpy.data.objects:
        print(f"[R] SKIP {group}: not in this file")
        continue
    bundles = pieces(group)
    # Split into two eyes by the sign of x, then render each side as one image.
    left = [o for x, objs in bundles if x < 0 for o in objs]
    right = [o for x, objs in bundles if x >= 0 for o in objs]
    for blender_side, objs in (('neg', left), ('pos', right)):
        # Pupils stay out of these renders. Gaze moves a pupil inside its white every
        # frame, so a pupil baked into the white would be nailed in place - and the
        # separate pupil drawn over it would double it.
        objs = [o for o in objs if not o.name.startswith('Pupil')]
        if not objs:
            continue
        tmp = os.path.join(OUT, f"_tmp_{label}_{blender_side}.png")
        render_to(tmp, objs)
        side, centre = ink_side(tmp)
        if side is None:
            os.remove(tmp)
            print(f"[R] {label} {blender_side}: nothing rendered")
            continue
        if side == 'both':
            print(f"[R] {label} {blender_side}: spans the centre line, left as-is")
            side = blender_side
        final = os.path.join(OUT, f"eye_{label}_{side}.png")
        os.replace(tmp, final)
        made.append(os.path.basename(final))
        print(f"[R] eye_{label}_{side}.png  <- {sorted(o.name for o in objs)}  ink centre x={centre:.0f}")

# The file models the wink on one eye only. Mirroring it about the centre line gives
# the other side, so a wink can be played on whichever eye the state asks for.
wink_src = [o for o in bpy.data.objects['Eyes | Confused'].children
            if o.type in DRAWN and 'Wink' in o.name]
for mirror in (False, True):
    if not wink_src:
        break
    saved = [(o, tuple(o.scale), tuple(o.location)) for o in wink_src]
    if mirror:
        for o in wink_src:
            o.scale = (-o.scale[0], o.scale[1], o.scale[2])
            o.location = (-o.location[0], o.location[1], o.location[2])
    tmp = os.path.join(OUT, '_tmp_wink.png')
    render_to(tmp, wink_src)
    side, centre = ink_side(tmp)
    for o, sc, loc in saved:
        o.scale, o.location = sc, loc
    if side in ('L', 'R'):
        os.replace(tmp, os.path.join(OUT, f'eye_wink_{side}.png'))
        made.append(f'eye_wink_{side}.png')
        print(f"[R] eye_wink_{side}.png  <- {'mirrored ' if mirror else ''}"
              f"{sorted(o.name for o in wink_src)}  ink centre x={centre:.0f}")
    else:
        os.remove(tmp)
        print(f"[R] wink (mirror={mirror}) landed on {side}: not written")

print(f"[R] wrote {len(made)} files")
