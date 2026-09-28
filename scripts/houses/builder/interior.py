"""The Interior's furniture kit and templates (docs/adr/0005-hero-interior-is-real-baked-geometry.md).

build.py furnishes the room shell of each of a House's Interiors with `furnish`: the kind's template, built
from one shared low-poly kit and sized from the room. Everything is laid out in the room frame: x along the
window wall from its left end seen from outside, y inward from that wall, z up from the finished floor. It
returns the parts, each of one material from this module's palette, and the room's lamps. build.py places
them in the House, joins them into the room's `interior` node with its walls, floor and ceiling, bakes them,
and then gives them the GLB's one `interior` material: after the bake, the room's colours are in its texture.

A lounge or a library with a fireplace puts it on the hearth wall, where the House's stone mass stands
outside the room, if it has one; a lounge with a TV puts it on the side wall it names; a bedroom with a
`bedside` puts the bed's head on that side wall, and its TV on the other; every other feature wall is the back
wall, facing the window.
"""

import math
import random

import bpy  # bpy must load before bmesh
import bmesh

import config as C

parts = []  # every piece of furniture, one material each
lamps = []  # the room's lights
glass = []  # the Glazing Faces in the room's side and back walls, (wall, u0, u1, sill, head)
doors = []  # the doors in them, (wall, u0, u1, head)
mats = {}

# ---------------------------------------------------------------- palette


def material(name, color, rough=0.7, emission=None, strength=0.0, metallic=0.0, node=None):
    name = f"room-{name}"
    if name in mats:
        return mats[name]
    m = bpy.data.materials.new(name)
    m.use_fake_user = True  # build.py purges orphans between making the palette and furnishing the room
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metallic
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1)
        bsdf.inputs["Emission Strength"].default_value = strength
    if node:
        node(m.node_tree, bsdf)
    mats[name] = m
    return m


def varied(scale, amount):
    """A node setup that breaks a flat colour with noise: `amount` either side of it."""

    def build(tree, bsdf):
        base = bsdf.inputs["Base Color"].default_value[:]
        noise = tree.nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = scale
        ramp = tree.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].color = tuple(c * (1 - amount) for c in base[:3]) + (1,)
        ramp.color_ramp.elements[1].color = tuple(min(1.0, c * (1 + amount)) for c in base[:3]) + (1,)
        tree.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
        tree.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])

    return build


def planks(width):
    """Boards `width` wide in the House's plan, each its own shade, with a hairline joint."""

    def build(tree, bsdf):
        base = bsdf.inputs["Base Color"].default_value[:3]
        coord = tree.nodes.new("ShaderNodeTexCoord")
        brick = tree.nodes.new("ShaderNodeTexBrick")
        brick.offset = 0.37
        brick.inputs["Scale"].default_value = 1.0
        brick.inputs["Brick Width"].default_value = 2.2
        brick.inputs["Row Height"].default_value = width
        brick.inputs["Mortar Size"].default_value = 0.004
        brick.inputs["Color1"].default_value = (*[c * 0.85 for c in base], 1)
        brick.inputs["Color2"].default_value = (*[c * 1.1 for c in base], 1)
        brick.inputs["Mortar"].default_value = (*[c * 0.4 for c in base], 1)
        tree.links.new(coord.outputs["Object"], brick.inputs["Vector"])
        tree.links.new(brick.outputs["Color"], bsdf.inputs["Base Color"])

    return build


BOOKS = [(0.3, 0.08, 0.05), (0.08, 0.12, 0.18), (0.45, 0.38, 0.25), (0.1, 0.16, 0.1), (0.55, 0.52, 0.45),
         (0.2, 0.18, 0.16), (0.4, 0.22, 0.08)]


def spines(tree, bsdf):
    """A row of books is one box: its colour changes every spine's width along either plan axis, and
    from one shelf to the next."""
    coord = tree.nodes.new("ShaderNodeTexCoord")
    scale = tree.nodes.new("ShaderNodeVectorMath")
    scale.operation = "MULTIPLY"
    scale.inputs[1].default_value = (1 / 0.035, 1 / 0.035, 1 / 0.4)
    snap = tree.nodes.new("ShaderNodeVectorMath")
    snap.operation = "FLOOR"
    noise = tree.nodes.new("ShaderNodeTexWhiteNoise")
    noise.noise_dimensions = "3D"
    ramp = tree.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.interpolation = "CONSTANT"
    elements = ramp.color_ramp.elements
    elements[0].color = (*BOOKS[0], 1)
    elements[1].position = 1 / len(BOOKS)
    elements[1].color = (*BOOKS[1], 1)
    for i, c in enumerate(BOOKS[2:], start=2):
        elements.new(i / len(BOOKS)).color = (*c, 1)
    tree.links.new(coord.outputs["Object"], scale.inputs[0])
    tree.links.new(scale.outputs["Vector"], snap.inputs[0])
    tree.links.new(snap.outputs["Vector"], noise.inputs["Vector"])
    tree.links.new(noise.outputs["Value"], ramp.inputs["Fac"])
    tree.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])


def palette():
    lamp = C.oklch_to_linear(*C.INTERIOR_LAMP)
    fire = C.oklch_to_linear(*C.INTERIOR_FIRE)
    stone = C.MATERIALS["stone"][0]
    material("plaster", (0.62, 0.58, 0.52), 0.95)
    material("oak", (0.36, 0.2, 0.09), 0.45, node=planks(0.19))
    material("ceiling", (0.46, 0.23, 0.10), 0.6, node=planks(0.12))  # the soffits' timber, carried inside
    material("walnut", (0.13, 0.065, 0.035), 0.4)
    material("wool", (0.075, 0.07, 0.068), 0.95, node=varied(40, 0.25))
    material("linen", (0.5, 0.45, 0.38), 0.9, node=varied(30, 0.15))
    material("rust", (0.35, 0.1, 0.04), 0.9)
    material("rug", (0.3, 0.27, 0.23), 1.0, node=varied(12, 0.2))
    material("stone", stone, 0.85, node=varied(6, 0.3))
    material("hearth", tuple(c * 0.6 for c in stone), 0.6)
    material("soot", (0.012, 0.011, 0.01), 1.0)
    material("black", (0.02, 0.02, 0.022), 0.4, metallic=0.5)
    material("brass", (0.6, 0.42, 0.18), 0.3, metallic=1.0)
    material("ceramic", (0.7, 0.68, 0.64), 0.3)
    material("canvas-dark", (0.2, 0.23, 0.26), 0.9)
    material("canvas-warm", (0.62, 0.48, 0.32), 0.9)
    material("bedding", (0.72, 0.7, 0.66), 0.9, node=varied(25, 0.1))
    material("books", (0.3, 0.2, 0.15), 0.8, node=spines)
    material("screen", (0.006, 0.006, 0.007), 0.2)
    screen = C.oklch_to_linear(*C.INTERIOR_SCREEN)
    material("monitor", (0.01, 0.012, 0.015), 0.2, emission=screen, strength=C.INTERIOR_SCREEN_GLOW)
    material("leaf", (0.035, 0.075, 0.03), 0.7, node=varied(9, 0.35))
    material("stoneware", (0.3, 0.25, 0.2), 0.5, node=varied(20, 0.15))
    material("glaze", (0.16, 0.22, 0.2), 0.3)
    material("wax", (0.78, 0.74, 0.66), 0.6)
    material("shade", (0.8, 0.7, 0.55), 0.8, emission=lamp, strength=C.INTERIOR_SHADE_GLOW)
    material("disc", lamp, 0.5, emission=lamp, strength=C.INTERIOR_DISC_GLOW)
    material("fire", fire, 1.0, emission=fire, strength=C.INTERIOR_FIRE_GLOW)


