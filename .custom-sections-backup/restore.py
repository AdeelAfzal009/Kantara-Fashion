#!/usr/bin/env python3
"""
Restore the Kantara custom sections after `shopify theme pull`.

A pull overwrites the theme directories with whatever is on the remote theme, which
removes the custom-* files and reverts the four theme files they hook into. This puts
all of it back.

Run from anywhere:  python3 .custom-sections-backup/restore.py

Safe to run repeatedly. The theme.liquid edits are applied only if missing, and
anything about to be overwritten is copied to .custom-sections-backup/pre-restore/
first, so a pull that brought down real theme-editor changes is never lost silently.
"""

import filecmp
import io
import shutil
import sys
from datetime import datetime
from pathlib import Path

BACKUP = Path(__file__).resolve().parent
THEME = BACKUP.parent
FILES = BACKUP / "files"
REFERENCE = BACKUP / "reference"
PRE_RESTORE = BACKUP / "pre-restore" / datetime.now().strftime("%Y-%m-%d_%H%M%S")

# The four theme files the sections hook into. header/footer groups and the homepage
# template are replaced wholesale; theme.liquid is patched in place (below) because a
# pull may legitimately bring down upstream changes worth keeping.
GROUP_FILES = [
    ("reference/header-group.json", "sections/header-group.json"),
    ("reference/footer-group.json", "sections/footer-group.json"),
    ("reference/index.json", "templates/index.json"),
]

created, skipped, patched = [], [], []


def stash(target: Path) -> None:
    """Copy a file we are about to overwrite into pre-restore/<timestamp>/."""
    if not target.exists():
        return
    destination = PRE_RESTORE / target.relative_to(THEME)
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(target, destination)


def copy_file(source: Path, target: Path) -> None:
    if target.exists() and filecmp.cmp(source, target, shallow=False):
        skipped.append(str(target.relative_to(THEME)))
        return
    stash(target)
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)
    created.append(str(target.relative_to(THEME)))


def patch_theme_liquid() -> None:
    """Re-apply the two edits the sections depend on, only where they are missing."""
    path = THEME / "layout" / "theme.liquid"
    if not path.exists():
        print("!! layout/theme.liquid not found — skipping patches")
        return

    source = io.open(path, encoding="utf-8").read()
    original = source

    # 1. Shared tokens, fonts and the reveal script.
    if "render 'custom-head'" not in source:
        anchor = "{%- render 'fonts' -%}"
        if anchor in source:
            source = source.replace(anchor, anchor + "\n    {%- render 'custom-head' -%}", 1)
            patched.append("theme.liquid: render 'custom-head'")
        else:
            print("!! could not find the fonts render in theme.liquid — add "
                  "{%- render 'custom-head' -%} inside <head> by hand")

    # 2. `dir` on <html>, so RTL locales mirror without a second stylesheet.
    if 'dir="{{ text_direction }}"' not in source:
        anchor = '  lang="{{ request.locale.iso_code }}"\n>'
        replacement = (
            '  lang="{{ request.locale.iso_code }}"\n'
            "  {%- liquid\n"
            "    assign rtl_locales = 'ar,arc,ckb,dv,fa,ha,he,khw,ks,ps,sd,ur,uz-AF,yi' | split: ','\n"
            "    assign locale_root = request.locale.iso_code | split: '-' | first\n"
            '    assign text_direction = "ltr"\n'
            "    if rtl_locales contains locale_root\n"
            '      assign text_direction = "rtl"\n'
            "    endif\n"
            "  -%}\n"
            '  dir="{{ text_direction }}"\n'
            ">"
        )
        if anchor in source:
            source = source.replace(anchor, replacement, 1)
            patched.append("theme.liquid: dir attribute")
        else:
            print('!! could not find the <html lang> tag in theme.liquid — add '
                  'dir="{{ text_direction }}" by hand')

    if source != original:
        stash(path)
        io.open(path, "w", encoding="utf-8").write(source)


def main() -> int:
    if not FILES.is_dir():
        print(f"!! {FILES} is missing — nothing to restore")
        return 1

    for source in sorted(FILES.rglob("*")):
        if source.is_file():
            copy_file(source, THEME / source.relative_to(FILES))

    for reference_name, target_name in GROUP_FILES:
        copy_file(BACKUP / reference_name, THEME / target_name)

    patch_theme_liquid()

    print("\nRestored the Kantara custom sections.\n")
    for label, items in (("written", created), ("patched", patched), ("already current", skipped)):
        if items:
            print(f"  {label} ({len(items)}):")
            for item in items:
                print(f"    - {item}")
    if PRE_RESTORE.exists():
        print(f"\n  overwritten files stashed in: {PRE_RESTORE.relative_to(THEME)}")

    print("\nNext: shopify theme check   then   shopify theme dev")
    return 0


if __name__ == "__main__":
    sys.exit(main())
