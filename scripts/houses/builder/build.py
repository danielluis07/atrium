"""PROTOTYPE (throwaway, issue #6): compile Lyngen House in headless Blender.

Builds the House from shared parts (volume, slab, glazing, fascia, stone mass,
roof snow), cuts openings, bevels with harden normals, unwraps a lightmap UV,
bakes two Cycles lightmap layers (base = sky + downlights, spill = window light)
for the House and its snow plinth, and exports a GLB.

The House data below is hand-written for the prototype. The real schema is
"Design the House schema" (#10).

    .venv/Scripts/python.exe build.py --res 2048 --samples 256 [--preview]
"""

import argparse
import json
import math
import os
import sys
import time

import bpy  # bpy must load before bmesh/mathutils
import bmesh
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
PUBLIC = os.path.join(HERE, "..", "..", "public", "prototype", "lyngen")
OUT = os.path.join(HERE, "out")

ap = argparse.ArgumentParser()
ap.add_argument("--res", type=int, default=512)
ap.add_argument("--plinth-res", type=int, default=0)
ap.add_argument("--samples", type=int, default=16)
ap.add_argument("--preview", action="store_true")
ap.add_argument("--no-bake", action="store_true")
ap.add_argument("--tag", default="")
args = ap.parse_args(sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:])
PLINTH_RES = args.plinth_res or max(256, args.res // 2)
TAG = args.tag or str(args.res)

t0 = time.time()
timings = {}


def lap(name):
    global t0
    timings[name] = round(time.time() - t0, 2)
    print(f"[{name}] {timings[name]} s", flush=True)
    t0 = time.time()


# ---------------------------------------------------------------- colour


def oklch_to_linear(L, C, h):
    a = C * math.cos(math.radians(h))
    b = C * math.sin(math.radians(h))
    l_ = L + 0.3963377774 * a + 0.2158037573 * b
    m_ = L - 0.1055613458 * a - 0.0638541728 * b
    s_ = L - 0.0894841775 * a - 1.2914855480 * b
    l, m, s = l_**3, m_**3, s_**3
    r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
    g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
    bb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    return (max(r, 0), max(g, 0), max(bb, 0))


SKY_ZENITH = oklch_to_linear(0.26, 0.06, 262)
SKY_HORIZON = oklch_to_linear(0.55, 0.06, 250)
WINDOW = oklch_to_linear(0.82, 0.12, 70)
DOWNLIGHT = oklch_to_linear(0.86, 0.09, 75)

# ---------------------------------------------------------------- the House (prototype data, metres, z up, front faces -y)

H = {
    "volumes": [
        # name, x0, y0, z0, x1, y1, z1, material
        ("wing-west", -10.0, 0.0, 0.0, -2.4, 9.0, 3.3, "concrete"),
        ("main", -0.8, 0.6, 0.0, 7.2, 10.0, 6.8, "concrete"),
        ("east-lower", 7.2, 1.6, 0.0, 14.0, 10.0, 3.5, "concrete"),
        ("east-frame", 7.6, 0.0, 3.5, 15.2, 10.4, 7.2, "concrete"),
    ],
    "stone": [("chimney", -2.4, -0.4, 0.0, -0.8, 7.0, 8.4)],
    # openings: volume, face axis, x0,x1 (along face), z0,z1, recess depth, fill ("glazing" | "timber" | "void")
    "openings": [
        ("wing-west", "front", -9.2, -4.4, 0.0, 2.6, 0.3, "timber"),
        ("wing-west", "front", -3.9, -2.9, 0.4, 2.9, 0.25, "glazing"),
        ("main", "front", 0.0, 6.6, 0.12, 6.55, 0.3, "glazing"),
        ("east-lower", "front", 8.0, 13.4, 0.12, 3.2, 0.3, "glazing"),
        ("east-frame", "front", 7.95, 14.85, 3.85, 6.9, 1.6, "terrace"),
        ("main", "side-w", 3.0, 8.4, 3.9, 6.2, 0.25, "glazing"),
        ("east-frame", "side-e", 3.0, 9.0, 4.2, 6.6, 0.25, "glazing"),
    ],
    "slabs": [
        # name, x0, y0, x1, y1, z_bottom, thickness, fascia depth, soffit (timber underside)
        ("roof-main", -1.3, -2.6, 8.6, 10.5, 6.8, 0.5, 0.55, True),
        ("canopy", 1.2, -1.5, 7.8, 0.6, 3.3, 0.32, 0.34, True),
        ("roof-west", -10.1, -0.1, -2.4, 9.1, 3.3, 0.0, 0.6, False),
    ],
    "downlights": [
        (0.6, -1.7, 6.8), (2.7, -1.7, 6.8), (4.8, -1.7, 6.8), (6.9, -1.7, 6.8),
        (2.3, -0.5, 3.3), (4.5, -0.5, 3.3), (6.7, -0.5, 3.3),
        (9.2, 0.8, 6.9), (11.4, 0.8, 6.9), (13.6, 0.8, 6.9),
        (-7.9, -0.35, 3.3), (-5.7, -0.35, 3.3),
    ],
    "plinth": (-22.0, -24.0, 28.0, 26.0),
}

MULLION_PITCH = 1.65

# ---------------------------------------------------------------- scene helpers

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
col = scene.collection
mats = {}


def mat(name, color, rough=0.8, emission=None, strength=0.0, metallic=0.0):
    if name in mats:
        return mats[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metallic
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1)
        bsdf.inputs["Emission Strength"].default_value = strength
    mats[name] = m
    return m


mat("concrete", (0.34, 0.34, 0.335), 0.85)
mat("timber", (0.46, 0.23, 0.10), 0.6)
mat("metal", (0.035, 0.037, 0.04), 0.45)
mat("stone", (0.28, 0.26, 0.23), 0.9)
mat("snow", (0.82, 0.84, 0.86), 0.7)
mat("plinth", (0.82, 0.84, 0.86), 0.7)
mat("glazing", (0.02, 0.02, 0.02), 0.05, emission=WINDOW, strength=0.0)
mat("balustrade", (0.8, 0.8, 0.8), 0.05)
mat("downlight", DOWNLIGHT, 0.5, emission=DOWNLIGHT, strength=12.0)
mat("ground", (0.82, 0.84, 0.86), 0.8)


def box(name, x0, y0, z0, x1, y1, z1, material):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x = x0 if v.co.x < 0 else x1
        v.co.y = y0 if v.co.y < 0 else y1
        v.co.z = z0 if v.co.z < 0 else z1
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    col.objects.link(ob)
    me.materials.append(mats[material])
    return ob


def apply_mods(ob):
    with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob]):
        for m in list(ob.modifiers):
            bpy.ops.object.modifier_apply(modifier=m.name)


