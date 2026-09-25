"""The Houses' shared tiled detail maps: board-formed concrete, stacked stone, timber soffits and snow.

Promoted from the one-House prototype (#6). Every map is periodic, so it tiles, and is generated at its
full size and at half size (the mobile Scene's lighter set). Each albedo map's mean, in linear light, is
the flat base colour in config.MATERIALS, so a House keeps the brightness it was baked with. The
roughness map's mean is the material's roughness. Normal maps are tangent space, +y along +v with the
rows running down the image (glTF texcoords, no flip).

Run it through `bun run houses:detail`, which encodes the PNGs it writes to KTX2:

    python textures.py --out <dir> --spec '{"concrete": {"metres": 2, "px": 1024}, ...}'

Writes <dir>/<material>-<map>-<px>.png for each map, at px and px / 2. Needs only numpy (bpy ships it).
"""

import argparse
import json
import os
import struct
import zlib

import numpy as np

from config import MATERIALS

# prototype feature sizes are in pixels at this density; each map scales them to its own
PROTOTYPE_PX_PER_METRE = 1024
SEED = 7


def srgb_to_linear(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def linear_to_srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


class Maker:
    """One material's generator: a seeded noise source at a tile size and density."""

    def __init__(self, name, n, metres):
        self.n = n
        # feature scale against the prototype: 0.5 at 512 px per metre
        self.s = n / metres / PROTOTYPE_PX_PER_METRE
        self.rng = np.random.default_rng([SEED, *name.encode()])

    def px(self, prototype_px):
        """A prototype size in pixels at this map's density, never under one pixel."""
        return max(1.0, prototype_px * self.s)

    def noise(self, scale, aniso=(1.0, 1.0)):
        """Periodic gaussian-ish noise via FFT, unit variance. scale is the feature size in prototype px."""
        n = self.n
        f = np.fft.fftfreq(n)
        fx, fy = np.meshgrid(f * aniso[0], f * aniso[1])
        k = np.sqrt(fx**2 + fy**2)
        spec = np.exp(-((k * self.px(scale)) ** 2))
        w = np.fft.ifft2(np.fft.fft2(self.rng.standard_normal((n, n))) * spec).real
        return (w - w.mean()) / (w.std() + 1e-9)

    def normal(self, height, strength):
        """A tangent-space normal from a periodic height field: (-dh/du, -dh/dv, 1), v down the rows."""
        k = 0.5 * strength * self.s
        dx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) * k
        dy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) * k
        n = np.stack([-dx, -dy, np.ones_like(height)], -1)
        return n / np.linalg.norm(n, axis=-1, keepdims=True)


def fit_run(rng, total, size, gap):
    """Random (size, gap) pairs, each in its [lo, hi) range, that sum to exactly `total` pixels.

    Draws pairs until they overrun the tile, then scales the sizes down to fit, so a run of courses
    or blocks laid from any start wraps round the tile with a joint at every seam.
    """
    pairs = []
    while sum(s + g for s, g in pairs) < total:
        pairs.append((int(rng.integers(*size)), int(rng.integers(*gap))))
    room = total - sum(g for _, g in pairs)
    drawn = sum(s for s, _ in pairs)
    sizes = [max(1, int(s * room / drawn)) for s, _ in pairs]
    sizes[-1] += room - sum(sizes)  # the rounding goes to the last
    return [(s, g) for s, (_, g) in zip(sizes, pairs)]


def albedo(material, display):
    """Linear albedo from a display-referred pattern, each channel scaled so its mean is the base colour."""
    base = np.array(MATERIALS[material][0])
    lin = srgb_to_linear(display)
    return lin * (base / lin.reshape(-1, 3).mean(0))


def roughness(material, r):
    """A roughness map with the material's roughness as its mean."""
    return np.clip(r - r.mean() + MATERIALS[material][1], 0, 1)