# ---------------------------------------------------------------- the kit


def mesh(name, bm, mat):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    me.materials.append(mats[f"room-{mat}"])
    parts.append(ob)
    return ob


def box(x0, y0, z0, x1, y1, z1, mat, soft=0.0):
    """An axis-aligned box. `soft` chamfers its edges once, for upholstery."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x = x0 if v.co.x < 0 else x1
        v.co.y = y0 if v.co.y < 0 else y1
        v.co.z = z0 if v.co.z < 0 else z1
    if soft:
        w = min(soft, (x1 - x0) / 2.5, (y1 - y0) / 2.5, (z1 - z0) / 2.5)
        bmesh.ops.bevel(bm, geom=bm.edges[:], offset=w, segments=1, affect="EDGES", clamp_overlap=True)
    return mesh("box", bm, mat)


def cyl(x, y, z0, z1, r, mat, verts=8, r_top=None):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=verts, radius1=r, radius2=r if r_top is None else r_top,
                          depth=z1 - z0)
    bmesh.ops.translate(bm, verts=bm.verts, vec=(x, y, (z0 + z1) / 2))
    return mesh("cyl", bm, mat)


def light(kind, x, y, z, watts, color, radius=0.05, **settings):
    data = bpy.data.lights.new(f"room-{kind.lower()}", kind)
    data.energy = watts
    data.color = color
    data.shadow_soft_size = radius
    for k, v in settings.items():
        setattr(data, k, v)
    ob = bpy.data.objects.new("room-lamp", data)
    ob.location = (x, y, z)
    bpy.context.scene.collection.objects.link(ob)
    lamps.append(ob)
    return ob


def lamp_light():
    return C.oklch_to_linear(*C.INTERIOR_LAMP)


class Frame:
    """A local frame on the floor at (x, y), turned so local -y faces `facing` ("window", "back", "left",
    "right"): a sofa's seat, a chair's front."""

    TURNS = {"window": 0, "right": 90, "back": 180, "left": 270}

    def __init__(self, x, y, facing="window"):
        self.x, self.y = x, y
        a = math.radians(self.TURNS[facing])
        self.c, self.s = math.cos(a), math.sin(a)

    def at(self, u, v):
        return (self.x + u * self.c - v * self.s, self.y + u * self.s + v * self.c)

    def box(self, u0, v0, z0, u1, v1, z1, mat, soft=0.0):
        (xa, ya), (xb, yb) = self.at(u0, v0), self.at(u1, v1)
        return box(min(xa, xb), min(ya, yb), z0, max(xa, xb), max(ya, yb), z1, mat, soft)

    def cyl(self, u, v, z0, z1, r, mat, verts=8, r_top=None):
        x, y = self.at(u, v)
        return cyl(x, y, z0, z1, r, mat, verts, r_top)


class Wall:
    """One wall of the room, as a frame: `u` runs along it, `v` out from it into the room. `toward` is the
    facing that looks at it, `away` the one that turns its back on it, and `plus`/`minus` look along +u/-u."""

    def __init__(self, name, w, d):
        self.name = name
        self.length = w if name == "back" else d
        self.toward = name
        self.away = {"back": "window", "left": "right", "right": "left"}[name]
        self.plus, self.minus = ("right", "left") if name == "back" else ("back", "window")
        self.w, self.d = w, d

    def point(self, u, v):
        if self.name == "back":
            return (u, self.d - v)
        if self.name == "left":
            return (v, u)
        return (self.w - v, u)

    def box(self, u0, v0, z0, u1, v1, z1, mat, soft=0.0):
        (xa, ya), (xb, yb) = self.point(u0, v0), self.point(u1, v1)
        return box(min(xa, xb), min(ya, yb), z0, max(xa, xb), max(ya, yb), z1, mat, soft)

    def frame(self, u, v, facing):
        return Frame(*self.point(u, v), facing)


def sofa(f, length, cushion="linen", accent="rust"):
    """Low and deep, seat toward local -y. Its back is at local +y."""
    h, d = length / 2, 0.95
    f.box(-h, -d / 2, 0.08, h, d / 2, 0.36, "wool")  # plinth
    f.box(-h, d / 2 - 0.2, 0.36, h, d / 2, 0.74, "wool", soft=0.03)  # back
    for s in (-1, 1):
        f.box(s * h - (0.18 if s > 0 else 0), -d / 2, 0.36, s * h + (0.18 if s < 0 else 0), d / 2, 0.58, "wool", soft=0.03)
    n = 2 if length < 2.2 else 3
    inner = (length - 0.36) / n
    for i in range(n):
        u0 = -h + 0.18 + i * inner
        f.box(u0 + 0.01, -d / 2 + 0.02, 0.36, u0 + inner - 0.01, d / 2 - 0.2, 0.47, "wool", soft=0.04)
        f.box(u0 + 0.03, d / 2 - 0.36, 0.47, u0 + inner - 0.03, d / 2 - 0.2, 0.72, cushion, soft=0.05)
    f.box(-h + 0.22, d / 2 - 0.42, 0.47, -h + 0.66, d / 2 - 0.3, 0.8, accent, soft=0.05)  # a throw pillow
    for u in (-h + 0.06, h - 0.06):
        for v in (-d / 2 + 0.06, d / 2 - 0.06):
            f.cyl(u, v, 0.0, 0.08, 0.025, "black", verts=6)


def armchair(f, fabric="linen"):
    h, d = 0.43, 0.85
    f.box(-h, -d / 2, 0.1, h, d / 2, 0.4, fabric, soft=0.04)
    f.box(-h, d / 2 - 0.18, 0.4, h, d / 2, 0.8, fabric, soft=0.04)
    for s in (-1, 1):
        f.box(s * h - (0.14 if s > 0 else 0), -d / 2, 0.4, s * h + (0.14 if s < 0 else 0), d / 2, 0.6, fabric, soft=0.03)
    for u in (-h + 0.06, h - 0.06):
        for v in (-d / 2 + 0.06, d / 2 - 0.06):
            f.cyl(u, v, 0.0, 0.1, 0.02, "walnut", verts=6)


def table(f, w, d, height, top="walnut", legs="walnut", thick=0.04):
    f.box(-w / 2, -d / 2, height - thick, w / 2, d / 2, height, top)
    for u in (-w / 2 + 0.06, w / 2 - 0.06):
        for v in (-d / 2 + 0.06, d / 2 - 0.06):
            f.box(u - 0.025, v - 0.025, 0.0, u + 0.025, v + 0.025, height - thick, legs)


def chair(f):
    f.box(-0.23, -0.22, 0.43, 0.23, 0.22, 0.47, "walnut")
    f.box(-0.23, 0.18, 0.47, 0.23, 0.22, 0.85, "walnut")
    for u in (-0.2, 0.2):
        for v in (-0.19, 0.19):
            f.box(u - 0.015, v - 0.015, 0.0, u + 0.015, v + 0.015, 0.43, "walnut")


def lampshade(ob):
    """A glowing shade lets its lamp's light through: it casts no shadow."""
    ob.visible_shadow = False
    return ob


