"""Compile one House in headless Blender from its exported JSON.

Reads the builder JSON written by `bun run houses:export` (docs/design/house-schema.md),
builds the shared parts, derives fascias, snow, downlights, clipped soffits and the snow
plinth, culls buried faces, bevels with harden normals, marks the faces the overview and arc
cameras see, unwraps a lightmap UV (unseen faces at a quarter of the texel density), bakes two
Cycles lightmap layers (base = sky + downlights, spill = window light) for the shell and
the plinth with OIDN denoise, and exports a raw GLB whose root carries the contract extras.

A House with Site Works (ADR 0006) has its pieces built from siteworks.py's kit and baked with the shell, then
split out as the `site` node, and its plinth takes the snow they shape, refined only along them.

A House with Interiors (ADR 0005) also has each of their volumes hollowed to its room shell, the Glazing
Faces into it cut through, and the room furnished from interior.py's kit. Each room bakes on its own, lit by
its lamps and downlights and by the sky through its glass, into one texture that holds its colours too.

Run it through `bun run houses:bake`, which compresses the outputs into public/houses/.

    uv run python build.py --json out/lyngen.json --out out/lyngen --bake-hash <sha256> [--mode draft|final]
"""

import argparse
import json
import math
import os
import struct
import subprocess
import sys
import time

import bpy  # bpy must load before bmesh/mathutils
import bmesh
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

import config as C
import interior as I
import siteworks as S

HERE = os.path.dirname(os.path.abspath(__file__))
EPS = 1e-4

ap = argparse.ArgumentParser()
ap.add_argument("--json", required=True, help="the House's builder JSON")
ap.add_argument("--out", required=True, help="directory for the raw GLB and lightmaps")
ap.add_argument("--bake-hash", required=True, help="written to the GLB extras")
ap.add_argument("--mode", choices=sorted(C.MODES), default="draft")
ap.add_argument("--no-bake", action="store_true", help="build and export without lightmaps")
ap.add_argument("--preview", action="store_true", help="also render out/preview.png")
args = ap.parse_args(sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:])
MODE = C.MODES[args.mode]
OUT = os.path.abspath(args.out)

with open(args.json, encoding="utf-8") as f:
    DATA = json.load(f)
H = DATA["house"]
SLUG = DATA["slug"]

t0 = time.time()
timings = {}


def lap(name):
    global t0
    timings[name] = round(time.time() - t0, 2)
    print(f"[{name}] {timings[name]} s", flush=True)
    t0 = time.time()


# ---------------------------------------------------------------- colour

SKY_ZENITH = C.oklch_to_linear(*C.SKY_ZENITH)
SKY_HORIZON = C.oklch_to_linear(*C.SKY_HORIZON)
WINDOW = C.oklch_to_linear(*C.WINDOW)
DOWNLIGHT = C.oklch_to_linear(*C.DOWNLIGHT)

# ---------------------------------------------------------------- the House, resolved to absolute boxes

LEVELS = {l["name"]: l for l in H["levels"]}


def level_top(name):
    return LEVELS[name]["elevation"] + LEVELS[name]["height"]


def extent(part):
    """(x0, y0, z0, x1, y1, z1) of a volume or the stone mass."""
    r = part["rect"]
    top = part["top"] if part.get("top") is not None else level_top(part["to"])
    return (r["x0"], r["y0"], LEVELS[part["from"]]["elevation"], r["x1"], r["y1"], top)


VOLUMES = {v["name"]: extent(v) for v in H["volumes"]}
# the Interiors, the hero Interior first: each one's volume, the face its template turns to and its room shell
# (lib/house/derive.ts), its furnishing from the record, and its GLB node and texture (`interiors` there). The
# hero Interior keeps the names it had when a House had one at most.
FURNISHINGS = {v["name"]: v["interior"] for v in H["volumes"] if v.get("interior")}
HERO = DATA["derived"].get("interior")
ROOMS = [
    {**r, "furnishing": FURNISHINGS[r["volume"]], "node": node, "texture": node.replace(":", "-")}
    for r, node in ([(HERO, "interior")] if HERO else [])
    + [(r, f"interior:{r['volume']}") for r in DATA["derived"].get("otherInteriors", [])]
]
ROOM_IN = {r["volume"]: r for r in ROOMS}
STONE = extent(H["stone"])
SOLIDS = list(VOLUMES.values()) + [STONE]
SLABS = [
    {**s, "zb": level_top(s["level"]), "r": (s["rect"]["x0"], s["rect"]["y0"], s["rect"]["x1"], s["rect"]["y1"])}
    for s in H["slabs"]
]
ENTRANCE = next(l["name"] for l in H["levels"] if l["elevation"] == 0)
PLINTH_Z = min(b[2] for b in SOLIDS)  # the lowest exposed floor
# solids that start below ±0.00: the grade stands at ±0.00 behind them (uphill, +y) and steps down in front
SUNK = [b for b in SOLIDS if b[2] < -EPS]
RUN = (min(b[0] for b in SUNK), max(b[3] for b in SUNK)) if SUNK else None


def cut_at(x):
    """The back face of the sunk solids at x, which holds the grade behind it."""
    return max((b[4] for b in SUNK if b[0] - EPS <= x <= b[3] + EPS), default=max(b[4] for b in SUNK))


def plinth_z(x, y, sx=None, sy=None):
    """The snow plinth's height at (x, y), on the side of any step that (sx, sy) is on. Flat at the lowest
    exposed floor, unless solids start below ±0.00: then ±0.00 behind their back faces and their floor in
    front, and past each end of their run the snow falls between the two across a GRADE_FAN fan."""
    if not SUNK:
        return PLINTH_Z
    sx, sy = (x, y) if sx is None else (sx, sy)
    x0, x1 = RUN
    if x0 <= sx <= x1:
        return 0.0 if sy >= cut_at(sx) - EPS else PLINTH_Z
    end = x0 if sx < x0 else x1
    cy, w = cut_at(end), abs(x - end) * math.tan(C.GRADE_FAN)
    if w < EPS:
        return 0.0 if sy >= cy - EPS else PLINTH_Z
    t = min(max((y - cy + w) / w, 0.0), 1.0)
    return PLINTH_Z * (1 - t * t * (3 - 2 * t))


# the House's Site Works (ADR 0006), when it has them: their pieces, and the snow they shape, which the plinth takes
SITE = (S.Site(DATA["derived"]["site"], plinth_z, SLUG, [(b[0], b[1], b[3], b[4]) for b in SOLIDS])
        if DATA["derived"].get("site") else None)
ground_z = SITE.ground if SITE else plinth_z


def opening_extent(o):
    """Along the face from its left edge seen from outside, and absolute z. Mirrors lib/house/derive.ts."""
    floor = LEVELS[o["level"]]["elevation"]
    above = level_top(o.get("to") or o["level"])
    head = o["head"] if o.get("head") is not None else min(above, VOLUMES[o["volume"]][5]) - floor
    return (o["at"], o["at"] + o["width"]), (floor + (o.get("sill") or 0.0), floor + head)


class FaceFrame:
    """Boxes placed on one face of a volume: `a` runs along the face from its left edge seen from
    outside, `d` runs inward from the face plane (negative is outside)."""

    NORMALS = {"front": (0, -1, 0), "back": (0, 1, 0), "left": (-1, 0, 0), "right": (1, 0, 0)}

    def __init__(self, box6, face):
        self.x0, self.y0, _, self.x1, self.y1, _ = box6
        self.face = face
        self.normal = self.NORMALS[face]

    def point(self, a, d):
        f = self.face
        if f == "front":
            return (self.x0 + a, self.y0 + d)
        if f == "back":
            return (self.x1 - a, self.y1 - d)
        if f == "left":
            return (self.x0 + d, self.y1 - a)
        return (self.x1 - d, self.y0 + a)

    def box(self, a0, a1, d0, d1, z0, z1):
        (xa, ya), (xb, yb) = self.point(a0, d0), self.point(a1, d1)
        return (min(xa, xb), min(ya, yb), z0, max(xa, xb), max(ya, yb), z1)

    @property
    def depth(self):
        """The volume's depth behind this face."""
        return self.y1 - self.y0 if self.face in ("front", "back") else self.x1 - self.x0