def cut(ob, cutter):
    m = ob.modifiers.new("cut", "BOOLEAN")
    m.operation = "DIFFERENCE"
    m.solver = "EXACT"
    m.object = cutter
    apply_mods(ob)
    bpy.data.objects.remove(cutter)


def bevel(ob, width, segments=2):
    ob.data.shade_smooth()
    m = ob.modifiers.new("bevel", "BEVEL")
    m.width = width
    m.segments = segments
    m.limit_method = "ANGLE"
    m.angle_limit = math.radians(30)
    m.harden_normals = True
    m.use_clamp_overlap = True
    apply_mods(ob)


# ---------------------------------------------------------------- build parts

parts = {"house": [], "glazing": [], "balustrade": [], "downlights": []}
vol = {}
for name, x0, y0, z0, x1, y1, z1, m in H["volumes"]:
    vol[name] = (x0, y0, z0, x1, y1, z1)
    vol[name + "#ob"] = box(name, x0, y0, z0, x1, y1, z1, m)

frames = []
for vname, face, a0, a1, z0, z1, depth, fill in H["openings"]:
    x0, y0, vz0, x1, y1, vz1 = vol[vname]
    ob = vol[vname + "#ob"]
    if face == "front":
        c = box("cutter", a0, y0 - 1, z0, a1, y0 + depth, z1, "concrete")
        plane = ("y", y0 + depth, a0, a1)
    elif face == "side-w":
        c = box("cutter", x0 - 1, a0, z0, x0 + depth, a1, z1, "concrete")
        plane = ("x", x0 + depth, a0, a1)
    else:  # side-e
        c = box("cutter", x1 - depth, a0, z0, x1 + 1, a1, z1, "concrete")
        plane = ("x", x1 - depth, a0, a1)
    cut(ob, c)
    axis, pos, b0, b1 = plane
    sgn = -1 if face in ("front", "side-w") else 1  # outward direction along axis

    def slab_at(nm, lo, hi, zz0, zz1, thick, material, offset=0.0):
        p0 = pos + sgn * offset
        p1 = p0 + sgn * thick
        if axis == "y":
            return box(nm, lo, min(p0, p1), zz0, hi, max(p0, p1), zz1, material)
        return box(nm, min(p0, p1), lo, zz0, max(p0, p1), hi, zz1, material)

    if fill == "timber":
        parts["house"].append(slab_at("garage-door", b0, b1, z0, z1, 0.06, "timber"))
    elif fill == "glazing":
        parts["glazing"].append(slab_at("glass", b0, b1, z0, z1, 0.02, "glazing", 0.06))
        n = max(1, round((b1 - b0) / MULLION_PITCH))
        for i in range(n + 1):
            t = b0 + (b1 - b0) * i / n
            lo, hi = (t, t + 0.06) if i == 0 else ((t - 0.06, t) if i == n else (t - 0.03, t + 0.03))
            frames.append(slab_at("mullion", lo, hi, z0, z1, 0.14, "metal"))
        frames.append(slab_at("sill", b0, b1, z0, z0 + 0.07, 0.14, "metal"))
        frames.append(slab_at("head", b0, b1, z1 - 0.07, z1, 0.14, "metal"))
        if z1 - z0 > 5:  # Level line on double-height glazing
            zl = z0 + (z1 - z0) * 0.52
            frames.append(slab_at("transom", b0, b1, zl - 0.09, zl + 0.09, 0.2, "metal"))
    elif fill == "terrace":
        # recessed terrace: glazing on the back wall, snow floor, glass balustrade, timber ceiling
        yb = y0 + depth
        g = box("glass", a0 + 0.05, yb - 0.08, z0, a1 - 0.05, yb - 0.06, z1 - 0.02, "glazing")
        parts["glazing"].append(g)
        n = max(1, round((a1 - a0) / MULLION_PITCH))
        for i in range(n + 1):
            t = a0 + 0.05 + (a1 - a0 - 0.1) * i / n
            frames.append(box("mullion", t - 0.03, yb - 0.2, z0, t + 0.03, yb - 0.06, z1, "metal"))
        frames.append(box("head", a0, yb - 0.2, z1 - 0.08, a1, yb - 0.06, z1, "metal"))
        parts["house"].append(box("terrace-snow", a0, y0 - 0.02, z0, a1, yb - 0.2, z0 + 0.08, "snow"))
        parts["house"].append(box("terrace-soffit", a0, y0, z1 - 0.03, a1, yb, z1, "timber"))
        parts["balustrade"].append(box("balustrade", a0 + 0.05, y0 + 0.12, z0 + 0.08, a1 - 0.05, y0 + 0.14, z0 + 1.08, "balustrade"))
        frames.append(box("balustrade-rail", a0 + 0.05, y0 + 0.1, z0 + 0.08, a1 - 0.05, y0 + 0.16, z0 + 0.14, "metal"))

