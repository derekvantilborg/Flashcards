"""Draw the app icon (two stacked flashcards on a blue background) with Pillow.

Usage: python3 tools/make_icons.py
"""
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "icons"
BLUE = (47, 91, 211)
S = 1024  # draw large, then downscale for smooth edges


def draw():
    img = Image.new("RGB", (S, S), BLUE)
    d = ImageDraw.Draw(img)
    # Back card, tilted look via offset, slightly transparent white.
    back = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    bd = ImageDraw.Draw(back)
    bd.rounded_rectangle((300, 210, 790, 760), radius=70, fill=(255, 255, 255, 110))
    back = back.rotate(-10, resample=Image.BICUBIC, center=(S / 2, S / 2))
    img.paste(back, (0, 0), back)
    # Front card.
    d.rounded_rectangle((240, 280, 730, 830), radius=70, fill=(255, 255, 255))
    # "Text" lines on the front card: one bold line, one thin line.
    d.rounded_rectangle((330, 470, 640, 530), radius=30, fill=BLUE)
    d.rounded_rectangle((370, 580, 600, 615), radius=18, fill=(170, 186, 230))
    return img


def main():
    OUT.mkdir(exist_ok=True)
    img = draw()
    for size in (180, 192, 512):
        img.resize((size, size), Image.LANCZOS).save(OUT / f"icon-{size}.png")
    print("icons written to", OUT)


if __name__ == "__main__":
    main()
