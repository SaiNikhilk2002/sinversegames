"""
Builds one fictional Sinverse cricketer from CC0 MakeHuman assets and exports it
as a GLB for the browser renderer.

Run with a Blender that has MPFB 2 and the CC0 MakeHuman system asset packs:

  blender -b --python-exit-code 1 -P build_athlete.py -- <athlete.json> <out.glb> [hi|lo]

"hi" (the default) is the close-up athlete. "lo" is the same person for distant
players and lighter presets: a 1,591-vertex body, a thinner kit and hair, no
brows or lashes, smaller textures and no normal maps.

The athlete file (see athletes/) picks the body shape, the face (MakeHuman
targets, including small left/right asymmetries), skin, eye colour, hair and
brows. Everything it can reference is CC0; see LICENSES.md.

The cricket kit is made here rather than taken from the clothing library:
MakeHuman's fitted "tights" helper, which every body carries and which follows
its shape, is cut into a shirt and trousers, loosened, given a fold-over
collar, turned hems and compression folds at the joints, and skinned with the
body's own weights. The skin under the kit is removed so it can't show through
when a limb bends. Each kit vertex carries COLOR_0 = (trim, occlusion, part, 1):
trim marks the collar, cuffs and waistband, occlusion is baked from the body,
and part is 0 for trousers and 0.5 for the shirt.
"""
import json
import math
import os
import sys
import importlib

import bpy
import bmesh
from mathutils import Vector

MPFB = "bl_ext.user_default.mpfb"
HumanService = importlib.import_module(MPFB + ".services.humanservice").HumanService
LocationService = importlib.import_module(MPFB + ".services.locationservice").LocationService

args = sys.argv[sys.argv.index("--") + 1 :]
spec_path, out_path = args[0], args[1]
LOD = args[2] if len(args) > 2 else "hi"
if LOD not in ("hi", "lo"):
    raise SystemExit("level of detail must be hi or lo")
LO = LOD == "lo"
with open(spec_path, encoding="utf-8") as f:
    spec = json.load(f)

bpy.ops.wm.read_factory_settings(use_empty=True)

# ---- the human -------------------------------------------------------------
targets = [{"target": k, "value": float(v)} for k, v in spec.get("face", {}).items()]
targets += [{"target": k, "value": float(v)} for k, v in spec.get("body", {}).items()]
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
    "eyes": "low-poly/low-poly.mhclo" if LO else "high-poly/high-poly.mhclo",
    "eyebrows": "" if LO else spec["eyebrows"],
    "eyelashes": "" if LO else spec.get("eyelashes", "eyelashes03/eyelashes03.mhclo"),
    "hair": spec.get("hair", ""),
    "teeth": "",
    "tongue": "",
    "clothes": [spec.get("shoes", "shoes05/shoes05.mhclo")],
    "skin_mhmat": spec["skin"],
    "skin_material_type": "GAMEENGINE",
    "eyes_material_type": "GAMEENGINE",
    "clothes_material_type": "GAMEENGINE",
    "override_clothes_model": "GAMEENGINE",
    "override_eyes_model": "GAMEENGINE",
    "material_instances": "NEVER",
    "targets": targets,
    "expressions": [],
    "makeup": [],
}
settings = HumanService.get_default_deserialization_settings()
settings.update({"subdiv_levels": 0, "override_skin_model": "GAMEENGINE", "override_rig": "mixamo"})
basemesh = HumanService.deserialize_from_dict(human_info, settings)
bpy.context.view_layer.update()
HumanService.refit(basemesh)
bpy.context.view_layer.update()
armature = next(o for o in bpy.data.objects if o.type == "ARMATURE")


def joint(name, tail=False):
    b = armature.data.bones["mixamorig:" + name]
    return armature.matrix_world @ (b.tail_local if tail else b.head_local)


J = {n: joint(n) for n in ("Hips", "Spine", "Spine1", "Spine2", "Neck", "Head", "LeftArm", "LeftForeArm", "LeftHand", "RightArm", "RightForeArm", "RightHand", "LeftUpLeg", "LeftLeg", "LeftFoot", "RightUpLeg", "RightLeg", "RightFoot", "LeftShoulder", "RightShoulder")}