for name, *_ in H["volumes"]:
    ob = vol[name + "#ob"]
    bevel(ob, 0.015, 2)
    parts["house"].append(ob)

for name, x0, y0, z0, x1, y1, z1 in H["stone"]:
    ob = box(name, x0, y0, z0, x1, y1, z1, "stone")
    bevel(ob, 0.03, 3)
    parts["house"].append(ob)

for name, x0, y0, x1, y1, zb, thick, fd, soffit in H["slabs"]:
    ft = 0.05  # fascia thickness
    zt = zb + max(thick, fd - 0.05)
    if thick > 0:
        core = box(name, x0 + ft, y0 + ft, zb, x1 - ft, y1 - ft, zb + thick, "concrete")
        bevel(core, 0.01, 1)
        parts["house"].append(core)
    for fx0, fy0, fx1, fy1 in [
        (x0, y0, x1, y0 + ft), (x0, y1 - ft, x1, y1), (x0, y0 + ft, x0 + ft, y1 - ft), (x1 - ft, y0 + ft, x1, y1 - ft)
    ]:
        f = box(name + "-fascia", fx0, fy0, zb - 0.02 if thick else zb, fx1, fy1, zb + fd, "metal")
        bevel(f, 0.004, 1)
        frames.append(f)
    if soffit:
        # only where the slab overhangs: a soffit face buried in a volume top wastes lightmap texels
        rects = [(x0 + ft, y0 + ft, x1 - ft, y1 - ft)]
        for vx0, vy0, vz0, vx1, vy1, vz1 in [v[1:7] for v in H["volumes"]] + [s_[1:7] for s_ in H["stone"]]:
            if not (vz0 < zb - 0.01 and vz1 >= zb - 0.01):
                continue
            nxt = []
            for rx0, ry0, rx1, ry1 in rects:
                ix0, iy0, ix1, iy1 = max(rx0, vx0), max(ry0, vy0), min(rx1, vx1), min(ry1, vy1)
                if ix0 >= ix1 or iy0 >= iy1:
                    nxt.append((rx0, ry0, rx1, ry1))
                    continue
                for r in [(rx0, ry0, rx1, iy0), (rx0, iy1, rx1, ry1), (rx0, iy0, ix0, iy1), (ix1, iy0, rx1, iy1)]:
                    if r[2] - r[0] > 0.02 and r[3] - r[1] > 0.02:
                        nxt.append(r)
            rects = nxt
        for rx0, ry0, rx1, ry1 in rects:
            parts["house"].append(box(name + "-soffit", rx0, ry0, zb - 0.03, rx1, ry1, zb, "timber"))
    # roof snow: soft cushion inside the fascia
    sz0 = zb + (thick if thick else 0)
    sn = box(name + "-snow", x0 + ft + 0.01, y0 + ft + 0.01, sz0, x1 - ft - 0.01, y1 - ft - 0.01, zb + fd + 0.12, "snow")
    bevel(sn, 0.1, 4)
    parts["house"].append(sn)

