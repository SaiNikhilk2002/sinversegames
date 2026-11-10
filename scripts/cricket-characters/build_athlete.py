"""
Builds one fictional Sinverse cricketer from CC0 MakeHuman assets and exports it
as a GLB for the browser renderer.

Run with a Blender that has MPFB 2 and the CC0 MakeHuman system asset packs:

  blender -b --python-exit-code 1 -P build_athlete.py -- <athlete.json> <out.glb> [hi|lo]

"hi" (the default) is the close-up athlete. "lo" is the same person for distant
players and lighter presets: a 1,591-vertex body, decimated cloth and hair, no
brows or lashes, smaller textures and no normal maps.

The athlete file picks a body shape, skin, hair and kit from the asset library
(see athletes/). Everything it can reference is CC0; see LICENSES.md.
"""
import json
import sys
import importlib

import bpy

MPFB = "bl_ext.user_default.mpfb"
HumanService = importlib.import_module(MPFB + ".services.humanservice").HumanService

args = sys.argv[sys.argv.index("--") + 1 :]
spec_path, out_path = args[0], args[1]
LOD = args[2] if len(args) > 2 else "hi"
if LOD not in ("hi", "lo"):
    raise SystemExit("level of detail must be hi or lo")
LO = LOD == "lo"
with open(spec_path, encoding="utf-8") as f:
    spec = json.load(f)

# Start from an empty scene.
bpy.ops.wm.read_factory_settings(use_empty=True)

human_info = {
    "name": spec["id"],
    "phenotype": {
        "gender": 1.0,
        "age": spec.get("age", 0.5),
        "muscle": spec.get("muscle", 0.65),
        "weight": spec.get("weight", 0.5),
        "proportions": spec.get("proportions", 0.65),
        "height": spec.get("height", 0.55),
        "cupsize": 0.5,
        "firmness": 0.5,
        "race": spec["race"],
    },
    "proxy": "male1591/male1591.proxy" if LO else spec.get("proxy", "male_muscle_13290/male_muscle_13290.proxy"),
    "rig": "mixamo",
    "eyes": "low-poly/low-poly.mhclo",
    "eyebrows": "" if LO else spec["eyebrows"],
    "eyelashes": "" if LO else "eyelashes02/eyelashes02.mhclo",
    "hair": spec.get("hair", ""),
    "teeth": "",
    "tongue": "",
    "clothes": spec["clothes"],
    "skin_mhmat": spec["skin"],
    "skin_material_type": "GAMEENGINE",
    "eyes_material_type": "GAMEENGINE",
    "clothes_material_type": "GAMEENGINE",
    "override_clothes_model": "GAMEENGINE",
    "override_eyes_model": "GAMEENGINE",
    "material_instances": "NEVER",
    "targets": [],
    "expressions": [],
    "makeup": [],
}
settings = HumanService.get_default_deserialization_settings()
settings.update({"subdiv_levels": 0, "override_skin_model": "GAMEENGINE", "override_rig": "mixamo"})
basemesh = HumanService.deserialize_from_dict(human_info, settings)
# The rig and the fitted meshes are first placed for the default body. Refit
# them to this athlete's shape, or the skeleton won't match the skin.
bpy.context.view_layer.update()
HumanService.refit(basemesh)
bpy.context.view_layer.update()

# The proxy replaces the full-resolution basemesh in game, so drop the basemesh
# and any helper geometry before export.
bpy.data.objects.remove(basemesh, do_unlink=True)
for o in list(bpy.data.objects):
    if o.type == "MESH" and (o.name.endswith(".body") or "helper" in o.name.lower()):
        bpy.data.objects.remove(o, do_unlink=True)

if LO:
    # Distant players: thin out cloth, shoes and hair. The decimation goes first
    # in the stack so it runs on the rest shape and keeps the skin weights.
    RATIOS = {"suit": 0.38, "shoes": 0.3}
    for o in bpy.data.objects:
        if o.type != "MESH":
            continue
        name = o.name.lower()
        ratio = next((r for k, r in RATIOS.items() if k in name), None)
        if ratio is None and any(h in name for h in ("short0", "afro", "bob0", "braid", "long0", "ponytail")):
            ratio = 0.45
        if ratio is None:
            continue
        mod = o.modifiers.new("lod", "DECIMATE")
        mod.ratio = ratio
        with bpy.context.temp_override(object=o):
            bpy.ops.object.modifier_move_to_index(modifier="lod", index=0)
    # No normal maps at this distance.
    for m in bpy.data.materials:
        if not m.node_tree:
            continue
        for n in list(m.node_tree.nodes):
            if n.type == "NORMAL_MAP" or (n.type == "TEX_IMAGE" and n.image and "normal" in n.image.name.lower()):
                m.node_tree.nodes.remove(n)

