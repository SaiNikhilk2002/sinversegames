"""
Renders front, three-quarter and side previews of an exported athlete GLB, so a
reviewer can check it without opening Blender.

  blender -b -P preview_athlete.py -- <athlete.glb> <out-prefix>
"""
import math
import sys

import bpy

glb, prefix = sys.argv[sys.argv.index("--") + 1 :][:2]
# Athletes face -Y in Blender, whether built there or imported from glTF.
FACING = -1
if glb.endswith(".blend"):
    bpy.ops.wm.open_mainfile(filepath=glb)
else:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=glb)

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE_NEXT"
scene.render.resolution_x, scene.render.resolution_y = 720, 960
scene.view_settings.view_transform = "AgX"
world = bpy.data.worlds.new("sky")
scene.world = world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.55, 0.62, 0.7, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = 0.8

sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
sun.data.energy = 3.2
sun.rotation_euler = (math.radians(50), 0, math.radians(35))
scene.collection.objects.link(sun)
ground = bpy.data.meshes.new("ground")
ground.from_pydata([(-6, -6, 0), (6, -6, 0), (6, 6, 0), (-6, 6, 0)], [], [(0, 1, 2, 3)])
g = bpy.data.objects.new("ground", ground)
mat = bpy.data.materials.new("grass")
mat.use_nodes = True
mat.node_tree.nodes["Principled BSDF"].inputs[0].default_value = (0.16, 0.3, 0.12, 1)
g.data.materials.append(mat)
scene.collection.objects.link(g)

cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
cam.data.lens = 70
scene.collection.objects.link(cam)
scene.camera = cam
target = bpy.data.objects.new("target", None)
target.location = (0, 0, 0.95)
scene.collection.objects.link(target)
track = cam.constraints.new("TRACK_TO")
track.target = target

for name, angle, dist, z, look in [("front", 0, 4.6, 1.0, 0.95), ("three-quarter", 40, 4.6, 1.05, 0.95), ("side", 90, 4.6, 1.0, 0.95), ("face", 15, 1.25, 1.66, 1.62)]:
    a = math.radians(angle)
    cam.location = (math.sin(a) * dist * FACING, math.cos(a) * dist * FACING, z)
    target.location = (0, 0, look)
    scene.render.filepath = f"{prefix}-{name}.png"
    bpy.ops.render.render(write_still=True)
print("PREVIEW_DONE")
