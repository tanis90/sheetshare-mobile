"""Slice the 4x3 class-icon sheet into transparent PNGs for the viewer."""
from collections import deque

import numpy as np
from PIL import Image

SRC = r"C:\Users\yangqi\Pictures\职业图标2.jpg"
OUT_DIR = r"C:\Users\yangqi\code\sheetshare-mobile\viewer\assets\classes"

GRID = [
    ["rogue", "fighter", "wizard"],
    ["ranger", "barbarian", "druid"],
    ["bard", "cleric", "sorcerer"],
    ["monk", "paladin", "warlock"],
]

WHITE = 235          # channel threshold for "background-ish" pixels
ICON_SIZE = 128      # output edge length
PADDING = 3          # px kept around the hexagon


def exterior_white_mask(rgb: np.ndarray) -> np.ndarray:
    """Flood fill from the borders across white-ish pixels; returns bool mask."""
    whiteish = np.all(rgb > WHITE, axis=2)
    h, w = whiteish.shape
    seen = np.zeros_like(whiteish)
    queue = deque()
    for x in range(w):
        for y in (0, h - 1):
            if whiteish[y, x] and not seen[y, x]:
                seen[y, x] = True
                queue.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if whiteish[y, x] and not seen[y, x]:
                seen[y, x] = True
                queue.append((y, x))
    while queue:
        y, x = queue.popleft()
        for ny, nx in ((y-1, x), (y+1, x), (y, x-1), (y, x+1)):
            if 0 <= ny < h and 0 <= nx < w and whiteish[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                queue.append((ny, nx))
    return seen


def extract(cell_rgb: np.ndarray) -> Image.Image:
    h, w, _ = cell_rgb.shape
    work = cell_rgb[: int(h * 0.80)]          # drop the text label row
    ink = np.any(work < WHITE, axis=2)        # non-background pixels
    ys, xs = np.where(ink)
    y0, y1 = ys.min(), ys.max()
    x0, x1 = xs.min(), xs.max()
    y0 = max(0, y0 - PADDING); x0 = max(0, x0 - PADDING)
    y1 = min(work.shape[0] - 1, y1 + PADDING); x1 = min(work.shape[1] - 1, x1 + PADDING)
    hexagon = work[y0:y1 + 1, x0:x1 + 1]

    exterior = exterior_white_mask(hexagon)
    alpha = np.where(exterior, 0, 255).astype(np.uint8)
    rgba = np.dstack([hexagon.astype(np.uint8), alpha])

    img = Image.fromarray(rgba, "RGBA")
    # Square-pad so every icon shares the same aspect box, then resize.
    side = max(img.size)
    square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    square.paste(img, ((side - img.width) // 2, (side - img.height) // 2), img)
    return square.resize((ICON_SIZE, ICON_SIZE), Image.LANCZOS)


def main():
    import os
    os.makedirs(OUT_DIR, exist_ok=True)
    sheet = np.array(Image.open(SRC).convert("RGB"), dtype=np.int16)
    h, w, _ = sheet.shape
    cell_w, cell_h = w / 3, h / 4
    for row, ids in enumerate(GRID):
        for col, class_id in enumerate(ids):
            y0, y1 = int(row * cell_h), int((row + 1) * cell_h)
            x0, x1 = int(col * cell_w), int((col + 1) * cell_w)
            icon = extract(sheet[y0:y1, x0:x1])
            path = os.path.join(OUT_DIR, f"{class_id}.png")
            icon.save(path)
            print(f"{class_id}: {icon.size} -> {path}")


if __name__ == "__main__":
    main()
