"""A House's balconies: its Balcony Furniture, from one shared kit, and the pergolas over its balcony slabs.

`derived.balcony` in the builder JSON gives each furnished slab's deck (its top) and its pieces in plan (`balconyPlan`
in lib/house/balcony.ts): each piece's kind, footprint, facing and options. `derived.pergolas` gives each pergola's
outline, its beams' underside, its slats' top and its posts (`pergolaPlan`). This module gives them their shape, in
the House's own materials: timber, metal, concrete and stone, and snow for the sheepskins. It adds the three lights
the pieces carry: the lantern on a table, the fire in a fire bowl and the glow in a hot tub's water.

Balcony Furniture stands on a slab, not on the plinth, so unlike the Site Works (siteworks.py) it shapes no snow. A
slab it stands on, or a pergola covers, is kept clear of snow, and so are the pieces and the pergola. Everything is
in the House frame (metres, z up, the front faces -y), and nothing here needs bpy.
"""

import math
import random

import config as C

FACING = {"front": (0, -1), "back": (0, 1), "left": (-1, 0), "right": (1, 0)}


class Mesh:
    """One piece's mesh of one material: its vertices and faces, and how it shades. With `strips`, it is long boxes
    only, each with seams (`seams`, pairs of vertex indices) that open it into one strip down its length with its
    ends on it, so each box unwraps as one island in the lightmap."""

    def __init__(self, name, material, smooth=None, strips=False):
        self.name, self.material = name, material
        self.smooth = smooth  # None: flat; "all": smooth; an angle: smooth up to it
        self.strips = strips
        self.verts, self.faces, self.seams = [], [], []

    def add(self, verts, faces):
        start = len(self.verts)
        self.verts += verts
        self.faces += [tuple(start + i for i in f) for f in faces]
        return self

    def box(self, x0, y0, z0, x1, y1, z1):
        start = len(self.verts)
        if self.strips:
            axis = max(range(3), key=lambda i: (x1 - x0, y1 - y0, z1 - z0)[i])
            self.seams += [(start + a, start + b) for a, b in STRIP_SEAMS[axis]]
        return self.add(corners(x0, y0, z0, x1, y1, z1), BOX_FACES)

    def solid(self, eight):
        """A closed six-sided solid from its eight corners: the bottom four counter-clockwise, then the top four."""
        return self.add(list(eight), BOX_FACES)


BOX_FACES = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
# a box's seams by the axis it is long along: one long edge, and three edges round each end, which stays on the
# strip by its fourth
STRIP_SEAMS = {
    0: [(0, 1), (3, 0), (0, 4), (7, 3), (1, 2), (2, 6), (5, 1)],
    1: [(0, 3), (0, 1), (1, 5), (4, 0), (2, 3), (3, 7), (6, 2)],
    2: [(0, 4), (0, 3), (3, 2), (1, 0), (4, 5), (6, 7), (7, 4)],
}


def corners(x0, y0, z0, x1, y1, z1):
    return [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]


def lathe(profile, cx, cy, seg, turn=0.0, cap_bottom=False, cap_top=False):
    """A surface of revolution about (cx, cy) through a profile of (radius, z) points, and optionally a cap on
    either end; its faces face away from the axis where the profile rises, toward it where it falls."""
    verts, faces = [], []
    for r, z in profile:
        for j in range(seg):
            a = turn + math.tau * j / seg
            verts.append((cx + r * math.cos(a), cy + r * math.sin(a), z))
    for k in range(len(profile) - 1):
        for j in range(seg):
            a, b = k * seg + j, k * seg + (j + 1) % seg
            faces.append((a, b, b + seg, a + seg))
    if cap_bottom:
        faces.append(tuple(reversed(range(seg))))
    if cap_top:
        k = (len(profile) - 1) * seg
        faces.append(tuple(range(k, k + seg)))
    return verts, faces