def floor_lamp(f):
    """A tall lamp with a glowing linen shade."""
    f.cyl(0, 0, 0.0, 0.03, 0.16, "black")
    f.cyl(0, 0, 0.03, 1.38, 0.012, "brass", verts=6)
    lampshade(f.cyl(0, 0, 1.3, 1.62, 0.23, "shade", verts=12, r_top=0.18))
    x, y = f.at(0, 0)
    light("POINT", x, y, 1.45, C.INTERIOR_LAMP_WATTS, lamp_light(), radius=0.1)


def pendant(x, y, z, ceiling):
    """A shade hung from the ceiling, its bottom at z."""
    cyl(x, y, z + 0.3, ceiling, 0.006, "black", verts=4)
    lampshade(cyl(x, y, z, z + 0.3, 0.3, "shade", verts=12, r_top=0.08))
    light("POINT", x, y, z + 0.1, C.INTERIOR_LAMP_WATTS * 1.3, lamp_light(), radius=0.12)


def table_lamp(f, z):
    f.cyl(0, 0, z, z + 0.3, 0.06, "ceramic")
    lampshade(f.cyl(0, 0, z + 0.28, z + 0.5, 0.16, "shade", verts=12, r_top=0.13))
    x, y = f.at(0, 0)
    light("POINT", x, y, z + 0.4, C.INTERIOR_LAMP_WATTS * 0.5, lamp_light(), radius=0.07)


def rug(x0, y0, x1, y1):
    box(x0, y0, 0.0, x1, y1, 0.012, "rug")


def vase(f, z):
    f.cyl(0, 0, z, z + 0.26, 0.07, "ceramic", r_top=0.04)


def books(wall, u0, u1, v0, v1, z, height, rng):
    """A shelf's books along a wall: runs of spines, each run one box, with gaps and the odd vase."""
    u = u0 + rng.uniform(0.0, 0.1)
    while u < u1 - 0.1:
        if rng.random() < 0.15:
            if rng.random() < 0.5 and u1 - u > 0.3:
                x, y = wall.point(u + 0.1, (v0 + v1) / 2)
                cyl(x, y, z, z + height * 0.6, 0.06, "ceramic", r_top=0.04)
            u += rng.uniform(0.15, 0.3)
            continue
        run = min(rng.uniform(0.25, 0.6), u1 - u)
        wall.box(u, v0 + rng.uniform(0.0, 0.03), z, u + run, v1, z + height * rng.uniform(0.7, 0.95), "books")
        u += run + 0.01


def shelving(wall, u0, u1, depth, top, rng):
    """Walnut shelves against a wall, from u0 to u1 along it and the floor to `top`, full of books."""
    n = max(2, round((top - 0.12) / 0.36))
    pitch = (top - 0.12) / n
    bays = max(1, round((u1 - u0) / 0.9))
    for i in range(bays + 1):
        u = u0 + (u1 - u0) * i / bays
        wall.box(u - 0.015, 0.0, 0.0, u + 0.015, depth, top, "walnut")
    for j in range(n + 1):
        z = 0.1 + j * pitch
        wall.box(u0, 0.0, z, u1, depth, z + 0.025, "walnut")
    wall.box(u0, depth - 0.02, 0.0, u1, depth, 0.1, "walnut")  # plinth
    for i in range(bays):
        ua, ub = u0 + (u1 - u0) * i / bays + 0.02, u0 + (u1 - u0) * (i + 1) / bays - 0.02
        for j in range(n):
            books(wall, ua, ub, 0.02, depth - 0.02, 0.125 + j * pitch, pitch - 0.04, rng)


def fireplace(wall, c, width, ceiling):
    """A stone chimney breast on a wall, floor to ceiling, round a lit firebox, with a hearth."""
    depth, opening, head, sill = 0.55, min(1.1, width * 0.55), 0.75, 0.35
    u0, u1 = c - width / 2, c + width / 2
    o0, o1 = c - opening / 2, c + opening / 2
    wall.box(u0, 0.0, 0.0, o0, depth, ceiling, "stone")
    wall.box(o1, 0.0, 0.0, u1, depth, ceiling, "stone")
    wall.box(o0, 0.0, sill + head, o1, depth, ceiling, "stone")
    wall.box(o0, 0.0, 0.0, o1, depth, sill, "stone")
    wall.box(o0, 0.0, sill, o1, 0.1, sill + head, "soot")  # the firebox's back
    wall.box(u0 - 0.2, depth, 0.0, u1 + 0.2, depth + 0.45, 0.06, "hearth")
    for i, (du, r) in enumerate([(-0.2, 0.06), (0.05, 0.07), (0.25, 0.055)]):
        v = depth - 0.22 - 0.03 * i
        wall.box(c + du - 0.18, v - 2 * r, sill, c + du + 0.18, v, sill + 2 * r, "walnut")
    wall.box(c - 0.3, depth - 0.36, sill + 0.08, c + 0.3, depth - 0.28, sill + 0.34, "fire")
    x, y = wall.point(c, depth - 0.1)
    light("POINT", x, y, sill + 0.3, C.INTERIOR_FIRE_WATTS, C.oklch_to_linear(*C.INTERIOR_FIRE), radius=0.25)


def television(wall, c):
    """A dark wall TV in a thin black frame, centred at c along a wall, over a long, low walnut media unit."""
    tw, th, z = C.TV_WIDTH, C.TV_HEIGHT, 0.7
    wall.box(c - 1.3, 0.0, 0.0, c + 1.3, 0.42, 0.45, "walnut")
    wall.box(c - 1.28, 0.42, 0.06, c + 1.28, 0.425, 0.43, "black")  # the unit's doors, a shadow gap round them
    wall.box(c - tw / 2, 0.02, z, c + tw / 2, 0.06, z + th, "black")
    wall.box(c - tw / 2 + 0.015, 0.06, z + 0.015, c + tw / 2 - 0.015, 0.065, z + th - 0.015, "screen")


def artwork(wall, c, z, w, h):
    """A quiet abstract canvas in a black frame: two fields of colour."""
    wall.box(c - w / 2 - 0.02, 0.0, z - 0.02, c + w / 2 + 0.02, 0.04, z + h + 0.02, "black")
    wall.box(c - w / 2, 0.0, z, c + w / 2, 0.045, z + h * 0.45, "canvas-warm")
    wall.box(c - w / 2, 0.0, z + h * 0.45, c + w / 2, 0.045, z + h, "canvas-dark")


