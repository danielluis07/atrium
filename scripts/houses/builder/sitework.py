"""Site works around Lyngen House: a go/no-go prototype (issue #86), hard-coded here and nowhere else.

Built exterior detail on the snow in front of the House, in its own materials: a lounge terrace edged by a
low board-formed concrete wall, which runs on in front of `lower` round a snow garden, stone steps down
through the wall, a stone path along its foot to the garage, a concrete apron at the garage door
and a few small warm lights set into the wall and the steps. Everything is
in the House frame (metres, z up, the front faces -y), and nothing here needs bpy.

The pieces are solids that build.py bakes with the shell and exports as the `site` node. The snow they meet
is the plinth's: `ground` is its height, which build.py samples on a grid refined over `RECT` (`lines`), so
the drifts against the walls, the banks along the path and the lower snow in front of the terrace are all
one surface with the plinth, lit by its bake and shadowed as it is.
"""

import math

# ---------------------------------------------------------------- the pieces' dimensions

WALL = 0.3  # the terrace wall's thickness
WALL_TOP = 0.45  # above the terrace
FOOT = -0.6  # every piece reaches this far down, under the snow
CAP = 0.08  # the snow on a wall's top
TERRACE_SNOW = 0.05  # the thin layer on the terrace beyond the canopy, at the wall
LOWER = -0.3  # the snow in front of the terrace wall, below the shelf the House stands on
FLAG = 0.08  # the path's stone, its thickness

# the terrace: stone paving level with the lounge floor, in front of `main` and out past the roof
TERRACE = (-3.4, -8.6, 4.6, -4.3)
DRIP = -6.5  # the canopy's edge: the snow lies beyond it, the paving under it is clear
# the wall: along the front, back along each end to the House, and between the terrace and the garden
FRONT_Y = (-8.9, -8.6)
WALL_X = (-3.7, 11.4)  # its outer faces
DIVIDER = 4.6  # the terrace's east edge, where the garden begins
# the steps: a gap in the front wall, three risers down between two sloping cheeks, in front of the lounge
STAIR_X = (1.6, 3.0)
CHEEK = 0.25
TREADS = [(-8.9, -9.25, -0.15), (-9.25, -9.6, -0.30)]  # (back, front, top)
STAIR_FOOT = -9.6
# the path: out from the steps past the drift, west along the wall's foot, then north to the garage door,
# rising gently
PATH_W = 1.2
PATH_OUT = -10.0  # the path's near edge, clear of the drift
PATH_D = (STAIR_X[0], PATH_OUT, STAIR_X[1], STAIR_FOOT)  # out from the steps, x0 y0 x1 y1
PATH_B = (-10.0, PATH_OUT - PATH_W, STAIR_X[1], PATH_OUT)  # west
PATH_C = (-10.0, PATH_OUT, -8.8, -6.3)  # north
APRON = (-11.8, -6.3, -7.0, -4.76)  # concrete, in front of the garage door, level with the floor
PATH_LINE = [(sum(STAIR_X) / 2, STAIR_FOOT), (sum(STAIR_X) / 2, PATH_OUT - PATH_W / 2),
             (-9.4, PATH_OUT - PATH_W / 2), (-9.4, -6.3)]  # the path's centre line, from the steps
PATH_FROM, PATH_TO = TREADS[-1][2] - 0.15, 0.0  # its level at the steps and at the apron

# ---------------------------------------------------------------- the snow

DRIFT_TOP = 0.0  # the drift against the wall's outer face reaches this high, and SIDE_DRIFT more
DRIFT_W = 1.1  # and runs out over this far
BANK = 1.6  # past the ends of the wall the shelf falls to the lower snow over this far
FAN = 1.2  # and the fall draws back from the House this fast beside it
SPAN_BLEND = 0.8  # the drift gives way to the bank over this far past each end of the wall
LIP = 0.02  # the snow's edge along the path stands this far above the flags
EDGE_BANK = 0.3  # from the lip up to the snow beside the path
BERM = 0.2  # the shovelled snow along the path: its height,
BERM_AT = 0.45  # how far out from the edge it peaks,
BERM_W = 0.32  # and how wide it is
SIDE_DRIFT = 0.1  # a little snow banked against the side walls' outer faces
SIDE_DRIFT_W = 0.6