# Only hair, brows and lashes are cut-out cards. Everything else must be opaque:
# MakeHuman routes every texture's alpha into the shader, and the glTF exporter
# would otherwise mark skin and clothes as blended, so far surfaces show through.
CARDS = ("hair", "eyebrow", "eyelash")
for o in bpy.data.objects:
    if o.type != "MESH":
        continue
    card = any(c in o.name.lower() for c in CARDS) or o.name.lower().endswith(tuple(h for h in ("short01", "short02", "short03", "short04", "afro01", "bob01", "bob02", "braid01", "long01", "ponytail01")))
    for m in o.data.materials:
        if not m or not m.node_tree:
            continue
        bsdf = next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if bsdf is None:
            continue
        for link in list(m.node_tree.links):
            if link.to_node == bsdf and link.to_socket.name == "Alpha" and not card:
                m.node_tree.links.remove(link)
        if not card:
            bsdf.inputs["Alpha"].default_value = 1.0
            m.surface_render_method = "DITHERED"
        else:
            # Hashed/dithered cards export as alpha MASK, which needs no sorting.
            m.surface_render_method = "DITHERED"

report = {"objects": [], "bones": 0}
for o in bpy.data.objects:
    entry = {"name": o.name, "type": o.type}
    if o.type == "MESH":
        entry["vertices"] = len(o.data.vertices)
        entry["materials"] = [m.name for m in o.data.materials if m]
        entry["shape_keys"] = len(o.data.shape_keys.key_blocks) if o.data.shape_keys else 0
    if o.type == "ARMATURE":
        report["bones"] = len(o.data.bones)
        heads = {b.name.replace("mixamorig:", ""): round((o.matrix_world @ b.head_local).z, 3) for b in o.data.bones}
        report["joint_heights"] = {k: heads[k] for k in ("LeftFoot", "LeftLeg", "LeftUpLeg", "Hips", "Spine2", "Neck", "Head", "LeftShoulder", "LeftArm") if k in heads}
    if o.type == "MESH" and "male_" in o.name and "suit" not in o.name:
        zs = [(o.matrix_world @ v.co).z for v in o.data.vertices]
        report["body_z"] = [round(min(zs), 3), round(max(zs), 3)]
    report["objects"].append(entry)

# Kit base: the suit's ambient-occlusion map keeps the fabric folds but not the
# printed logo on the source shirt, so it becomes the base colour, and the game
# tints it per team.
LocationService = importlib.import_module(MPFB + ".services.locationservice").LocationService
import os as _os
for m in bpy.data.materials:
    if not m.node_tree or "casualsuit" not in m.name:
        continue
    suit = m.name.split(".")[-1]
    ao = _os.path.join(LocationService.get_user_data(), "clothes", suit, suit + "_ao.png")
    if not _os.path.exists(ao):
        raise SystemExit("missing kit occlusion map: " + ao)
    for n in m.node_tree.nodes:
        if n.type == "TEX_IMAGE" and n.image and "diffuse" in n.image.name.lower():
            n.image = bpy.data.images.load(ao)
    m.name = "kit"

# Web-sized textures: skin keeps 1024 for the face, everything else 512.
for img in bpy.data.images:
    if img.size[0] == 0:
        continue
    limit = 1024 if "skin" in img.name.lower() or "diffuse" in img.name.lower() and "male" in img.name.lower() else 512
    if LO:
        limit = 512 if limit == 1024 else 256
    if max(img.size) > limit:
        k = limit / max(img.size)
        img.scale(max(1, int(img.size[0] * k)), max(1, int(img.size[1] * k)))

import os
if os.environ.get("ATHLETE_BLEND"):
    bpy.ops.wm.save_as_mainfile(filepath=os.environ["ATHLETE_BLEND"])

bpy.ops.export_scene.gltf(
    filepath=out_path,
    export_format="GLB",
    export_apply=True,
    export_skins=True,
    export_animations=False,
    export_morph=False,
    export_yup=True,
    export_image_format="JPEG",
    export_jpeg_quality=88,
)
print("ATHLETE_REPORT " + json.dumps(report))