def partition(w, h, v, door, pivot=False):
    """A plastered wall across the room, its near face `v` in from the window wall, with a closed walnut
    door from u = door along it: a hinged door with a lever handle, or a wide, tall pivot door set nearly
    flush with the wall, with a long pull."""
    t = C.PARTITION_THICKNESS
    dw, dh = (C.PIVOT_WIDTH, min(C.PIVOT_HEIGHT, h - 0.3)) if pivot else (C.DOOR_WIDTH, C.DOOR_HEIGHT)
    box(0.0, v, 0.0, door, v + t, h, "plaster")
    box(door + dw, v, 0.0, w, v + t, h, "plaster")
    box(door, v, dh, door + dw, v + t, h, "plaster")
    inset = 0.015 if pivot else 0.04
    box(door, v + inset, 0.0, door + dw, v + t - inset, dh, "walnut")
    for y0, y1 in ((v - 0.05, v + inset), (v + t - inset, v + t + 0.05)):  # a handle either side
        if pivot:
            box(door + dw - 0.2, y0, 0.5, door + dw - 0.16, y1, 2.0, "brass")
        else:
            box(door + dw - 0.14, y0, 1.0, door + dw - 0.08, y1, 1.03, "brass")


def side_door(w, d, beside, hearth, limit):
    """A closed walnut door into the room beside this one, on a wall another volume stands against: the one
    away from the fire if there is a choice, towards the back of what the room sees of it, short of `limit`
    (a partition, or the back wall)."""
    dw, dh = C.DOOR_WIDTH, C.DOOR_HEIGHT
    # a side wall's span runs in from the window, so a partition cuts it short; the back wall is behind one
    spans = [(name, u0, u1 if name == "back" else min(u1, limit)) for name, u0, u1 in beside
             if name != "back" or limit >= d]
    fits = [(name, u0, u1) for name, u0, u1 in spans if u1 - u0 >= dw + 1.2]
    if not fits:
        raise SystemExit(f"interior: a door needs a wall another volume stands against, and none fits: {beside}")
    name, u0, u1 = sorted(fits, key=lambda f: (hearth is not None and f[0] == hearth[0], f[0] == "back"))[0]
    a = max(u0 + 0.6, u1 - 0.8 - dw)
    wall_door(Wall(name, w, d), a, dw, dh)


def wall_door(wall, a, width, height):
    """A closed walnut door on a wall, from u = a along it, with a brass lever."""
    wall.box(a, 0.0, 0.0, a + width, 0.04, height, "walnut")
    lever = a + 0.08 if wall.name == "right" else a + width - 0.14  # on the leaf's far side from its hinges
    wall.box(lever, 0.04, 1.0, lever + 0.06, 0.1, 1.03, "brass")


def crockery(wall, u0, u1, v0, v1, z, height, rng):
    """A kitchen shelf's things along a wall: stacks of plates, nested bowls and rows of jars, with gaps."""
    u, v = u0 + rng.uniform(0.0, 0.1), (v0 + v1) / 2
    while u < u1 - 0.25:
        pick = rng.random()
        if pick < 0.2:
            u += rng.uniform(0.15, 0.35)
        elif pick < 0.45:  # a stack of plates
            r = min(rng.uniform(0.1, 0.12), (v1 - v0) / 2)
            cyl(*wall.point(u + r, v), z, z + rng.uniform(0.04, 0.1), r, "ceramic", verts=10)
            u += 2 * r + 0.04
        elif pick < 0.7:  # bowls, nested
            r = min(rng.uniform(0.08, 0.11), (v1 - v0) / 2)
            cyl(*wall.point(u + r, v), z, z + r * 0.7, r * 0.55, rng.choice(("stoneware", "ceramic")), verts=8,
                r_top=r)
            u += 2 * r + 0.04
        else:  # jars
            for _ in range(rng.randint(2, 4)):
                cyl(*wall.point(u + 0.045, v), z, z + rng.uniform(0.12, height * 0.8), 0.045,
                    rng.choice(("glaze", "stoneware")), verts=6)
                u += 0.105
            u += 0.05


def worktop(wall, u0, u1, h, o, rng):
    """A kitchen run along a wall from u0 to u1, C.WORKTOP_DEPTH deep: base units and a stone worktop with a
    cutting board and bowls on it, a splashback, and open shelves of crockery (with `shelving`) or cupboards
    above."""
    wall.box(u0, 0.0, 0.0, u1, 0.62, 0.86, "walnut")
    wall.box(u0, 0.0, 0.86, u1, C.WORKTOP_DEPTH, 0.9, "stone")
    wall.box(u0, 0.0, 0.9, u1, 0.02, 1.5, "ceramic")  # splashback
    board = u0 + (u1 - u0) * 0.3
    wall.box(board - 0.24, 0.12, 0.9, board + 0.24, 0.46, 0.925, "oak")
    for f, r, mat in ((0.62, 0.15, "stoneware"), (0.68, 0.1, "ceramic")):
        cyl(*wall.point(u0 + (u1 - u0) * f, 0.3), 0.9, 0.9 + r * 0.6, r * 0.55, mat, verts=10, r_top=r)
    if o.get("shelving"):
        for z in (1.62, 2.02):
            wall.box(u0 + 0.2, 0.0, z, u1 - 0.2, 0.28, z + 0.03, "walnut")
            crockery(wall, u0 + 0.3, u1 - 0.3, 0.02, 0.26, z + 0.03, 0.3, rng)
    else:
        wall.box(u0, 0.0, 1.55, u1, 0.36, min(h - 0.05, 2.35), "walnut")


def wardrobe(wall, u0, u1, top):
    """Built-in walnut doors against a wall, floor to `top`, a brass pull on every door."""
    depth = 0.6
    wall.box(u0, 0.0, 0.0, u1, depth, top, "walnut")
    n = max(2, round((u1 - u0) / 0.55))
    for i in range(n):
        a, b = u0 + (u1 - u0) * i / n, u0 + (u1 - u0) * (i + 1) / n
        if i:
            wall.box(a - 0.004, depth, 0.02, a + 0.004, depth + 0.004, top - 0.02, "black")  # the door joint
        pull = b - 0.05 if i % 2 == 0 else a + 0.05
        wall.box(pull - 0.012, depth, 0.9, pull + 0.012, depth + 0.03, 1.3, "brass")


def downlights(w, h, d, skip=None):
    """Recessed downlights in rows across the ceiling, the front row a pitch in from the glass, none within
    a pitch's third of `skip` (a wall across the room, as the span of v it stands on)."""
    pitch = C.INTERIOR_DOWNLIGHT_PITCH
    nx = max(1, round(w / pitch))
    for i in range(nx):
        x = w * (i + 0.5) / nx
        y = pitch * 0.75
        while y < d - 0.4:
            if skip and skip[0] - pitch / 3 < y < skip[1] + pitch / 3:
                y += pitch
                continue
            cyl(x, y, h - 0.005, h, 0.05, "disc", verts=8)
            light("SPOT", x, y, h - 0.02, C.INTERIOR_DOWNLIGHT_WATTS, lamp_light(), radius=0.03,
                  spot_size=math.radians(110), spot_blend=0.8)
            y += pitch


