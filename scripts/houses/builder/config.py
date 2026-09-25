"""Builder-wide constants: the detail values every House shares, never set per House.

See docs/design/house-schema.md. Lengths in metres, House frame (z up, the front faces -y).
"""

import math

# ---------------------------------------------------------------- bake modes

# res: shell lightmap size; plinth_res: snow plinth lightmap size; samples: Cycles spp;
# interior_res: the Interior's baked texture size
MODES = {
    "draft": {"res": 512, "plinth_res": 256, "samples": 64, "interior_res": 512},
    "final": {"res": 1024, "plinth_res": 512, "samples": 256, "interior_res": 1024},
}

# ---------------------------------------------------------------- openings

MULLION_PITCH = 1.65  # default pane width when an opening gives no mullion count
FRAME_WIDTH = 0.06  # mullion face width (half at the jambs)
FRAME_DEPTH = 0.14  # mullions, sill and head, measured out from the glass line
SILL_HEAD_HEIGHT = 0.07
TRANSOM_HEIGHT = 0.18  # the frame at each Level line an opening crosses
TRANSOM_DEPTH = 0.2
GLASS_INSET = 0.06  # glass sits this far out from the back of its recess
DOOR_THICKNESS = 0.06

# ---------------------------------------------------------------- slabs, fascias, snow

FASCIA_THICKNESS = 0.05
FASCIA_DROP = 0.02  # a fascia hangs this far below its slab's underside
SOFFIT_THICKNESS = 0.03
CAP_THICKNESS = 0.05  # metal cap around a volume top that is fully exposed
CAP_DEPTH = 0.22  # its height, centred a little below the top
SNOW_CUSHION = 0.12  # roof snow rises this far above the fascia or cap
STONE_SNOW = 0.18  # snow on an exposed stone mass top
SNOW_INSET = 0.01  # gap between roof snow and the fascia's inner face
MIN_SNOW_PATCH = 0.3  # exposed tops narrower than this get no snow

# ---------------------------------------------------------------- terrace recesses and balustrades

BALUSTRADE_HEIGHT = 1.0
BALUSTRADE_GLASS = 0.02
RAIL_WIDTH = 0.06
RAIL_HEIGHT = 0.06
TERRACE_SNOW = 0.08

# ---------------------------------------------------------------- downlights

DOWNLIGHT_PITCH = 2.1  # along each soffit's outer edge
DOWNLIGHT_INSET = 0.45  # in from the fascia
DOWNLIGHT_RADIUS = 0.05
DOWNLIGHT_WATTS = 60.0
DOWNLIGHT_CONE = math.radians(130)

# ---------------------------------------------------------------- bevels (width, segments)

BEVEL_VOLUME = (0.015, 2)
BEVEL_STONE = (0.03, 3)
BEVEL_SLAB = (0.01, 1)
BEVEL_METAL = (0.004, 1)
BEVEL_SNOW = (0.1, 4)
BEVEL_STONE_SNOW = (0.08, 3)
BEVEL_ANGLE = math.radians(30)

# ---------------------------------------------------------------- snow plinth

PLINTH_MARGIN = 12.0  # beyond the footprint on every side
PLINTH_GRID = 50  # subdivisions per side, for the edge fade into the live terrain
# where solids start below ±0.00, the plinth steps down in front of them. Past each end of their run the
# snow falls from grade to the lower floor across a fan this wide, measured from their back face.
GRADE_FAN = math.radians(60)

# ---------------------------------------------------------------- lightmaps

ISLAND_MARGIN = 0.004  # smart-project island margin, in UV units
BAKE_MARGIN = 8  # pixels of edge extension around each island
SMART_PROJECT_ANGLE = math.radians(66)
# shell faces no overview or arc camera sees bake at this fraction of the seen texels per metre
UNSEEN_TEXEL_RATIO = 0.25
# ---------------------------------------------------------------- light (blue hour)