# east-frame roof snow + a cap fascia on the frame
x0, y0, z0, x1, y1, z1 = vol["east-frame"]
sn = box("frame-snow", x0 + 0.08, y0 + 0.08, z1, x1 - 0.08, y1 - 0.08, z1 + 0.22, "snow")
bevel(sn, 0.1, 4)
parts["house"].append(sn)
for fx0, fy0, fx1, fy1 in [(x0 - 0.03, y0 - 0.03, x1 + 0.03, y0 + 0.02), (x0 - 0.03, y1 - 0.02, x1 + 0.03, y1 + 0.03),
                           (x0 - 0.03, y0, x0 + 0.02, y1), (x1 - 0.02, y0, x1 + 0.03, y1)]:
    f = box("frame-cap", fx0, fy0, z1 - 0.1, fx1, fy1, z1 + 0.12, "metal")
    frames.append(f)
# snow on the stone mass top
x0, y0, z0, x1, y1, z1 = H["stone"][0][1:]
sn = box("chimney-snow", x0 + 0.03, y0 + 0.03, z1, x1 - 0.03, y1 - 0.03, z1 + 0.18, "snow")
bevel(sn, 0.08, 3)
parts["house"].append(sn)

for f in frames:
    if not f.modifiers and len(f.data.polygons) == 6 and f.name.startswith(("mullion", "sill", "head", "transom", "balustrade-rail")):
        bevel(f, 0.004, 1)
parts["house"].extend(frames)

for i, (x, y, z) in enumerate(H["downlights"]):
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.05, depth=0.01, location=(x, y, z - 0.035))
    d = bpy.context.active_object
    d.name = "downlight"
    d.data.materials.append(mats["downlight"])
    parts["downlights"].append(d)
    ld = bpy.data.lights.new("downlight-lamp", "SPOT")
    ld.energy = 60.0
    ld.color = DOWNLIGHT
    ld.shadow_soft_size = 0.03
    ld.spot_size = math.radians(130)
    ld.spot_blend = 0.6
    lo = bpy.data.objects.new("downlight-lamp", ld)
    lo.location = (x, y, z - 0.06)
    col.objects.link(lo)