# ---- the kit, cut from the fitted tights helper ------------------------------
# The helper is part of the basemesh, so take the evaluated (shaped) mesh with
# every modifier off except the shape keys.
for m in basemesh.modifiers:
    m.show_viewport = False
deps = bpy.context.evaluated_depsgraph_get()
tights_mesh = bpy.data.meshes.new_from_object(basemesh.evaluated_get(deps), preserve_all_data_layers=True, depsgraph=deps)
for m in basemesh.modifiers:
    m.show_viewport = True
tights = bpy.data.objects.new("tights", tights_mesh)
bpy.context.scene.collection.objects.link(tights)
tights.matrix_world = basemesh.matrix_world.copy()
# The basemesh's own vertex groups (bone weights and helper masks) come along by index.
for g in basemesh.vertex_groups:
    tights.vertex_groups.new(name=g.name)
src_groups = {g.index: g.name for g in basemesh.vertex_groups}

bm = bmesh.new()
bm.from_mesh(tights_mesh)
deform = bm.verts.layers.deform.verify()
tg = basemesh.vertex_groups["helper-tights"].index
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v[deform].get(tg, 0) < 0.5], context="VERTS")
bm.to_mesh(tights_mesh)
bm.free()
tights.data.transform(tights.matrix_world)
tights.matrix_world.identity()

# Arms hang in an A pose: unit axes for the sleeves.
def axis(a, b):
    return (J[b] - J[a]).normalized()


def cut(obj, planes, keep_largest=False, keep_main=False):
    """Bisects `obj` with each (point, normal) plane, removing the normal side."""
    b = bmesh.new()
    b.from_mesh(obj.data)
    for plane in planes:
        co, no = plane[0], plane[1]
        near = plane[2] if len(plane) > 2 else None
        geom = b.verts[:] + b.edges[:] + b.faces[:]
        if near is None:
            bmesh.ops.bisect_plane(b, geom=geom, plane_co=co, plane_no=no, clear_outer=True)
        else:
            # A limited cut (a sleeve): split along the plane, then remove only the
            # far side that is near this arm, not the torso the plane also crosses.
            bmesh.ops.bisect_plane(b, geom=geom, plane_co=co, plane_no=no)
            gone = [v for v in b.verts if (v.co - co).dot(no) > 1e-5 and near(v.co)]
            bmesh.ops.delete(b, geom=gone, context="VERTS")
    if keep_main:
        # Only the main piece of cloth: drop any scraps a limited cut left behind.
        b.verts.ensure_lookup_table()
        seen, parts = set(), []
        for v in b.verts:
            if v in seen:
                continue
            stack, part = [v], []
            seen.add(v)
            while stack:
                x = stack.pop()
                part.append(x)
                for e in x.link_edges:
                    o = e.other_vert(x)
                    if o not in seen:
                        seen.add(o)
                        stack.append(o)
            parts.append(part)
        parts.sort(key=len, reverse=True)
        bmesh.ops.delete(b, geom=[v for p in parts[1:] for v in p], context="VERTS")
    if keep_largest:
        # Keep only the pieces connected to the pelvis (drops the arms the waist cut leaves).
        b.verts.ensure_lookup_table()
        seen, parts = set(), []
        for v in b.verts:
            if v in seen:
                continue
            stack, part = [v], []
            seen.add(v)
            while stack:
                x = stack.pop()
                part.append(x)
                for e in x.link_edges:
                    o = e.other_vert(x)
                    if o not in seen:
                        seen.add(o)
                        stack.append(o)
            parts.append(part)
        # Legs are the pieces whose centre is between the hips in x.
        hip_x = abs(J["LeftUpLeg"].x) + 0.08
        drop = [v for p in parts if abs(sum(x.co.x for x in p) / len(p)) > hip_x for v in p]
        bmesh.ops.delete(b, geom=drop, context="VERTS")
    b.to_mesh(obj.data)
    b.free()