def concrete(m):
    """16 horizontal boards per 2 m (12.5 cm), form-tie holes every 0.5 m."""
    n = m.n
    y = np.arange(n)
    board_h = n // 16
    tone = m.rng.normal(0, 0.045, 16)[y // board_h][:, None]
    # grain streaks along the board: long in x (a squeezed y frequency passes finer features across it)
    grain = m.noise(60, aniso=(1.0, 0.08)) * 0.018 + m.noise(6, aniso=(1.0, 0.15)) * 0.012
    blotch = m.noise(400) * 0.03 + m.noise(90) * 0.015
    pores = (m.noise(1.2) > 2.3) * -0.08
    # board joints: a small groove, wide and dark enough in albedo to survive the mips at fly-to distance
    dist = np.minimum(y % board_h, board_h - (y % board_h))[:, None].astype(float)
    groove = np.exp(-((dist / m.px(3.0)) ** 2))
    # form ties every 0.5 m each way, mid-board
    pitch = n // 4
    xx, yy = np.meshgrid(np.arange(n), np.arange(n))
    tx = (xx % pitch) - pitch // 2
    ty = (yy % pitch) - pitch // 2 + board_h // 2
    tie = np.exp(-((tx**2 + ty**2) / (2 * m.px(7.0) ** 2)))
    height = grain * 1.6 + pores * 0.5 - groove * 0.35 - tie * 0.9 + m.noise(3) * 0.02
    base = 0.60 + tone + blotch + grain * 0.6 + pores - groove * 0.14 - tie * 0.22
    display = np.stack([base * 1.0, base * 0.995, base * 0.985], -1)
    rough = 0.82 + m.noise(80) * 0.05 - groove * 0.1 + pores * -0.5
    return {
        "albedo": albedo("concrete", display),
        "normal": m.normal(height, 9.0),
        "roughness": roughness("concrete", rough),
    }


def timber(m):
    """Planks 10 cm wide running along u."""
    n = m.n
    y = np.arange(n)
    # ten planks to the tile exactly, fractional pixels and all, so the joints and tones wrap
    ph = n / 10
    tone = m.rng.normal(0, 0.06, 10)[(y // ph).astype(int)][:, None]
    # grain along the plank, long in x
    grain = m.noise(30, aniso=(1.0, 0.03)) * 0.5 + m.noise(4, aniso=(1.0, 0.05)) * 0.25
    # rings about 0.6 rad per prototype pixel, rounded to whole cycles per tile so their phase wraps
    cycles = max(1, round(0.6 * n / m.s / (2 * np.pi)))
    rings = np.sin(2 * np.pi * cycles * y[:, None] / n + m.noise(80, aniso=(0.1, 1.0)) * 12) * 0.15
    dist = np.minimum(y % ph, ph - (y % ph))[:, None]
    gap = np.exp(-((dist / m.px(1.4)) ** 2))
    v = 1 + tone + grain * 0.12 + rings * 0.5 - gap * 0.55
    display = np.stack([0.50 * v, 0.29 * v, 0.16 * v], -1)
    return {"albedo": albedo("timber", display), "normal": m.normal(grain * 0.4 - gap * 1.5, 4.0)}


def stone(m):
    """Stacked ledgestone: courses 5–14 cm, blocks 15–55 cm, dark recessed joints."""
    n = m.n
    rng = m.rng
    px = lambda v: max(1, int(round(v * m.s)))  # noqa: E731
    height = np.zeros((n, n))
    display = np.zeros((n, n, 3))
    xx = np.arange(n)
    y = 0
    # courses and their joints fill the tile exactly, as do each course's blocks, so every joint wraps
    for h, joint in fit_run(rng, n, (px(52), px(143)), (px(5), px(10))):
        edge = np.minimum(np.arange(h), h - 1 - np.arange(h)).astype(float)
        prof = np.clip(edge / px(9), 0, 1) ** 0.5
        ys = slice(y, y + h)
        # each course starts somewhere different, wrapping round the tile
        x = int(rng.integers(0, n))
        for w, gap in fit_run(rng, n, (px(150), px(560)), (px(6), px(14))):
            c = 0.55 + rng.normal(0, 0.045)
            warm = abs(rng.normal(0, 0.025))
            cols = (xx - x) % n < w
            bump = rng.uniform(0.6, 1.0)
            height[ys, cols] = prof[:, None] * bump
            display[ys, cols] = [c + warm, c + warm * 0.4, c - warm * 0.6]
            x += w + gap
        y += h + joint
    # blocks only fill where written: the rest is the joints
    solid = height > 0
    fine = m.noise(3) * 0.08 + m.noise(25) * 0.12
    height = np.where(solid, height + fine * 0.3, -0.2)
    shade = 1 + m.noise(40) * 0.08 + m.noise(4) * 0.05
    display = np.where(solid[..., None], display * shade[..., None], 0.12)
    return {"albedo": albedo("stone", display), "normal": m.normal(height, 14.0)}


def snow(m):
    """Soft wind ripples and grain: roof snow, the plinth and the live terrain."""
    h = m.noise(70, aniso=(0.4, 1.0)) * 0.6 + m.noise(10) * 0.25 + m.noise(1.5) * 0.12
    return {"normal": m.normal(h, 2.5)}


MAKERS = {"concrete": concrete, "stone": stone, "timber": timber, "snow": snow}


def half(kind, a):
    """The map at half size: a 2x2 box filter, in linear light for albedo, renormalized for normals."""
    a = (a[0::2, 0::2] + a[1::2, 0::2] + a[0::2, 1::2] + a[1::2, 1::2]) / 4
    return a / np.linalg.norm(a, axis=-1, keepdims=True) if kind == "normal" else a


def to_u8(kind, a):
    if kind == "albedo":
        a = linear_to_srgb(a)
    elif kind == "normal":
        a = a * 0.5 + 0.5
    elif kind == "roughness":
        a = np.repeat(a[..., None], 3, -1)  # three reads roughness from green
    return np.round(np.clip(a, 0, 1) * 255).astype(np.uint8)


def albedo_mean(u8):
    """The linear mean of an 8-bit sRGB image, as the GPU filters it."""
    return srgb_to_linear(u8.reshape(-1, 3) / 255).mean(0)


def write_png(path, rgb):
    h, w, _ = rgb.shape
    raw = b"".join(b"\x00" + rgb[row].tobytes() for row in range(h))

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data))

    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n")
        f.write(chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)))
        f.write(chunk(b"IDAT", zlib.compress(raw, 9)))
        f.write(chunk(b"IEND", b""))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    parser.add_argument("--spec", required=True, help="JSON: {material: {metres, px}}")
    args = parser.parse_args()
    spec = json.loads(args.spec)
    os.makedirs(args.out, exist_ok=True)

    for material, tile in spec.items():
        n = tile["px"]
        maps = MAKERS[material](Maker(material, n, tile["metres"]))
        for kind, full in maps.items():
            for size, a in ((n, full), (n // 2, half(kind, full))):
                u8 = to_u8(kind, a)
                if kind == "albedo":
                    mean = albedo_mean(u8)
                    base = np.array(MATERIALS[material][0])
                    if np.abs(mean - base).max() > 0.004:
                        raise SystemExit(f"{material} albedo mean {mean} drifted from its base colour {base}")
                if kind == "roughness":
                    mean = u8[..., 1].mean() / 255
                    if abs(mean - MATERIALS[material][1]) > 0.004:
                        raise SystemExit(f"{material} roughness mean {mean:.3f} drifted from {MATERIALS[material][1]}")
                path = os.path.join(args.out, f"{material}-{kind}-{size}.png")
                write_png(path, u8)
                print(f"  {path}", flush=True)


if __name__ == "__main__":
    main()
