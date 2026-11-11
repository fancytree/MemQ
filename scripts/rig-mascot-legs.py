# Rig the joined torso's legs and render them posed.
#
# THIS DOES NOT WORK, and is kept only so the next person does not try it again.
#
# The intent was: rotating a leg rigidly pivots the whole stump out of the body's
# outline, so past a few degrees it reads as a lozenge parked beside the body, whereas
# a bone weighted across the hip would keep the top with the body and swing only the
# lower part.
#
# The flaw is that joining objects is not welding them. The torso and the two feet are
# three separate meshes; after bpy.ops.object.join() the single object still contains
# three unconnected surfaces of 6050, 3010 and 3010 verts, with no shared topology at
# the hip. Automatic weights therefore give each leg bone only its own island, and the
# result is identical to rotating the leg rigidly.
#
# It passes its own rest-pose check at IoU 1.0, which proves nothing: at rest a rigid
# rotation and a bone agree by construction. Making this work needs the legs welded
# into the body in the model, which is modelling work, not a script.
#
# All of this happens in memory - the .blend is opened, never written.
#
#   blender --background "<parts.blend>" --python scripts/rig-mascot-legs.py -- <out-dir>
#
# Writes body_feet_s0..sN, s0 being the rest pose. The rest pose is compared against
# the unrigged render so a bad weighting shows up as a number rather than a surprise.
import math
import os
import sys

import bpy
from mathutils import Quaternion, Vector

OUT = sys.argv[sys.argv.index("--") + 1]
os.makedirs(OUT, exist_ok=True)

# Degrees each leg swings out at the apex of a hop. A bone can carry more than a rigid
# rotation could, because the hip stays put.
STEPS = [0.0, 6.0, 12.0, 18.0]

scene = bpy.context.scene
scene.camera = bpy.data.objects["Camera | Front"]
scene.render.engine = 'CYCLES'
scene.cycles.samples = 128
scene.render.film_transparent = True
scene.render.resolution_x = scene.render.resolution_y = 1024
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'

DRAWN = ('MESH', 'CURVE', 'FONT')
body = bpy.data.objects['Body | rounded clay shell']
feet = [bpy.data.objects['Foot.L'], bpy.data.objects['Foot.R']]


def extent(obj):
    pts = [obj.matrix_world @ v.co for v in obj.data.vertices]
    return pts


def leg_bone(obj):
    """Head at the top of the stump where it meets the body, tail at its lowest point."""
    pts = extent(obj)
    top = max(p.z for p in pts)
    bot = min(p.z for p in pts)
    band = [p for p in pts if p.z > top - 0.05]
    head = Vector((sum(p.x for p in band) / len(band),
                   sum(p.y for p in band) / len(band), top))
    low = [p for p in pts if p.z < bot + 0.05]
    tail = Vector((sum(p.x for p in low) / len(low),
                   sum(p.y for p in low) / len(low), bot))
    return head, tail


BONES = [leg_bone(f) for f in feet]
for (h, t), f in zip(BONES, feet):
    print(f"[G] {f.name}: head ({h.x:+.3f}, {h.z:+.3f})  tail ({t.x:+.3f}, {t.z:+.3f})")

# --- render the unrigged rest pose first, as the thing to compare against ----------
for o in bpy.data.objects:
    if o.type in DRAWN:
        o.hide_render = o not in ([body] + feet)
scene.render.filepath = os.path.join(OUT, "_unrigged.png")
bpy.ops.render.render(write_still=True)
print("[G] rendered the unrigged rest pose")

# --- join the three meshes --------------------------------------------------------
view = bpy.context.view_layer
for o in bpy.data.objects:
    o.select_set(False)
for o in [body] + feet:
    o.hide_viewport = False
    o.select_set(True)
view.objects.active = body
bpy.ops.object.join()
joined = view.objects.active
joined.name = 'Joined torso'
print(f"[G] joined into one mesh: {len(joined.data.vertices)} verts")

# --- build the armature -----------------------------------------------------------
arm_data = bpy.data.armatures.new('LegRig')
rig = bpy.data.objects.new('LegRig', arm_data)
scene.collection.objects.link(rig)
view.objects.active = rig
rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
pts = [joined.matrix_world @ v.co for v in joined.data.vertices]
# A root bone holds everything that is not a leg, so automatic weights have somewhere
# to put the body instead of smearing it onto the legs.
root = arm_data.edit_bones.new('root')
root.head = Vector((0.0, 0.0, max(p.z for p in pts)))
root.tail = Vector((0.0, 0.0, min(p.z for p in pts)))
for i, (head, tail) in enumerate(BONES):
    b = arm_data.edit_bones.new(f'leg{i}')
    b.head = head
    b.tail = tail
    b.parent = root
    b.use_connect = False
bpy.ops.object.mode_set(mode='OBJECT')

for o in bpy.data.objects:
    o.select_set(False)
joined.select_set(True)
rig.select_set(True)
view.objects.active = rig
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
print("[G] bound with automatic weights")

for o in bpy.data.objects:
    if o.type in DRAWN:
        o.hide_render = o is not joined

for i, deg in enumerate(STEPS):
    bpy.ops.object.mode_set(mode='OBJECT')
    for k, sign in ((0, 1.0), (1, -1.0)):
        pb = rig.pose.bones[f'leg{k}']
        pb.rotation_mode = 'QUATERNION'
        # The front camera looks along Y, so a swing in the image plane turns about
        # world Y. A pose bone's rotation is in BONE space, and these bones point
        # straight down, so their local Y runs along the leg: rotating about it spins
        # the stump on its own axis and changes nothing visible. The world axis has to
        # be expressed in bone space first.
        axis = pb.bone.matrix_local.to_3x3().inverted() @ Vector((0.0, 1.0, 0.0))
        pb.rotation_quaternion = Quaternion(axis, math.radians(deg * sign))
    view.update()
    scene.render.filepath = os.path.join(OUT, f"body_feet_s{i}.png")
    bpy.ops.render.render(write_still=True)
    print(f"[G] body_feet_s{i}.png  legs at {deg:+.0f} degrees")

print("[G] done")