px0, py0, px1, py1 = H["plinth"]
bpy.ops.mesh.primitive_grid_add(x_subdivisions=50, y_subdivisions=50, size=1)
plinth = bpy.context.active_object
plinth.name = "plinth"
for v in plinth.data.vertices:
    v.co.x = px0 + (v.co.x + 0.5) * (px1 - px0)
    v.co.y = py0 + (v.co.y + 0.5) * (py1 - py0)
plinth.data.materials.append(mats["plinth"])

bpy.ops.mesh.primitive_plane_add(size=600, location=(0, 0, -0.03))
ground = bpy.context.active_object
ground.name = "bounce-ground"
ground.data.materials.append(mats["ground"])
lap("build parts")


# ---------------------------------------------------------------- join + UVs


def join(name, obs):
    target = obs[0]
    print(f"join {name}: {len(obs)} objects", flush=True)
    if len(obs) == 1:
        target.name = name
        return target
    with bpy.context.temp_override(active_object=target, selected_editable_objects=obs, selected_objects=obs):
        bpy.ops.object.join()
    target.name = name
    target.data.name = name
    return target


house = join("house", parts["house"])
glazing = join("glazing", parts["glazing"])
balustrade = join("balustrade", parts["balustrade"])
downlights = join("downlights", parts["downlights"])


def box_uv(ob):
    """uv0 in metres by dominant axis; boards run horizontal on walls."""
    me = ob.data
    if not me.uv_layers:
        me.uv_layers.new(name="UVMap")
    bm = bmesh.new()
    bm.from_mesh(me)
    uv = bm.loops.layers.uv[0]
    for f in bm.faces:
        n = f.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for lp in f.loops:
            c = lp.vert.co
            if ax == 0:
                lp[uv].uv = (c.y * (1 if n.x > 0 else -1), c.z)
            elif ax == 1:
                lp[uv].uv = (c.x * (-1 if n.y > 0 else 1), c.z)
            else:
                lp[uv].uv = (c.x, c.y)
    bm.to_mesh(me)
    bm.free()


def cull_hidden(ob):
    """Delete faces that sit on the ground or are buried inside another part (all samples inside a solid).
    They would otherwise waste lightmap texels."""
    from mathutils.bvhtree import BVHTree

    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.faces.ensure_lookup_table()
    tree = BVHTree.FromBMesh(bm)
    dead = []
    for f in bm.faces:
        n = f.normal
        c = f.calc_center_median()
        if n.z < -0.9 and c.z < 0.01:
            dead.append(f)
            continue
        samples = [c] + [c.lerp(v.co, 0.9) for v in f.verts]
        hidden = True
        for s in samples:
            loc, hn, idx, dist = tree.ray_cast(s + n * 0.004, n, 100.0)
            if loc is None or hn.dot(n) <= 0:
                hidden = False
                break
        if hidden:
            dead.append(f)
    before = sum(f.calc_area() for f in bm.faces)
    bmesh.ops.delete(bm, geom=dead, context="FACES")
    after = sum(f.calc_area() for f in bm.faces)
    bm.to_mesh(ob.data)
    bm.free()
    print(f"cull {ob.name}: removed {len(dead)} faces, {before:.0f} -> {after:.0f} m2", flush=True)


cull_hidden(house)
for ob in (house, glazing, balustrade, plinth):
    box_uv(ob)


def lightmap_uv(ob, margin):
    me = ob.data
    me.uv_layers.new(name="lightmap")
    me.uv_layers.active = me.uv_layers["lightmap"]
    for o in scene.objects:
        o.select_set(False)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=margin, area_weight=0.0,
                             correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    me.uv_layers.active = me.uv_layers["UVMap"]


lightmap_uv(house, 0.004)
# plinth: planar 0..1 projection is already ideal
me = plinth.data
me.uv_layers.new(name="lightmap")
lm = me.uv_layers["lightmap"]
for poly in me.polygons:
    for li in poly.loop_indices:
        c = me.vertices[me.loops[li].vertex_index].co
        lm.data[li].uv = ((c.x - px0) / (px1 - px0), (c.y - py0) / (py1 - py0))
