"""The Interior's furniture kit and templates (docs/adr/0005-hero-interior-is-real-baked-geometry.md).

build.py furnishes the room shell of a House's Interior with `furnish`: the kind's template, built from one
shared low-poly kit and sized from the room. Everything is laid out in the room frame: x along the window
wall from its left end seen from outside, y inward from that wall, z up from the finished floor. It returns
the parts, each of one material from this module's palette, and the room's lamps. build.py places them in
the House, joins them into the `interior` node with the room's walls, floor and ceiling, bakes them, and
then gives them the GLB's one `interior` material: after the bake, the room's colours are in its texture.

A lounge or a library with a fireplace puts it on the hearth wall, where the House's stone mass stands
outside the room, if it has one; every other feature wall is the back wall, facing the window.
"""

import math
import random

import bpy  # bpy must load before bmesh
import bmesh

import config as C

parts = []  # every piece of furniture, one material each
lamps = []  # the room's lights
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


def artwork(wall, c, z, w, h):
    """A quiet abstract canvas in a black frame: two fields of colour."""
    wall.box(c - w / 2 - 0.02, 0.0, z - 0.02, c + w / 2 + 0.02, 0.04, z + h + 0.02, "black")
    wall.box(c - w / 2, 0.0, z, c + w / 2, 0.045, z + h * 0.45, "canvas-warm")
    wall.box(c - w / 2, 0.0, z + h * 0.45, c + w / 2, 0.045, z + h, "canvas-dark")


def partition(w, h, v, door):
    """A plastered wall across the room, its near face `v` in from the window wall, with a closed walnut
    door from u = door to door + DOOR_WIDTH along it."""
    t, dw, dh = C.PARTITION_THICKNESS, C.DOOR_WIDTH, C.DOOR_HEIGHT
    box(0.0, v, 0.0, door, v + t, h, "plaster")
    box(door + dw, v, 0.0, w, v + t, h, "plaster")
    box(door, v, dh, door + dw, v + t, h, "plaster")
    box(door, v + 0.04, 0.0, door + dw, v + t - 0.04, dh, "walnut")
    for y0, y1 in ((v - 0.05, v + 0.04), (v + t - 0.04, v + t + 0.05)):  # a handle either side
        box(door + dw - 0.14, y0, 1.0, door + dw - 0.08, y1, 1.03, "brass")


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


# ---------------------------------------------------------------- templates, one per kind


def feature_wall(w, d, o, hearth):
    """The wall a template turns to: the hearth wall for a fireplace, when the House has one, or else the
    back wall. Returns it, the middle of what the room sees of it, and that span's length."""
    name, u0, u1 = hearth if hearth and o.get("fireplace") else ("back", 0.0, w)
    return Wall(name, w, d), (u0 + u1) / 2, u1 - u0


def lounge(w, h, d, o, hearth, rng):
    """Seating round the fire, or round a table facing the back wall, with shelving and a lamp."""
    wall, c, span = feature_wall(w, d, o, hearth)
    back = Wall("back", w, d)
    breast = min(2.4, span, wall.length * 0.36)
    if o.get("fireplace"):
        fireplace(wall, c, breast, h)
    top = min(3.2, h - 0.3)
    if wall.name != "back":
        # the fire is on a side wall: shelving, or a canvas over a sideboard, across from the window
        if o.get("shelving"):
            shelving(back, 0.4, w - 0.4, 0.36, top, rng)
        else:
            back.box(w / 2 - 1.2, 0.0, 0.0, w / 2 + 1.2, 0.45, 0.75, "walnut")
            artwork(back, w / 2, 1.3, min(1.8, w * 0.3), 1.2)
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
    v = min(2.4, (w if wall.name != "back" else d) / 3)
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


def dining(w, h, d, o, hearth, rng):
    back = Wall("back", w, d)
    cx, yc = w / 2, min(max(2.4, d * 0.42), d - 1.8)
    length = min(2.8, max(1.4, w - 2.0))
    table(Frame(cx, yc), length, 1.0, 0.74, thick=0.05)
    n = max(1, round(length / 0.7))
    for i in range(n):
        u = -length / 2 + length * (i + 0.5) / n
        chair(Frame(cx + u, yc - 0.75, "back"))
        chair(Frame(cx + u, yc + 0.75, "window"))
    vase(Frame(cx, yc), 0.74)
    if o.get("shelving"):
        shelving(back, max(0.15, cx - 1.8), min(w - 0.15, cx + 1.8), 0.36, min(2.2, h - 0.4), rng)
    else:
        back.box(max(0.15, cx - 1.2), 0.0, 0.0, min(w - 0.15, cx + 1.2), 0.45, 0.75, "walnut")  # sideboard
        artwork(back, cx, 1.3, min(1.4, w * 0.3), 0.9)
    if o.get("lamp") == "floor":
        floor_lamp(Frame(min(w - 0.4, cx + length / 2 + 0.7), yc + 0.9))
    else:
        for i in range(2):
            pendant(cx + (i - 0.5) * length / 2, yc, 1.55, h)


def kitchen(w, h, d, o, hearth, rng):
    back = Wall("back", w, d)
    # a run of base units and a worktop along the back wall, open shelves or cupboards above
    back.box(0.0, 0.0, 0.0, w, 0.62, 0.86, "walnut")
    back.box(0.0, 0.0, 0.86, w, 0.64, 0.9, "stone")
    back.box(0.0, 0.0, 0.9, w, 0.02, 1.5, "ceramic")  # splashback
    if o.get("shelving"):
        for z in (1.62, 2.02):
            back.box(0.2, 0.0, z, w - 0.2, 0.28, z + 0.03, "walnut")
            books(back, 0.3, w - 0.3, 0.02, 0.26, z + 0.03, 0.3, rng)
    else:
        back.box(0.0, 0.0, 1.55, w, 0.36, min(h - 0.05, 2.35), "walnut")
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