def desk(wall, c):
    """A long walnut desk against a wall, centred at c along it, with a drawer unit at one end: a slim monitor
    on a stand, whose screen glows a dim, cool blue, a keyboard, a brass task lamp and a desk chair."""
    n, dd, top = C.DESK_LENGTH / 2, 0.75, 0.74
    wall.box(c - n, 0.0, top - 0.04, c + n, dd, top, "walnut")
    wall.box(c - n, 0.02, 0.0, c - n + 0.04, dd - 0.04, top - 0.04, "walnut")  # the leg at the open end
    wall.box(c + n - 0.55, 0.02, 0.0, c + n, dd - 0.04, top - 0.04, "walnut")  # the drawers
    for z in (0.24, 0.47):
        wall.box(c + n - 0.53, dd - 0.04, z - 0.004, c + n - 0.02, dd - 0.036, z + 0.004, "black")  # drawer joints
    wall.box(c + n - 0.33, dd - 0.04, 0.58, c + n - 0.23, dd - 0.02, 0.6, "brass")
    m = c - 0.25  # the monitor, a little toward the open end
    wall.box(m - 0.12, 0.14, top, m + 0.12, 0.34, top + 0.012, "black")  # its foot
    wall.box(m - 0.03, 0.16, top, m + 0.03, 0.19, top + 0.2, "black")  # its neck
    wall.box(m - 0.31, 0.19, top + 0.12, m + 0.31, 0.215, top + 0.48, "black")
    wall.box(m - 0.3, 0.215, top + 0.13, m + 0.3, 0.218, top + 0.47, "monitor")
    x, y = wall.point(m, 0.4)
    light("POINT", x, y, top + 0.3, C.INTERIOR_SCREEN_WATTS, C.oklch_to_linear(*C.INTERIOR_SCREEN), radius=0.2)
    wall.box(m - 0.22, 0.42, top, m + 0.22, 0.56, top + 0.018, "black")  # the keyboard
    # the task lamp, over the drawer end: a brass post, an arm out over the desk, a small brass shade
    lamp = wall.frame(c + n - 0.3, 0.16, wall.away)
    lamp.cyl(0, 0, top, top + 0.02, 0.08, "brass", verts=10)
    lamp.cyl(0, 0, top + 0.02, top + 0.46, 0.01, "brass", verts=6)
    wall.box(c + n - 0.31, 0.16, top + 0.44, c + n - 0.29, 0.42, top + 0.46, "brass")
    shade = wall.frame(c + n - 0.3, 0.42, wall.away)
    shade.cyl(0, 0, top + 0.34, top + 0.46, 0.08, "brass", verts=10, r_top=0.035)
    lampshade(shade.cyl(0, 0, top + 0.335, top + 0.34, 0.075, "shade", verts=10))
    x, y = wall.point(c + n - 0.3, 0.42)
    light("POINT", x, y, top + 0.3, C.INTERIOR_LAMP_WATTS * 0.35, lamp_light(), radius=0.05)
    desk_chair(wall.frame(m, 1.05, wall.toward))


def desk_chair(f):
    """A task chair, seat toward local -y: wool seat and back on a black post and a five-spoked foot."""
    f.cyl(0, 0, 0.0, 0.06, 0.3, "black", verts=5)
    f.cyl(0, 0, 0.06, 0.42, 0.025, "black", verts=6)
    f.box(-0.24, -0.23, 0.42, 0.24, 0.23, 0.5, "wool", soft=0.03)
    f.box(-0.22, 0.2, 0.55, 0.22, 0.26, 0.98, "wool", soft=0.03)
    f.box(-0.03, 0.2, 0.45, 0.03, 0.24, 0.55, "black")  # the back's stem


def daybed(wall, c, length):
    """A low walnut daybed against a wall, centred at c along it, under a window's sill: a linen mattress, a
    wool bolster along the wall and two cushions."""
    n, dd = length / 2, 0.85
    wall.box(c - n, 0.0, 0.08, c + n, dd, 0.28, "walnut")
    for u in (c - n + 0.06, c + n - 0.06):
        for v in (0.06, dd - 0.06):
            wall.box(u - 0.025, v - 0.025, 0.0, u + 0.025, v + 0.025, 0.08, "black")
    wall.box(c - n + 0.02, 0.02, 0.28, c + n - 0.02, dd - 0.02, 0.42, "linen", soft=0.04)
    wall.box(c - n + 0.05, 0.02, 0.42, c + n - 0.05, 0.24, 0.6, "wool", soft=0.06)  # the bolster
    wall.box(c - n + 0.12, 0.2, 0.42, c - n + 0.58, 0.34, 0.66, "rust", soft=0.05)
    wall.box(c + n - 0.62, 0.2, 0.42, c + n - 0.14, 0.34, 0.64, "linen", soft=0.05)


def plant(x, y):
    """A large plant in a dark pot: a slender stem and loose clumps of broad leaves, about 1.8 m high."""
    cyl(x, y, 0.0, 0.5, 0.26, "black", verts=10, r_top=0.3)
    cyl(x, y, 0.46, 0.49, 0.27, "soot", verts=10)
    cyl(x, y, 0.49, 1.45, 0.018, "walnut", verts=5)
    for dx, dy, z, s in ((0.14, -0.08, 0.72, 0.36), (-0.16, 0.05, 0.9, 0.4), (0.06, 0.16, 1.1, 0.38),
                         (-0.05, -0.15, 1.28, 0.34), (0.12, 0.04, 1.45, 0.3), (-0.06, 0.02, 1.6, 0.26)):
        box(x + dx - s / 2, y + dy - s / 2, z, x + dx + s / 2, y + dy + s / 2, z + s * 0.6, "leaf", soft=0.08)


def pot_plant(x, y, rng):
    """A smaller plant by the glass, about 1.1 m high: a pale stoneware pot and three or four clumps of leaves."""
    cyl(x, y, 0.0, 0.42, 0.17, "ceramic", verts=10, r_top=0.2)
    cyl(x, y, 0.38, 0.4, 0.19, "soot", verts=10)
    for i in range(rng.randint(3, 4)):
        s = rng.uniform(0.28, 0.36)
        dx, dy, z = rng.uniform(-0.1, 0.1), rng.uniform(-0.1, 0.1), 0.42 + i * 0.17
        box(x + dx - s / 2, y + dy - s / 2, z, x + dx + s / 2, y + dy + s / 2, z + s * 0.6, "leaf", soft=0.08)


def window_plants(w, rng):
    """Two pot plants by the glass, one in each corner of the window wall."""
    for x in (0.4, w - 0.4):
        pot_plant(x, 0.4, rng)


def free_canvas(w, h, d, back=None):
    """A canvas on the side wall with the longest run clear of glass and doors, in front of what stands along
    the back wall `back` deep; none where no run is long enough."""
    runs = []
    for name in ("left", "right"):
        spans = [(0.3, d - (back or 0.0) - 0.3)]
        for g in [*glass, *doors]:
            if g[0] == name:
                spans = [piece for a, b in spans for piece in ((a, min(b, g[1] - 0.15)), (max(a, g[2] + 0.15), b))]
        runs += [(b - a, name, a, b) for a, b in spans]
    length, name, a, b = max(runs)
    if length >= 1.2:
        artwork(Wall(name, w, d), (a + b) / 2, 1.3, min(1.4, length - 0.4), min(0.9, h - 2.0))



# ---------------------------------------------------------------- templates, one per kind


