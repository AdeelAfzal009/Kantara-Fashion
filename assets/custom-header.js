/**
 * Behaviour for sections/custom-header.liquid.
 *
 * Four concerns, all scoped to the header: the scroll state that turns the
 * transparent bar solid, the menu drawer, the search overlay (backed by Shopify's
 * predictive search), and the cart count.
 *
 * Also publishes `--header-height` / `--header-group-height`, which theme sections
 * such as the sticky product information read. The stock header sets these; this one
 * replaces it, so it takes over the job.
 */
(() => {
  const SCROLL_THRESHOLD = 60;
  const SEARCH_DEBOUNCE = 250;
  const CART_LINES_UPDATE = 'shopify:cart:lines-update';

  const focusableSelector =
    'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

  /** Keeps Tab inside `container` while it is the active layer. */
  function trapFocus(container, event) {
    const focusable = [...container.querySelectorAll(focusableSelector)].filter(
      (el) => el.offsetParent !== null || el === document.activeElement
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  class CustomHeader {
    constructor(header) {
      this.header = header;
      this.root = header.parentElement ?? document;
      this.lastFocused = null;

      this.drawer = this.query('[data-custom-drawer]');
      this.drawerOverlay = this.query('.custom-drawer__overlay');
      this.search = this.query('[data-custom-search]');
      this.searchInput = this.query('[data-custom-search-input]');
      this.searchResults = this.query('[data-custom-search-results]');

      this.searchAbort = null;
      this.searchTimer = 0;

      this.bindScroll();
      this.bindDrawer();
      this.bindSearch();
      this.bindCart();
      this.measure();
    }

    /* The drawer, overlay and search overlay are siblings of the <header>, so they
       are looked up in the section wrapper rather than inside the header itself. */
    query(selector) {
      return this.root.querySelector(selector) ?? document.querySelector(selector);
    }

    /* ---------- scroll state ---------- */

    /**
     * base.css makes `.page-wrapper` the scroll container at >=990px and leaves the
     * window scrolling below that, so `window.scrollY` is permanently 0 on desktop and
     * the bar never turned solid. Listening to both and taking whichever has moved
     * covers each breakpoint without rebinding when the viewport crosses it.
     */
    bindScroll() {
      const pageWrapper = document.querySelector('.page-wrapper');

      const update = () => {
        const scrolled = Math.max(window.scrollY || 0, pageWrapper?.scrollTop || 0);
        this.header.classList.toggle('is-scrolled', scrolled > SCROLL_THRESHOLD);
      };

      update();
      window.addEventListener('scroll', update, { passive: true });
      pageWrapper?.addEventListener('scroll', update, { passive: true });
    }

    /* ---------- header height ---------- */

    measure() {
      const publish = () => {
        const height = this.header.offsetHeight;
        document.body.style.setProperty('--custom-header-height', `${height}px`);
        document.body.style.setProperty('--header-height', `${height}px`);
        document.body.style.setProperty('--header-group-height', `${height}px`);
      };

      publish();
      if ('ResizeObserver' in window) new ResizeObserver(publish).observe(this.header);
      window.addEventListener('load', publish, { once: true });
    }

    /* ---------- drawer ---------- */

    bindDrawer() {
      if (!this.drawer) return;

      // Staggered link entrance, matching the reveal timing used across the sections.
      this.drawer.querySelectorAll('.custom-drawer__nav > ul > li').forEach((item, index) => {
        item.style.setProperty('--custom-drawer-delay', `${0.08 + index * 0.05}s`);
      });

      for (const trigger of this.root.querySelectorAll('[data-custom-drawer-open]')) {
        trigger.addEventListener('click', () => this.openDrawer(trigger));
      }
      for (const trigger of this.root.querySelectorAll('[data-custom-drawer-close]')) {
        trigger.addEventListener('click', () => this.closeDrawer());
      }

      this.drawer.addEventListener('keydown', (event) => {
        if (event.key === 'Tab') trapFocus(this.drawer, event);
      });
    }

    openDrawer(trigger) {
      if (!this.drawer) return;
      this.lastFocused = trigger ?? document.activeElement;

      this.drawer.hidden = false;
      if (this.drawerOverlay) this.drawerOverlay.hidden = false;

      // Let the elements paint in their closed state before transitioning in.
      requestAnimationFrame(() => {
        this.drawer.classList.add('is-open');
        this.drawerOverlay?.classList.add('is-open');
      });

      trigger?.setAttribute('aria-expanded', 'true');
      document.documentElement.style.overflow = 'hidden';
      this.drawer.querySelector(focusableSelector)?.focus();
    }

    closeDrawer() {
      if (!this.drawer || this.drawer.hidden) return;

      this.drawer.classList.remove('is-open');
      this.drawerOverlay?.classList.remove('is-open');

      for (const trigger of this.root.querySelectorAll('[data-custom-drawer-open]')) {
        trigger.setAttribute('aria-expanded', 'false');
      }

      const finish = () => {
        this.drawer.hidden = true;
        if (this.drawerOverlay) this.drawerOverlay.hidden = true;
      };
      this.drawer.addEventListener('transitionend', finish, { once: true });
      setTimeout(finish, 500);

      this.releaseScroll();
      this.lastFocused?.focus();
    }

    /* ---------- search ---------- */

    bindSearch() {
      if (!this.search) return;

      for (const trigger of this.root.querySelectorAll('[data-custom-search-open]')) {
        trigger.addEventListener('click', () => this.openSearch(trigger));
      }
      for (const trigger of this.root.querySelectorAll('[data-custom-search-close]')) {
        trigger.addEventListener('click', () => this.closeSearch());
      }

      this.searchInput?.addEventListener('input', () => {
        clearTimeout(this.searchTimer);
        this.searchTimer = setTimeout(() => this.fetchResults(), SEARCH_DEBOUNCE);
      });

      for (const chip of this.search.querySelectorAll('[data-custom-search-term]')) {
        chip.addEventListener('click', () => {
          if (!this.searchInput) return;
          this.searchInput.value = chip.dataset.customSearchTerm ?? '';
          this.searchInput.focus();
          this.fetchResults();
        });
      }

      this.search.addEventListener('keydown', (event) => {
        if (event.key === 'Tab') trapFocus(this.search, event);
      });
    }

    openSearch(trigger) {
      if (!this.search) return;
      this.lastFocused = trigger ?? document.activeElement;

      this.search.hidden = false;
      requestAnimationFrame(() => this.search.classList.add('is-open'));
      trigger?.setAttribute('aria-expanded', 'true');
      document.documentElement.style.overflow = 'hidden';
      setTimeout(() => this.searchInput?.focus(), 260);
    }

    closeSearch() {
      if (!this.search || this.search.hidden) return;

      this.search.classList.remove('is-open');
      for (const trigger of this.root.querySelectorAll('[data-custom-search-open]')) {
        trigger.setAttribute('aria-expanded', 'false');
      }

      const finish = () => {
        this.search.hidden = true;
      };
      this.search.addEventListener('transitionend', finish, { once: true });
      setTimeout(finish, 400);

      if (this.searchInput) this.searchInput.value = '';
      this.search.classList.remove('has-query');
      if (this.searchResults) this.searchResults.innerHTML = '';
      this.releaseScroll();
      this.lastFocused?.focus();
    }

    /**
     * Results come back as rendered markup from sections/custom-search-results.liquid,
     * so prices, translations and image sizing stay in Liquid.
     */
    async fetchResults() {
      if (!this.searchInput || !this.searchResults) return;

      const query = this.searchInput.value.trim();
      this.search.classList.toggle('has-query', query.length > 0);

      if (query.length === 0) {
        this.searchResults.innerHTML = '';
        return;
      }

      this.searchAbort?.abort();
      this.searchAbort = new AbortController();

      const url =
        `${window.Shopify?.routes?.root ?? '/'}search/suggest` +
        `?q=${encodeURIComponent(query)}` +
        '&resources[type]=product&resources[limit]=8' +
        '&section_id=custom-search-results';

      try {
        const response = await fetch(url, { signal: this.searchAbort.signal });
        if (!response.ok) throw new Error(`Search failed: ${response.status}`);

        const markup = new DOMParser().parseFromString(await response.text(), 'text/html');
        const results = markup.querySelector('.shopify-section')?.innerHTML;
        this.searchResults.innerHTML = results ?? markup.body.innerHTML;
      } catch (error) {
        if (error.name !== 'AbortError') console.warn('[custom-header] search request failed:', error);
      }
    }

    /* ---------- cart ---------- */

    bindCart() {
      const trigger = this.header.querySelector('[data-custom-cart-drawer]');

      trigger?.addEventListener('click', (event) => {
        const drawer = document.getElementById('cart-drawer');
        // Falls through to the cart page link if the drawer has not upgraded yet.
        if (typeof drawer?.toggle !== 'function') return;
        event.preventDefault();
        drawer.toggle();
      });

      // The event fires before the cart request finishes, so wait for its promise
      // and read the new total from it; a plain /cart.js fetch here races the update.
      document.addEventListener(CART_LINES_UPDATE, (event) => {
        if (!event.promise) return this.refreshCartCount();

        event.promise
          .then(({ cart, detail }) => {
            const total = cart?.totalQuantity ?? detail?.itemCount;
            return typeof total === 'number' ? this.setCartCount(total) : this.refreshCartCount();
          })
          .catch((error) => {
            if (error?.name !== 'AbortError') this.refreshCartCount();
          });
      });
    }

    async refreshCartCount() {
      const count = this.header.querySelector('[data-custom-cart-count]');
      if (!count) return;

      try {
        const response = await fetch(`${window.Shopify?.routes?.root ?? '/'}cart.js`);
        if (!response.ok) return;

        const cart = await response.json();
        this.setCartCount(cart.item_count);
      } catch (error) {
        console.warn('[custom-header] cart count refresh failed:', error);
      }
    }

    setCartCount(total) {
      const count = this.header.querySelector('[data-custom-cart-count]');
      if (!count) return;

      count.textContent = String(total);
      count.classList.toggle('is-empty', total === 0);
    }

    /* ---------- shared ---------- */

    /* Reads the `is-open` class, not `hidden` — `hidden` is flipped after the close
       transition, so it is still false at the moment this runs. */
    releaseScroll() {
      const drawerOpen = this.drawer?.classList.contains('is-open');
      const searchOpen = this.search?.classList.contains('is-open');
      if (!drawerOpen && !searchOpen) document.documentElement.style.overflow = '';
    }

    closeAll() {
      this.closeDrawer();
      this.closeSearch();
    }
  }

  const instances = new Set();

  function init(root = document) {
    for (const header of root.querySelectorAll('[data-custom-header]')) {
      if (header.dataset.customHeaderBound === 'true') continue;
      header.dataset.customHeaderBound = 'true';
      instances.add(new CustomHeader(header));
    }
  }

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    for (const instance of instances) instance.closeAll();
  });

  init();
  document.addEventListener('shopify:section:load', (event) => init(event.target));
})();