def subtract(rects, holes):
    """Plan rectangles minus holes, as a list of non-overlapping rectangles."""
    for hx0, hy0, hx1, hy1 in holes:
        nxt = []
        for rx0, ry0, rx1, ry1 in rects:
            ix0, iy0, ix1, iy1 = max(rx0, hx0), max(ry0, hy0), min(rx1, hx1), min(ry1, hy1)
            if ix0 >= ix1 - EPS or iy0 >= iy1 - EPS:
                nxt.append((rx0, ry0, rx1, ry1))
                continue
            for r in [(rx0, ry0, rx1, iy0), (rx0, iy1, rx1, ry1), (rx0, iy0, ix0, iy1), (ix1, iy0, rx1, iy1)]:
                if r[2] - r[0] > 0.02 and r[3] - r[1] > 0.02:
                    nxt.append(r)
        rects = nxt
    return rects


def exposed_top(box6):
    """The parts of a volume or stone top that nothing stands or rests on."""
    x0, y0, _, x1, y1, top = box6
    holes = [(b[0], b[1], b[3], b[4]) for b in SOLIDS if b is not box6 and b[2] <= top + EPS < b[5]]
    holes += [s["r"] for s in SLABS if abs(s["zb"] - top) < EPS]
    return subtract([(x0, y0, x1, y1)], holes)


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


for name, (color, rough, metallic) in C.MATERIALS.items():
    if name == "glazing":
        mat(name, color, rough, emission=WINDOW, strength=0.0)
    elif name == "downlight":
        mat(name, DOWNLIGHT, rough, emission=DOWNLIGHT, strength=C.DOWNLIGHT_EMISSION)
    else:
        mat(name, color, rough, metallic=metallic)
mats["interior"].use_fake_user = True  # it has no user until the Interior's bake is done
mat("ground", C.MATERIALS["snow"][0], 0.8)  # bounce only, never exported


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


def quad(name, corners, uvs, material):
    """One outward-facing quad with its own 0..1 UV."""
    me = bpy.data.meshes.new(name)
    me.from_pydata(corners, [], [(0, 1, 2, 3)])
    me.uv_layers.new(name="UVMap")
    for i, loop in enumerate(me.uv_layers[0].data):
        loop.uv = uvs[i]
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


def bevel(ob, spec):
    width, segments = spec
    ob.data.shade_smooth()
    m = ob.modifiers.new("bevel", "BEVEL")
    m.width = width
    m.segments = segments
    m.limit_method = "ANGLE"
    m.angle_limit = C.BEVEL_ANGLE
    m.harden_normals = True
    m.use_clamp_overlap = True
    apply_mods(ob)


# ---------------------------------------------------------------- build parts

parts = {"shell": [], "balustrade": [], "downlights": []}
glazing = {}  # Glazing Face name -> its glass object
terrace_glass = []  # glazed back walls of terrace recesses
frames = []  # thin metal parts, bevelled together at the end
lamps = []  # (x, y, z) of each downlight
glazing_faces = {}  # name -> contract extras (House frame; converted to glTF at export)
bearings = {g["name"]: g["bearing"] for g in DATA["derived"]["glazingFaces"]}
rooms = {g["name"]: g["room"] for g in DATA["derived"]["glazingFaces"]}  # the procedural room behind each

vol_ob = {name: box(name, *b, "concrete") for name, b in VOLUMES.items()}
for room in ROOMS:
    # hollow each Interior's volume to its room shell, open top and bottom: the room brings its own floor and
    # ceiling, and whatever stands on the volume closes it from above
    r = room["rect"]
    cut(vol_ob[room["volume"]], box("cutter", r["x0"], r["y0"], room["floor"] - 1, r["x1"], r["y1"],
                                    room["ceiling"] + 1, "concrete"))


def glazed(ff, name, a0, a1, z0, z1, d, mullions, level_lines):
    """Glass at recess depth `d` with jambs, mullions, sill, head and a transom at each Level line."""
    g = d - C.GLASS_INSET  # glass line
    (xa, ya), (xb, yb) = ff.point(a0, g), ff.point(a1, g)
    glazing[name] = quad(
        f"glazing:{name}",
        [(xa, ya, z0), (xb, yb, z0), (xb, yb, z1), (xa, ya, z1)],
        [(0, 0), (1, 0), (1, 1), (0, 1)],
        "glazing",
    )
    n = mullions + 1
    fw = C.FRAME_WIDTH
    for i in range(n + 1):
        t = a0 + (a1 - a0) * i / n
        lo, hi = (t, t + fw) if i == 0 else ((t - fw, t) if i == n else (t - fw / 2, t + fw / 2))
        frames.append(box("mullion", *ff.box(lo, hi, g - C.FRAME_DEPTH, g, z0, z1), "metal"))
    frames.append(box("sill", *ff.box(a0, a1, g - C.FRAME_DEPTH, g, z0, z0 + C.SILL_HEAD_HEIGHT), "metal"))
    frames.append(box("head", *ff.box(a0, a1, g - C.FRAME_DEPTH, g, z1 - C.SILL_HEAD_HEIGHT, z1), "metal"))
    for zl in level_lines:
        th = C.TRANSOM_HEIGHT / 2
        frames.append(box("transom", *ff.box(a0, a1, g - C.TRANSOM_DEPTH, g, zl - th, zl + th), "metal"))