def dup(obj, name):
    o = obj.copy()
    o.data = obj.data.copy()
    o.name = name
    bpy.context.scene.collection.objects.link(o)
    return o


up = Vector((0, 0, 1))
neck_base = J["Neck"] + Vector((0, 0, 0.012))
waist_z = J["Hips"].z + 0.075
long_sleeves = bool(spec.get("long_sleeves", False))
sleeve = 0.92 if long_sleeves else 0.5  # fraction from shoulder to elbow (short) or elbow to wrist (long)
shirt = dup(tights, "kit-shirt")
planes = [
    # Neckline: lower at the front (MakeHuman bodies face -Y), level at the back.
    (neck_base, Vector((0, -0.55, 1)).normalized()),
    (Vector((0, 0, waist_z - 0.055)), -up),  # hem, tucked in under the waistband
]
def near_arm(side):
    """Within the arm's tube: close to the line from the shoulder through the hand."""
    s0, s1 = J[side + "Arm"], J[side + "Hand"]
    ax = (s1 - s0).normalized()

    def test(co):
        t = (co - s0).dot(ax)
        return t > -0.02 and ((co - s0) - ax * t).length < 0.14

    return test


for side in ("Left", "Right"):
    if long_sleeves:
        p = J[side + "ForeArm"].lerp(J[side + "Hand"], sleeve)
        planes.append((p, axis(side + "ForeArm", side + "Hand"), near_arm(side)))
    else:
        p = J[side + "Arm"].lerp(J[side + "ForeArm"], sleeve)
        planes.append((p, axis(side + "Arm", side + "ForeArm"), near_arm(side)))
cut(shirt, planes, keep_main=True)
trousers = dup(tights, "kit-trousers")
cut(trousers, [(Vector((0, 0, waist_z)), up), (Vector((0, 0, J["LeftFoot"].z - 0.005)), -up)], keep_largest=True)
bpy.data.objects.remove(tights, do_unlink=True)


def loops(b):
    """Boundary edge loops of a bmesh, as lists of verts."""
    edges = [e for e in b.edges if e.is_boundary]
    left, out = set(edges), []
    while left:
        e = left.pop()
        loop = [e.verts[0], e.verts[1]]
        grow = True
        while grow:
            grow = False
            for f in [x for x in loop[-1].link_edges if x in left]:
                left.discard(f)
                loop.append(f.other_vert(loop[-1]))
                grow = True
                break
        out.append(loop)
    return out


def loosen(obj, amount):
    """Pushes every vertex out along its normal by amount(position)."""
    obj.data.update()
    for v in obj.data.vertices:
        v.co += v.normal * amount(v.co)


def shirt_ease(co):
    # Close over the shoulders and chest, barely looser over the belly: an
    # athlete's shirt falls straight from the chest to the waist. A loose belly
    # pinched in by the tuck balloons into a rounded, barrel-like front.
    belly = max(0.0, min(1.0, (J["Spine1"].z - co.z) / 0.25))
    # Eased in over the lower belly to where it tucks into the trousers, snug
    # enough there never to show through them.
    tuck = max(0.0, min(1.0, (waist_z + 0.09 - co.z) / 0.1)) ** 1.5
    return (0.007 + 0.004 * belly) * (1 - tuck) + 0.003 * tuck


knee_z = J["LeftLeg"].z
foot_z = J["LeftFoot"].z


def trouser_ease(co):
    # Straight-cut legs: close at the seat, then hanging free below the knee.
    below = max(0.0, min(1.0, (knee_z + 0.12 - co.z) / (knee_z + 0.12 - foot_z)))
    return 0.011 + 0.026 * below ** 1.2 + (0.008 if co.z > J["LeftUpLeg"].z - 0.05 else 0)


loosen(shirt, shirt_ease)
loosen(trousers, trouser_ease)


