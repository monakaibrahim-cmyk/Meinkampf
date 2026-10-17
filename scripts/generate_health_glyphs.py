"""
Generates resource_pack/font/glyph_E1.png — custom font glyphs used by the
mob health bar nameplate (see src/features/mobHealthBar.ts).

Each glyph is one gauge segment. Segments connect seamlessly without gaps
to form a single continuous, pixel-perfect health bar matching the modern nameplate card.

Layout (16x16 grid of 16px cells, codepoint = U+E100 + index):
    Empty track:  index = shape                                  (0..3)
    Filled:       index = 4 + (color * 4 + shape) * LEVELS + (level - 1)

    color: 0 = green (high HP), 1 = yellow (mid HP), 2 = red (low HP)
    shape: 0 = left cap, 1 = middle, 2 = right cap, 3 = single (both caps)
    level: 1..LEVELS filled pixel columns (LEVELS = 16)

Keep LEVELS / layout in sync with GAUGE_LEVELS in mobHealthBar.ts.

Usage: python3 scripts/generate_health_glyphs.py
"""

from pathlib import Path
from PIL import Image

CELL = 16
SHEET = CELL * 16

BORDER_COLOR = (0, 0, 0, 255)

FILL_PALETTES = [
    # 0: Green (ratio > 0.50) — Highlight (#C6FF7A), Body (#7DFF1F), Shadow (#3FA80F)
    ((198, 255, 122, 255), (125, 255, 31, 255), (63, 168, 15, 255)),
    # 1: Yellow / Amber (0.25 < ratio <= 0.50) — Highlight (#FFFFB0), Body (#FFFF55), Shadow (#B5B51C)
    ((255, 255, 176, 255), (255, 255, 85, 255), (181, 181, 28, 255)),
    # 2: Red (ratio <= 0.25) — Highlight (#FFA3A3), Body (#FF5555), Shadow (#B02222)
    ((255, 163, 163, 255), (255, 85, 85, 255), (176, 34, 34, 255)),
]

TRACK_PALETTE = (
    (122, 122, 122, 255),  # Highlight (#7A7A7A)
    (79, 79, 79, 255),     # Main body (#4F4F4F)
    (58, 58, 58, 255),     # Shadow    (#3A3A3A)
)

BAR_TOP = 3      # Row 3 in 16px cell
BAR_HEIGHT = 11  # 11-row pixel-perfect bar matching card template
LEVELS = 16      # 16 fill columns per segment

SHAPES = [(True, False), (False, False), (False, True), (True, True)]


def draw_segment(img: Image.Image, index: int, fill_palette, level: int, round_left: bool, round_right: bool) -> None:
    ox, oy = (index % 16) * CELL, (index // 16) * CELL
    px = img.load()
    top = BAR_TOP
    bottom = BAR_TOP + BAR_HEIGHT - 1

    for x in range(0, CELL):
        is_filled = (x <= level) if round_left else (x < level)
        palette = fill_palette if is_filled else TRACK_PALETTE

        # Left cap outer edge (column 0)
        if round_left and x == 0:
            for y in range(top, bottom + 1):
                if y in (top, top + 1, bottom - 1, bottom):
                    px[ox + x, oy + y] = (0, 0, 0, 0)
                else:
                    px[ox + x, oy + y] = BORDER_COLOR
            continue

        # Left cap inner edge (column 1)
        if round_left and x == 1:
            for y in range(top, bottom + 1):
                if y in (top, bottom):
                    px[ox + x, oy + y] = BORDER_COLOR
                elif y in (top + 1, bottom - 1):
                    px[ox + x, oy + y] = BORDER_COLOR
                else:
                    r = y - top
                    if r in (2, 3):
                        px[ox + x, oy + y] = palette[0]
                    elif r in (4, 5, 6):
                        px[ox + x, oy + y] = palette[1]
                    elif r in (7, 8):
                        px[ox + x, oy + y] = palette[2]
            continue

        # Right cap outer edge (column 15)
        if round_right and x == CELL - 1:
            for y in range(top, bottom + 1):
                if y in (top, top + 1, bottom - 1, bottom):
                    px[ox + x, oy + y] = (0, 0, 0, 0)
                else:
                    px[ox + x, oy + y] = BORDER_COLOR
            continue

        # Right cap inner edge (column 14)
        if round_right and x == CELL - 2:
            for y in range(top, bottom + 1):
                if y in (top, bottom):
                    px[ox + x, oy + y] = BORDER_COLOR
                elif y in (top + 1, bottom - 1):
                    px[ox + x, oy + y] = BORDER_COLOR
                else:
                    r = y - top
                    if r in (2, 3):
                        px[ox + x, oy + y] = palette[0]
                    elif r in (4, 5, 6):
                        px[ox + x, oy + y] = palette[1]
                    elif r in (7, 8):
                        px[ox + x, oy + y] = palette[2]
            continue

        # Normal inner columns
        for y in range(top, bottom + 1):
            r = y - top
            if r in (0, 1):       # Top border (2px)
                px[ox + x, oy + y] = BORDER_COLOR
            elif r in (2, 3):     # Highlight (2px)
                px[ox + x, oy + y] = palette[0]
            elif r in (4, 5, 6):  # Main body (3px)
                px[ox + x, oy + y] = palette[1]
            elif r in (7, 8):     # Shadow (2px)
                px[ox + x, oy + y] = palette[2]
            elif r in (9, 10):    # Bottom border (2px)
                px[ox + x, oy + y] = BORDER_COLOR

    # Width marker: guarantees Bedrock keeps glyph advance width at full cell
    px[ox + CELL - 1, oy + 0] = (0, 0, 0, 1)


def main() -> None:
    img = Image.new("RGBA", (SHEET, SHEET), (0, 0, 0, 0))

    # Empty tracks (index 0..3)
    for s, (rl, rr) in enumerate(SHAPES):
        draw_segment(img, s, TRACK_PALETTE, 0, rl, rr)

    # Filled tracks for each color and shape
    for c, palette in enumerate(FILL_PALETTES):
        for s, (rl, rr) in enumerate(SHAPES):
            for level in range(1, LEVELS + 1):
                index = 4 + (c * 4 + s) * LEVELS + (level - 1)
                draw_segment(img, index, palette, level, rl, rr)

    out = Path(__file__).resolve().parent.parent / "resource_pack" / "font" / "glyph_E1.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out)
    print(f"Wrote {out} ({4 + len(FILL_PALETTES) * 4 * LEVELS} glyphs)")


if __name__ == "__main__":
    main()