for o in H["openings"]:
    box6 = VOLUMES[o["volume"]]
    ff = FaceFrame(box6, o["face"])
    (a0, a1), (z0, z1) = opening_extent(o)
    fill, d = o["fill"], o["depth"]
    # a void cuts through its volume, and glass into an Interior through to its room
    into_room = o["volume"] in ROOM_IN and fill == "glazing"
    through = ff.depth + 1 if fill == "void" else (ff.depth / 2 if into_room else d)
    cut(vol_ob[o["volume"]], box("cutter", *ff.box(a0, a1, -1, through, z0, z1), "concrete"))
    level_lines = [l["elevation"] for l in H["levels"] if z0 + 0.3 < l["elevation"] < z1 - 0.3]
    panes = max(1, round((a1 - a0) / C.MULLION_PITCH))
    mullions = o["mullions"] if o.get("mullions") is not None else panes - 1

    if fill == "door":
        parts["shell"].append(box(f"door-{o['name']}", *ff.box(a0, a1, d - C.DOOR_THICKNESS, d, z0, z1), "timber"))
    elif fill == "glazing":
        glazed(ff, o["name"], a0, a1, z0, z1, d, mullions, level_lines)
        nx, ny, _ = ff.normal
        glazing_faces[o["name"]] = {"size": (a1 - a0, z1 - z0), "normal": (nx, ny, 0.0), "room": rooms[o["name"]],
                                    "interior": into_room}
    elif fill == "terrace":
        # a recess with a glazed back wall, snow floor, glass balustrade and timber ceiling. Its glass
        # isn't a Glazing Face, so it joins the balustrade node, after the bake: it lights the spill layer.
        g = d - C.GLASS_INSET
        (xa, ya), (xb, yb) = ff.point(a0, g), ff.point(a1, g)
        terrace_glass.append(
            quad("terrace-glass", [(xa, ya, z0), (xb, yb, z0), (xb, yb, z1), (xa, ya, z1)],
                 [(0, 0), (1, 0), (1, 1), (0, 1)], "glazing"))
        n = mullions + 1
        for i in range(n + 1):
            t = a0 + (a1 - a0) * i / n
            lo, hi = (t, t + C.FRAME_WIDTH) if i == 0 else ((t - C.FRAME_WIDTH, t) if i == n else (t - C.FRAME_WIDTH / 2, t + C.FRAME_WIDTH / 2))
            frames.append(box("mullion", *ff.box(lo, hi, g - C.FRAME_DEPTH, g, z0, z1), "metal"))
        frames.append(box("head", *ff.box(a0, a1, g - C.FRAME_DEPTH, g, z1 - C.SILL_HEAD_HEIGHT, z1), "metal"))
        parts["shell"].append(box("terrace-snow", *ff.box(a0, a1, -0.02, g - C.FRAME_DEPTH, z0, z0 + C.TERRACE_SNOW), "snow"))
        parts["shell"].append(box("terrace-soffit", *ff.box(a0, a1, 0, d, z1 - C.SOFFIT_THICKNESS, z1), "timber"))
        zb = z0 + C.TERRACE_SNOW
        parts["balustrade"].append(box("balustrade", *ff.box(a0 + 0.05, a1 - 0.05, 0.12, 0.12 + C.BALUSTRADE_GLASS, zb, zb + C.BALUSTRADE_HEIGHT), "balustrade"))
        frames.append(box("balustrade-rail", *ff.box(a0 + 0.05, a1 - 0.05, 0.1, 0.16, zb + C.BALUSTRADE_HEIGHT - C.RAIL_HEIGHT, zb + C.BALUSTRADE_HEIGHT), "metal"))
        # downlights down the middle of the recess ceiling
        n_lamps = max(1, round((a1 - a0) / C.DOWNLIGHT_PITCH))
        for i in range(n_lamps):
            x, y = ff.point(a0 + (a1 - a0) * (i + 0.5) / n_lamps, d / 2)
            lamps.append((x, y, z1 - C.SOFFIT_THICKNESS))
    # "void": the cut-through is the whole part



def room_walls(ob, r):
    """Split the room's walls, the faces the hollowing left on the room shell's sides, from the volume into
    their own object: they belong to the Interior, and bake with it. A face in a wall's plane but beyond the
    room, the reveal of glass as wide as the room, stays on the shell."""
    x0, y0, x1, y1 = r["x0"], r["y0"], r["x1"], r["y1"]

    def on_wall(f):
        c, n = f.calc_center_median(), f.normal
        along_x, along_y = x0 < c.x < x1, y0 < c.y < y1
        return ((abs(c.x - x0) < 1e-3 and n.x > 0.9 and along_y) or (abs(c.x - x1) < 1e-3 and n.x < -0.9 and along_y)
                or (abs(c.y - y0) < 1e-3 and n.y > 0.9 and along_x) or (abs(c.y - y1) < 1e-3 and n.y < -0.9 and along_x))

    I.palette()
    walls = bpy.data.objects.new("room-walls", ob.data.copy())
    col.objects.link(walls)
    for target, keep in ((ob, False), (walls, True)):
        bm = bmesh.new()
        bm.from_mesh(target.data)
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if on_wall(f) != keep], context="FACES")
        bm.to_mesh(target.data)
        bm.free()
    walls.data.materials.clear()
    walls.data.materials.append(I.mats["room-plaster"])
    for p in walls.data.polygons:
        p.material_index = 0
    return walls


walls = {room["volume"]: room_walls(vol_ob[room["volume"]], room["rect"]) for room in ROOMS}
for name, ob in vol_ob.items():
    bevel(ob, C.BEVEL_VOLUME)
    parts["shell"].append(ob)

stone = box(H["stone"]["name"], *STONE, "stone")
bevel(stone, C.BEVEL_STONE)
parts["shell"].append(stone)


def downlights_along(slab, soffits):
    """Downlights on a fixed pitch along each outer edge of a slab, where its soffit reaches."""
    x0, y0, x1, y1 = slab["r"]
    ft = C.FASCIA_THICKNESS
    inside = lambda x, y: any(r[0] - EPS <= x <= r[2] + EPS and r[1] - EPS <= y <= r[3] + EPS for r in soffits)
    points = []
    for (ax, ay), (bx, by), (ix, iy) in [
        ((x0, y0), (x1, y0), (0, 1)), ((x1, y1), (x0, y1), (0, -1)),
        ((x0, y1), (x0, y0), (1, 0)), ((x1, y0), (x1, y1), (-1, 0)),
    ]:
        n = max(1, round(math.hypot(bx - ax, by - ay) / C.DOWNLIGHT_PITCH))
        for i in range(n):
            t = (i + 0.5) / n
            # a narrow soffit strip takes its light closer to the fascia
            for inset in (C.DOWNLIGHT_INSET, C.DOWNLIGHT_INSET / 3):
                x, y = ax + (bx - ax) * t + ix * (ft + inset), ay + (by - ay) * t + iy * (ft + inset)
                if inside(x, y):
                    if all(math.hypot(x - px, y - py) > C.DOWNLIGHT_PITCH / 2 for px, py in points):
                        points.append((x, y))
                    break
    return points


for s in SLABS:
    x0, y0, x1, y1 = s["r"]
    zb, thick, fd, ft = s["zb"], s["thickness"], s["fascia"], C.FASCIA_THICKNESS
    if thick > 0:
        core = box(s["name"], x0 + ft, y0 + ft, zb, x1 - ft, y1 - ft, zb + thick, "concrete")
        bevel(core, C.BEVEL_SLAB)
        parts["shell"].append(core)
    for fx0, fy0, fx1, fy1 in [
        (x0, y0, x1, y0 + ft), (x0, y1 - ft, x1, y1), (x0, y0 + ft, x0 + ft, y1 - ft), (x1 - ft, y0 + ft, x1, y1 - ft)
    ]:
        frames.append(box(f"{s['name']}-fascia", fx0, fy0, zb - C.FASCIA_DROP if thick else zb, fx1, fy1, zb + fd, "metal"))
    if s["soffit"]:
        # only where the slab overhangs: a soffit face buried in a volume top wastes lightmap texels
        holes = [(b[0], b[1], b[3], b[4]) for b in SOLIDS if b[2] < zb - 0.01 and b[5] >= zb - 0.01]
        soffits = subtract([(x0 + ft, y0 + ft, x1 - ft, y1 - ft)], holes)
        for rx0, ry0, rx1, ry1 in soffits:
            parts["shell"].append(box(f"{s['name']}-soffit", rx0, ry0, zb - C.SOFFIT_THICKNESS, rx1, ry1, zb, "timber"))
        lamps.extend((x, y, zb - C.SOFFIT_THICKNESS) for x, y in downlights_along(s, soffits))
    # roof snow: a soft cushion inside the fascia
    si = ft + C.SNOW_INSET
    sn = box(f"{s['name']}-snow", x0 + si, y0 + si, zb + thick, x1 - si, y1 - si, zb + max(thick, fd) + C.SNOW_CUSHION, "snow")
    bevel(sn, C.BEVEL_SNOW)
    parts["shell"].append(sn)

