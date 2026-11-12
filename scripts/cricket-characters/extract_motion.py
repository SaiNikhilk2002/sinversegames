"""
Extracts the motion clips Sinverse Cricket uses from Quaternius's Universal
Animation Library (CC0 1.0), keeping only the skeleton and the chosen actions.

  blender -b --python-exit-code 1 -P extract_motion.py -- <library.glb> <out.glb> <Clip,Clip,...>

The mannequin meshes are dropped: the game plays these clips on its own
athletes (see apps/web/src/games/sinverse-cricket/motion.ts).
"""
import sys

import bpy

src, out, wanted = sys.argv[sys.argv.index("--") + 1 :][:3]
wanted = [w for w in wanted.split(",") if w]

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)

for o in list(bpy.data.objects):
    if o.type != "ARMATURE":
        bpy.data.objects.remove(o, do_unlink=True)
missing = [w for w in wanted if w not in bpy.data.actions]
if missing:
    raise SystemExit("missing clips: " + ", ".join(missing))
for a in list(bpy.data.actions):
    if a.name not in wanted:
        bpy.data.actions.remove(a)
    else:
        a.use_fake_user = True

armature = next(o for o in bpy.data.objects if o.type == "ARMATURE")
# Export every remaining action as its own glTF animation. The importer made an
# NLA track for each clip in the library; start from none.
armature.animation_data_create()
armature.animation_data.action = None
for track in list(armature.animation_data.nla_tracks):
    armature.animation_data.nla_tracks.remove(track)
for name in wanted:
    track = armature.animation_data.nla_tracks.new()
    track.name = name
    action = bpy.data.actions[name]
    track.strips.new(name, int(action.frame_range[0]), action)
    track.mute = True

bpy.ops.export_scene.gltf(
    filepath=out,
    export_format="GLB",
    export_animations=True,
    export_animation_mode="NLA_TRACKS",
    export_skins=False,
    export_morph=False,
    export_yup=True,
)
print("MOTION_DONE", len(wanted))
