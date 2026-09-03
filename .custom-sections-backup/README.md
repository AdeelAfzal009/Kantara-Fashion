# Kantara custom sections — backup and restore

`shopify theme pull` overwrites the theme directories with whatever is on the remote
theme. That deletes the `custom-*` files below and reverts the four theme files they
hook into. This folder holds a copy of all of it plus a script that puts it back.

**This folder is not a theme directory, so a pull leaves it alone.**

## After a pull

```sh
python3 .custom-sections-backup/restore.py
shopify theme check
```

Safe to run more than once, and safe on a theme carrying real theme-editor work.
Anything it does overwrite is copied to `pre-restore/<timestamp>/` first.

## What it restores

### New files — copied back as-is (11)

| File | Purpose |
| --- | --- |
| `sections/custom-header.liquid` | Header, menu drawer, search overlay |
| `sections/custom-banner.liquid` | Hero banner |
| `sections/custom-trust-strip.liquid` | Trust strip |
| `sections/custom-newsletter.liquid` | Newsletter signup |
| `sections/custom-footer.liquid` | Footer |
| `sections/custom-search-results.liquid` | Fragment the search overlay fetches |
| `snippets/custom-head.liquid` | Shared tokens, fonts, reveal script — rendered once from the layout |
| `snippets/custom-icon.liquid` | 16 thin-stroke icons (8 utility, 8 social) |
| `assets/custom-header.js` | Scroll state, drawer, search, cart count, header height vars |
| `assets/custom-footer.js` | Column accordions, localization submit |
| `assets/custom-reveal.js` | Scroll reveal with per-container stagger |

### Section JSON — restored only when a pull has reverted it (3)

- `sections/header-group.json` — points the header group at `custom-header`
- `sections/footer-group.json` — points the footer group at `custom-footer`
- `templates/index.json` — homepage order: banner, best sellers, new arrivals, trust, newsletter

These are also where Shopify writes theme-editor work: uploaded images, reordered
sections, tweaked settings. So each is restored **only if its section type is missing**
— if the file already references `custom-header` / `custom-footer` / `custom-banner`,
it is left completely alone, because everything else in it is merchant work that exists
nowhere else.

The consequence worth knowing: once a file is wired up, the script will not push later
changes from `reference/` into it. If a section's *default* wiring needs to change, edit
the live file (or delete it and re-run).

### `layout/theme.liquid` — patched in place, not replaced

A pull may bring down genuine upstream changes here, so the script re-applies only the
two edits the sections need, and only if they are missing:

1. `{%- render 'custom-head' -%}` in `<head>` — without it every section loses its
   fonts, colour tokens and reveal animation.
2. `dir="{{ text_direction }}"` on `<html>` — the stock theme sets no direction at all,
   so Arabic will not mirror without it.

If the script cannot find its anchors it says so and leaves the file alone — add the
two edits by hand, using `reference/theme.liquid` as the guide.

## Refreshing the reference copies

After doing theme-editor work you want captured as the new baseline:

```sh
cp sections/header-group.json sections/footer-group.json .custom-sections-backup/reference/
cp templates/index.json .custom-sections-backup/reference/
cp sections/custom-*.liquid .custom-sections-backup/files/sections/   # skip custom-liquid.liquid
cp snippets/custom-*.liquid .custom-sections-backup/files/snippets/
cp assets/custom-*.js       .custom-sections-backup/files/assets/
git add -A && git commit -m "Refresh custom section backup"
```

## Not ours

`sections/custom-liquid.liquid` is a **stock Horizon section**, despite the name. Never
delete theme files by matching `custom-*`; it would take that one with them.