# volume tops nothing rests on: snow, and a metal cap when the whole top is open to the sky
for name, b in VOLUMES.items():
    x0, y0, _, x1, y1, top = b
    pieces = exposed_top(b)
    whole = len(pieces) == 1 and all(abs(p - q) < EPS for p, q in zip(pieces[0], (x0, y0, x1, y1)))
    if whole:
        ct = C.CAP_THICKNESS
        zc0, zc1 = top - C.CAP_DEPTH / 2, top + C.CAP_DEPTH / 2
        for fx0, fy0, fx1, fy1 in [(x0 - ct, y0 - ct, x1 + ct, y0 + ct), (x0 - ct, y1 - ct, x1 + ct, y1 + ct),
                                   (x0 - ct, y0 + ct, x0 + ct, y1 - ct), (x1 - ct, y0 + ct, x1 + ct, y1 - ct)]:
            frames.append(box(f"{name}-cap", fx0, fy0, zc0, fx1, fy1, zc1, "metal"))
    for px0, py0, px1, py1 in pieces:
        if px1 - px0 < C.MIN_SNOW_PATCH or py1 - py0 < C.MIN_SNOW_PATCH:
            continue
        inset = C.CAP_THICKNESS + C.SNOW_INSET if whole else C.SNOW_INSET
        sn = box(f"{name}-snow", px0 + inset, py0 + inset, top, px1 - inset, py1 - inset,
                 top + C.CAP_DEPTH / 2 + C.SNOW_CUSHION if whole else top + C.SNOW_CUSHION, "snow")
        bevel(sn, C.BEVEL_SNOW)
        parts["shell"].append(sn)

# snow on the stone mass top
for px0, py0, px1, py1 in exposed_top(STONE):
    if px1 - px0 < C.MIN_SNOW_PATCH or py1 - py0 < C.MIN_SNOW_PATCH:
        continue
    sn = box("stone-snow", px0 + 0.03, py0 + 0.03, STONE[5], px1 - 0.03, py1 - 0.03, STONE[5] + C.STONE_SNOW, "snow")
    bevel(sn, C.BEVEL_STONE_SNOW)
    parts["shell"].append(sn)

# authored balustrades: glass with a metal rail along slab edges
slab_by_name = {s["name"]: s for s in SLABS}
for bal in H["balustrades"]:
    s = slab_by_name[bal["slab"]]
    x0, y0, x1, y1 = s["r"]
    zb = s["zb"] + s["thickness"]
    ft, g = C.FASCIA_THICKNESS, C.BALUSTRADE_GLASS
    edges = {
        "front": (x0 + ft, y0 + ft, x1 - ft, y0 + ft + g),
        "back": (x0 + ft, y1 - ft - g, x1 - ft, y1 - ft),
        "left": (x0 + ft, y0 + ft, x0 + ft + g, y1 - ft),
        "right": (x1 - ft - g, y0 + ft, x1 - ft, y1 - ft),
    }
    for edge in bal["edges"]:
        ex0, ey0, ex1, ey1 = edges[edge]
        parts["balustrade"].append(box("balustrade", ex0, ey0, zb, ex1, ey1, zb + C.BALUSTRADE_HEIGHT, "balustrade"))
        cx, cy = (ex0 + ex1) / 2, (ey0 + ey1) / 2
        rw = C.RAIL_WIDTH / 2
        rx0, rx1 = (ex0, ex1) if edge in ("front", "back") else (cx - rw, cx + rw)
        ry0, ry1 = (cy - rw, cy + rw) if edge in ("front", "back") else (ey0, ey1)
        frames.append(box("balustrade-rail", rx0, ry0, zb + C.BALUSTRADE_HEIGHT - C.RAIL_HEIGHT, rx1, ry1, zb + C.BALUSTRADE_HEIGHT, "metal"))

for f in frames:
    if not f.modifiers and len(f.data.polygons) == 6:
        bevel(f, C.BEVEL_METAL)
parts["shell"].extend(frames)

for x, y, z in lamps:
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=C.DOWNLIGHT_RADIUS, depth=0.01, location=(x, y, z - 0.005))
    d = bpy.context.active_object
    d.name = "downlight"
    d.data.materials.append(mats["downlight"])
    parts["downlights"].append(d)
    ld = bpy.data.lights.new("downlight-lamp", "SPOT")
    ld.energy = C.DOWNLIGHT_WATTS
    ld.color = DOWNLIGHT
    ld.shadow_soft_size = 0.03
    ld.spot_size = C.DOWNLIGHT_CONE
    ld.spot_blend = 0.6
    lo = bpy.data.objects.new("downlight-lamp", ld)
    lo.location = (x, y, z - 0.03)
    col.objects.link(lo)


def solid(name, corners, material):
    """A closed six-sided solid from its eight corners: the bottom four counter-clockwise, then the top four."""
    me = bpy.data.meshes.new(name)
    me.from_pydata(corners, [], [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)])
    ob = bpy.data.objects.new(name, me)
    col.objects.link(ob)
    me.materials.append(mats[material])
    return ob


def mark(ob, value):
    """Tags every face of a site works piece (1, or 2 for a Snow Shrub's twigs) through the join, the culling and
    the unwrap, until `split_site` takes them out of the shell."""
    ob.data.attributes.new("site", "INT", "FACE").data.foreach_set("value", [value] * len(ob.data.polygons))
    parts["shell"].append(ob)


if SITE:
    # the site works bake with the shell, on its lightmap, and leave it as their own node after the bake
    for name, material, shape, spec in SITE.pieces():
        ob = box(name, *shape[1:], material) if shape[0] == "box" else solid(name, list(shape[1:]), material)
        if spec:
            bevel(ob, spec)
        mark(ob, 1)
    for name, material, verts, faces, fine in SITE.shrubs(H["siteWorks"]["shrubs"]):
        me = bpy.data.meshes.new(name)
        me.from_pydata(verts, [], faces)
        ob = bpy.data.objects.new(name, me)
        col.objects.link(ob)
        me.materials.append(mats[material])
        if not fine:
            me.shade_smooth()
        mark(ob, 2 if fine else 1)
    for slot, (x, y, z), direction in SITE.lights(H["siteWorks"]["lights"]):
        parts["downlights"].append(box("site-light", *slot, "downlight"))
        ld = bpy.data.lights.new("site-lamp", "SPOT")
        ld.energy = C.SITE_LIGHT_WATTS
        ld.color = DOWNLIGHT
        ld.shadow_soft_size = 0.02
        ld.spot_size = C.SITE_LIGHT_CONE
        ld.spot_blend = 0.8
        lo = bpy.data.objects.new("site-lamp", ld)
        lo.location = (x, y, z)
        lo.rotation_euler = Vector(direction).to_track_quat("-Z", "Y").to_euler()
        col.objects.link(lo)

# the snow plinth: the footprint plus a margin, at the lowest exposed floor, stepping up to ±0.00 behind
# any solids that start below it
footprint = [(b[0], b[1], b[3], b[4]) for b in SOLIDS] + [s["r"] for s in SLABS]
px0 = min(r[0] for r in footprint) - C.PLINTH_MARGIN
py0 = min(r[1] for r in footprint) - C.PLINTH_MARGIN
px1 = max(r[2] for r in footprint) + C.PLINTH_MARGIN
py1 = max(r[3] for r in footprint) + C.PLINTH_MARGIN
if SUNK:
    spans = sorted((b[0], b[3]) for b in SUNK)
    reach = spans[0][1]
    for a, b in spans[1:]:
        if a > reach + EPS:
            print(f"warning: nothing holds the grade between x {reach:g} and {a:g}: the snow steps there", flush=True)
        reach = max(reach, b)


def grid_lines(a, b, steps):
    """A uniform grid from a to b, plus a line at each step, clear of the grid lines beside it."""
    steps = [s for s in steps if a < s < b]
    uniform = [a + (b - a) * i / C.PLINTH_GRID for i in range(C.PLINTH_GRID + 1)]
    return sorted(steps + [u for u in uniform if all(abs(u - s) > 0.05 for s in steps)])


# the plinth leaves a hole under each Interior where it meets the room's floor: the live plinth's polygon
# offset would win over the floor. Where the room stands above the snow (Senja's cantilever, Reine's upper
# rooms), the snow runs on under it.
holes = [((r["x0"], r["y0"], r["x1"], r["y1"]), room["floor"]) for room in ROOMS for r in [room["rect"]]]
xs = grid_lines(px0, px1, [v for b in SUNK for v in (b[0], b[3])] + [v for h, _ in holes for v in (h[0], h[2])])
ys = grid_lines(py0, py1, [b[4] for b in SUNK] + [v for h, _ in holes for v in (h[1], h[3])])
bm = bmesh.new()