lap("join + uv")

# texel density report
area = sum(p.area for p in house.data.polygons)
uv_area = 0.0
lmd = house.data.uv_layers["lightmap"].data
for p in house.data.polygons:
    pts = [lmd[i].uv for i in p.loop_indices]
    s = 0.0
    for i in range(len(pts)):
        a, b = pts[i], pts[(i + 1) % len(pts)]
        s += a.x * b.y - b.x * a.y
    uv_area += abs(s) / 2
texels_per_m = math.sqrt(uv_area * args.res * args.res / area)
tris = sum(len(p.vertices) - 2 for o in (house, glazing, balustrade, downlights, plinth) for p in o.data.polygons)
print(f"house surface {area:.0f} m2, uv coverage {uv_area:.2f}, {texels_per_m:.0f} texels/m at {args.res}, {tris} tris")

# ---------------------------------------------------------------- world + bake setup

world = bpy.data.worlds.new("sky")
scene.world = world
world.use_nodes = True
nt = world.node_tree
nt.nodes.clear()
tc = nt.nodes.new("ShaderNodeTexCoord")
sep = nt.nodes.new("ShaderNodeSeparateXYZ")
ramp = nt.nodes.new("ShaderNodeValToRGB")
glow_dot = nt.nodes.new("ShaderNodeVectorMath")
glow_dot.operation = "DOT_PRODUCT"
glow_dot.inputs[1].default_value = Vector((-0.75, -0.55, 0.05)).normalized()  # afterglow: west-southwest, low
glow_pow = nt.nodes.new("ShaderNodeMath")
glow_pow.operation = "POWER"
glow_pow.inputs[1].default_value = 6.0
glow_clamp = nt.nodes.new("ShaderNodeMath")
glow_clamp.operation = "MAXIMUM"
glow_clamp.inputs[1].default_value = 0.0
mix = nt.nodes.new("ShaderNodeMix")
mix.data_type = "RGBA"
mix.blend_type = "ADD"
mix.inputs["B"].default_value = (*[c * 0.9 for c in SKY_HORIZON], 1)
bg = nt.nodes.new("ShaderNodeBackground")
out = nt.nodes.new("ShaderNodeOutputWorld")
ramp.color_ramp.elements[0].position = 0.5
ramp.color_ramp.elements[0].color = (*SKY_HORIZON, 1)
ramp.color_ramp.elements[1].position = 1.0
ramp.color_ramp.elements[1].color = (*SKY_ZENITH, 1)
below = ramp.color_ramp.elements.new(0.45)
below.color = (*[c * 0.5 for c in SKY_HORIZON], 1)
map_z = nt.nodes.new("ShaderNodeMapRange")
map_z.inputs["From Min"].default_value = -1
map_z.inputs["From Max"].default_value = 1
nt.links.new(tc.outputs["Generated"], sep.inputs[0])
nt.links.new(sep.outputs["Z"], map_z.inputs["Value"])
nt.links.new(map_z.outputs["Result"], ramp.inputs["Fac"])
nt.links.new(tc.outputs["Generated"], glow_dot.inputs[0])
nt.links.new(glow_dot.outputs["Value"], glow_clamp.inputs[0])
nt.links.new(glow_clamp.outputs[0], glow_pow.inputs[0])
nt.links.new(glow_pow.outputs[0], mix.inputs["Factor"])
nt.links.new(ramp.outputs["Color"], mix.inputs["A"])
nt.links.new(mix.outputs["Result"], bg.inputs["Color"])
nt.links.new(bg.outputs["Background"], out.inputs["Surface"])
sky_strength = bg.inputs["Strength"]

scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = args.samples
scene.cycles.max_bounces = 6
scene.cycles.diffuse_bounces = 4
scene.render.threads_mode = "AUTO"
scene.cycles.sample_clamp_indirect = 4.0  # kills downlight/window fireflies in the indirect term
scene.render.bake.margin = 8
scene.render.bake.margin_type = "EXTEND"

glass_bsdf = mats["glazing"].node_tree.nodes["Principled BSDF"]
lamps = [o for o in scene.objects if o.type == "LIGHT"]
os.makedirs(OUT, exist_ok=True)
os.makedirs(PUBLIC, exist_ok=True)


