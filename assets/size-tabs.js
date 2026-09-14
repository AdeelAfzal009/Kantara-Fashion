// Switches between the "Ready Size" and "Custom Size" panels on the product page.
// The panels themselves (variant-picker, custom-size-panel) are sibling blocks, not
// children of this element, so visibility is driven by a data attribute on this host
// combined with a general sibling selector in size-tabs.liquid's stylesheet.
class SizeTabs extends HTMLElement {
  #controller = new AbortController();

  connectedCallback() {
    const { signal } = this.#controller;

    this.querySelectorAll('[data-size-tab]').forEach((tab) => {
      tab.addEventListener('click', this.#handleTabClick, { signal });
    });

    const sizeGuideLink = this.querySelector('[data-size-guide-link]');
    if (sizeGuideLink) sizeGuideLink.addEventListener('click', this.#handleSizeGuideClick, { signal });
  }

  disconnectedCallback() {
    this.#controller.abort();
  }

  #handleTabClick = (event) => {
    const tab = event.currentTarget;
    if (!(tab instanceof HTMLElement)) return;

    const target = tab.dataset.sizeTab;
    if (!target) return;

    this.querySelectorAll('[data-size-tab]').forEach((otherTab) => {
      const isActive = otherTab === tab;
      otherTab.classList.toggle('active', isActive);
      otherTab.setAttribute('aria-selected', String(isActive));
    });

    this.setAttribute('data-active-tab', target);
  };

  #handleSizeGuideClick = (event) => {
    event.preventDefault();

    const heading = Array.from(document.querySelectorAll('.details__header')).find((element) =>
      element.textContent?.trim().toLowerCase().startsWith('size guide')
    );
    if (!heading) return;

    const details = heading.closest('details');
    if (details instanceof HTMLDetailsElement) details.open = true;

    heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
}

if (!customElements.get('size-tabs')) {
  customElements.define('size-tabs', SizeTabs);
}