def site_cells():
    """With site works, the plinth's cells: the coarse grid's points, thinned wherever the site works' feature
    points come near, and those points, in a constrained Delaunay triangulation that keeps the holes' edges and
    the steps' lines. The refinement stays along the pieces and their snow, and no line runs across the plinth.
    Each cell is its corners and its centre."""
    from mathutils.geometry import delaunay_2d_cdt

    outlines, tiers = SITE.features([h for h, _ in holes], (px0, py0, px1, py1))
    points, edges = [], []
    for ring in outlines:
        start = len(points)
        points += ring
        edges += [(start + i, start + (i + 1) % len(ring)) for i in range(len(ring))]
    for b in SUNK:
        # a step falls along each sunk solid's back face
        edges.append((len(points), len(points) + 1))
        points += [(b[0], b[4]), (b[3], b[4])]
    cell = C.SITE_CLEAR
    taken = {}
    key = lambda p: (int(math.floor(p[0] / cell)), int(math.floor(p[1] / cell)))

    def near(p):
        i, j = key(p)
        return any(math.dist(p, q) < cell for di in (-1, 0, 1) for dj in (-1, 0, 1) for q in taken.get((i + di, j + dj), ()))

    def take(p):
        points.append(p)
        taken.setdefault(key(p), []).append(p)

    for p in list(points):
        taken.setdefault(key(p), []).append(p)
    grid = [(x, y) for x in xs for y in ys]
    edge = [p for p in grid if p[0] in (px0, px1) or p[1] in (py0, py1)]
    for p in edge:
        take(p)
    inner = [p for p in grid if p[0] not in (px0, px1) and p[1] not in (py0, py1) and not SITE.in_hole(*p)]
    for tier in [*tiers, inner]:
        for p in tier:
            if not near(p):
                take(p)
    vs, _, faces, *_ = delaunay_2d_cdt([Vector(p) for p in points], edges, [], 0, 1e-5)
    for f in faces:
        mx, my = sum(vs[i].x for i in f) / len(f), sum(vs[i].y for i in f) / len(f)
        if not SITE.in_hole(mx, my):
            yield [(vs[i].x, vs[i].y) for i in f], mx, my


def grid_cells():
    for i in range(len(xs) - 1):
        for j in range(len(ys) - 1):
            corners = [(xs[i], ys[j]), (xs[i + 1], ys[j]), (xs[i + 1], ys[j + 1]), (xs[i], ys[j + 1])]
            yield corners, (xs[i] + xs[i + 1]) / 2, (ys[j] + ys[j + 1]) / 2


for corners, mx, my in site_cells() if SITE else grid_cells():
    # each cell takes its side of a step from a point just inside it, so a step falls between cells,
    # on the face of the solid that holds it, and the weld leaves it open
    pts = [(x, y, ground_z(x, y, x + (mx - x) * 0.01, y + (my - y) * 0.01)) for x, y in corners]
    if any(h[0] < mx < h[2] and h[1] < my < h[3] and all(abs(p[2] - floor) < 0.01 for p in pts)
           for h, floor in holes):
        continue
    bm.faces.new([bm.verts.new(p) for p in pts])
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
print(f"plinth: {len(bm.faces)} cells", flush=True)
me = bpy.data.meshes.new("plinth")
bm.to_mesh(me)
bm.free()
me.shade_smooth()
plinth = bpy.data.objects.new("plinth", me)
col.objects.link(plinth)
plinth.data.materials.append(mats["plinth"])

bpy.ops.mesh.primitive_plane_add(size=600, location=(0, 0, (min(PLINTH_Z, SITE.lowest) if SITE else PLINTH_Z) - 0.03))
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
        target.data.name = name
        return target
    with bpy.context.temp_override(active_object=target, selected_editable_objects=obs, selected_objects=obs):
        bpy.ops.object.join()
    target.name = name
    target.data.name = name
    return target


shell = join("shell", parts["shell"])
balustrade = join("balustrade", parts["balustrade"]) if parts["balustrade"] else None  # glass only, for now
downlights = join("downlights", parts["downlights"]) if parts["downlights"] else None
plinth.data.name = "plinth"
bpy.data.orphans_purge(do_recursive=True)  # the joined-away meshes, so exported mesh names match their nodes


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


def cull_hidden(ob, ground=plinth_z, beyond=lambda p: False):
    """Delete faces that sit on the ground or are buried, each sample under the ground, inside another
    part or just in front of it `beyond` (behind the room's walls, or inside them). They would otherwise
    waste lightmap texels."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.faces.ensure_lookup_table()
    tree = BVHTree.FromBMesh(bm)
    dead = []
    for f in bm.faces:
        n = f.normal
        c = f.calc_center_median()
        if ground and n.z < -0.9 and c.z < ground(c.x, c.y) + 0.01:
            dead.append(f)
            continue
        samples = [c] + [c.lerp(v.co, 0.9) for v in f.verts]
        hidden = True
        for s in samples:
            if (ground and s.z < ground(s.x, s.y) - 0.01) or beyond(s + n * 0.004):
                continue
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


def room_frame(room):
    """A room's frame (x along the window wall from its left end seen from outside, y inward, z up from the
    finished floor) as a matrix to the House frame, and the room's width, height and depth in it."""
    r, face = room["rect"], room["face"]
    x0, y0, x1, y1 = r["x0"], r["y0"], r["x1"], r["y1"]
    (ax, ay), (dx, dy), (ox, oy) = {
        "front": ((1, 0), (0, 1), (x0, y0)), "back": ((-1, 0), (0, -1), (x1, y1)),
        "left": ((0, -1), (1, 0), (x0, y1)), "right": ((0, 1), (-1, 0), (x1, y0)),
    }[face]
    floor = room["floor"] + C.INTERIOR_FINISH
    m = Matrix(((ax, dx, 0, ox), (ay, dy, 0, oy), (0, 0, 1, floor), (0, 0, 0, 1)))
    w, d = (x1 - x0, y1 - y0) if face in ("front", "back") else (y1 - y0, x1 - x0)
    return m, w, room["ceiling"] - C.INTERIOR_FINISH - floor, d


def against(room, s, m, w, d):
    """The walls of a room a solid `s` stands against outside, in the room frame, and the span of each the
    room sees, as [("left" | "right" | "back", u0, u1)]: never the window's wall, nor a span under 1.2 m."""
    v, r = VOLUMES[room["volume"]], room["rect"]
    inv = m.inverted()
    walls = []
    for plane, touching in (("x0", abs(s[3] - v[0]) < EPS), ("x1", abs(s[0] - v[3]) < EPS),
                            ("y0", abs(s[4] - v[1]) < EPS), ("y1", abs(s[1] - v[4]) < EPS)):
        across = (s[1], s[4], r["y0"], r["y1"]) if plane[0] == "x" else (s[0], s[3], r["x0"], r["x1"])
        lo, hi = max(across[0], across[2]), min(across[1], across[3])
        if not touching or hi - lo < 1.2:
            continue
        a, b = (inv @ Vector((r[plane], t, 0) if plane[0] == "x" else (t, r[plane], 0)) for t in (lo, hi))
        if abs(a.x) < 1e-3 or abs(a.x - w) < 1e-3:
            walls.append(("left" if abs(a.x) < 1e-3 else "right", min(a.y, b.y), max(a.y, b.y)))
        elif abs(a.y - d) < 1e-3:
            walls.append(("back", min(a.x, b.x), max(a.x, b.x)))
    return walls


