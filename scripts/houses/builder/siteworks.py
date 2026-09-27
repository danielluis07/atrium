"""A House's Site Works (ADR 0006): the built pieces around it, the snow they shape, and its Snow Shrubs.

`derived.site` in the builder JSON gives the pieces in plan (`sitePlan` in lib/house/site.ts): the terrace, each
wall's boxes between its gaps, each flight's treads and cheeks, each path's runs with its level at their corners,
and the aprons. This module gives them height and thickness, adds the set-in lights and the Snow Shrubs, and
shapes the snow they meet: the plinth takes it (`Site.ground`), refined only along the pieces and their snow
(`Site.features`), with holes where the terrace, the steps, the paths and the aprons stand. So the drifts, banks
and berms share the plinth's bake, edge fade and live shadow mask, with no seam.

Everything is in the House frame (metres, z up, the front faces -y), and nothing here needs bpy.
"""

import math
import random

import config as C

EPS = 1e-6


def smoothstep(a, b, x):
    t = min(max((x - a) / (b - a), 0.0), 1.0)
    return t * t * (3 - 2 * t)


def box4(r):
    """A plan rectangle from the JSON as (x0, y0, x1, y1)."""
    return (r["x0"], r["y0"], r["x1"], r["y1"])


def inside(r, x, y, e=1e-4):
    return r[0] + e < x < r[2] - e and r[1] + e < y < r[3] - e


def rect_distance(r, x, y):
    """Distance from a plan point to a rectangle, 0 inside it, and the nearest point in it."""
    cx, cy = min(max(x, r[0]), r[2]), min(max(y, r[1]), r[3])
    return math.hypot(x - cx, y - cy), (cx, cy)


def bilinear(r, tops, x, y):
    """A value given at a rectangle's corners (x0y0, x1y0, x1y1, x0y1), at a point in it."""
    u = (x - r[0]) / (r[2] - r[0]) if r[2] > r[0] else 0.0
    v = (y - r[1]) / (r[3] - r[1]) if r[3] > r[1] else 0.0
    return (tops[0] * (1 - u) * (1 - v) + tops[1] * u * (1 - v) + tops[2] * u * v + tops[3] * (1 - u) * v)


def prism(r, tops, bottom=None, thickness=None):
    """A box with its own height at each top corner (x0y0, x1y0, x1y1, x0y1): flat-bottomed at `bottom`, or
    `thickness` deep under each corner. Its eight corners: the bottom four counter-clockwise, then the top four."""
    x0, y0, x1, y1 = r
    corners = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
    low = [(x, y, bottom if thickness is None else t - thickness) for (x, y), t in zip(corners, tops)]
    return ("prism", *low, *[(x, y, t) for (x, y), t in zip(corners, tops)])


def touching_sides(r, others):
    """The sides of a rectangle (x0, y0, x1, y1) that another rectangle meets or runs across, along some length."""
    x0, y0, x1, y1 = r
    out = set()
    for o in others:
        if o == r:
            continue
        along_y = min(y1, o[3]) - max(y0, o[1]) > 1e-3
        along_x = min(x1, o[2]) - max(x0, o[0]) > 1e-3
        if along_y and o[0] < x0 - 1e-4 < o[2]:
            out.add("x0")
        if along_y and o[0] < x1 + 1e-4 < o[2]:
            out.add("x1")
        if along_x and o[1] < y0 - 1e-4 < o[3]:
            out.add("y0")
        if along_x and o[1] < y1 + 1e-4 < o[3]:
            out.add("y1")
    return out


def shrink(r, sides_kept, d):
    """A rectangle pulled in by `d` on every side but those kept."""
    x0, y0, x1, y1 = r
    return (x0 if "x0" in sides_kept else x0 + d, y0 if "y0" in sides_kept else y0 + d,
            x1 if "x1" in sides_kept else x1 - d, y1 if "y1" in sides_kept else y1 - d)


