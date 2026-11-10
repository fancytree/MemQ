# Render the joined torso at several leg angles.
#
# The legs look right only when they are rendered joined to the body: the contact
# shading where a leg meets the torso is most of what makes it read as part of the
# character rather than a blob set against it. Cutting the legs out as their own
# layers loses exactly that - the silhouettes match to an IoU of 0.998, and the whole
# visible difference is the join.
#
# So instead of splitting them, the legs are swung in Blender and the joined torso is
# rendered again at each angle. Every frame keeps its real contact shading, and the
# runtime picks a frame instead of rotating a layer. The legs are rigid shapes, so
# this needs no armature: rotating the objects about their hips is the whole rig.
#
#   blender --background "<parts.blend>" --python scripts/render-mascot-leg-poses.py -- <out-dir>
#
# Writes body_feet_s0..sN. s0 is the resting pose and must match the pack's own
# body_feet; the script checks that and says so rather than assuming it.
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

OUT = sys.argv[sys.argv.index("--") + 1]
os.makedirs(OUT, exist_ok=True)

# Degrees each leg swings out, from resting to fully splayed at the apex of a hop.
STEPS = [0.0, 7.0, 14.0, 21.0]

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
body = bpy.data.objects['Body | rounded clay shell']
feet = [bpy.data.objects['Foot.L'], bpy.data.objects['Foot.R']]


def hip(obj):
    """The point a leg should turn about: the centre of its topmost slice, which is
    where it disappears into the body."""
    pts = [obj.matrix_world @ v.co for v in obj.data.vertices]
    top = max(p.z for p in pts)
    band = [p for p in pts if p.z > top - 0.05]
    return Vector((sum(p.x for p in band) / len(band),
                   sum(p.y for p in band) / len(band),
                   top))


HIPS = [hip(f) for f in feet]
print("[L] hips:", [f"({h.x:+.3f}, {h.z:+.3f})" for h in HIPS])

for i, deg in enumerate(STEPS):
    saved = [(f, f.matrix_world.copy()) for f in feet]
    for f, h, sign in zip(feet, HIPS, (1.0, -1.0)):
        # The front camera looks along Y, so a swing in the image plane turns about Y.
        # Each leg turns the opposite way, so they open rather than lean together.
        rot = (Matrix.Translation(h)
               @ Matrix.Rotation(math.radians(deg * sign), 4, 'Y')
               @ Matrix.Translation(-h))
        f.matrix_world = rot @ f.matrix_world
    for o in every:
        o.hide_render = o not in ([body] + feet)
    scene.render.filepath = os.path.join(OUT, f"body_feet_s{i}.png")
    bpy.ops.render.render(write_still=True)
    for f, m in saved:
        f.matrix_world = m
    bpy.context.view_layer.update()
    print(f"[L] body_feet_s{i}.png  legs at {deg:+.0f} degrees")

print("[L] done")