def hearth(room, m, w, d):
    """The wall of a room the stone mass stands behind, in the room frame, and the span of it the room sees, as
    ("left" | "right" | "back", u0, u1); or None when the stone stands against no wall but the window's."""
    if STONE[5] < room["floor"] + 2.0:
        return None
    return next(iter(against(room, STONE, m, w, d)), None)


def beside(room, m, w, d):
    """The walls the House's other volumes on a room's floor stand against, as `against` gives them: where
    a door into the room beside it can go."""
    floor = room["floor"]
    return [wall for name, s in VOLUMES.items()
            if name != room["volume"] and s[2] <= floor + EPS and s[5] >= floor + 2.4
            for wall in against(room, s, m, w, d)]


def furnished_room(room, walls):
    """An Interior: its walls, a floor and a ceiling, and the kind's template from the shared kit, joined
    into one object in the House frame; and the lamps that light it. The hero Interior is seeded with the
    House's slug, as it was when a House had one; another adds its volume."""
    m, w, h, d = room_frame(room)
    where, doors = hearth(room, m, w, d), beside(room, m, w, d)
    seed = SLUG if room is ROOMS[0] else f"{SLUG}:{room['volume']}"
    furniture, room_lamps = I.furnish(room["furnishing"], w, h, d, where, doors, seed)
    floor = quad("room-floor", [(0, 0, 0), (w, 0, 0), (w, d, 0), (0, d, 0)], [(0, 0)] * 4, "concrete")
    ceiling = quad("room-ceiling", [(0, 0, h), (0, d, h), (w, d, h), (w, 0, h)], [(0, 0)] * 4, "concrete")
    for ob, name in ((floor, "oak"), (ceiling, "ceiling")):
        ob.data.materials[0] = I.mats[f"room-{name}"]
        ob.data.uv_layers.remove(ob.data.uv_layers[0])
    for ob in [floor, ceiling, *furniture]:
        ob.data.transform(m)
    for lamp in room_lamps:
        lamp.location = m @ lamp.location
    ob = join(room["node"], [walls, floor, ceiling, *furniture])
    tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    print(f"{room['node']}: {room['furnishing']['kind']} in {room['volume']}, {w:.2f} x {d:.2f} x {h:.2f} m facing "
          f"{room['face']}, hearth {where}, beside {doors}, {len(furniture)} pieces, {len(room_lamps)} lamps, {tris} tris",
          flush=True)
    return ob, room_lamps


def in_room(room, p, finish=0.0):
    """Whether a point is inside a room shell, or with `finish`, inside its finished floor and ceiling."""
    r = room["rect"]
    return (r["x0"] < p.x < r["x1"] and r["y0"] < p.y < r["y1"]
            and room["floor"] + finish < p.z < room["ceiling"] - finish)


# each room's object and the lamps that light it
for room in ROOMS:
    room["ob"], room["lamps"] = furnished_room(room, walls[room["volume"]])
room_lamps = [lamp for room in ROOMS for lamp in room["lamps"]]
bpy.data.orphans_purge(do_recursive=True)
# the shell loses what the rooms enclose, and each room what stands flush against its shell
cull_hidden(shell, ground=SITE.cull_ground if SITE else plinth_z,
            beyond=lambda p: any(in_room(room, p) for room in ROOMS))
for room in ROOMS:
    cull_hidden(room["ob"], ground=None, beyond=lambda p, room=room: not in_room(room, p, C.INTERIOR_FINISH))
for ob in (shell, balustrade, plinth):
    if ob:
        box_uv(ob)

# ---------------------------------------------------------------- seen and unseen faces

# the overview and arc cameras in the House frame. Only the House is in the way: the other Houses and the
# terrain are ignored, and there is no frustum test (every one of these cameras frames the whole House).
VIEWPOINTS = [Vector(p) for p in DATA["derived"]["viewpoints"]]


def sees(tree, points, normal):
    """Whether any viewpoint sees any of the points on a surface facing `normal`, past the shell."""
    for p in points:
        o = p + normal * 0.004
        for cam in VIEWPOINTS:
            ray = cam - o
            if ray.dot(normal) <= 0:
                continue
            if tree.ray_cast(o, ray.normalized(), ray.length)[0] is None:
                return True
    return False


bm = bmesh.new()
bm.from_mesh(shell.data)
shell_tree = BVHTree.FromBMesh(bm)
seen = [sees(shell_tree, [f.calc_center_median()] + [f.calc_center_median().lerp(v.co, 0.9) for v in f.verts], f.normal)
        for f in bm.faces]
bm.free()

steps = (0.05, 0.275, 0.5, 0.725, 0.95)
for name, ob in glazing.items():
    a, b, c, d = (v.co for v in ob.data.vertices)  # bottom left, bottom right, top right, top left
    points = [a.lerp(b, u).lerp(d.lerp(c, u), v) for u in steps for v in steps]
    glazing_faces[name]["seen"] = sees(shell_tree, points, Vector(glazing_faces[name]["normal"]))
    if not glazing_faces[name]["seen"]:
        print(f"warning: Glazing Face {name} is entirely unseen from the overview and arc cameras", flush=True)
print(f"seen: {sum(seen)} of {len(seen)} shell faces, "
      f"{sum(g['seen'] for g in glazing_faces.values())} of {len(glazing_faces)} Glazing Faces", flush=True)
for room in ROOMS:
    # a room is seen through its glass, which doesn't stop the rays, past the shell and its own furniture
    ob = room["ob"]
    bm = bmesh.new()
    bm.from_mesh(shell.data)
    bm.from_mesh(ob.data)
    tree = BVHTree.FromBMesh(bm)
    bm.free()
    room["seen"] = [sees(tree, [p.center] + [p.center.lerp(ob.data.vertices[v].co, 0.9) for v in p.vertices], p.normal)
                    for p in ob.data.polygons]
    print(f"seen: {sum(room['seen'])} of {len(room['seen'])} {room['node']} faces", flush=True)
lap("seen faces")


def uv_area(uv, poly):
    s = 0.0
    pts = [uv[i].uv for i in poly.loop_indices]
    for i in range(len(pts)):
        a, b = pts[i], pts[(i + 1) % len(pts)]
        s += a.x * b.y - b.x * a.y
    return abs(s) / 2


def texel_density(ob, res, polys):
    """Lightmap texels per metre over some of a mesh's faces."""
    uv = ob.data.uv_layers["lightmap"].data
    area = sum(p.area for p in polys)
    return math.sqrt(sum(uv_area(uv, p) for p in polys) * res * res / area) if area else 0.0