class Site:
    """The Site Works of one House, from `derived.site`. `base(x, y, sx, sy)` is the plinth's height without
    them, on the side of any step that (sx, sy) is on."""

    def __init__(self, plan, base, slug):
        self.base = base
        self.slug = slug
        t = plan.get("terrace")
        self.terrace = t and {"rect": box4(t["rect"]), "level": t["level"],
                              "snow": box4(t["snow"]) if t.get("snow") else None}
        self.walls = [{**w, "rect": box4(w["rect"]), "segments": [box4(s) for s in w["segments"]]}
                      for w in plan["walls"]]
        self.steps = [{**s, "rect": box4(s["rect"]),
                       "treads": [(box4(t["rect"]), t["top"]) for t in s["treads"]],
                       "cheeks": [(box4(c["rect"]), c["tops"]) for c in s["cheeks"]]}
                      for s in plan["steps"]]
        # the slabs the snow is cut back to, with their level at a point: the path runs and the aprons
        self.slabs = [(box4(r["rect"]), r["tops"]) for p in plan["paths"] for r in p["runs"]]
        self.slabs += [(box4(a["rect"]), [a["level"]] * 4) for a in plan["aprons"]]
        self.aprons = [box4(a["rect"]) for a in plan["aprons"]]
        self.runs = len(self.slabs) - len(self.aprons)
        # the holes the plinth leaves for them: each flight with its cheeks, the terrace, and each slab pulled in
        # from its edges so the snow runs a little over them, except where it meets another
        steps = [(min(c[0][0] for c in s["cheeks"] + [(s["rect"],)]), min(c[0][1] for c in s["cheeks"] + [(s["rect"],)]),
                  max(c[0][2] for c in s["cheeks"] + [(s["rect"],)]), max(c[0][3] for c in s["cheeks"] + [(s["rect"],)]))
                 for s in self.steps]
        whole = [r for r, _ in self.slabs] + steps + ([self.terrace["rect"]] if self.terrace else [])
        self.holes = [(r, min(t for _, t in s["treads"]) - 0.2) for r, s in zip(steps, self.steps)]
        if self.terrace:
            self.holes.append((self.terrace["rect"], self.terrace["level"] - 0.02))
        for r, tops in self.slabs:
            self.holes.append((shrink(r, touching_sides(r, whole), C.SITE_HOLE_INSET), min(tops) - 0.02))
        lows = [w["lower"] for w in self.walls if w.get("lower") is not None]
        lows += [min(tops) for _, tops in self.slabs] + [t for s in self.steps for _, t in s["treads"]]
        self.lowest = min(lows + [base(0.0, 0.0)])
        self.foot = self.lowest - C.SITE_SINK

    # ------------------------------------------------------------ the snow

    def in_hole(self, x, y):
        return any(inside(r, x, y) for r, _ in self.holes)

    def slab_level(self, x, y):
        """The distance to the nearest path or apron, and its level there."""
        best = None
        for r, tops in self.slabs:
            d, (cx, cy) = rect_distance(r, x, y)
            if best is None or d < best[0] - 1e-9:
                best = (d, bilinear(r, tops, cx, cy))
        return best

    def field(self, x, y, b):
        """The snow before the paths: the plinth's height `b`, drifted up against each wall that holds the
        snow and falling in front of it to the lower snow, a bank past its ends, and a little snow banked
        against every other long face of a wall."""
        z = b
        for w in self.walls:
            if w.get("lower") is None:
                continue
            x0, face, x1, _ = w["rect"]
            t = face - y
            if t <= 0:
                continue
            low = w["lower"]
            u = max(x0 - x, x - x1, 0.0)
            drift = low + (b - low) * (1 - smoothstep(0.0, C.SITE_DRIFT_W, t))
            bank = b + (low - b) * smoothstep(0.0, C.SITE_BANK, t - C.SITE_FAN * u)
            k = 1 - smoothstep(0.0, C.SITE_SPAN_BLEND, u)
            z = min(z, k * drift + (1 - k) * bank)
        side = 0.0
        height, width = C.SITE_SIDE_DRIFT
        for face, (lo, hi), d in self.faces(x, y):
            beyond = max(lo - (x if face in "yY" else y), (x if face in "yY" else y) - hi, 0.0)
            side = max(side, height * (1 - smoothstep(0.0, width, d)) * (1 - smoothstep(0.0, 0.5, beyond)))
        return z + side

    def faces(self, x, y):
        """Each long face of a wall that takes a side drift, with its span along the wall and how far out from
        it the point is (negative behind it): 'y'/'Y' for the faces toward -y/+y of a wall along x, 'x'/'X' for
        a wall along y. A wall that holds the snow takes its drift on its low face instead."""
        for w in self.walls:
            x0, y0, x1, y1 = w["rect"]
            if w["axis"] == "x":
                if w.get("lower") is None and y <= y0:
                    yield "y", (x0, x1), y0 - y
                if y >= y1:
                    yield "Y", (x0, x1), y - y1
            else:
                if x <= x0:
                    yield "x", (y0, y1), x0 - x
                if x >= x1:
                    yield "X", (y0, y1), x - x1

    def ground(self, x, y, sx=None, sy=None):
        """The snow's height, which the plinth takes: `field`, cut back along each path and apron to just above
        it, with a shovelled berm beside it."""
        sx, sy = (x, y) if sx is None else (sx, sy)
        z = self.field(x, y, self.base(x, y, sx, sy))
        if self.slabs:
            s, level = self.slab_level(x, y)
            reach = C.SITE_BERM[1] + 4 * C.SITE_BERM[2]
            if s < reach:
                edge = level + C.SITE_LIP
                height, at, width = C.SITE_BERM
                snow = z + height * math.exp(-(((s - at) / width) ** 2))
                z = edge + (snow - edge) * smoothstep(0.0, C.SITE_EDGE_BANK, s)
        return z

    def cull_ground(self, x, y):
        """What buries a piece's faces: the snow, or in a hole, just under the piece that fills it."""
        for r, below in self.holes:
            if inside(r, x, y):
                return below
        return self.ground(x, y)

    def features(self, holes_extra, bounds):
        """The plinth's refinement over the site works: (constraint outlines, points in order of priority). The
        outlines are the holes' edges (and `holes_extra`, the Interiors' holes), each a closed list of points;
        the points follow the lines the snow bends along: each wall's faces, the drift and the bank in front of a
        wall that holds the snow, the crest and the foot of each berm, and the edge of each side drift. Only
        points within `bounds` (the plinth) are kept."""
        sp = C.SITE_SPACING
        bx0, by0, bx1, by1 = bounds

        def line(ax, ay, bx, by):
            n = max(1, math.ceil(math.hypot(bx - ax, by - ay) / sp))
            return [(ax + (bx - ax) * i / n, ay + (by - ay) * i / n) for i in range(n + 1)]

        def ring(r):
            x0, y0, x1, y1 = r
            pts = []
            for a, b in (((x0, y0), (x1, y0)), ((x1, y0), (x1, y1)), ((x1, y1), (x0, y1)), ((x0, y1), (x0, y0))):
                pts += line(*a, *b)[:-1]
            return pts

        def around(r, s):
            """The rounded outline `s` out from a rectangle."""
            x0, y0, x1, y1 = r
            pts = []
            for (cx, cy), a0 in (((x1, y0), -90), ((x1, y1), 0), ((x0, y1), 90), ((x0, y0), 180)):
                for k in range(4):
                    a = math.radians(a0 + 90 * k / 3)
                    pts.append((cx + s * math.cos(a), cy + s * math.sin(a)))
            out = []
            for i, p in enumerate(pts):
                q = pts[(i + 1) % len(pts)]
                out += line(*p, *q)[:-1]
            return out

        outlines = [ring(r) for r, _ in self.holes] + [ring(r) for r in holes_extra]
        tiers = []
        # the walls' faces, where the snow meets them
        faces = []
        for w in self.walls:
            x0, y0, x1, y1 = w["rect"]
            faces += line(x0, y0, x1, y0) + line(x0, y1, x1, y1) + line(x0, y0, x0, y1) + line(x1, y0, x1, y1)
        tiers.append(faces)
        # the berms along the paths and aprons: crest, then foot
        height, at, width = C.SITE_BERM
        for s in (at, at + 1.7 * width):
            pts = [p for r, _ in self.slabs for p in around(r, s)]
            tiers.append([p for p in pts if self.slab_level(*p)[0] > s - 0.02])
        # in front of each wall that holds the snow: halfway down the drift and at its foot, and past its ends the
        # bank's top and foot
        drift, bank = [], []
        for w in self.walls:
            if w.get("lower") is None:
                continue
            x0, face, x1, _ = w["rect"]
            for t in (C.SITE_DRIFT_W / 2, C.SITE_DRIFT_W):
                drift += line(x0 - C.SITE_SPAN_BLEND, face - t, x1 + C.SITE_SPAN_BLEND, face - t)
            for end, sign in ((x0, -1), (x1, 1)):
                far = (end - bx0) if sign < 0 else (bx1 - end)
                for off in (0.0, C.SITE_BANK):
                    bank += line(end, face - off, end + sign * far, face - off - C.SITE_FAN * far)
        tiers += [drift, bank]
        # the edge of each side drift
        side = []
        width = C.SITE_SIDE_DRIFT[1]
        for w in self.walls:
            x0, y0, x1, y1 = w["rect"]
            if w["axis"] == "x":
                side += line(x0, y1 + width, x1, y1 + width)
                if w.get("lower") is None:
                    side += line(x0, y0 - width, x1, y0 - width)
            else:
                side += line(x0 - width, y0, x0 - width, y1) + line(x1 + width, y0, x1 + width, y1)
        tiers.append(side)
        keep = lambda p: bx0 + 1e-3 < p[0] < bx1 - 1e-3 and by0 + 1e-3 < p[1] < by1 - 1e-3 and not self.in_hole(*p)
        return outlines, [[p for p in tier if keep(p)] for tier in tiers]

    # ------------------------------------------------------------ the pieces

    def pieces(self):
        """Every built piece: (name, material, shape, bevel or None), a shape being ("box", x0, y0, z0, x1, y1,
        z1) or a prism's eight corners."""
        out = []
        foot = self.foot
        if self.terrace:
            x0, y0, x1, y1 = r = self.terrace["rect"]
            level = self.terrace["level"]
            out.append(("site-paving", "stone", ("box", x0, y0, level - C.SITE_PAVING, x1, y1, level), None))
            if self.terrace["snow"]:
                # thick at the terrace's edges, thinning toward the edges it has inside the terrace
                sr = self.terrace["snow"]
                inner = {k for k, a, b in (("x0", sr[0], r[0]), ("y0", sr[1], r[1]), ("x1", sr[2], r[2]),
                                            ("y1", sr[3], r[3])) if abs(a - b) > 1e-4}
                thick, thin = C.SITE_TERRACE_SNOW
                on = [("x0", "y0"), ("x1", "y0"), ("x1", "y1"), ("x0", "y1")]
                tops = [level + (thin if inner & set(c) else thick) for c in on]
                out.append(("site-terrace-snow", "snow", prism(sr, tops, bottom=level), (0.012, 1)))
        segments = [s for w in self.walls for s in w["segments"]]
        for w in self.walls:
            for i, s in enumerate(w["segments"]):
                x0, y0, x1, y1 = s
                out.append((f"site-wall-{w['name']}-{i}", "concrete", ("box", x0, y0, foot, x1, y1, w["top"]),
                            C.BEVEL_SITE_WALL))
                # its snow cap, a little proud of it, but flush with the cap of a wall its end meets
                o = C.SITE_CAP_PROUD
                cap = [x0 - o, y0 - o, x1 + o, y1 + o]
                for k, (coord, sign) in enumerate(((x0, -1), (y0, -1), (x1, 1), (y1, 1))):
                    along_x = k in (0, 2)
                    if w["axis"] == ("y" if along_x else "x"):
                        continue  # a long face
                    for t in segments:
                        if t is s:
                            continue
                        lo, hi = (t[0], t[2]) if along_x else (t[1], t[3])
                        a, b = (t[1], t[3]) if along_x else (t[0], t[2])
                        span = (y0, y1) if along_x else (x0, x1)
                        if min(b, span[1]) - max(a, span[0]) > 1e-3 and lo - 1e-4 <= coord <= hi + 1e-4:
                            cap[k] = (lo - o) if sign > 0 else (hi + o)
                out.append((f"site-wall-cap-{w['name']}-{i}", "snow",
                            ("box", cap[0], cap[1], w["top"], cap[2], cap[3], w["top"] + C.SITE_CAP), C.BEVEL_SITE_CAP))
        for s in self.steps:
            for i, (r, top) in enumerate(s["treads"]):
                out.append((f"site-tread-{s['name']}-{i}", "stone", ("box", r[0], r[1], foot, r[2], r[3], top),
                            C.BEVEL_SITE_TREAD))
            for i, (r, tops) in enumerate(s["cheeks"]):
                out.append((f"site-cheek-{s['name']}-{i}", "concrete", prism(r, tops, bottom=foot), C.BEVEL_SITE_WALL))
                # its cap, proud of it but at the end against the wall it runs from
                o = C.SITE_CAP_PROUD
                wall = s.get("wall")
                upper = {"front": "y1", "back": "y0", "left": "x1", "right": "x0"}[s["down"]]
                grow = [(-o, "x0"), (-o, "y0"), (o, "x1"), (o, "y1")]
                cap = tuple(c + (0.0 if (wall and side == upper) else d) for c, (d, side) in zip(r, grow))
                out.append((f"site-cheek-cap-{s['name']}-{i}", "snow", prism(cap, [t + C.SITE_CAP for t in tops], thickness=C.SITE_CAP),
                            C.BEVEL_SITE_CHEEK_CAP))
        for i, (r, tops) in enumerate(self.slabs):
            if i < self.runs:
                # one slab to each run, so no joint or bevel breaks it into slivers
                out.append((f"site-path-{i}", "stone", prism(r, tops, thickness=C.SITE_FLAG), None))
            else:
                out.append((f"site-apron-{i - self.runs}", "concrete",
                            ("box", r[0], r[1], tops[0] - C.SITE_APRON, r[2], r[3], tops[0]), None))
        return out

    def lights(self, set_in):
        """The set-in lights: (slot box, lamp position, the direction it shines). `set_in` is the record's lights
        in walls; each flight with lights has one in each cheek, over its second tread."""
        out = []
        walls = {w["name"]: w for w in self.walls}
        normals = {"front": (0, -1), "back": (0, 1), "left": (-1, 0), "right": (1, 0)}
        for light in set_in:
            w = walls[light["wall"]]
            x0, y0, x1, y1 = w["rect"]
            nx, ny = normals[light["face"]]
            z = w["top"] - C.SITE_LIGHT_BELOW
            if w["axis"] == "x":
                x, y = light["at"], (y0 if ny < 0 else y1)
                slot = (x - 0.07, min(y, y + ny * 0.006), z - 0.02, x + 0.07, max(y, y + ny * 0.006), z + 0.02)
            else:
                x, y = (x0 if nx < 0 else x1), light["at"]
                slot = (min(x, x + nx * 0.006), y - 0.07, z - 0.02, max(x, x + nx * 0.006), y + 0.07, z + 0.02)
            out.append((slot, (x + nx * 0.03, y + ny * 0.03, z), (nx * 0.55, ny * 0.55, -0.83)))
        for s in self.steps:
            if not s["lights"]:
                continue
            r, top = s["treads"][min(1, len(s["treads"]) - 1)]
            z = top + C.SITE_LIGHT_ABOVE
            across_x = s["down"] in ("front", "back")
            for cr, _ in s["cheeks"]:
                # the cheek's face toward the treads
                if across_x:
                    x, n = (cr[2], 1) if cr[2] <= r[0] + 1e-4 else (cr[0], -1)
                    y = (r[1] + r[3]) / 2
                    slot = (min(x, x + n * 0.006), y - 0.07, z - 0.02, max(x, x + n * 0.006), y + 0.07, z + 0.02)
                    out.append((slot, (x + n * 0.03, y, z), (n * 0.6, 0.0, -0.8)))
                else:
                    y, n = (cr[3], 1) if cr[3] <= r[1] + 1e-4 else (cr[1], -1)
                    x = (r[0] + r[2]) / 2
                    slot = (x - 0.07, min(y, y + n * 0.006), z - 0.02, x + 0.07, max(y, y + n * 0.006), z + 0.02)
                    out.append((slot, (x, y + n * 0.03, z), (0.0, n * 0.6, -0.8)))
        return out

    # ------------------------------------------------------------ Snow Shrubs

    def shrubs(self, record):
        """Each Snow Shrub as meshes: (name, material, vertices, faces, fine), where `fine` marks the twigs,
        which bake at a lower texel density. A low snow mound of two or three soft lumps, its rim sunk in the
        snow around it, with dark timber twig tips standing out of it; its shape seeded by the House and its
        place in the record, so no two are alike."""
        out = []
        for i, shrub in enumerate(record):
            rng = random.Random(f"{self.slug}:shrub:{i}")
            cx, cy = shrub["at"]
            size = shrub["size"]
            lo, hi = C.SHRUB_HEIGHT
            h = min(max(lo + (hi - lo) * (size - 0.5) / 0.6 * rng.uniform(0.85, 1.15), lo), hi)
            # the lumps: (x, y, radius, height), the first in the middle, the others leaning out of it, all within
            # the shrub's size across
            r = size / 2
            lumps = [(cx, cy, r * 0.72, h)]
            turn = rng.uniform(0, math.tau)
            for k in range(rng.randint(1, 2)):
                a = turn + k * rng.uniform(1.9, 2.6)
                d = r * rng.uniform(0.3, 0.42)
                lumps.append((cx + d * math.cos(a), cy + d * math.sin(a), r - d, h * rng.uniform(0.55, 0.8)))

            def height(x, y):
                return max((lh * max(0.0, 1 - (math.hypot(x - lx, y - ly) / lr) ** 2) ** 0.6
                            for lx, ly, lr, lh in lumps), default=0.0)

            def reach(a):
                """How far out from the middle the lumps reach along a bearing."""
                ux, uy = math.cos(a), math.sin(a)
                best = 0.0
                for lx, ly, lr, _ in lumps:
                    px, py = lx - cx, ly - cy
                    b = px * ux + py * uy
                    c = px * px + py * py - lr * lr
                    if b * b - c >= 0:
                        best = max(best, b + math.sqrt(b * b - c))
                return best

            base = self.ground(cx, cy)
            seg, fractions = 14, (1.0, 0.85, 0.66, 0.46, 0.26)
            verts, faces = [], []
            for k, f in enumerate(fractions):
                for j in range(seg):
                    a = turn + math.tau * j / seg
                    rr = reach(a) * f
                    x, y = cx + rr * math.cos(a), cy + rr * math.sin(a)
                    z = self.ground(x, y) - 0.04 if k == 0 else base + height(x, y) * rng.uniform(0.96, 1.04)
                    verts.append((x, y, z))
            verts.append((cx, cy, base + height(cx, cy)))
            for k in range(len(fractions) - 1):
                for j in range(seg):
                    a, b = k * seg + j, k * seg + (j + 1) % seg
                    faces.append((a, b, b + seg, a + seg))
            top = len(verts) - 1
            for j in range(seg):
                k = len(fractions) - 1
                faces.append((k * seg + j, k * seg + (j + 1) % seg, top))
            out.append((f"site-shrub-{i}", "snow", verts, faces, False))

            # the twigs: thin tapered three-sided prisms standing out of the mound, a few forked
            tverts, tfaces = [], []

            def twig(px, py, pz, dx, dy, dz, length, radius):
                n = math.sqrt(dx * dx + dy * dy + dz * dz)
                dx, dy, dz = dx / n, dy / n, dz / n
                ux, uy, uz = (-dy, dx, 0.0) if abs(dz) < 0.99 else (1.0, 0.0, 0.0)
                m = math.sqrt(ux * ux + uy * uy + uz * uz)
                ux, uy, uz = ux / m, uy / m, uz / m
                vx, vy, vz = dy * uz - dz * uy, dz * ux - dx * uz, dx * uy - dy * ux
                start = len(tverts)
                for q in range(3):
                    a = math.tau * q / 3
                    ca, sa = math.cos(a) * radius, math.sin(a) * radius
                    tverts.append((px + ux * ca + vx * sa, py + uy * ca + vy * sa, pz + uz * ca + vz * sa))
                tverts.append((px + dx * length, py + dy * length, pz + dz * length))
                for q in range(3):
                    tfaces.append((start + q, start + (q + 1) % 3, start + 3))
                k = rng.uniform(0.45, 0.65)
                return (px + dx * length * k, py + dy * length * k, pz + dz * length * k), (dx, dy, dz)

            for _ in range(rng.randint(*C.SHRUB_TWIGS)):
                a = rng.uniform(0, math.tau)
                rr = reach(a) * rng.uniform(0.1, 0.7)
                px, py = cx + rr * math.cos(a), cy + rr * math.sin(a)
                pz = base + height(px, py) - 0.08
                # leaning out from the middle, more so toward the rim
                tilt = math.radians(rng.uniform(10, 30) + 40 * rr / max(reach(a), 1e-3))
                dx, dy, dz = math.sin(tilt) * math.cos(a), math.sin(tilt) * math.sin(a), math.cos(tilt)
                length = rng.uniform(*C.SHRUB_TWIG) + 0.08
                radius = rng.uniform(*C.SHRUB_TWIG_RADIUS)
                mid, (ex, ey, ez) = twig(px, py, pz, dx, dy, dz, length, radius)
                if rng.random() < 0.6:
                    b = rng.uniform(-1.2, 1.2) + a
                    twig(*mid, ex + 0.8 * math.cos(b), ey + 0.8 * math.sin(b), ez + 0.2, length * 0.5, radius * 0.6)
            out.append((f"site-twigs-{i}", "timber", tverts, tfaces, True))
        return out