def feature_wall(w, d, o, hearth):
    """The wall a template turns to: the hearth wall for a fireplace, when the House has one, the side wall it
    names for a TV, or else the back wall. Returns it, the middle of what the room sees of it, and that span's
    length."""
    if o.get("tv"):
        name, u0, u1 = o["tv"], 0.0, d
    else:
        name, u0, u1 = hearth if hearth and o.get("fireplace") else ("back", 0.0, w)
    return Wall(name, w, d), (u0 + u1) / 2, u1 - u0


def lounge(w, h, d, o, hearth, rng):
    """Seating round the fire, round a TV on a side wall, or round a table facing the back wall, with shelving
    and a lamp. A partition stands in for the back wall, with a wide pivot door in it off-centre, on the side
    away from the fire, and leaves the room behind it empty."""
    # the plaster of the back wall, from u0 to u1: all of it, or the partition's either side of its door
    u0, u1 = 0.0, w
    if o.get("partition"):
        d = o["partition"]
        # the stone behind the room's back wall is behind the partition; on a side wall, clip it at the partition
        if hearth and hearth[0] == "back" and o.get("fireplace"):
            raise SystemExit("interior: the stone stands behind the back wall, behind the partition: no wall for the fire")
        if hearth and hearth[0] == "back":
            hearth = None
        elif hearth:
            hearth = (hearth[0], hearth[1], min(hearth[2], d)) if min(hearth[2], d) - hearth[1] >= 1.2 else None
        left = hearth and o.get("fireplace") and hearth[0] == "right"
        door = 1.0 if left else w - 1.0 - C.PIVOT_WIDTH
        partition(w, h, d, door, pivot=True)
        u0, u1 = (door + C.PIVOT_WIDTH, w) if left else (0.0, door)
    wall, c, span = feature_wall(w, d, o, hearth)
    back = Wall("back", w, d)
    breast = min(2.4, span, wall.length * 0.36)
    if o.get("fireplace"):
        fireplace(wall, c, breast, h)
    if o.get("tv"):
        television(wall, c)
    top = min(3.2, h - 0.3)
    # the seating's distance from the feature wall
    v = min(2.4, (w if wall.name != "back" else d) / 3)
    if wall.name != "back":
        # the fire or the TV is on a side wall: shelving, or a canvas over a sideboard, across from the window;
        # beside a TV, behind the seating that faces it, which is where the glass looks
        m = (u0 + u1) / 2
        if o.get("tv"):
            m = wall.point(0.0, (v + 1.3) / 2)[0]
        if o.get("shelving"):
            shelving(back, u0 + 0.4, u1 - 0.4, 0.36, top, rng)
        else:
            back.box(m - 1.2, 0.0, 0.0, m + 1.2, 0.45, 0.75, "walnut")
            artwork(back, m, 1.3, min(1.8, (u1 - u0) * 0.4), 1.2)
    elif o.get("shelving"):
        side = (w - breast) / 2 - 0.4 if o.get("fireplace") else min(2.2, w / 2 - 0.2)
        if o.get("fireplace") and side > 0.8:
            shelving(back, 0.2, 0.2 + min(side, 2.4), 0.36, top, rng)
            shelving(back, w - 0.2 - min(side, 2.4), w - 0.2, 0.36, top, rng)
        elif not o.get("fireplace"):
            shelving(back, c - side, c + side, 0.36, top, rng)
    elif not o.get("fireplace"):
        artwork(back, c, 1.3, min(1.6, w * 0.3), 1.0)
    # a sofa across from the feature wall, armchairs either side, a table between
    length = min(2.4, max(1.6, wall.length * 0.3))
    sofa(wall.frame(c, v + 1.3, wall.toward), length)
    armchair(wall.frame(c - length / 2 - 0.35, v, wall.plus))
    armchair(wall.frame(c + length / 2 + 0.35, v, wall.minus), fabric="rust")
    table(wall.frame(c, v + 0.1, wall.toward), 1.1, 0.7, 0.36, top="stone")
    wall.box(c - length / 2 - 0.9, v - 1.0, 0.0, c + length / 2 + 0.9, v + 1.9, 0.012, "rug")
    side_table = wall.frame(c - length / 2 - 0.45, v + 1.4, wall.toward)
    table(side_table, 0.45, 0.45, 0.5)
    vase(side_table, 0.5)
    if o.get("lamp") == "pendant":
        x, y = wall.point(c, v + 0.1)
        pendant(x, y, 2.2, h)
    else:
        floor_lamp(wall.frame(c + length / 2 + 0.5, v + 1.5, wall.toward))


def sitting(w, d, end):
    """A dining room's living room, in the third of the room at the `end` it names, turned toward the glass: a
    sofa facing the window, a low stone table in front of it, and an armchair across the table from the end
    wall, its back to the rest of the room; a rug under them and a floor lamp by the glass. Returns the span
    along the room it leaves for the table, (lo, hi)."""
    at = (lambda u: u) if end == "left" else (lambda u: w - u)  # along the room, in from the end wall
    length = min(2.0, w / 3 - 0.8)
    s, y = 0.6 + length / 2, min(3.2, d - 1.1)  # the sofa's middle
    a = 0.6 + length + 0.5  # the armchair's
    sofa(Frame(at(s), y), length)
    table(Frame(at(s), y - 1.1), 1.1, 0.6, 0.36, top="stone")
    armchair(Frame(at(a), y - 1.1, end), fabric="rust")
    x0, x1 = sorted((at(0.3), at(a + 0.6)))
    rug(x0, y - 2.0, x1, y + 0.7)
    floor_lamp(Frame(at(0.4), y - 1.9))  # toward the glass, where its shade clears the roof's edge
    return tuple(sorted((at(a + 0.45), at(w))))  # from the armchair's back


def table_setting(cx, yc, length, top):
    """A linen runner down a dining table, the vase on it, and three candles in brass holders, lit."""
    box(cx - length / 2 + 0.25, yc - 0.17, top, cx + length / 2 - 0.25, yc + 0.17, top + 0.004, "linen")
    vase(Frame(cx, yc), top + 0.004)
    for du, tall in ((-0.55, 0.26), (-0.4, 0.2), (0.45, 0.23)):
        z = top + 0.004
        cyl(cx + du, yc, z, z + 0.03, 0.035, "brass", verts=8)
        cyl(cx + du, yc, z + 0.03, z + 0.03 + tall, 0.018, "wax", verts=6)
        box(cx + du - 0.007, yc - 0.007, z + 0.04 + tall, cx + du + 0.007, yc + 0.007, z + 0.07 + tall, "fire")