# OKLCH (L, C, h), converted to linear sRGB by the builder
def oklch_to_linear(L, C_, h):
    a = C_ * math.cos(math.radians(h))
    b = C_ * math.sin(math.radians(h))
    l_ = L + 0.3963377774 * a + 0.2158037573 * b
    m_ = L - 0.1055613458 * a - 0.0638541728 * b
    s_ = L - 0.0894841775 * a - 1.2914855480 * b
    l, m, s = l_**3, m_**3, s_**3
    r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
    g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
    bb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    return (max(r, 0), max(g, 0), max(bb, 0))


SKY_ZENITH = (0.26, 0.06, 262)
SKY_HORIZON = (0.55, 0.06, 250)
WINDOW = (0.82, 0.12, 70)
DOWNLIGHT = (0.86, 0.09, 75)

# the afterglow: a compass bearing (degrees clockwise from north) and its height above the horizon
AFTERGLOW_BEARING = 245.0
AFTERGLOW_ELEVATION = math.radians(3)
AFTERGLOW_POWER = 6.0  # how tight the glow is around its bearing
WINDOW_SPILL_STRENGTH = 2.5  # glazing emission in the spill layer

CYCLES = {
    "max_bounces": 6,
    "diffuse_bounces": 4,
    "sample_clamp_indirect": 4.0,  # kills downlight and window fireflies in the indirect term
}

# ---------------------------------------------------------------- the Interior (ADR 0005)

# the options each kind's template honours: mirrors `Interior` in lib/house/schema.ts
INTERIOR_OPTIONS = {
    "lounge": {"fireplace": bool, "lamp": ("floor", "pendant"), "shelving": bool},
    "dining": {"lamp": ("floor", "pendant"), "shelving": bool},
    "kitchen": {"lamp": ("floor", "pendant"), "shelving": bool},
    "library": {"fireplace": bool, "lamp": ("floor", "pendant")},
    "bedroom": {"lamp": ("floor", "pendant")},
}
INTERIOR_FINISH = 0.02  # the finished floor and ceiling stand this far inside the room shell, clear of the concrete
INTERIOR_COLOR_SAMPLES = 16  # spp for the colour and emission bakes, which are noiseless
INTERIOR_LAMP = (0.8, 0.15, 62)  # OKLCH: lamps and downlights, a little warmer than the window glow
INTERIOR_FIRE = (0.72, 0.17, 50)
INTERIOR_LAMP_WATTS = 120.0
INTERIOR_DOWNLIGHT_WATTS = 45.0
INTERIOR_DOWNLIGHT_PITCH = 2.0
INTERIOR_FIRE_WATTS = 220.0
INTERIOR_SHADE_GLOW = 4.0  # emission strengths: lampshades, downlight discs, the fire
INTERIOR_DISC_GLOW = 20.0
INTERIOR_FIRE_GLOW = 12.0
INTERIOR_EXPOSURE = 2.0  # scales the whole baked room, to sit with the procedural rooms beside it

# ---------------------------------------------------------------- materials (the GLB's fixed enum)

# name: (linear base colour, roughness, metallic)
MATERIALS = {
    "concrete": ((0.34, 0.34, 0.335), 0.85, 0.0),
    "stone": ((0.28, 0.26, 0.23), 0.9, 0.0),
    "timber": ((0.46, 0.23, 0.10), 0.6, 0.0),
    "metal": ((0.035, 0.037, 0.04), 0.45, 0.3),  # coated dielectric, or dark fascias go flat black
    "snow": ((0.82, 0.84, 0.86), 0.7, 0.0),
    "glazing": ((0.02, 0.02, 0.02), 0.05, 0.0),
    "balustrade": ((0.8, 0.8, 0.8), 0.05, 0.0),
    "downlight": ((0.9, 0.85, 0.75), 0.5, 0.0),
    "plinth": ((0.82, 0.84, 0.86), 0.7, 0.0),
    # the Interior's own palette is in interior.py: after its bake, the room's colours are in its texture
    "interior": ((1.0, 1.0, 1.0), 1.0, 0.0),
}
DOWNLIGHT_EMISSION = 12.0
