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

Safe to run more than once. Anything it is about to overwrite is copied to
`pre-restore/<timestamp>/` first, so if the pull brought down real theme-editor
changes you can still get them back.

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

### Theme files — replaced from `reference/` (3)

- `sections/header-group.json` — points the header group at `custom-header`
- `sections/footer-group.json` — points the footer group at `custom-footer`
- `templates/index.json` — homepage order: banner, best sellers, new arrivals, trust, newsletter

### `layout/theme.liquid` — patched in place, not replaced

A pull may bring down genuine upstream changes here, so the script re-applies only the
two edits the sections need, and only if they are missing:

1. `{%- render 'custom-head' -%}` in `<head>` — without it every section loses its
   fonts, colour tokens and reveal animation.
2. `dir="{{ text_direction }}"` on `<html>` — the stock theme sets no direction at all,
   so Arabic will not mirror without it.

If the script cannot find its anchors it says so and leaves the file alone — add the
two edits by hand, using `reference/theme.liquid` as the guide.

## Not ours

`sections/custom-liquid.liquid` is a **stock Horizon section**, despite the name. Never
delete theme files by matching `custom-*`; it would take that one with them.