def dining(w, h, d, o, hearth, rng):
    """A table facing the window, chairs either side, a runner and candles on it, under two pendants or by
    a floor lamp. On the back wall, a sideboard and a canvas, shelving, or with `kitchen` a kitchen run centred
    behind the table (open shelves over it with `shelving`), which the table keeps clear of. With `seating`,
    the third of the room at the end it names is a living room (`sitting`), and the table moves to the rest,
    1.2 m short of the far wall, with what stands behind it. Two pot plants stand by the glass, and without
    the sideboard's canvas, a canvas hangs on a free side wall."""
    back = Wall("back", w, d)
    run = C.WORKTOP_DEPTH if o.get("kitchen") else 0.0
    lo, hi = 0.0, w  # the span along the room the table has
    if o.get("seating"):
        lo, hi = sitting(w, d, o["seating"])
    length = min(2.8, max(1.4, hi - lo - 2.0))
    cx, yc = (lo + hi) / 2, min(max(2.4, d * 0.42), d - 1.8 - run)
    if hi - lo < w:
        # toward the far wall, away from the seating
        cx = max(cx, hi - 1.2 - length / 2) if hi == w else min(cx, lo + 1.2 + length / 2)
    table(Frame(cx, yc), length, 1.0, 0.74, thick=0.05)
    n = max(1, round(length / 0.7))
    for i in range(n):
        u = -length / 2 + length * (i + 0.5) / n
        chair(Frame(cx + u, yc - 0.75, "back"))
        chair(Frame(cx + u, yc + 0.75, "window"))
    table_setting(cx, yc, length, 0.74)
    if o.get("kitchen"):
        # a little longer than the table, short of the side walls, clear of any glass in them, and of the seating
        half = min(cx - lo - (0.6 if lo == 0 else 0.3), hi - cx - (0.6 if hi == w else 0.3), length / 2 + 1.2)
        worktop(back, cx - half, cx + half, h, o, rng)
    elif o.get("shelving"):
        shelving(back, max(lo + 0.15, cx - 1.8), min(hi - 0.15, cx + 1.8), 0.36, min(2.2, h - 0.4), rng)
    else:
        back.box(max(lo + 0.15, cx - 1.2), 0.0, 0.0, min(hi - 0.15, cx + 1.2), 0.45, 0.75, "walnut")  # sideboard
        artwork(back, cx, 1.3, min(1.4, w * 0.3), 0.9)
    if o.get("lamp") == "floor":
        floor_lamp(Frame(min(hi - 0.4, cx + length / 2 + 0.7), yc + 0.9))
    else:
        for i in range(2):
            pendant(cx + (i - 0.5) * length / 2, yc, 1.55, h)
    window_plants(w, rng)
    if o.get("kitchen") or o.get("shelving"):
        free_canvas(w, h, d, back=run)


def kitchen(w, h, d, o, hearth, rng):
    """A run along the back wall, wall to wall, and an island with stools at it, under pendants or by a floor
    lamp. Two pot plants stand by the glass, and a canvas hangs on a free side wall."""
    # a run along the back wall, wall to wall
    worktop(Wall("back", w, d), 0.0, w, h, o, rng)
    # an island, and stools at it
    cx, yc = w / 2, min(max(2.2, d * 0.4), d - 2.0)
    length = min(2.6, max(1.2, w - 1.8))
    f = Frame(cx, yc)
    f.box(-length / 2, -0.45, 0.0, length / 2, 0.45, 0.88, "walnut")
    f.box(-length / 2 - 0.02, -0.47, 0.88, length / 2 + 0.02, 0.47, 0.92, "stone")
    n = max(1, round(length / 0.65))
    for i in range(n):
        s = Frame(cx - length / 2 + length * (i + 0.5) / n, yc - 0.75)
        s.cyl(0, 0, 0.0, 0.64, 0.02, "black", verts=6)
        s.cyl(0, 0, 0.64, 0.68, 0.19, "walnut")
    vase(Frame(cx + length / 4, yc), 0.92)
    if o.get("lamp") == "floor":
        floor_lamp(Frame(min(w - 0.4, cx + length / 2 + 0.8), yc + 0.2))
    else:
        k = 3 if length > 1.8 else 2
        for i in range(k):
            pendant(cx - length / 2 + length * (i + 0.5) / k, yc, 1.65, h)
    window_plants(w, rng)
    free_canvas(w, h, d, back=C.WORKTOP_DEPTH)


def library(w, h, d, o, hearth, rng):
    """Shelving floor to near ceiling along the back wall, and on along each side wall that has no desk or
    fire, either side of its glass and doors; two armchairs by the fire, or else turned toward the window,
    with a side table and a lamp, on a rug.

    With `desk`, a long walnut desk with a computer is centred along that side wall, so the window sees it
    side-on; a large plant stands in the window's corner on that side, and a low daybed under the sill of the
    widest glass in the other side wall. With `door`, a closed walnut door stands toward the back of that side
    wall, clear of the back wall's shelves."""
    wall, c, span = feature_wall(w, d, o, hearth)
    back = Wall("back", w, d)
    top = min(h - 0.1, 3.4)
    breast = min(2.0, span, wall.length * 0.34)
    fire = wall.name if o.get("fireplace") else None
    if fire:
        fireplace(wall, c, breast, h)
    if fire == "back":
        run = (w - breast) / 2 - 0.2
        if run > 0.6:
            shelving(back, 0.1, 0.1 + run, 0.36, top, rng)
            shelving(back, w - 0.1 - run, w - 0.1, 0.36, top, rng)
    else:
        shelving(back, 0.1, w - 0.1, 0.36, top, rng)
    side = o.get("desk")
    closed = list(doors)
    if o.get("door"):
        # toward the back of its wall, clear of the back wall's shelves: validateProject's LIBRARY_DOOR_BACK
        a = d - 0.66 - C.DOOR_WIDTH
        wall_door(Wall(o["door"], w, d), a, C.DOOR_WIDTH, C.DOOR_HEIGHT)
        closed.append((o["door"], a, a + C.DOOR_WIDTH, C.DOOR_HEIGHT))
    # the side walls' shelving, from the window wall to the back wall's shelves, round their glass and doors
    for name in ("left", "right"):
        if name in (side, fire):
            continue
        spans = [(0.0, d - 0.36)]
        for g in [*glass, *closed]:
            if g[0] == name:
                spans = [piece for a, b in spans for piece in ((a, min(b, g[1] - 0.1)), (max(a, g[2] + 0.1), b))]
        for a, b in spans:
            if b - a >= 0.5:
                shelving(Wall(name, w, d), a, b, 0.36, top, rng)
    if side:
        desk(Wall(side, w, d), d / 2)
        plant(0.45 if side == "left" else w - 0.45, 0.45)
    # the daybed, under the widest glass in the other side wall with a sill it clears
    other = {"left": "right", "right": "left"}.get(side)
    under = [g for g in glass if g[0] == other and g[3] >= 0.5 and g[2] - g[1] >= 2.2]
    bed = max(under, key=lambda g: g[2] - g[1], default=None)
    if bed:
        daybed(Wall(other, w, d), (bed[1] + bed[2]) / 2, 2.0)
    if fire:
        v = min(2.2, (w if wall.name != "back" else d) / 3)
        armchair(wall.frame(c - 0.7, v, wall.plus))
        armchair(wall.frame(c + 0.7, v, wall.minus), fabric="rust")
        table(wall.frame(c, v + 0.1, wall.toward), 0.5, 0.5, 0.45)
        wall.box(c - 1.4, v - 1.0, 0.0, c + 1.4, v + 1.0, 0.012, "rug")
        if o.get("lamp") == "pendant":
            pendant(*wall.point(c, v), 1.7, h)
        else:
            floor_lamp(wall.frame(c - 1.25, v + 0.55, wall.toward))
        return
    # the armchairs, turned toward the window, between the desk's chair and the daybed or the shelving
    lo = 1.8 if side == "left" else (0.95 if bed and other == "left" else 0.6)
    hi = w - (1.8 if side == "right" else (0.95 if bed and other == "right" else 0.6))
    cx, v = (lo + hi) / 2, min(2.6, d / 3)
    armchair(Frame(cx - 0.75, v))
    armchair(Frame(cx + 0.75, v), fabric="rust")
    table(Frame(cx, v + 0.1), 0.45, 0.45, 0.5)
    vase(Frame(cx, v + 0.1), 0.5)
    box(cx - 1.55, v - 1.0, 0.0, cx + 1.55, v + 1.0, 0.012, "rug")
    if o.get("lamp") == "pendant":
        pendant(cx, v + 0.1, 1.7, h)
    else:
        floor_lamp(Frame(cx + 1.4, v + 0.45))