def drape(obj, iterations):
    """Cloth bridges the hollows of the body (under the chest, down the spine,
    between the shoulder blades) instead of clinging to them: smooth the
    surface, then push anything that sank inside back out to where it was."""
    target = dup(obj, obj.name + "-fit")
    # The openings (hems, cuffs, neck) stay where they are: the smoothing eases in
    # over a few edge rings from every open edge, or it would pull the hems up.
    b = bmesh.new()
    b.from_mesh(obj.data)
    b.verts.ensure_lookup_table()
    ring = {v.index: 0 for v in b.verts if v.is_boundary}
    frontier = [b.verts[i] for i in ring]
    while frontier:
        nxt = []
        for v in frontier:
            for e in v.link_edges:
                o = e.other_vert(v)
                if o.index not in ring:
                    ring[o.index] = ring[v.index] + 1
                    nxt.append(o)
        frontier = nxt
    b.free()
    group = obj.vertex_groups.new(name="drape")
    for i in range(len(obj.data.vertices)):
        group.add([i], min(1.0, ring.get(i, 99) / 5.0), "REPLACE")
    sm = obj.modifiers.new("drape", "SMOOTH")
    sm.factor = 1.0
    sm.iterations = iterations
    sm.vertex_group = "drape"
    sw = obj.modifiers.new("fit", "SHRINKWRAP")
    sw.target = target
    sw.wrap_method = "NEAREST_SURFACEPOINT"
    sw.wrap_mode = "OUTSIDE_SURFACE"
    for name in ("drape", "fit"):
        with bpy.context.temp_override(object=obj, active_object=obj):
            bpy.ops.object.modifier_apply(modifier=name)
    bpy.data.objects.remove(target, do_unlink=True)
    obj.vertex_groups.remove(obj.vertex_groups["drape"])


drape(shirt, 14)
drape(trousers, 6)

# Collar, cuffs and waistband: new rows on the open edges, marked as trim.
TRIM = "trim"


def hem(obj, kind):
    b = bmesh.new()
    b.from_mesh(obj.data)
    trim = b.verts.layers.float.new(TRIM)
    for loop in loops(b):
        c = sum((v.co for v in loop), Vector()) / len(loop)
        # What the opening is: the collar (at the neck), a sleeve (near an arm
        # cut), or the waist/hem/ankles. Pieces of a loop are judged the same way.
        near_arm = min((c - J[s_ + "Arm"].lerp(J[s_ + "ForeArm"], 0.5)).length for s_ in ("Left", "Right")) < 0.16 or min((c - J[s_ + "ForeArm"].lerp(J[s_ + "Hand"], 0.8)).length for s_ in ("Left", "Right")) < 0.12
        collar = kind == "shirt" and c.z > J["Neck"].z - 0.06 and abs(c.x) < 0.1
        middle = not near_arm
        edges = [e for e in b.edges if e.is_boundary and e.verts[0] in loop and e.verts[1] in loop]
        if not collar and not (kind == "shirt" and middle):
            for v in loop:
                v[trim] = 1.0
        if collar:
            # Fold-over collar: up the neck (higher at the back), then out and down.
            ring = bmesh.ops.extrude_edge_only(b, edges=edges)
            v1 = [x for x in ring["geom"] if isinstance(x, bmesh.types.BMVert)]
            for v in v1:
                back = max(0.0, min(1.0, (v.co.y - c.y) / 0.06 + 0.5))
                out = v.co - c
                out.z = 0
                v.co += up * (0.009 + 0.012 * back) + out.normalized() * 0.002
                v[trim] = 0.0
            ring2 = bmesh.ops.extrude_edge_only(b, edges=[e for e in b.edges if e.is_boundary and all(x in v1 for x in e.verts)])
            for v in [x for x in ring2["geom"] if isinstance(x, bmesh.types.BMVert)]:
                back = max(0.0, min(1.0, (v.co.y - c.y) / 0.06 + 0.5))
                out = v.co - c
                out.z = 0
                v.co += out.normalized() * (0.007 + 0.004 * back) - up * (0.02 + 0.01 * back)
                v[trim] = 1.0
        elif kind == "shirt" and middle:
            continue  # the tucked hem is hidden under the waistband
        else:
            # Turned hem: a narrow band folded back inside the opening.
            ring = bmesh.ops.extrude_edge_only(b, edges=edges)
            for v in [x for x in ring["geom"] if isinstance(x, bmesh.types.BMVert)]:
                v.co -= (v.co - c).normalized() * 0.005
                v[trim] = 1.0
    b.to_mesh(obj.data)
    b.free()


