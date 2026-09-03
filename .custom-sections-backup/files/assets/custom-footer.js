/**
 * Behaviour for sections/custom-footer.liquid.
 *
 * The link columns are <details> so they work as accordions on mobile with no JS.
 * Above the column breakpoint they are pinned open, because the CSS lays them out
 * side by side and a collapsed column there would just be a missing column.
 *
 * Also submits the localization form on change, so the region and language pickers
 * need no separate button.
 */
(() => {
  const COLUMN_BREAKPOINT = '(min-width: 750px)';

  function bindColumns(footer) {
    const columns = footer.querySelectorAll('.custom-footer__column');
    if (columns.length === 0) return;

    const wide = window.matchMedia(COLUMN_BREAKPOINT);

    const sync = () => {
      for (const column of columns) {
        if (wide.matches) {
          // Remember the mobile state so collapsing survives a trip through desktop.
          column.dataset.customCollapsed = column.open ? 'false' : 'true';
          column.open = true;
        } else {
          column.open = column.dataset.customCollapsed === 'false';
        }
      }
    };

    sync();
    wide.addEventListener('change', sync);
  }

  function bindLocalization(footer) {
    const form = footer.querySelector('.custom-footer__localization');
    if (!form) return;

    for (const select of form.querySelectorAll('[data-custom-footer-submit]')) {
      select.addEventListener('change', () => form.submit());
    }
  }

  function init(root = document) {
    for (const footer of root.querySelectorAll('[data-custom-footer]')) {
      if (footer.dataset.customFooterBound === 'true') continue;
      footer.dataset.customFooterBound = 'true';
      bindColumns(footer);
      bindLocalization(footer);
    }
  }

  init();
  document.addEventListener('shopify:section:load', (event) => init(event.target));
})();
