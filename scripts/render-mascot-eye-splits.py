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

# The lid shapes are modelled narrower and thinner than the open eye they replace, so
# closing an eye visibly shrinks it and the closed shapes read as scratches rather than
# as eyes. Each is scaled up as a group and given a little extra stroke on top.
#
# Uniformly, and about one shared centre. A lid is a curve plus two cap meshes, and
# scaling each object about its own origin walks the caps off the ends of the curve —
# which showed up as the lid breaking into a wavy line with two dots under it.
# Applied in memory for the render only; the .blend keeps its own proportions.
#   name -> (group scale, extra stroke, extra vertical scale)
#
# No extra stroke. The lids are modelled at the right weight already: measured against
# the reference art, stroke over width is 0.155 there and 0.155 in the source, and a
# uniform scale keeps that. An earlier pass added 25% on top and made them 18% heavier
# than the reference. The vertical scales below are set from measured proportions -
# the reference arcs run 2.10 wide-to-tall for the pleased lid and 2.58 for the
# sleepy one.
ADJUST = {
    'arc': (1.44, 1.0, 1.26),
    'sleepy': (1.44, 1.0, 1.20),
    'closed': (1.44, 1.0, 1.0),
}

# The sleepy lids modelled in the file curve the wrong way: their ends turn up, so the
# pair reads as two cups rather than as lowered lids. The pleased crescent is the right
# shape — flattened, it becomes a relaxed one — so the sleepy art is derived from it
# instead, and the file's own sleepy curves go unused.
#   group -> (name, scale, stroke, vertical scale)
DERIVED = []

# Group in the .blend -> the name this project knows that expression by.
GROUPS = {
    'Eyes | Idle': 'open',
    'Eyes | Surprised': 'wide',
    'Eyes | Focused': 'focused',
    'Eyes | Excited': 'squeezed',
    'Eyes | Blink half': 'half',
    'Eyes | Blink closed': 'closed',
    'Eyes | Thinking': 'glance',
    'Eyes | Happy': 'smile',
    # Two closed-lid crescents that bow upward, for the pleased states. The reference
    # art wants a deep one, so both are rendered and the deeper wins.
    'Eyes | Celebrate': 'arc',
    # Bows downward, ends turning up: a lowered, relaxed lid. This is what the
    # reference sleepy actually is. An earlier pass read it as curving the wrong way
    # and derived sleepy from the pleased crescent instead, which inverted it.
    'Eyes | Sleepy': 'sleepy',
}
# The confused group is not a symmetric pair - it is one open eye beside one winking
# one - so it is handled on its own below rather than split like the others.


def render_to(path, objects, adjust=None):
    for o in every:
        o.hide_render = o not in objects
    pivot, bevels, basis = None, [], []
    if adjust:
        scale, stroke, vscale = adjust
        # One empty at the group's own centre, everything parented to it, scaled once.
        pivot = bpy.data.objects.new("__eye_pivot", None)
        bpy.context.scene.collection.objects.link(pivot)
        pivot.location = (mean_x(objects), 0.0, mean_z(objects))
        bpy.context.view_layer.update()
        for o in objects:
            basis.append((o, o.matrix_basis.copy(), o.parent,
                          o.matrix_parent_inverse.copy()))
            o.parent = pivot
            o.matrix_parent_inverse = pivot.matrix_world.inverted()
            if o.type == 'CURVE':
                bevels.append((o, o.data.bevel_depth))
                o.data.bevel_depth *= stroke
        pivot.scale = (scale, scale, scale * vscale)
        bpy.context.view_layer.update()
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    if pivot is not None:
        # Put every transform back exactly as it was; clearing it instead leaves the
        # pieces at the origin and every later render comes back empty.
        for o, mb, parent, mpi in basis:
            o.parent = parent
            o.matrix_parent_inverse = mpi
            o.matrix_basis = mb
        for o, bevel in bevels:
            o.data.bevel_depth = bevel
        bpy.data.objects.remove(pivot)
        bpy.context.view_layer.update()


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


def mean_z(objects):
    """Mean world z of the geometry, for the same reason mean_x exists."""
    zs = []
    for o in objects:
        if o.type != 'MESH':
            continue
        m = o.matrix_world
        zs.extend((m @ v.co).z for v in o.data.vertices)
    return sum(zs) / len(zs) if zs else 0.0


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
        render_to(tmp, objs, ADJUST.get(label))
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
# Variants derived from another group's geometry, rendered under their own name.
for group, label, adjust in DERIVED:
    if group not in bpy.data.objects:
        continue
    bundles = pieces(group)
    left = [o for x, objs in bundles if x < 0 for o in objs]
    right = [o for x, objs in bundles if x >= 0 for o in objs]
    for objs in (left, right):
        objs = [o for o in objs if not o.name.startswith('Pupil')]
        if not objs:
            continue
        tmp = os.path.join(OUT, f"_tmp_{label}.png")
        render_to(tmp, objs, adjust)
        side, centre = ink_side(tmp)
        if side in ('L', 'R'):
            os.replace(tmp, os.path.join(OUT, f"eye_{label}_{side}.png"))
            made.append(f"eye_{label}_{side}.png")
            print(f"[R] eye_{label}_{side}.png  <- derived from {group}  ink centre x={centre:.0f}")
        else:
            os.remove(tmp)
            print(f"[R] derived {label} landed on {side}: not written")

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