def lightmap_uv(ob, margin, seen, site=None):
    """Unwrap the seen and unseen faces apart, bring the unseen ones to UNSEEN_TEXEL_RATIO of the seen
    texel density, then pack both into one lightmap. With `site` (each face's site works tag), the site works'
    seen faces unwrap on their own with a wider angle, so their bevels join the faces beside them and pack tight,
    and the Snow Shrubs' twigs on their own at TWIG_TEXEL_RATIO."""
    group_of = [("twig" if site and site[i] == 2 else "site" if site and site[i] and s else s) for i, s in enumerate(seen)]
    me = ob.data
    me.uv_layers.new(name="lightmap")
    me.uv_layers.active = me.uv_layers["lightmap"]
    for o in scene.objects:
        o.select_set(False)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.context.tool_settings.use_uv_select_sync = True
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.context.tool_settings.mesh_select_mode = (False, False, True)
    # each group: its texel density against the seen faces', its unwrap angle, and where it is parked apart
    groups = [(True, 1.0, C.SMART_PROJECT_ANGLE, 0.0), (False, C.UNSEEN_TEXEL_RATIO, C.SMART_PROJECT_ANGLE, 2.0),
              ("site", 1.0, C.SITE_PROJECT_ANGLE, 4.0), ("twig", C.TWIG_TEXEL_RATIO, C.SMART_PROJECT_ANGLE, 6.0)]
    for group, _, angle, _ in groups:
        bpy.ops.mesh.select_all(action="DESELECT")
        ebm = bmesh.from_edit_mesh(me)
        chosen = [f for f in ebm.faces if group_of[f.index] == group]
        for f in chosen:
            f.select_set(True)
        bmesh.update_edit_mesh(me)
        if chosen:
            bpy.ops.uv.smart_project(angle_limit=angle, island_margin=margin, area_weight=0.0,
                                     correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    # each smart project fills the unit square on its own: rescale each group to its texel density, and park
    # the unseen group off the square so no island can join across the two
    uv = me.uv_layers["lightmap"].data
    for group, ratio, _, park in groups:
        polys = [p for p in me.polygons if group_of[p.index] == group]
        if not polys:
            continue
        k = ratio / texel_density(ob, 1, polys)
        offset = Vector((park, 0.0))
        for p in polys:
            for li in p.loop_indices:
                uv[li].uv = uv[li].uv * k + offset
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.pack_islands(rotate=True, rotate_method="CARDINAL", scale=True, margin_method="SCALED", margin=margin,
                            shape_method="AABB")
    bpy.ops.object.mode_set(mode="OBJECT")
    if "UVMap" in me.uv_layers:
        me.uv_layers.active = me.uv_layers["UVMap"]


lightmap_uv(shell, C.ISLAND_MARGIN, seen, [a.value for a in shell.data.attributes["site"].data] if SITE else None)
for room in ROOMS:
    # a room's only UV set: its texture's
    lightmap_uv(room["ob"], C.ISLAND_MARGIN, room["seen"])
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
seen_polys = [p for p in shell.data.polygons if seen[p.index]]
unseen_polys = [p for p in shell.data.polygons if not seen[p.index]]
texels_per_m = texel_density(shell, MODE["res"], seen_polys)
texels_per_m_unseen = texel_density(shell, MODE["res"], unseen_polys)
if SITE:
    tag = shell.data.attributes["site"].data
    site_seen = [p for p in seen_polys if tag[p.index].value]
    print(f"site works: {sum(p.area for p in site_seen):.0f} m2 seen, "
          f"{sum(p.area for p in unseen_polys if tag[p.index].value):.0f} unseen, of the shell's "
          f"{sum(p.area for p in seen_polys):.0f} seen", flush=True)
area = sum(p.area for p in shell.data.polygons)
unseen_area = sum(p.area for p in unseen_polys)
coverage = sum(uv_area(shell.data.uv_layers["lightmap"].data, p) for p in shell.data.polygons)
exported = [o for o in [shell, balustrade, downlights, plinth, *glazing.values(), *terrace_glass] if o]
tris = sum(len(p.vertices) - 2 for o in exported for p in o.data.polygons)
print(f"shell surface {area:.0f} m2 ({unseen_area:.0f} unseen), uv coverage {coverage:.2f}, "
      f"{texels_per_m:.1f} texels/m seen and {texels_per_m_unseen:.1f} unseen at {MODE['res']}, {tris} tris")
for room in ROOMS:
    polys = list(room["ob"].data.polygons)
    room["texels_per_m"] = texel_density(room["ob"], MODE["interior_res"], [p for p in polys if room["seen"][p.index]])
    room["tris"] = sum(len(p.vertices) - 2 for p in polys)
    print(f"{room['node']} surface {sum(p.area for p in polys):.0f} m2, "
          f"{room['texels_per_m']:.0f} texels/m seen at {MODE['interior_res']}, {room['tris']} tris")

# ---------------------------------------------------------------- world + bake setup


def house_direction(bearing, elevation):
    """A compass bearing (clockwise from north) as a direction in the House frame. Inverts bearing() in
    lib/house/derive.ts: the layout's north and the House's rotation are both counter-clockwise."""
    p = DATA["placement"]
    theta = math.radians(p["north"] - bearing - p["rotation"])
    return Vector((-math.sin(theta) * math.cos(elevation), math.cos(theta) * math.cos(elevation), math.sin(elevation)))


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
glow_dot.inputs[1].default_value = house_direction(C.AFTERGLOW_BEARING, C.AFTERGLOW_ELEVATION)
glow_pow = nt.nodes.new("ShaderNodeMath")
glow_pow.operation = "POWER"
glow_pow.inputs[1].default_value = C.AFTERGLOW_POWER
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
scene.cycles.samples = MODE["samples"]
scene.cycles.max_bounces = C.CYCLES["max_bounces"]
scene.cycles.diffuse_bounces = C.CYCLES["diffuse_bounces"]
scene.render.threads_mode = "AUTO"
scene.cycles.sample_clamp_indirect = C.CYCLES["sample_clamp_indirect"]
scene.render.bake.margin = C.BAKE_MARGIN
scene.render.bake.margin_type = "EXTEND"

glass_bsdf = mats["glazing"].node_tree.nodes["Principled BSDF"]
lights = [o for o in scene.objects if o.type == "LIGHT" and o not in room_lamps]
os.makedirs(OUT, exist_ok=True)
lightmaps = {}  # node -> layer -> file name, written to the extras


def bake_layer(ob, image_name, res, samples, kind="DIFFUSE", passes=("DIRECT", "INDIRECT"), denoise=True):
    """Bake one layer of `ob` on its lightmap UV into <OUT>/<image_name>.exr, OIDN-denoised unless it is
    noiseless (a colour or emission pass)."""
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
    bpy.ops.object.bake(type=kind, pass_filter=set(passes), uv_layer="lightmap", width=res, height=res,
                        margin=C.BAKE_MARGIN, use_clear=True, target="IMAGE_TEXTURES")
    raw = os.path.join(OUT, f"{image_name}-raw.exr")
    path = os.path.join(OUT, f"{image_name}.exr")
    img.file_format = "OPEN_EXR"
    img.save(filepath=raw if denoise else path)
    if denoise:
        # OIDN through the compositor, in a fresh bpy process (it rebuilds the scene)
        subprocess.run([sys.executable, os.path.join(HERE, "denoise.py"), raw, path], check=True,
                       stdout=subprocess.DEVNULL)
    print(f"  {image_name}: {os.path.getsize(path) / 1e6:.2f} MB exr", flush=True)
    return img


def set_layer(layer):
    if layer == "base":
        sky_strength.default_value = 1.0
        glass_bsdf.inputs["Emission Strength"].default_value = 0.0
        for l in lights:
            l.hide_render = False
    else:
        sky_strength.default_value = 0.0
        glass_bsdf.inputs["Emission Strength"].default_value = C.WINDOW_SPILL_STRENGTH
        for l in lights:
            l.hide_render = True


# glazing and balustrade must not block light into reveals/terraces in the bake: glass is thin, so only
# the balustrade is hidden; glazing stays as the emitter for the spill layer.
if balustrade:
    balustrade.hide_render = True
# the rooms are sealed behind opaque glass in the House's bakes: their lamps would only cost samples
for lamp in room_lamps:
    lamp.hide_render = True
if not args.no_bake:
    for layer in ("base", "spill"):
        set_layer(layer)
        # downlight discs emit in the base layer; hide in spill
        if downlights:
            downlights.hide_render = layer != "base"
        for ob, res in ((shell, MODE["res"]), (plinth, MODE["plinth_res"])):
            name = f"lm-{ob.name}-{layer}"
            bake_layer(ob, name, res, MODE["samples"])
            lightmaps.setdefault(ob.name, {})[layer] = f"{name}.ktx2"
            lap(f"bake {ob.name} {layer} {res}")
if balustrade:
    balustrade.hide_render = False
if downlights:
    downlights.hide_render = False


def pixels(img):
    """An image's linear RGB, as a float array."""
    px = np.empty(len(img.pixels), np.float32)
    img.pixels.foreach_get(px)
    return px.reshape(-1, 4)[:, :3]


def bake_room(room, res, samples):
    """An Interior's texture, <OUT>/<texture>.exr: its colour times its light, plus what glows. The light
    comes from its lamps and downlights, the House's downlights and the sky through its glass, which hides
    for the bake; it is denoised on its own, so the colours keep their edges. The other rooms' lamps stay
    off."""
    ob, name = room["ob"], room["texture"]
    set_layer("base")
    for lamp in room_lamps:
        lamp.hide_render = lamp not in room["lamps"]
    for g in glazing.values():
        g.hide_render = True
    bake_layer(ob, f"{name}-light", res, samples)
    bake_layer(ob, f"{name}-color", res, C.INTERIOR_COLOR_SAMPLES, passes=("COLOR",), denoise=False)
    bake_layer(ob, f"{name}-glow", res, C.INTERIOR_COLOR_SAMPLES, kind="EMIT", passes=(), denoise=False)
    light, color, glow = (pixels(bpy.data.images.load(os.path.join(OUT, f"{name}-{layer}.exr")))
                          for layer in ("light", "color", "glow"))
    for g in glazing.values():
        g.hide_render = False
    out = bpy.data.images.new(name, res, res, alpha=False, float_buffer=True)
    rgba = np.ones((res * res, 4), np.float32)
    rgba[:, :3] = (color * light + glow) * C.INTERIOR_EXPOSURE
    out.pixels.foreach_set(rgba.ravel())
    # as denoise.py writes the lightmaps: half-float RGB, linear, which ktx create encodes as UASTC HDR
    settings = scene.render.image_settings
    was = settings.file_format, settings.color_mode, settings.color_depth
    settings.file_format, settings.color_mode, settings.color_depth = "OPEN_EXR", "RGB", "16"
    out.save_render(os.path.join(OUT, f"{name}.exr"), scene=scene)
    settings.file_format, settings.color_mode, settings.color_depth = was
    print(f"  {name}: {os.path.getsize(os.path.join(OUT, f'{name}.exr')) / 1e6:.2f} MB exr", flush=True)


for room in ROOMS:
    ob = room["ob"]
    if not args.no_bake:
        bake_room(room, MODE["interior_res"], MODE["samples"])
        lap(f"bake {room['node']} {MODE['interior_res']}")
    # its colours are in its texture now: one material for the GLB, and one UV set, the texture's
    ob.data.materials.clear()
    ob.data.materials.append(mats["interior"])
    for p in ob.data.polygons:
        p.material_index = 0
    for layer in [l for l in ob.data.uv_layers if l.name != "lightmap"]:
        ob.data.uv_layers.remove(layer)
if terrace_glass:
    balustrade = join("balustrade", ([balustrade] if balustrade else []) + terrace_glass)


def split_site():
    """The site works' faces, baked on the shell's lightmap, as their own node: the Scene draws and measures
    them apart."""
    ob = bpy.data.objects.new("site", shell.data.copy())
    col.objects.link(ob)
    for target, keep in ((shell, False), (ob, True)):
        bm = bmesh.new()
        bm.from_mesh(target.data)
        layer = bm.faces.layers.int["site"]
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if bool(f[layer]) != keep], context="FACES")
        bm.to_mesh(target.data)
        bm.free()
        target.data.attributes.remove(target.data.attributes["site"])
    ob.data.name = "site"
    print(f"site: {len(ob.data.polygons)} faces, {sum(len(p.vertices) - 2 for p in ob.data.polygons)} tris", flush=True)
    return ob