class Place:
    """A piece's own frame on its deck: `u` across it, `v` from its front (negative) to its back, `z` up from the
    deck, turned to its facing."""

    def __init__(self, piece, deck):
        r = piece["rect"]
        self.x, self.y = (r["x0"] + r["x1"]) / 2, (r["y0"] + r["y1"]) / 2
        fx, fy = FACING[piece["facing"]]
        self.bx, self.by = -fx, -fy  # toward its back
        self.rx, self.ry = self.by, -self.bx
        self.deck = deck

    def at(self, u, v, z=0.0):
        return (self.x + u * self.rx + v * self.bx, self.y + u * self.ry + v * self.by, self.deck + z)

    def box(self, mesh, u0, v0, z0, u1, v1, z1):
        (xa, ya, za), (xb, yb, zb) = self.at(u0, v0, z0), self.at(u1, v1, z1)
        return mesh.box(min(xa, xb), min(ya, yb), za, max(xa, xb), max(ya, yb), zb)

    def solid(self, mesh, quad, z_bottom, z_top):
        """A slab under a sloping top: `quad` is its four (u, v) corners counter-clockwise from above, with a
        bottom and a top height at each."""
        pts = [self.at(u, v) for u, v in quad]
        ccw = sum(pts[i][0] * pts[(i + 1) % 4][1] - pts[(i + 1) % 4][0] * pts[i][1] for i in range(4)) > 0
        order = range(4) if ccw else range(3, -1, -1)
        low = [(pts[i][0], pts[i][1], self.deck + z_bottom[i]) for i in order]
        high = [(pts[i][0], pts[i][1], self.deck + z_top[i]) for i in order]
        return mesh.solid(low + high)


class Balcony:
    """The balconies of one House, from `derived.balcony` and `derived.pergolas`."""

    def __init__(self, furniture, pergolas, slug):
        self.furniture = furniture or []
        self.pergolas = pergolas or []
        self.slug = slug

    @property
    def clear(self):
        """The slabs kept clear of snow: each one furnished or under a pergola."""
        return {b["slab"] for b in self.furniture} | {p["slab"] for p in self.pergolas}

    def build(self):
        """Every mesh, every glowing part and every light: ([Mesh], [Mesh], [light]), a light being (kind, position,
        watts, colour, radius, size), a spot or an area light shining straight down."""
        meshes, glows, lights = [], [], []
        for p in self.pergolas:
            meshes += pergola(p)
        for g, group in enumerate(self.furniture):
            for i, piece in enumerate(group["pieces"]):
                place = Place(piece, group["deck"])
                rng = random.Random(f"{self.slug}:balcony:{group['slab']}:{i}")
                made = KIT[piece["kind"]](place, piece, f"balcony-{piece['kind']}-{g}-{i}", rng)
                meshes += made[0]
                glows += made[1]
                lights += made[2]
        return meshes, glows, lights


# ---------------------------------------------------------------- the pergola


def pergola(p):
    """Timber slats across the whole outline, on dark metal beams round it and between its posts, on slender dark
    metal posts. Where no post stands, a beam bears on the solid along it."""
    r, deck, bottom, top = p["rect"], p["deck"], p["bottom"], p["top"]
    x0, y0, x1, y1 = r["x0"], r["y0"], r["x1"], r["y1"]
    beam_top, b = top - C.PERGOLA_SLAT[1], C.PERGOLA_BEAM
    metal, timber = Mesh("pergola-frame", "metal", strips=True), Mesh("pergola-slats", "timber", strips=True)
    for post in p["posts"]:
        metal.box(post["x0"], post["y0"], deck, post["x1"], post["y1"], beam_top)
    # round its outline, and across it from each post between the corners to the edge opposite
    beams = [(x0, y0, x1, y0 + b), (x0, y1 - b, x1, y1), (x0, y0 + b, x0 + b, y1 - b), (x1 - b, y0 + b, x1, y1 - b)]
    for post in p["posts"]:
        cx, cy = (post["x0"] + post["x1"]) / 2, (post["y0"] + post["y1"]) / 2
        if x0 + b < cx < x1 - b and (cy < y0 + b or cy > y1 - b):
            beams.append((cx - b / 2, y0 + b, cx + b / 2, y1 - b))
        elif y0 + b < cy < y1 - b and (cx < x0 + b or cx > x1 - b):
            beams.append((x0 + b, cy - b / 2, x1 - b, cy + b / 2))
    for bx0, by0, bx1, by1 in dict.fromkeys(tuple(round(c, 4) for c in beam) for beam in beams):
        metal.box(bx0, by0, bottom, bx1, by1, beam_top)
    # the slats run along the longer span between the beams across it, so they rest on every beam
    width, depth = C.PERGOLA_SLAT
    n = max(2, round((y1 - y0 - width) / C.PERGOLA_PITCH))
    for k in range(n + 1):
        y = y0 + (y1 - y0 - width) * k / n
        timber.box(x0, y, beam_top, x1, y + width, top)
    return [metal, timber]


