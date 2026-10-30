#!/usr/bin/env python3
"""
Prepare site imagery for the NAJMARA website from the company-profile PDF extract.

Source images live in assets/img/ (extracted from the attached company profile PDF).
This script crops/resizes them to the exact frames the site uses and normalises the
client logos (trim + luminance lift) so they read on the obsidian dark background.

Run:  python3 scripts/prep_assets.py
"""
import os
from PIL import Image, ImageOps, ImageStat

SRC = "assets/img"
OUT = "assets"

# (source, destination, size, quality)
PHOTOS = [
    # hero canvas clip frames (16:9)
    ("p01_1_X5.jpg",   "hero-1.jpg", (1600, 900), 72),
    ("p04_2_X56.jpg",  "hero-2.jpg", (1600, 900), 72),
    ("p09_1_X119.jpg", "hero-3.jpg", (1600, 900), 72),
    ("p10_1_X126.jpg", "hero-4.jpg", (1600, 900), 72),
    # four pillars
    ("p04_3_X57.jpg",  "pillar-data-centre.jpg",   (1000, 700), 78),
    ("p09_2_X120.jpg", "pillar-maintenance.jpg",   (1000, 700), 78),
    ("p10_3_X134.jpg", "pillar-contracting.jpg",   (1000, 700), 78),
    ("p13_4_X179.jpg", "pillar-supply.jpg",        (1000, 700), 78),
    # services sections
    ("p09_3_X121.jpg", "svc-data-centre.jpg",  (1100, 750), 78),
    ("p04_4_X58.jpg",  "svc-fibre.jpg",        (1100, 750), 78),
    ("p09_4_X122.jpg", "svc-hard.jpg",         (1100, 750), 78),
    ("p08_1_X107.jpg", "svc-soft.jpg",         (1100, 750), 78),
    ("p07_3_X94.jpg",  "svc-hospitality.jpg",  (1100, 750), 78),
    ("p11_3_X147.jpg", "svc-contracting.jpg",  (1100, 750), 78),
    ("p13_2_X176.jpg", "svc-supply.jpg",       (1100, 750), 78),
    # about
    ("p07_1_X86.jpg",  "about-facilities.jpg", (1300, 850), 78),
    ("p11_2_X146.jpg", "about-method.jpg",     (1300, 850), 78),
    # field operations gallery
    ("p11_4_X148.jpg", "field-1.jpg", (900, 650), 78),
    ("p10_5_X136.jpg", "field-2.jpg", (900, 650), 78),
    ("p11_6_X150.jpg", "field-3.jpg", (900, 650), 78),
    ("p10_2_X133.jpg", "field-4.jpg", (900, 650), 78),
    ("p05_3_X71.jpg",  "field-5.jpg", (900, 650), 78),
    ("p06_3_X82.jpg",  "field-6.jpg", (900, 650), 78),
]

# (source, destination) client logos, alpha preserved
LOGOS = [
    ("p14_1_X190.png", "logo-kafd.png"),
    ("p14_2_X192.png", "logo-almarai.png"),
    ("p14_3_X194.png", "logo-habib.png"),
    ("p14_4_X196.png", "logo-mandarin.png"),
    ("p14_5_X198.png", "logo-alayuni.png"),
    ("p14_6_X200.png", "logo-lt.png"),
    ("p14_8_X204.png", "logo-huawei.png"),
]

BRAND = ("p01_0_X12.png", "logo-najmara.png")


def photos():
    for src, dst, size, quality in PHOTOS:
        path = os.path.join(SRC, src)
        if not os.path.exists(path):
            print("missing", path)
            continue
        im = Image.open(path).convert("RGB")
        im = ImageOps.fit(im, size, method=Image.LANCZOS, centering=(0.5, 0.45))
        im.save(os.path.join(OUT, dst), "JPEG", quality=quality, optimize=True, progressive=True)
        print("wrote", dst, size, os.path.getsize(os.path.join(OUT, dst)) // 1024, "KB")


def trim_alpha(im, pad=4):
    bbox = im.split()[3].getbbox()
    if not bbox:
        return im
    left, top, right, bottom = bbox
    left = max(0, left - pad)
    top = max(0, top - pad)
    right = min(im.width, right + pad)
    bottom = min(im.height, bottom + pad)
    return im.crop((left, top, right, bottom))


def logos():
    for src, dst in LOGOS:
        path = os.path.join(SRC, src)
        if not os.path.exists(path):
            print("missing", path)
            continue
        im = Image.open(path).convert("RGBA")
        im = trim_alpha(im)

        # lift dark artwork so it reads on #121312
        r, g, b, a = im.split()
        visible = a.point(lambda v: 255 if v > 128 else 0)
        if sum(visible.getdata()) > 0:
            lum = Image.merge("RGB", (r, g, b)).convert("L")
            hist = lum.histogram()
            total = sum(hist[1:])
            mean = sum(i * hist[i] for i in range(256)) / total if total else 128
            target = 132.0
            if mean < target:
                gain = min(target / max(mean, 1), 2.6)
                scale = lambda v: min(255, int(v * gain))
                r, g, b = r.point(scale), g.point(scale), b.point(scale)
                im = Image.merge("RGBA", (r, g, b, a))

        if im.width > 560:
            h = round(im.height * 560 / im.width)
            im = im.resize((560, h), Image.LANCZOS)
        im.save(os.path.join(OUT, dst), "PNG", optimize=True)
        print("wrote", dst, im.size, os.path.getsize(os.path.join(OUT, dst)) // 1024, "KB")


def brand():
    src, dst = BRAND
    path = os.path.join(SRC, src)
    if not os.path.exists(path):
        return
    im = Image.open(path).convert("RGBA")
    im = trim_alpha(im, pad=0)
    im.save(os.path.join(OUT, dst), "PNG", optimize=True)
    # square-ish favicon canvas with the wordmark centred
    fav = Image.new("RGBA", (180, 180), (18, 19, 18, 255))
    mark = im.copy()
    mark.thumbnail((150, 110), Image.LANCZOS)
    fav.paste(mark, ((180 - mark.width) // 2, (180 - mark.height) // 2), mark)
    fav.save(os.path.join(OUT, "favicon.png"), "PNG", optimize=True)
    print("wrote", dst, "and favicon.png")


if __name__ == "__main__":
    photos()
    logos()
    brand()