site = split_site() if SITE else None
room_obs = [room["ob"] for room in ROOMS]
exported = [o for o in [shell, site, balustrade, downlights, plinth, *room_obs, *glazing.values()] if o]

# ---------------------------------------------------------------- export


def gltf(v):
    """House frame (z up, front -y) to glTF (y up, front +z)."""
    return [round(v[0], 4), round(v[2], 4), round(-v[1], 4)]


def interior_extras(room):
    return {"volume": room["volume"], "kind": room["furnishing"]["kind"], "texture": f"{room['texture']}.ktx2"}


root = bpy.data.objects.new(f"house:{SLUG}", None)
col.objects.link(root)
for o in exported:
    o.parent = root

corners = [o.matrix_world @ Vector(c) for o in exported if o is not plinth and o not in room_obs for c in o.bound_box]
lo = gltf((min(c.x for c in corners), max(c.y for c in corners), min(c.z for c in corners)))
hi = gltf((max(c.x for c in corners), min(c.y for c in corners), max(c.z for c in corners)))
extras = {
    "schemaVersion": DATA["schemaVersion"],
    "slug": SLUG,
    "mode": args.mode,
    "bakeHash": args.bake_hash,
    "datum": {"level": ENTRANCE, "plinth": round(PLINTH_Z, 4)},
    "bbox": {"min": lo, "max": hi},
    "glazingFaces": {
        name: {"size": [round(f["size"][0], 4), round(f["size"][1], 4)], "normal": gltf(f["normal"]),
               "bearing": bearings[name], "seen": f["seen"], "interior": f["interior"],
               "room": {"size": [round(f["room"][k], 4) for k in ("width", "height", "depth")],
                        "sill": round(f["room"]["sill"], 4)}}
        for name, f in glazing_faces.items()
    },
    "lightmaps": lightmaps,
    **({"interior": interior_extras(ROOMS[0])} if HERO else {}),
    **({"otherInteriors": [interior_extras(room) for room in ROOMS[1:]]} if len(ROOMS) > 1 else {}),
}

for o in scene.objects:
    o.select_set(o is root or o in exported)
glb = os.path.join(OUT, f"{SLUG}-raw.glb")
bpy.ops.export_scene.gltf(filepath=glb, export_format="GLB", use_selection=True, export_apply=True,
                          export_texcoords=True, export_normals=True, export_materials="EXPORT",
                          export_image_format="NONE", export_yup=True, export_lights=False, export_cameras=False)


def write_extras(path, node_name, value):
    """Set one node's extras in a GLB's JSON chunk. Done after export so numbers stay exact."""
    with open(path, "rb") as f:
        data = f.read()
    json_len, _ = struct.unpack_from("<II", data, 12)
    doc = json.loads(data[20 : 20 + json_len])
    rest = data[20 + json_len :]
    node = next(n for n in doc["nodes"] if n.get("name") == node_name)
    node["extras"] = value
    chunk = json.dumps(doc, separators=(",", ":")).encode()
    chunk += b" " * (-len(chunk) % 4)
    body = struct.pack("<II", len(chunk), 0x4E4F534A) + chunk + rest
    with open(path, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, 12 + len(body)) + body)


write_extras(glb, root.name, extras)
print(f"raw glb {os.path.getsize(glb) / 1e3:.0f} KB")
lap("export")

# ---------------------------------------------------------------- optional preview render

if args.preview:
    set_layer("base")
    glass_bsdf.inputs["Emission Strength"].default_value = C.WINDOW_SPILL_STRENGTH
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    col.objects.link(cam)
    cam.location = (-16, -34, 5)
    d = Vector((0, 0, 3.5)) - cam.location
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

with open(os.path.join(OUT, "timings.json"), "w") as f:
    json.dump({"mode": args.mode, **MODE, "texels_per_m": round(texels_per_m),
               "texels_per_m_unseen": round(texels_per_m_unseen), "unseen_m2": round(unseen_area), "tris": tris,
               "interiors": {room["node"]: {"texels_per_m": round(room["texels_per_m"]), "tris": room["tris"]}
                             for room in ROOMS},
               **timings}, f, indent=1)