def bedroom(w, h, d, o, hearth, rng):
    """A bed facing the window, its head to the back wall, or to the partition, which closes the bedroom off
    from the room behind it and leaves that empty. Nightstands, a bench at the foot of the bed, a wardrobe
    on the right wall and a reading chair in the window's left corner, where they fit.

    With `bedside`, the bed's head is against that side wall instead, as far back as the partition or the back
    wall allow, so the glass sees it side-on; the wardrobe moves to the back wall, on the far side from the bed,
    the reading chair to the window's corner on that side, and the partition's door to that side too. With
    `tv`, a wall TV over a low walnut unit faces the bed from the other side wall."""
    side = o.get("bedside")
    door = None
    if o.get("partition"):
        d, door = o["partition"], 0.3 if side != "left" else w - 0.3 - C.DOOR_WIDTH
        partition(w, h, d, door)
    head = Wall(side or "back", w, d)  # the wall the bed's head is against
    across = d if side is None else w  # from that wall to the one facing it
    width = min(1.8, head.length - 1.4) if head.length > 2.6 else head.length - 0.6
    if side is None:
        # centred, or clear of the door by a quarter metre, nightstand and all
        cb = w / 2 if door is None else max(w / 2, door + C.DOOR_WIDTH + 0.25 + width / 2 + 0.575)
    else:
        # as far back as it goes, the far nightstand 0.3 m short of the back wall or the partition
        cb = head.length - 0.3 - (width / 2 + 0.575)
    f = head.frame(cb, 1.1, head.away)
    f.box(-width / 2 - 0.05, 0.95, 0.0, width / 2 + 0.05, 1.05, 1.1, "wool", soft=0.03)  # headboard
    f.box(-width / 2, -1.05, 0.08, width / 2, 1.0, 0.36, "walnut")
    f.box(-width / 2 + 0.02, -1.0, 0.36, width / 2 - 0.02, 0.95, 0.56, "bedding", soft=0.05)
    f.box(-width / 2 + 0.02, -1.0, 0.5, width / 2 - 0.02, 0.1, 0.6, "linen", soft=0.04)  # throw
    for s in (-1, 1):
        f.box(s * width / 4 - 0.33, 0.55, 0.56, s * width / 4 + 0.33, 0.9, 0.72, "bedding", soft=0.05)
    lamp = o.get("lamp", "floor")
    for s in (-1, 1):
        u = cb + s * (width / 2 + 0.35)
        if 0.25 < u < head.length - 0.25:
            n = head.frame(u, 0.25, head.away)
            table(n, 0.45, 0.4, 0.5)
            if lamp == "floor":
                table_lamp(n, 0.5)
    if lamp == "pendant":
        for s in (-1, 1):
            pendant(*head.point(cb + s * (width / 2 + 0.35), 0.3), 1.1, h)
    artwork(head, cb, 1.45, min(1.4, width * 0.8), 0.7)
    head.box(max(0.2, cb - width / 2 - 0.6), 0.3, 0.0, min(head.length - 0.2, cb + width / 2 + 0.6), 2.6, 0.012, "rug")
    foot = across - 2.15  # the foot of the bed
    if foot > 1.4:
        f.box(-width / 2 + 0.15, -1.5, 0.36, width / 2 - 0.15, -1.12, 0.46, "linen", soft=0.03)
        for u in (-width / 2 + 0.2, width / 2 - 0.2):
            f.box(u - 0.02, -1.45, 0.0, u + 0.02, -1.17, 0.36, "walnut")
    if o.get("tv"):
        television(Wall("right" if side == "left" else "left", w, d), cb)
    top = min(2.4, h - 0.1)
    if side is None:
        # the wardrobe runs alongside the bed where the room is wide enough, or else stops short of the bench
        right = Wall("right", w, d)
        beside = w - 0.6 - (cb + width / 2 + 0.575) > 0.3
        end = min(3.0, d - 0.3 if beside else foot - 0.6)
        if end - 0.6 > 1.0:
            wardrobe(right, 0.6, end, top)
        if foot - 0.5 > 1.8 and cb - width / 2 > 1.6:
            armchair(Frame(0.8, 1.1, "right"))
            if lamp == "floor":
                floor_lamp(Frame(0.4, 0.45))
        return
    # the far side from the bed, along the back wall (or the partition) and the window, measured from its wall
    far = (lambda u: u) if side == "right" else (lambda u: w - u)
    start = 0.6 if door is None else max(far(door), far(door + C.DOOR_WIDTH)) + 0.3  # past the partition's door
    end = min(start + 3.0, w - 2.8)  # short of the bench at the foot of the bed
    if end - start > 1.0:
        a, b = sorted((far(start), far(end)))
        wardrobe(Wall("back", w, d), a, b, top)
    # the reading chair in the window's corner, clear of the TV unit
    if foot - 0.5 > 1.6 and (not o.get("tv") or cb - 1.3 > 1.8):
        armchair(Frame(far(0.8), 1.1, "right" if side == "right" else "left"))
        if lamp == "floor":
            floor_lamp(Frame(far(0.4), 0.45))


TEMPLATES = {"lounge": lounge, "dining": dining, "kitchen": kitchen, "library": library, "bedroom": bedroom}


def furnish(interior, w, h, d, hearth, beside, seed, house_doors=(), house_glass=()):
    """Build the kind's template in a room w wide, h high and d deep (room frame), with its downlights and,
    when the Interior asks for one, a door into the room beside it. `hearth` is the wall the House's stone
    mass stands behind and the span of it the room sees, as ("left" | "right" | "back", u0, u1), or None;
    `beside` lists the walls the House's other volumes stand against, the same way. `house_doors` are the
    House's doors in the room's side and back walls, (wall, u0, u1, head), each shown closed from inside, and
    `house_glass` its Glazing Faces there, (wall, u0, u1, sill, head), which a template keeps clear of.
    Returns the parts and the lamps."""
    parts.clear()
    lamps.clear()
    doors[:] = house_doors
    glass[:] = house_glass
    palette()
    TEMPLATES[interior["kind"]](w, h, d, interior, hearth, random.Random(seed))
    v = interior.get("partition")
    if interior["kind"] == "lounge" and interior.get("door"):
        side_door(w, d, beside, hearth, v or d)
    for name, u0, u1, head in doors:
        wall_door(Wall(name, w, d), u0, u1 - u0, head)
    downlights(w, h, d, skip=v and (v, v + C.PARTITION_THICKNESS))
    return list(parts), list(lamps)