hem(shirt, "shirt")
hem(trousers, "trousers")
# Waistband: a band of trim around the top of the trousers.
for v in trousers.data.vertices:
    if v.co.z > waist_z - 0.035:
        trousers.data.attributes[TRIM].data[v.index].value = 1.0

# Smooth the cloth (one subdivision for the close-up kit), then fold it.
# Only the shirt is subdivided: the collar and shoulders are seen up close in
# every batting and bowling shot; the trousers read fine at their own density.
for obj in (shirt,):
    if not LO:
        mod = obj.modifiers.new("smooth", "SUBSURF")
        mod.levels = 1
        mod.render_levels = 1
        with bpy.context.temp_override(object=obj, active_object=obj):
            bpy.ops.object.modifier_apply(modifier="smooth")


def folds(obj, limbs, amp):
    """Compression folds: rings across a limb near its bending joint, plus
    finer noise everywhere, pushed along the normal."""
    obj.data.update()
    for v in obj.data.vertices:
        d = 0.0
        for a, j, b, reach in limbs:
            ax = (J[b] - J[a]).normalized()
            t = (v.co - J[j]).dot(ax)
            radial = ((v.co - J[j]) - ax * t).length
            if radial > 0.14:
                continue
            w = math.exp(-((t / reach) ** 2))
            phase = t / 0.028 * 2 * math.pi + math.sin(v.co.x * 41 + v.co.y * 37) * 1.3
            d += w * math.sin(phase) * amp
        d += math.sin(v.co.z * 61 + v.co.x * 23) * math.sin(v.co.y * 47 - v.co.z * 19) * amp * 0.25
        v.co += v.normal * d


folds(shirt, [("LeftArm", "LeftArm", "LeftForeArm", 0.06), ("RightArm", "RightArm", "RightForeArm", 0.06), ("Spine", "Spine", "Spine2", 0.06)] + ([("LeftArm", "LeftForeArm", "LeftHand", 0.07), ("RightArm", "RightForeArm", "RightHand", 0.07)] if long_sleeves else []), 0.0028)
folds(trousers, [("LeftUpLeg", "LeftLeg", "LeftFoot", 0.08), ("RightUpLeg", "RightLeg", "RightFoot", 0.08), ("Hips", "LeftUpLeg", "LeftLeg", 0.07), ("Hips", "RightUpLeg", "RightLeg", 0.07), ("LeftLeg", "LeftFoot", "LeftFoot", 0.05), ("RightLeg", "RightFoot", "RightFoot", 0.05)], 0.0032)

# The subdivided shirt carries more triangles than its shape needs once the folds
# are in: collapse it back by about half (the decimator keeps the silhouette, the
# collar and the folds), so the detailed athlete stays within its budget.
if not LO:
    mod = shirt.modifiers.new("budget", "DECIMATE")
    mod.ratio = 0.5
    mod.use_collapse_triangulate = False
    with bpy.context.temp_override(object=shirt, active_object=shirt):
        bpy.ops.object.modifier_apply(modifier="budget")
# A sleeve cut can leave a scrap of cloth joined to the sleeve by a thin strip,
# which the smoothing and decimation then sever: keep only the shirt itself.
cut(shirt, [], keep_main=True)

# Skin weights: the cloth keeps the basemesh's bone groups (copied with the
# helper); subdivision and the new hem rows interpolate them. Normalise to four.
for obj in (shirt, trousers):
    for g in list(obj.vertex_groups):
        if not g.name.startswith("mixamorig:"):
            obj.vertex_groups.remove(g)
    with bpy.context.temp_override(object=obj, active_object=obj, selected_editable_objects=[obj]):
        bpy.ops.object.vertex_group_limit_total(group_select_mode="ALL", limit=4)
        bpy.ops.object.vertex_group_normalize_all(group_select_mode="ALL", lock_active=False)
    obj.parent = armature
    mod = obj.modifiers.new("rig", "ARMATURE")
    mod.object = armature
    obj.data.shade_smooth()

