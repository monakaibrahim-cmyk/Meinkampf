"""
Generates the Quick Sorter item icon (resource_pack/textures/items/quick_sorter.png).

Drawn on an authentic 16x16 Minecraft pixel grid, then upscaled 2x (nearest neighbour)
to 32x32 so it stays crisp and readable in the hotbar / inventory.

Usage:  python3 scripts/generate_sorter_icon.py [--preview out.png]
"""
import sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "resource_pack" / "textures" / "items" / "quick_sorter.png"

PALETTE = {
    "K": (27, 20, 38, 255),      # outline
    "G": (242, 190, 48, 255),    # gold
    "g": (168, 110, 20, 255),    # gold shadow
    "Y": (255, 240, 150, 255),   # gold highlight
    "C": (70, 222, 255, 255),    # crystal
    "c": (22, 140, 200, 255),    # crystal shadow
    "B": (12, 80, 140, 255),     # crystal deep shadow
    "W": (255, 255, 255, 255),   # crystal highlight
    "S": (200, 250, 255, 255),   # sparkle
}

N = 16
grid = [[None] * N for _ in range(N)]


def put(x, y, c):
    if 0 <= x < N and 0 <= y < N:
        grid[y][x] = c


# --- Crystal head: diamond centred at (11, 4), radius 3 ---
CX, CY, R = 11, 4, 3
for y in range(N):
    for x in range(N):
        d = abs(x - CX) + abs(y - CY)
        if d <= R:
            s = (x - CX) + (y - CY)  # < 0 => upper-left (lit) side
            if s < -1:
                put(x, y, "C")
            elif s <= 0:
                put(x, y, "C" if d < R else "c")
            elif s <= 1:
                put(x, y, "c")
            else:
                put(x, y, "B")
# facet highlights
for p in [(10, 2), (11, 2), (9, 4), (10, 3)]:
    put(*p, "W")
put(11, 4, "C")

# --- Staff: 2px diagonal from the pommel up to the crystal ---
for i in range(7):
    put(2 + i, 13 - i, "G")
    put(3 + i, 13 - i, "g")
    if i % 2 == 0:
        put(2 + i, 13 - i, "Y")

# --- Gold collar gripping the crystal ---
put(8, 6, "Y")
put(9, 6, "G")
put(9, 7, "g")
put(10, 7, "g")
put(8, 5, "G")

# --- Pommel with a tiny gem ---
put(1, 13, "G")
put(1, 14, "C")
put(2, 14, "g")
put(2, 15, "g")
put(1, 15, "g")

# --- Auto outline: transparent pixels touching a filled pixel become outline ---
filled = {(x, y) for y in range(N) for x in range(N) if grid[y][x]}
for (x, y) in list(filled):
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        nx, ny = x + dx, y + dy
        if 0 <= nx < N and 0 <= ny < N and (nx, ny) not in filled:
            grid[ny][nx] = "K"

# --- Sparkles (drawn after outline, unoutlined) ---
for p in [(4, 4), (14, 11), (6, 1)]:
    if grid[p[1]][p[0]] is None:
        put(*p, "S")

img16 = Image.new("RGBA", (N, N), (0, 0, 0, 0))
for y in range(N):
    for x in range(N):
        if grid[y][x]:
            img16.putpixel((x, y), PALETTE[grid[y][x]])

img32 = img16.resize((32, 32), Image.NEAREST)
OUT.parent.mkdir(parents=True, exist_ok=True)
img32.save(OUT)
print(f"Wrote {OUT}")

if "--preview" in sys.argv:
    out = Path(sys.argv[sys.argv.index("--preview") + 1])
    bg = Image.new("RGBA", (256, 256), (139, 139, 139, 255))
    bg.alpha_composite(img16.resize((256, 256), Image.NEAREST))
    bg.save(out)
    print(f"Wrote preview {out}")

