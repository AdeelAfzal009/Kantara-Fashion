// Collapses long text blocks behind a fading preview with a "see more" / "see less" toggle.
class ReadMoreText extends HTMLElement {
  /** @type {HTMLElement} */
  get content() {
    const content = this.querySelector('.text-block-read-more__content');

    if (!(content instanceof HTMLElement)) throw new Error('Content element not found');

    return content;
  }

  /** @type {HTMLButtonElement} */
  get toggle() {
    const toggle = this.querySelector('.text-block-read-more__toggle');

    if (!(toggle instanceof HTMLButtonElement)) throw new Error('Toggle button not found');

    return toggle;
  }

  get #lines() {
    return Number(this.dataset.lines) || 3;
  }

  #controller = new AbortController();
  #collapsedHeight = 0;

  connectedCallback() {
    const { signal } = this.#controller;

    this.toggle.addEventListener('click', this.#handleToggleClick, { signal });
    window.addEventListener('resize', this.#measure, { signal });

    this.#measure();
  }

  disconnectedCallback() {
    this.#controller.abort();
  }

  /**
   * Measures the collapsed height for the configured line count and shows the
   * toggle only when the content actually overflows that height.
   */
  #measure = () => {
    if (this.hasAttribute('expanded')) return;

    // Line-height is set on the rendered text element itself, not this
    // wrapper, so measure it there rather than relying on inheritance.
    const textElement = this.content.firstElementChild ?? this.content;
    const lineHeight = parseFloat(getComputedStyle(textElement).lineHeight) || 0;
    this.#collapsedHeight = Math.round(lineHeight * this.#lines);
    this.content.style.setProperty('--read-more-collapsed-height', `${this.#collapsedHeight}px`);

    const isOverflowing = this.content.scrollHeight - this.#collapsedHeight > 1;
    this.toggleAttribute('data-overflowing', isOverflowing);
    this.toggle.hidden = !isOverflowing;
  };

  #handleToggleClick = () => {
    const expanded = this.hasAttribute('expanded');
    const label = this.toggle.querySelector('.text-block-read-more__toggle-label');

    if (expanded) {
      this.removeAttribute('expanded');
      this.content.style.setProperty('--read-more-collapsed-height', `${this.#collapsedHeight}px`);
      this.toggle.setAttribute('aria-expanded', 'false');
      if (label instanceof HTMLElement) label.textContent = label.dataset.more ?? label.textContent;
    } else {
      this.setAttribute('expanded', '');
      this.content.style.setProperty('--read-more-collapsed-height', `${this.content.scrollHeight}px`);
      this.toggle.setAttribute('aria-expanded', 'true');
      if (label instanceof HTMLElement) label.textContent = label.dataset.less ?? label.textContent;
    }
  };
}

if (!customElements.get('read-more-text')) {
  customElements.define('read-more-text', ReadMoreText);
}