def library(w, h, d, o, hearth, rng):
    """Shelving floor to near ceiling, two armchairs by the fire or facing the back wall."""
    wall, c, span = feature_wall(w, d, o, hearth)
    back = Wall("back", w, d)
    top = min(h - 0.1, 3.4)
    breast = min(2.0, span, wall.length * 0.34)
    if o.get("fireplace"):
        fireplace(wall, c, breast, h)
    if o.get("fireplace") and wall.name == "back":
        side = (w - breast) / 2 - 0.2
        if side > 0.6:
            shelving(back, 0.1, 0.1 + side, 0.36, top, rng)
            shelving(back, w - 0.1 - side, w - 0.1, 0.36, top, rng)
    else:
        shelving(back, 0.1, w - 0.1, 0.36, top, rng)
    v = min(2.2, (w if wall.name != "back" else d) / 3)
    armchair(wall.frame(c - 0.7, v, wall.plus))
    armchair(wall.frame(c + 0.7, v, wall.minus), fabric="rust")
    table(wall.frame(c, v + 0.1, wall.toward), 0.5, 0.5, 0.45)
    wall.box(c - 1.4, v - 1.0, 0.0, c + 1.4, v + 1.0, 0.012, "rug")
    if o.get("lamp") == "pendant":
        x, y = wall.point(c, v)
        pendant(x, y, 1.7, h)
    else:
        floor_lamp(wall.frame(c - 1.25, v + 0.55, wall.toward))


def bedroom(w, h, d, o, hearth, rng):
    """A bed facing the window, its head to the back wall, or to the partition, which closes the bedroom off
    from the room behind it and leaves that empty. Nightstands, a bench at the foot of the bed, a wardrobe
    on the right wall and a reading chair in the window's left corner, where they fit."""
    door = None
    if o.get("partition"):
        d, door = o["partition"], 0.3
        partition(w, h, d, door)
    back = Wall("back", w, d)
    width = min(1.8, w - 1.4) if w > 2.6 else w - 0.6
    # centred, or clear of the door by a quarter metre, nightstand and all
    cx = w / 2 if door is None else max(w / 2, door + C.DOOR_WIDTH + 0.25 + width / 2 + 0.575)
    f = Frame(cx, d - 1.1, "window")
    f.box(-width / 2 - 0.05, 0.95, 0.0, width / 2 + 0.05, 1.05, 1.1, "wool", soft=0.03)  # headboard
    f.box(-width / 2, -1.05, 0.08, width / 2, 1.0, 0.36, "walnut")
    f.box(-width / 2 + 0.02, -1.0, 0.36, width / 2 - 0.02, 0.95, 0.56, "bedding", soft=0.05)
    f.box(-width / 2 + 0.02, -1.0, 0.5, width / 2 - 0.02, 0.1, 0.6, "linen", soft=0.04)  # throw
    for s in (-1, 1):
        f.box(s * width / 4 - 0.33, 0.55, 0.56, s * width / 4 + 0.33, 0.9, 0.72, "bedding", soft=0.05)
    lamp = o.get("lamp", "floor")
    for s in (-1, 1):
        x, _ = f.at(s * (width / 2 + 0.35), 0)
        if 0.25 < x < w - 0.25:
            n = Frame(x, d - 0.25)
            table(n, 0.45, 0.4, 0.5)
            if lamp == "floor":
                table_lamp(n, 0.5)
    if lamp == "pendant":
        for s in (-1, 1):
            pendant(cx + s * (width / 2 + 0.35), d - 0.3, 1.1, h)
    artwork(back, cx, 1.45, min(1.4, width * 0.8), 0.7)
    rug(max(0.2, cx - width / 2 - 0.6), d - 2.6, min(w - 0.2, cx + width / 2 + 0.6), d - 0.3)
    foot = d - 2.15  # the foot of the bed
    if foot > 1.4:
        f.box(-width / 2 + 0.15, -1.5, 0.36, width / 2 - 0.15, -1.12, 0.46, "linen", soft=0.03)
        for u in (-width / 2 + 0.2, width / 2 - 0.2):
            f.box(u - 0.02, -1.45, 0.0, u + 0.02, -1.17, 0.36, "walnut")
    # the wardrobe runs alongside the bed where the room is wide enough, or else stops short of the bench
    right = Wall("right", w, d)
    beside = w - 0.6 - (cx + width / 2 + 0.575) > 0.3
    end = min(3.0, d - 0.3 if beside else foot - 0.6)
    if end - 0.6 > 1.0:
        wardrobe(right, 0.6, end, min(2.4, h - 0.1))
    if foot - 0.5 > 1.8 and cx - width / 2 > 1.6:
        armchair(Frame(0.8, 1.1, "right"))
        if lamp == "floor":
            floor_lamp(Frame(0.4, 0.45))


TEMPLATES = {"lounge": lounge, "dining": dining, "kitchen": kitchen, "library": library, "bedroom": bedroom}


def furnish(interior, w, h, d, hearth, seed):
    """Build the kind's template in a room w wide, h high and d deep (room frame), with its downlights.
    `hearth` is the wall the House's stone mass stands behind and the span of it the room sees, as
    ("left" | "right" | "back", u0, u1), or None. Returns the parts and the lamps."""
    parts.clear()
    lamps.clear()
    palette()
    TEMPLATES[interior["kind"]](w, h, d, interior, hearth, random.Random(seed))
    v = interior.get("partition")
    downlights(w, h, d, skip=v and (v, v + C.PARTITION_THICKNESS))
    return list(parts), list(lamps)
