#!/usr/bin/env python3
"""
Assemble the deployable public output in public/.

Only site files are copied (pages, css, js, prepared images) so nothing
sensitive or oversized — raw PDF extracts, virtualenvs, scripts — can ever be
uploaded by sites_deploy.

Run:  python3 scripts/build_public.py
"""
import os
import shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public")

PAGES = ["index.html", "about", "contact", "services", "track-record"]
ASSET_EXCLUDE_DIRS = {"img"}  # raw company-profile extracts, not site output


def clean():
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    os.makedirs(OUT, exist_ok=True)


def copy_pages():
    for entry in PAGES:
        src = os.path.join(ROOT, entry)
        dst = os.path.join(OUT, entry)
        if os.path.isdir(src):
            shutil.copytree(src, dst)
        else:
            shutil.copy2(src, dst)


def copy_assets():
    src_root = os.path.join(ROOT, "assets")
    for dirpath, dirnames, filenames in os.walk(src_root):
        rel = os.path.relpath(dirpath, src_root)
        top = rel.split(os.sep)[0]
        if rel != "." and top in ASSET_EXCLUDE_DIRS:
            dirnames[:] = []
            continue
        dirnames[:] = [d for d in dirnames if d not in ASSET_EXCLUDE_DIRS]
        target = os.path.join(OUT, "assets", rel) if rel != "." else os.path.join(OUT, "assets")
        os.makedirs(target, exist_ok=True)
        for name in filenames:
            shutil.copy2(os.path.join(dirpath, name), os.path.join(target, name))


def report():
    files, total = 0, 0
    for dirpath, _, filenames in os.walk(OUT):
        for name in filenames:
            files += 1
            total += os.path.getsize(os.path.join(dirpath, name))
    print(f"public/: {files} files, {total / 1024 / 1024:.2f} MiB")
    limits = (1000, 10 * 1024 * 1024)
    print(f"deploy limits: {files}/{limits[0]} assets, {total}/{limits[1]} bytes — "
          + ("within limits" if files <= limits[0] and total <= limits[1] else "OVER LIMIT"))


if __name__ == "__main__":
    clean()
    copy_pages()
    copy_assets()
    report()