# ---------------------------------------------------------------- the kit


def chair(place, piece, name, rng):
    """A low timber lounge chair: two side frames as armrests, a sloping seat and a reclined back between them,
    and with `sheepskin`, a sheepskin draped over the seat and the back and over its front edge."""
    wood = Mesh(name, "timber")
    w, d = C.PIECE_SIZE["chair"]
    h, s = w / 2, 0.05  # half its width, its frames' thickness
    for side in (-1, 1):
        u0, u1 = (h - s, h) if side > 0 else (-h, -h + s)
        place.box(wood, u0, -d / 2 + 0.03, 0.0, u1, d / 2 - 0.08, 0.5)
    inner = h - s
    # the seat, falling back from its front edge, and the back, reclined from its foot
    seat = [(-inner, -d / 2 + 0.05), (inner, -d / 2 + 0.05), (inner, 0.18), (-inner, 0.18)]
    place.solid(wood, seat, [0.28, 0.28, 0.2, 0.2], [0.33, 0.33, 0.25, 0.25])
    back = [(-inner, 0.14), (inner, 0.14), (inner, d / 2), (-inner, d / 2)]
    place.solid(wood, back, [0.2, 0.2, 0.8, 0.8], [0.26, 0.26, 0.86, 0.86])
    meshes = [wood]
    if piece.get("sheepskin"):
        meshes.append(sheepskin(place, f"{name}-sheepskin", inner, d, rng))
    return meshes, [], []


def sheepskin(place, name, inner, d, rng):
    """A pelt draped over the seat and the back: a soft, ragged-edged sheet following them, thick in the middle
    and thin at its edges, spilling over the seat's front edge."""
    # its line from the front edge up to the top of the back, in (v, z), just over the timber
    line = [(-d / 2 - 0.02, 0.18), (-d / 2 + 0.04, 0.35), (0.0, 0.31), (0.16, 0.31), (0.26, 0.49), (0.36, 0.67),
            (0.42, 0.8)]
    across = 7
    skin = Mesh(name, "snow", smooth="all")
    top, bottom = [], []
    for k, (v, z) in enumerate(line):
        half = inner * rng.uniform(0.72, 0.86) * (0.8 if k in (0, len(line) - 1) else 1.0)
        for j in range(across):
            t = j / (across - 1) * 2 - 1
            u = t * half + rng.uniform(-0.015, 0.015)
            lift = 0.012 + 0.045 * (1 - t * t) * rng.uniform(0.8, 1.15)
            top.append(place.at(u, v, z + lift))
            bottom.append(place.at(u, v, z + 0.004))
    verts = top + bottom
    n, m = len(line), across
    faces = []
    for k in range(n - 1):
        for j in range(m - 1):
            a = k * m + j
            faces.append((a, a + 1, a + m + 1, a + m))  # top
            b = n * m + a
            faces.append((b, b + m, b + m + 1, b + 1))  # underside
    for k in range(n - 1):  # the two long edges
        for j in (0, m - 1):
            a, b = k * m + j, (k + 1) * m + j
            f = (a, b, n * m + b, n * m + a)
            faces.append(f if j == 0 else tuple(reversed(f)))
    for k in (0, n - 1):  # the two ends
        for j in range(m - 1):
            a, b = k * m + j, k * m + j + 1
            f = (a, n * m + a, n * m + b, b)
            faces.append(f if k == 0 else tuple(reversed(f)))
    return skin.add(verts, faces)


