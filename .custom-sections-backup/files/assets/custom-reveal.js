/**
 * Scroll reveal for the `custom-*` sections.
 *
 * Elements marked `.custom-reveal` fade and rise into place once, the first time
 * they cross the viewport. Staggering is per-container: every `.custom-reveal`
 * inside a `[data-custom-reveal-group]` gets an incremental delay.
 *
 * Re-runs on `shopify:section:load` so newly rendered sections animate in the
 * theme editor too.
 */
(() => {
  const REVEAL = '.custom-reveal';
  const STAGGER_STEP = 0.08;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const observer =
    'IntersectionObserver' in window
      ? new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (!entry.isIntersecting) continue;
              entry.target.classList.add('is-in-view');
              observer.unobserve(entry.target);
            }
          },
          { threshold: 0.15, rootMargin: '0px 0px -60px 0px' }
        )
      : null;

  function reveal(element) {
    if (element.dataset.customRevealBound === 'true') return;
    element.dataset.customRevealBound = 'true';

    if (!observer || prefersReducedMotion.matches) {
      element.classList.add('is-in-view');
      return;
    }

    observer.observe(element);
  }

  function init(root = document) {
    for (const group of root.querySelectorAll('[data-custom-reveal-group]')) {
      const items = group.querySelectorAll(REVEAL);
      items.forEach((item, index) => {
        item.style.setProperty('--custom-reveal-delay', `${index * STAGGER_STEP}s`);
      });
    }

    for (const element of root.querySelectorAll(REVEAL)) reveal(element);
  }

  init();

  document.addEventListener('shopify:section:load', (event) => {
    init(event.target);
  });
})();