# the plinth is refined over this rectangle (x0, y0, x1, y1), and it holds every piece
RECT = (-12.8, -12.6, 13.4, -3.2)
# the refined grid's spacing across and in depth, besides the lines at each piece's edges: seen from the arc's
# low pitch, depth is foreshortened about four times, and cells that are thin on screen cost the GPU
FINE = (0.6, 0.9)


def smoothstep(a, b, x):
    t = min(max((x - a) / (b - a), 0.0), 1.0)
    return t * t * (3 - 2 * t)


def inside(r, x, y, e=1e-4):
    return r[0] + e < x < r[2] - e and r[1] + e < y < r[3] - e


def rect_distance(r, x, y):
    """Distance from a plan point to a rectangle, 0 inside it, and the nearest point in it."""
    cx, cy = min(max(x, r[0]), r[2]), min(max(y, r[1]), r[3])
    return math.hypot(x - cx, y - cy), (cx, cy)


def path_level(x, y):
    """The path's top at a point on or beside it: rising along its centre line from the steps to the apron."""
    if inside(APRON, x, y, -1e-4):
        return 0.0
    best, run = None, 0.0
    lengths = [math.dist(a, b) for a, b in zip(PATH_LINE, PATH_LINE[1:])]
    total = sum(lengths)
    for (ax, ay), (bx, by), n in zip(PATH_LINE, PATH_LINE[1:], lengths):
        t = min(max(((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / (n * n), 0.0), 1.0)
        d = math.hypot(x - (ax + (bx - ax) * t), y - (ay + (by - ay) * t))
        if best is None or d < best[0]:
            best = (d, run + t * n)
        run += n
    return PATH_FROM + (PATH_TO - PATH_FROM) * best[1] / total


# ---------------------------------------------------------------- the pieces

def walls():
    """The terrace wall as (x0, y0, z0, x1, y1, z1) boxes: the front, broken by the steps, and each side."""
    (fy0, fy1), (wx0, wx1) = FRONT_Y, WALL_X
    return [
        (wx0, fy0, FOOT, STAIR_X[0], fy1, WALL_TOP),
        (STAIR_X[1], fy0, FOOT, wx1, fy1, WALL_TOP),
        (wx0, fy1, FOOT, wx0 + WALL, -5.4, WALL_TOP),  # to the chimney's front
        (DIVIDER, fy1, FOOT, DIVIDER + WALL, -3.4, WALL_TOP),  # to the front of `lower`
        (wx1 - WALL, fy1, FOOT, wx1, -3.4, WALL_TOP),  # to `lower`'s end
    ]


def cheek_top(y):
    """A cheek's top, falling with the steps from the wall's top."""
    return WALL_TOP + (TREADS[-1][2] + 0.25 - WALL_TOP) * (FRONT_Y[0] - y) / (FRONT_Y[0] - STAIR_FOOT)


def cheeks():
    """The two cheeks beside the steps as prisms: (x0, x1, y0, y1, z0, top at y0, top at y1)."""
    return [(x0, x1, STAIR_FOOT, FRONT_Y[0], FOOT, cheek_top(STAIR_FOOT), cheek_top(FRONT_Y[0]))
            for x0, x1 in ((STAIR_X[0] - CHEEK, STAIR_X[0]), (STAIR_X[1], STAIR_X[1] + CHEEK))]


def slabs():
    """The path's stone, one slab to each straight run so no joint or bevel breaks it into slivers, as prisms:
    (x0, x1, y0, y1, top at each corner (x0y0, x1y0, x1y1, x0y1)), each corner at the path's level."""
    bx0, by0, bx1, by1 = PATH_B
    cx0, _, cx1, cy1 = PATH_C
    runs = [PATH_D, (STAIR_X[0], by0, bx1, by1), (cx1, by0, STAIR_X[0], by1), (cx0, by0, cx1, by1), PATH_C]
    return [(x0, x1, y0, y1, [path_level(x, y) for x, y in ((x0, y0), (x1, y0), (x1, y1), (x0, y1))])
            for x0, y0, x1, y1 in runs]


def pieces():
    """Every piece: (name, material, shape, bevel or None where one would be too fine to see), where a shape is ("box", x0, y0, z0, x1, y1, z1) or
    ("prism", eight corners: the bottom four counter-clockwise from x0y0, then the top four)."""
    out = []
    for i, w in enumerate(walls()):
        out.append((f"site-wall-{i}", "concrete", ("box", *w), (0.012, 1)))
        # a snow cap on each, a little proud of both faces and rounded
        o = 0.015
        out.append((f"site-wall-cap-{i}", "snow", ("box", w[0] - o, w[1] - o, WALL_TOP, w[3] + o, w[4] + o, WALL_TOP + CAP), (0.035, 2)))
    for i, (x0, x1, y0, y1, z0, t0, t1) in enumerate(cheeks()):
        out.append((f"site-cheek-{i}", "concrete", prism(x0, x1, y0, y1, z0, [t0, t0, t1, t1]), (0.012, 1)))
        o = 0.015
        out.append((f"site-cheek-cap-{i}", "snow", prism(x0 - o, x1 + o, y0 - o, y1, None, [t0, t0, t1, t1], CAP), (0.03, 2)))
    x0, y0, x1, y1 = TERRACE
    out.append(("site-paving", "stone", ("box", x0, y0, -0.2, x1, y1, 0.0), None))
    out.append(("site-landing", "stone", ("box", STAIR_X[0], FRONT_Y[0], -0.2, STAIR_X[1], FRONT_Y[1], 0.0), None))
    # thinning toward the canopy's drip line, where the paving comes clear
    out.append(("site-terrace-snow", "snow", prism(x0, x1, y0, DRIP, 0.0, [TERRACE_SNOW, TERRACE_SNOW, 0.012, 0.012]),
                (0.012, 1)))
    for i, (back, front, top) in enumerate(TREADS):
        out.append((f"site-tread-{i}", "stone", ("box", STAIR_X[0], front, FOOT, STAIR_X[1], back, top), (0.015, 1)))
    for i, (fx0, fx1, fy0, fy1, tops) in enumerate(slabs()):
        out.append((f"site-path-{i}", "stone", prism(fx0, fx1, fy0, fy1, None, tops, FLAG), None))
    ax0, ay0, ax1, ay1 = APRON
    out.append(("site-apron", "concrete", ("box", ax0, ay0, -0.25, ax1, ay1, 0.0), None))
    return out


def prism(x0, x1, y0, y1, z0, tops, thickness=None):
    """A box with its own height at each top corner (x0y0, x1y0, x1y1, x0y1): flat-bottomed at z0, or
    `thickness` deep under each."""
    corners = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
    bottom = [(x, y, z0 if thickness is None else t - thickness) for (x, y), t in zip(corners, tops)]
    return ("prism", *bottom, *[(x, y, t) for (x, y), t in zip(corners, tops)])


def lights():
    """The set-in lights: (slot box, lamp position, the direction it shines). Two in the cheeks across the
    steps, two in the wall's outer face over the snow in front of it."""
    out = []
    ym, z = (TREADS[0][1] + TREADS[0][0]) / 2, TREADS[0][2] + 0.17
    for x, n in ((STAIR_X[0], 1), (STAIR_X[1], -1)):
        slot = (min(x, x + n * 0.006), ym - 0.07, z - 0.02, max(x, x + n * 0.006), ym + 0.07, z + 0.02)
        out.append((slot, (x + n * 0.03, ym, z), (n * 0.6, 0.0, -0.8)))
    y = FRONT_Y[0]
    for x in (-1.4, 8.0):
        z = DRIFT_TOP + SIDE_DRIFT + 0.17
        slot = (x - 0.07, y - 0.006, z - 0.02, x + 0.07, y, z + 0.02)
        out.append((slot, (x, y - 0.03, z), (0.0, -0.55, -0.83)))
    return out


# ---------------------------------------------------------------- the snow's height

def covered():
    """The plan rectangles under a piece, each with the plinth's height under it: None for "just under the
    piece", which is the path's flags or a wall's or step's foot."""
    return [
        (TERRACE, -0.3),
        ((STAIR_X[0] - CHEEK, STAIR_FOOT, STAIR_X[1] + CHEEK, FRONT_Y[1]), None),
        *[((w[0], w[1], w[3], w[4]), None) for w in walls()],
        (PATH_D, None), (PATH_B, None), (PATH_C, None), (APRON, None),
    ]


COVERED = covered()
PATHS = [PATH_D, PATH_B, PATH_C, APRON]


def field(x, y):
    """The snow before the path: the shelf the House stands on (±0.00), falling in front of the terrace
    wall to the lower snow, drifted up against the wall's faces, and past the wall's ends a soft bank."""
    if y >= -3.4:
        return 0.0  # beside the House, where the volumes stand
    (fy0, _), (wx0, wx1) = FRONT_Y, WALL_X
    t = fy0 - y  # in front of the wall's outer face
    u = max(wx0 - x, x - wx1, 0.0)  # beyond its ends
    side = SIDE_DRIFT * (1 - smoothstep(0.0, SIDE_DRIFT_W, u)) * (1 - smoothstep(0.0, 0.5, t))
    if t <= 0:
        # behind the front: the shelf, or inside the wall the garden, level with the floor
        return side if u > 0 else 0.0
    drift = LOWER + (DRIFT_TOP - LOWER) * (1 - smoothstep(0.0, DRIFT_W, t))
    bank = LOWER * smoothstep(0.0, BANK, t - FAN * u)
    w = 1 - smoothstep(0.0, SPAN_BLEND, u)
    return w * drift + (1 - w) * bank + side


def under(x, y):
    """The plinth's height where a piece covers it, hidden under the piece, or None where snow shows. A point
    on an edge two pieces share is covered too."""
    e = 1e-3
    if not all(any(inside(r, x + dx, y + dy, 0.0) for r, _ in COVERED) for dx in (-e, e) for dy in (-e, e)):
        return None
    heights = [h if h is not None else (path_level(x, y) - 0.12 if r in PATHS else FOOT + 0.1)
               for r, h in COVERED if inside(r, x, y, -e)]
    return min(heights)


def ground(x, y):
    """The snow's height, which the plinth takes over `RECT`: `field`, cut along the path to just above its
    flags and banked up beside it, and sunk out of sight under every piece."""
    h = under(x, y)
    if h is not None:
        return h
    s, near = min((rect_distance(p, x, y) for p in PATHS), key=lambda d: d[0])
    edge = path_level(*near) + LIP
    snow = field(x, y) + BERM * math.exp(-(((s - BERM_AT) / BERM_W) ** 2))
    return edge + (snow - edge) * smoothstep(0.0, EDGE_BANK, s)


def lines(need_x=(), need_y=()):
    """The refined grid's x and y lines over `RECT`: each piece's edges, a line just inside the path's for its
    lip and one out on its bank, the lines the caller needs (`need_x`, `need_y`), and between them a uniform
    spacing, kept clear of the rest, since a line close beside another runs a row of slivers right across the
    rectangle, which the GPU shades at a cost."""
    x0, y0, x1, y1 = RECT
    need = ([x0, x1, *need_x], [y0, y1, *need_y])
    extra = ([], [])
    for r, _ in COVERED:
        lip = (-0.06, EDGE_BANK) if r in PATHS else ()
        for axis, (lo, hi) in ((0, (r[0], r[2])), (1, (r[1], r[3]))):
            need[axis].extend((lo, hi))
            extra[axis].extend([lo - o for o in lip] + [hi + o for o in lip])

    def clean(fixed, optional, a, b, gap):
        """`fixed` inside a..b, and each of `optional` that keeps `gap` clear of every line so far."""
        out = sorted({round(v, 5) for v in fixed if a <= v <= b})
        for v in sorted(optional):
            if a <= v <= b and all(abs(v - w) > gap for w in out):
                out = sorted(out + [v])
        return out

    need[1].append((FRONT_Y[0] + FRONT_Y[0] - DRIFT_W) / 2)  # halfway down the drift
    n = (round((x1 - x0) / FINE[0]), round((y1 - y0) / FINE[1]))
    uniform = ([x0 + (x1 - x0) * i / n[0] for i in range(n[0] + 1)], [y0 + (y1 - y0) * i / n[1] for i in range(n[1] + 1)])
    xs, ys = clean(need[0], extra[0], x0, x1, 0.05), clean(need[1], extra[1], y0, y1, 0.05)
    return clean(xs, uniform[0], x0, x1, 0.6 * FINE[0]), clean(ys, uniform[1], y0, y1, 0.6 * FINE[1])


LOWEST = min(FOOT + 0.1, PATH_FROM - 0.12, -0.3)  # the plinth's lowest point, under the pieces