# ---- facial hair and scalp masks, from MakeHuman's own landmarks -------------------
# Per basemesh vertex: beard (jaw, cheeks, sideburns, under the chin), moustache,
# scalp (the artist-drawn hairline), chin. Copied to the body proxy by nearest
# vertex and exported as its COLOR_0, so the game can draw stubble, beards and
# buzz cuts in the skin shader for any player.
from mathutils import kdtree


def smooth(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


# Shape keys: use the evaluated shape for positions.
for m in basemesh.modifiers:
    m.show_viewport = False
_ev = basemesh.evaluated_get(bpy.context.evaluated_depsgraph_get())
_me = _ev.to_mesh()
base_co = [basemesh.matrix_world @ v.co for v in _me.vertices]
_ev.to_mesh_clear()
for m in basemesh.modifiers:
    m.show_viewport = True


def group_centre(name):
    gi = basemesh.vertex_groups[name].index
    pts = [base_co[v.index] for v in basemesh.data.vertices if any(g.group == gi and g.weight > 0.5 for g in v.groups)]
    return sum(pts, Vector()) / len(pts)


def weights(name):
    gi = basemesh.vertex_groups[name].index
    out = {}
    for v in basemesh.data.vertices:
        for g in v.groups:
            if g.group == gi:
                out[v.index] = g.weight
    return out


mouth, eye_l, eye_r, ear_l = group_centre("lips"), group_centre("helper-l-eye"), group_centre("helper-r-eye"), group_centre("ears")
eye_z = (eye_l.z + eye_r.z) / 2
lips, scalp, ears = weights("lips"), weights("scalp"), weights("ears")
body_gi = basemesh.vertex_groups["body"].index
in_body = [any(g.group == body_gi and g.weight > 0.5 for g in v.groups) for v in basemesh.data.vertices]
# The chin point: the most forward midline vertex below the lips.
chin_pt = min((base_co[i] for i, ok in enumerate(in_body) if ok and abs(base_co[i].x - mouth.x) < 0.006 and mouth.z - 0.09 < base_co[i].z < mouth.z - 0.02), key=lambda c: c.y)
jaw_z = chin_pt.z - 0.022  # underside of the chin
ear_y = sum((base_co[i] for i in ears), Vector()).y / max(1, len(ears))
mask = {}
for v in basemesh.data.vertices:
    if not in_body[v.index]:
        continue
    p = base_co[v.index]
    ax = abs(p.x - mouth.x)
    front = ear_y - p.y  # metres in front of the ears' middle (faces look to -Y)
    # Only the head and neck: nothing below the jaw line's neck band or off to the shoulders.
    if p.z < jaw_z - 0.07 or abs(p.x - mouth.x) > 0.13:
        continue
    face_ok = 1.0 if front >= -0.01 else 0.0
    lip = lips.get(v.index, 0)
    # Beard: in front of the ear, below a line from the sideburn (eye level at the
    # side of the face) down to just above the mouth corners, down under the jaw.
    top = mouth.z + 0.022 + (eye_z - 0.03 - mouth.z - 0.022) * smooth(0.03, 0.062, ax)
    # Down under the jaw to a natural neckline a few centimetres below it.
    under = smooth(jaw_z - 0.032, jaw_z - 0.008, p.z)
    beard = smooth(0.02, 0.036, front) * (1 - smooth(top - 0.005, top + 0.007, p.z)) * under
    beard *= 1 - min(1.0, lip * 2)
    beard *= (1 - min(1.0, ears.get(v.index, 0) * 3)) * face_ok
    # Moustache: between the nose and the upper lip.
    tash = (1 - smooth(0.024, 0.034, ax)) * smooth(mouth.z + 0.003, mouth.z + 0.008, p.z) * (1 - smooth(mouth.z + 0.019, mouth.z + 0.026, p.z)) * smooth(0.06, 0.075, front)
    tash *= (1 - min(1.0, lip * 2)) * face_ok
    # Chin: the middle of the chin and below the lower lip.
    chin = (1 - smooth(0.016, 0.026, ax)) * (1 - smooth(mouth.z - 0.012, mouth.z - 0.005, p.z)) * smooth(jaw_z - 0.01, jaw_z + 0.008, p.z) * smooth(0.055, 0.07, front)
    chin *= (1 - min(1.0, lip * 2)) * face_ok
    # Scalp: everything above a natural hairline. The skin textures paint short
    # hair over the whole scalp (further than MakeHuman's own scalp group), so
    # the mask must cover all of it for haircuts to look the same everywhere.
    # The hairline is about 6 cm above the eyes at the front, lower at the
    # temples, at eye level above the ears and down to the nape behind.
    ang = math.atan2(abs(p.x - mouth.x), -(p.y - (ear_y - 0.012)))  # 0 at the front, pi behind
    line = [(0.0, eye_z + 0.052), (0.75, eye_z + 0.044), (1.15, eye_z + 0.018), (1.6, eye_z + 0.006), (2.1, mouth.z + 0.01), (math.pi, mouth.z - 0.015)]
    for (a0, h0), (a1, h1) in zip(line, line[1:]):
        if ang <= a1:
            h = h0 + (h1 - h0) * (ang - a0) / (a1 - a0)
            break
    sc = smooth(h - 0.004, h + 0.01, p.z) * (1 - min(1.0, ears.get(v.index, 0) * 3))
    sc = max(sc, scalp.get(v.index, 0))
    if beard + tash + chin + sc > 0.001:
        mask[v.index] = (beard, tash, sc, chin)
tree = kdtree.KDTree(len(base_co))
for i, co in enumerate(base_co):
    tree.insert(co, i)
tree.balance()


# ---- drop the basemesh and helpers, and the skin under the kit -----------------
bpy.data.objects.remove(basemesh, do_unlink=True)
for o in list(bpy.data.objects):
    if o.type == "MESH" and (o.name.endswith(".body") or "helper" in o.name.lower()):
        bpy.data.objects.remove(o, do_unlink=True)
body = next(o for o in bpy.data.objects if o.type == "MESH" and any(m.name.lower().endswith("body") or "skin" in m.name.lower() for m in o.data.materials if m) and o not in (shirt, trousers))


def covered(co):
    """True where the kit covers the skin, with a margin inside every opening."""
    if (co - neck_base).dot(Vector((0, -0.55, 1)).normalized()) > -0.035:
        return False
    if co.z < foot_z + 0.05:
        return False
    for side in ("Left", "Right"):
        a, f = J[side + "Arm"], J[side + "ForeArm"]
        if abs(co.x) > abs(a.x) - 0.04 and (co.x > 0) == (a.x > 0):
            if long_sleeves:
                end, ax = J[side + "ForeArm"].lerp(J[side + "Hand"], sleeve), axis(side + "ForeArm", side + "Hand")
            else:
                end, ax = a.lerp(f, sleeve), axis(side + "Arm", side + "ForeArm")
            if (co - end).dot(ax) > -0.03:
                return False
    return True


b = bmesh.new()
b.from_mesh(body.data)
mw = body.matrix_world
hidden = [f for f in b.faces if all(covered(mw @ v.co) for v in f.verts)]
bmesh.ops.delete(b, geom=hidden, context="FACES_ONLY")
b.to_mesh(body.data)
b.free()
removed_faces = len(hidden)
face = body.data.color_attributes.new("COLOR_0", "BYTE_COLOR", "POINT")
for i, v in enumerate(body.data.vertices):
    _, idx, _d = tree.find(mw @ v.co)
    face.data[i].color = (*mask.get(idx, (0.0, 0.0, 0.0, 0.0)),)
body.data.color_attributes.active_color = face

# ---- occlusion baked into the kit's vertex colours -------------------------------
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.samples = 24 if not LO else 8
scene.cycles.device = "CPU"
for obj in (shirt, trousers):
    if not obj.data.materials:
        mat = bpy.data.materials.new("kit")
        mat.use_nodes = True
        obj.data.materials.append(mat)
    colour = obj.data.color_attributes.new("COLOR_0", "FLOAT_COLOR", "POINT")
    obj.data.color_attributes.active_color = colour
for o in bpy.data.objects:
    o.select_set(False)
for obj in (shirt, trousers):
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.bake(type="AO", target="VERTEX_COLORS")
    obj.select_set(False)
    trim = obj.data.attributes[TRIM]
    colour = obj.data.color_attributes["COLOR_0"]
    part = 0.0 if obj is trousers else 0.5
    for i, c in enumerate(colour.data):
        ao = c.color[0]
        c.color = (trim.data[i].value, max(0.25, ao), part, 1.0)
    obj.data.attributes.remove(trim)

# Separate kit materials named for the game; both use the same base.
for obj in (shirt, trousers):
    obj.data.materials.clear()
    mat = bpy.data.materials.get("kit") or bpy.data.materials.new("kit")
    mat.use_nodes = True
    obj.data.materials.append(mat)

# ---- cards and opaque surfaces -------------------------------------------------------
if LO:
    for o in bpy.data.objects:
        if o.type != "MESH":
            continue
        name = o.name.lower()
        ratio = 0.3 if "shoes" in name else 0.45 if any(h in name for h in ("short0", "afro", "bob0", "braid", "long0", "ponytail")) else 0.55 if o in (shirt, trousers) else None
        if ratio is None:
            continue
        mod = o.modifiers.new("lod", "DECIMATE")
        mod.ratio = ratio
        with bpy.context.temp_override(object=o):
            bpy.ops.object.modifier_move_to_index(modifier="lod", index=0)
    for m in bpy.data.materials:
        if not m.node_tree:
            continue
        for n in list(m.node_tree.nodes):
            if n.type == "NORMAL_MAP" or (n.type == "TEX_IMAGE" and n.image and "normal" in n.image.name.lower()):
                m.node_tree.nodes.remove(n)

HAIRS = ("short01", "short02", "short03", "short04", "afro01", "bob01", "bob02", "braid01", "long01", "ponytail01")
CARDS = ("hair", "eyebrow", "eyelash", "high-poly", "low-poly") + HAIRS
for o in bpy.data.objects:
    if o.type != "MESH":
        continue
    card = any(c in o.name.lower() for c in CARDS)
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

# Eye colour from the CC0 eye materials.
eye_colour = spec.get("eye", "brown")
eye_file = os.path.join(LocationService.get_user_data(), "eyes", "materials", eye_colour + "_eye.png")
if os.path.exists(eye_file):
    for m in bpy.data.materials:
        if "eye" in m.name.lower() and "brow" not in m.name.lower() and "lash" not in m.name.lower() and m.node_tree:
            for n in m.node_tree.nodes:
                if n.type == "TEX_IMAGE" and n.image and "normal" not in n.image.name.lower():
                    n.image = bpy.data.images.load(eye_file)
else:
    raise SystemExit("missing eye colour " + eye_file)

# Web-sized textures: skin keeps 1024 for the face, hair 1024 so strands stay
# crisp up close, everything else 512.
for img in bpy.data.images:
    if img.size[0] == 0:
        continue
    name = img.name.lower()
    limit = 1024 if ("skin" in name or ("diffuse" in name and "male" in name) or any(h in name for h in ("short0", "afro", "hair"))) else 512
    if LO:
        limit = 512 if limit == 1024 else 256
    if max(img.size) > limit:
        k = limit / max(img.size)
        img.scale(max(1, int(img.size[0] * k)), max(1, int(img.size[1] * k)))

report = {"objects": [], "bones": len(armature.data.bones), "removed_skin_faces": removed_faces}
for o in bpy.data.objects:
    if o.type == "MESH":
        report["objects"].append({"name": o.name, "vertices": len(o.data.vertices), "faces": len(o.data.polygons), "materials": [m.name for m in o.data.materials if m]})

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
    export_image_format="WEBP",
    export_image_quality=86,
    export_vertex_color="ACTIVE",
)
print("ATHLETE_REPORT " + json.dumps(report))