def table(place, piece, name, rng):
    """A low table, a stone top on slender dark metal legs, and with `lantern`, a lantern on it: a dark metal frame
    round warm glass, which lights the balcony."""
    w, d = C.PIECE_SIZE["table"]
    top, legs = Mesh(name, "stone"), Mesh(f"{name}-legs", "metal")
    height = C.TABLE_HEIGHT
    place.box(top, -w / 2, -d / 2, height - 0.04, w / 2, d / 2, height)
    for u in (-w / 2 + 0.04, w / 2 - 0.07):
        for v in (-d / 2 + 0.04, d / 2 - 0.07):
            place.box(legs, u, v, 0.0, u + 0.03, v + 0.03, height - 0.04)
    meshes, glows, lights = [top, legs], [], []
    if piece.get("lantern"):
        lu, s, g = w / 4, 0.08, 0.06  # its place along the table, its half-width, its glass's
        frame, glass = Mesh(f"{name}-lantern", "metal"), Mesh(f"{name}-lantern-glass", "downlight")
        z = height
        place.box(frame, lu - s, -s, z, lu + s, s, z + 0.02)
        place.box(glass, lu - g, -g, z + 0.02, lu + g, g, z + 0.2)
        for du, dv in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            cu, cv = lu + du * (g + 0.006), dv * (g + 0.006)
            place.box(frame, cu - 0.008, cv - 0.008, z + 0.02, cu + 0.008, cv + 0.008, z + 0.2)
        place.box(frame, lu - s - 0.005, -s - 0.005, z + 0.2, lu + s + 0.005, s + 0.005, z + 0.23)
        place.box(frame, lu - 0.02, -0.02, z + 0.23, lu + 0.02, 0.02, z + 0.28)
        meshes.append(frame)
        glows.append(glass)
        lights.append(("POINT", place.at(lu, 0.0, z + 0.12), C.LANTERN_WATTS, "lamp", 0.05, None))
    return meshes, glows, lights


def pine(place, piece, name, rng):
    """A dwarf pine in a concrete pot: a low, lumpy dark mound of needles overhanging the pot's rim."""
    pot = Mesh(f"{name}-pot", "concrete", smooth=math.radians(40))
    rim, radius, seg = C.POT_HEIGHT, C.PIECE_SIZE["pine"][0] / 2 - 0.05, 16
    x, y, _ = place.at(0, 0)
    verts, faces = lathe([(radius * 0.84, place.deck), (radius, place.deck + rim), (radius - 0.03, place.deck + rim)],
                         x, y, seg, cap_bottom=True, cap_top=True)
    pot.add(verts, faces)
    # the needles: two to four lumps, each a squashed dome, the mound their upper envelope
    needles = Mesh(name, "metal", smooth="all")
    lumps = [(0.0, 0.0, radius * 1.1, rng.uniform(0.34, 0.42))]
    turn = rng.uniform(0, math.tau)
    for k in range(rng.randint(2, 3)):
        a = turn + k * math.tau / 3 + rng.uniform(-0.4, 0.4)
        dist = radius * rng.uniform(0.35, 0.55)
        lumps.append((dist * math.cos(a), dist * math.sin(a), radius * rng.uniform(0.55, 0.7), rng.uniform(0.2, 0.3)))

    def height(px, py):
        return max(lh * max(0.0, 1 - (math.hypot(px - lx, py - ly) / lr) ** 2) ** 0.55 for lx, ly, lr, lh in lumps)

    base = place.deck + rim - 0.03
    rings, seg = (1.0, 0.8, 0.58, 0.34), 14
    verts, faces = [], []
    reach = radius * 1.15
    for k, f in enumerate(rings):
        for j in range(seg):
            a = turn + math.tau * j / seg
            rr = reach * f * rng.uniform(0.9, 1.08)
            px, py = rr * math.cos(a), rr * math.sin(a)
            z = base + (0.02 if k == 0 else height(px, py) * rng.uniform(0.92, 1.08))
            verts.append((x + px, y + py, z))
    verts.append((x, y, base + height(0.0, 0.0)))
    for k in range(len(rings) - 1):
        for j in range(seg):
            a, b = k * seg + j, k * seg + (j + 1) % seg
            faces.append((a, b, b + seg, a + seg))
    last = (len(rings) - 1) * seg
    for j in range(seg):
        faces.append((last + j, last + (j + 1) % seg, len(verts) - 1))
    faces.append(tuple(reversed(range(seg))))  # closed underneath, over the pot
    needles.add(verts, faces)
    return [pot, needles], [], []


