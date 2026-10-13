"""
Generates resource_pack/font/glyph_E1.png — custom font glyphs used by the
mob health bar nameplate (see src/features/mobHealthBar.ts).

Each glyph is one gauge segment. Segments can be partially filled at
1-pixel precision so the bar reflects the exact HP, not just a color change.

Layout (16x16 grid of 16px cells, codepoint = U+E100 + index):
    Empty track:  index = shape                                  (0..3)
    Filled:       index = 4 + (color * 4 + shape) * LEVELS + (level - 1)

    color: 0 = green, 1 = amber, 2 = red
    shape: 0 = left cap, 1 = middle, 2 = right cap, 3 = single (both caps)
    level: 1..LEVELS filled pixel columns (LEVELS = fully filled)

Keep LEVELS / layout in sync with GAUGE_LEVELS in mobHealthBar.ts.

Each glyph is pinned to the full cell width with a near-invisible marker
pixel so Bedrock's auto-trimming can't change segment spacing.

Usage: python3 scripts/generate_health_glyphs.py
"""

from pathlib import Path

from PIL import Image

CELL = 16
SHEET = CELL * 16

FILL_COLORS = [
    (74, 222, 128, 255),  # green  (#4ADE80)
    (251, 191, 36, 255),  # amber  (#FBBF24)
    (248, 113, 113, 255),  # red    (#F87171)
]
TRACK_COLOR = (45, 51, 61, 255)  # empty track (#2D333D)

BAR_TOP = 5  # first row of the bar inside the cell
BAR_HEIGHT = 5  # bar thickness in glyph pixels (~2.5 font pixels)
ART_RIGHT = 14  # last column of bar art; col 15 (+ engine spacing) forms the gap
LEVELS = ART_RIGHT + 1  # number of fill steps per segment (pixel columns)

SHAPES = [(True, False), (False, False), (False, True), (True, True)]


def draw_segment(img: Image.Image, index: int, fill_color, level: int, round_left: bool, round_right: bool) -> None:
    ox, oy = (index % 16) * CELL, (index // 16) * CELL
    px = img.load()
    top, bottom = BAR_TOP, BAR_TOP + BAR_HEIGHT - 1

    for y in range(top, bottom + 1):
        edge_row = y in (top, bottom)
        for x in range(0, ART_RIGHT + 1):
            r, g, b, a = fill_color if x < level else TRACK_COLOR
            corner = edge_row and ((round_left and x == 0) or (round_right and x == ART_RIGHT))
            # Cut corners are drawn semi-transparent for a soft pill shape
            px[ox + x, oy + y] = (r, g, b, a // 3) if corner else (r, g, b, a)

    # Width marker: keeps the glyph advance at the full cell width
    px[ox + CELL - 1, oy + 0] = (0, 0, 0, 1)


def main() -> None:
    img = Image.new("RGBA", (SHEET, SHEET), (0, 0, 0, 0))

    for s, (rl, rr) in enumerate(SHAPES):
        draw_segment(img, s, TRACK_COLOR, 0, rl, rr)

    for c, color in enumerate(FILL_COLORS):
        for s, (rl, rr) in enumerate(SHAPES):
            for level in range(1, LEVELS + 1):
                index = 4 + (c * 4 + s) * LEVELS + (level - 1)
                draw_segment(img, index, color, level, rl, rr)

    out = Path(__file__).resolve().parent.parent / "resource_pack" / "font" / "glyph_E1.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out)
    print(f"Wrote {out} ({4 + len(FILL_COLORS) * 4 * LEVELS} glyphs)")


if __name__ == "__main__":
    main()