def bake_layer(ob, image_name, res, samples):
    img = bpy.data.images.new(image_name, res, res, alpha=False, float_buffer=True)
    img.pixels[0]  # allocate the buffer, or save() finds no image data after the bake
    for slot in ob.material_slots:
        nodes = slot.material.node_tree.nodes
        node = nodes.get("bake-target") or nodes.new("ShaderNodeTexImage")
        node.name = "bake-target"
        node.image = img
        nodes.active = node
    scene.cycles.samples = samples
    for o in scene.objects:
        o.select_set(False)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.bake(type="DIFFUSE", pass_filter={"DIRECT", "INDIRECT"}, uv_layer="lightmap",
                        width=res, height=res, margin=8, use_clear=True, target="IMAGE_TEXTURES")
    raw = os.path.join(OUT, f"{image_name}-raw.hdr")
    path = os.path.join(PUBLIC, f"{image_name}.hdr")
    img.file_format = "HDR"
    img.save(filepath=raw)
    # OIDN through the compositor, in a fresh bpy process (it rebuilds the scene)
    import subprocess
    subprocess.run([sys.executable, os.path.join(HERE, "denoise.py"), raw, path], check=True,
                   stdout=subprocess.DEVNULL)
    print(f"  {image_name}: {os.path.getsize(path) / 1e6:.2f} MB hdr", flush=True)
    return img


def set_layer(layer):
    if layer == "base":
        sky_strength.default_value = 1.0
        glass_bsdf.inputs["Emission Strength"].default_value = 0.0
        for l in lamps:
            l.hide_render = False
    else:
        sky_strength.default_value = 0.0
        glass_bsdf.inputs["Emission Strength"].default_value = 2.5
        for l in lamps:
            l.hide_render = True


# glazing and balustrade must not block light into reveals/terraces in the bake: glass is thin, so only
# the balustrade is hidden; glazing stays as the emitter for the spill layer.
balustrade.hide_render = True
# downlight discs emit in the base layer; hide in spill
if not args.no_bake:
    for layer in ("base", "spill"):
        set_layer(layer)
        downlights.hide_render = layer != "base"
        bake_layer(house, f"lm-house-{layer}-{TAG}", args.res, args.samples)
        lap(f"bake house {layer} {args.res}")
        bake_layer(plinth, f"lm-plinth-{layer}-{TAG}", PLINTH_RES, args.samples)
        lap(f"bake plinth {layer} {PLINTH_RES}")
    balustrade.hide_render = False
    downlights.hide_render = False

# ---------------------------------------------------------------- export

for o in scene.objects:
    o.select_set(o.name in ("house", "glazing", "balustrade", "downlights", "plinth"))
glb = os.path.join(OUT, f"lyngen-raw.glb")
bpy.ops.export_scene.gltf(filepath=glb, export_format="GLB", use_selection=True, export_apply=True,
                          export_texcoords=True, export_normals=True, export_materials="EXPORT",
                          export_image_format="NONE", export_yup=True, export_lights=False, export_cameras=False)
print(f"raw glb {os.path.getsize(glb) / 1e3:.0f} KB")
lap("export")

# ---------------------------------------------------------------- optional preview render

if args.preview:
    set_layer("base")
    sky_strength.default_value = 1.0
    glass_bsdf.inputs["Emission Strength"].default_value = 2.5
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    col.objects.link(cam)
    cam.location = (-14, -34, 5)
    d = Vector((3, 4, 3.5)) - cam.location
    cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    cam.data.lens = 35
    scene.camera = cam
    scene.render.resolution_x, scene.render.resolution_y = 1280, 720
    scene.cycles.samples = 48
    scene.cycles.use_denoising = True
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.exposure = 2.5
    scene.render.filepath = os.path.join(OUT, "preview.png")
    bpy.ops.render.render(write_still=True)
    lap("preview render")

with open(os.path.join(OUT, f"timings-{TAG}.json"), "w") as f:
    json.dump({"res": args.res, "samples": args.samples, "texels_per_m": round(texels_per_m), "tris": tris, **timings}, f, indent=1)