def tub(place, piece, name, rng):
    """An open round timber hot tub on the deck, bound with two dark metal hoops, its water just under the rim with
    a low warm glow in it: a warm area light over the water, lighting the water and the tub's inside."""
    r, h, seg = C.PIECE_SIZE["tub"][0] / 2, C.TUB_HEIGHT, 24
    x, y, _ = place.at(0, 0)
    z0, z1, water, wall = place.deck, place.deck + h, place.deck + h - C.TUB_FREEBOARD, 0.06
    wood = Mesh(name, "timber", smooth=math.radians(40))
    # the outside, the rim and the inside down to the water, one surface
    verts, faces = lathe([(r, z0), (r, z1), (r - wall, z1), (r - wall, water)], x, y, seg)
    wood.add(verts, faces)
    surface = Mesh(f"{name}-water", "metal")
    verts, faces = lathe([(r - wall, water)], x, y, seg, cap_top=True)
    surface.add(verts, faces)
    hoops = Mesh(f"{name}-hoops", "metal", smooth=math.radians(40))
    for zb in (0.16, h - 0.2):
        o = r + 0.006
        verts, faces = lathe([(r, z0 + zb), (o, z0 + zb), (o, z0 + zb + 0.05), (r, z0 + zb + 0.05)], x, y, seg)
        hoops.add(verts, faces)
    light = ("AREA", (x, y, water + C.TUB_GLOW_ABOVE), C.TUB_GLOW_WATTS, "lamp", None, 2 * (r - wall) * 0.9)
    return [wood, surface, hoops], [], [light]


def fire_bowl(place, piece, name, rng):
    """A wide, shallow dark metal bowl on a short foot, with a bed of embers and low flames in it, which light the
    balcony."""
    x, y, _ = place.at(0, 0)
    r, seg, deck = C.PIECE_SIZE["fire-bowl"][0] / 2, 20, place.deck
    rim = deck + C.FIRE_BOWL_HEIGHT
    steel = Mesh(name, "metal", smooth=math.radians(40))
    verts, faces = lathe([(0.1, deck), (0.1, deck + 0.18), (0.16, deck + 0.18), (r, rim), (r - 0.02, rim),
                          (0.16, deck + 0.3)], x, y, seg, cap_bottom=True, cap_top=True)
    steel.add(verts, faces)
    fire = Mesh(f"{name}-fire", "downlight")
    verts, faces = lathe([(0.3, deck + 0.33), (0.3, deck + 0.36)], x, y, 12, cap_top=True)
    fire.add(verts, faces)
    for k in range(3):
        a = rng.uniform(0, math.tau)
        d = rng.uniform(0.0, 0.14)
        fx, fy, fh = x + d * math.cos(a), y + d * math.sin(a), rng.uniform(0.16, 0.26)
        verts, faces = lathe([(0.06, deck + 0.36), (0.0, deck + 0.36 + fh)], fx, fy, 4, turn=rng.uniform(0, 1))
        fire.add(verts, faces)
    light = ("POINT", (x, y, rim + 0.22), C.FIRE_BOWL_WATTS, "fire", 0.18, None)
    return [steel], [fire], [light]


def bench(place, piece, name, rng):
    """A timber bench on two concrete blocks."""
    w, d = C.PIECE_SIZE["bench"]
    seat, legs = Mesh(name, "timber"), Mesh(f"{name}-legs", "concrete")
    place.box(seat, -w / 2, -d / 2, C.BENCH_HEIGHT - 0.06, w / 2, d / 2, C.BENCH_HEIGHT)
    for u in (-w / 2 + 0.15, w / 2 - 0.27):
        place.box(legs, u, -d / 2 + 0.03, 0.0, u + 0.12, d / 2 - 0.03, C.BENCH_HEIGHT - 0.06)
    return [seat, legs], [], []


def telescope(place, piece, name, rng):
    """A telescope on a tripod, its tube pointed out past its front and a little up, over the water."""
    metal = Mesh(name, "metal", smooth=math.radians(40))
    head = C.TELESCOPE_HEAD
    spread = C.PIECE_SIZE["telescope"][0] / 2 - 0.05
    hx, hy, hz = place.at(0, 0, head)
    for k in range(3):
        a = math.radians(90 + 120 * k)
        fx, fy, fz = place.at(spread * math.cos(a), spread * math.sin(a), 0.0)
        metal.add(*leg((fx, fy, fz), (hx, hy, hz - 0.02), 0.014))
    place.box(metal, -0.04, -0.04, head - 0.04, 0.04, 0.04, head + 0.04)
    # the tube: from its eyepiece end behind the head, forward past its front, tilted up
    tilt, length, radius = math.radians(C.TELESCOPE_TILT), C.TELESCOPE_LENGTH, 0.055
    back, front = -0.35, length - 0.35
    a = place.at(0, -back * math.cos(tilt), head + 0.1 + back * math.sin(tilt))
    b = place.at(0, -front * math.cos(tilt), head + 0.1 + front * math.sin(tilt))
    metal.add(*tube(a, b, radius, radius * 1.15, 12))
    e = place.at(0, -(back - 0.12) * math.cos(tilt), head + 0.1 + (back - 0.12) * math.sin(tilt))
    metal.add(*tube(e, a, 0.018, 0.018, 6))
    return [metal], [], []


def leg(foot, head, radius):
    """A thin tapered four-sided leg from its foot up to the head."""
    return tube(foot, head, radius, radius * 0.6, 4)


def tube(a, b, ra, rb, seg):
    """A closed cylinder from point a (radius ra) to point b (radius rb)."""
    dx, dy, dz = b[0] - a[0], b[1] - a[1], b[2] - a[2]
    n = math.sqrt(dx * dx + dy * dy + dz * dz)
    dx, dy, dz = dx / n, dy / n, dz / n
    ux, uy, uz = (-dy, dx, 0.0) if abs(dz) < 0.99 else (1.0, 0.0, 0.0)
    m = math.sqrt(ux * ux + uy * uy + uz * uz)
    ux, uy, uz = ux / m, uy / m, uz / m
    vx, vy, vz = dy * uz - dz * uy, dz * ux - dx * uz, dx * uy - dy * ux
    verts = []
    for (px, py, pz), r in ((a, ra), (b, rb)):
        for j in range(seg):
            t = math.tau * j / seg
            c, s = math.cos(t) * r, math.sin(t) * r
            verts.append((px + ux * c + vx * s, py + uy * c + vy * s, pz + uz * c + vz * s))
    faces = [(j, (j + 1) % seg, seg + (j + 1) % seg, seg + j) for j in range(seg)]
    faces += [tuple(reversed(range(seg))), tuple(range(seg, 2 * seg))]
    return verts, faces


KIT = {"chair": chair, "table": table, "pine": pine, "tub": tub, "fire-bowl": fire_bowl, "bench": bench,
       "telescope": telescope}
