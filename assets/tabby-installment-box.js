/**
 * Behaviour for the tabby box in blocks/installments.liquid.
 *
 * Tabby's promo script (tabby-promo.js) works out the real installment
 * amounts in the browser and draws them in an open shadow root. This
 * component renders that widget off-screen, mirrors its text into the box's
 * own typography, and forwards "Learn more" to Tabby's popup. It re-renders
 * for the new price when the shopper picks another variant.
 */
import { Component } from '@theme/component';
import { StandardEvents } from '@shopify/events';

const TABBY_SCRIPT_URL = 'https://checkout.tabby.ai/tabby-promo.js';
const TEXT_SELECTOR = '[data-test="promo-widget-snippet-text"]';
const LEARN_MORE_SELECTOR = '[data-test="widget-learn-more"]';
const RENDER_TIMEOUT = 10000;
const POLL_INTERVAL = 150;

/** @type {Promise<void> | undefined} */
let tabbyScript;

/** Loads Tabby's promo script once per page. */
function loadTabby() {
  if (!tabbyScript) {
    tabbyScript = new Promise((resolve, reject) => {
      if (/** @type {any} */ (window).TabbyPromo) return resolve();
      const script = document.createElement('script');
      script.src = TABBY_SCRIPT_URL;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        tabbyScript = undefined;
        reject(new Error('Tabby promo script failed to load'));
      };
      document.head.append(script);
    });
  }
  return tabbyScript;
}

/**
 * @typedef {object} TabbyBoxRefs
 * @property {HTMLElement} terms - The box's terms line.
 * @property {HTMLButtonElement} learnMore - Opens Tabby's details popup.
 */

/** @extends {Component<TabbyBoxRefs>} */
class TabbyInstallmentBox extends Component {
  requiredRefs = ['terms', 'learnMore'];

  /** @type {AbortController | undefined} */
  #abortController;

  /** @type {HTMLElement | undefined} Off-screen host of the current Tabby widget. */
  #source;

  /** @type {number | undefined} */
  #pollTimer;

  #renderCount = 0;

  connectedCallback() {
    super.connectedCallback();

    this.#abortController = new AbortController();
    const section = this.closest('.shopify-section') ?? document;
    section.addEventListener(StandardEvents.productSelect, this.#handleProductSelect, {
      signal: this.#abortController.signal,
    });

    this.#render(this.dataset.price);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#abortController?.abort();
    window.clearInterval(this.#pollTimer);
    this.#source?.remove();
  }

  /** Opens Tabby's "Learn more" popup for the current price. */
  openDetails() {
    const link = this.#source?.querySelector('span')?.shadowRoot?.querySelector(LEARN_MORE_SELECTOR);
    if (link instanceof HTMLElement) link.click();
  }

  /** @param {Event} event */
  #handleProductSelect = (event) => {
    const select = /** @type {import('@shopify/events').ProductSelectEvent} */ (event);
    if (!(event.target instanceof Element) || event.target.closest('product-card')) return;

    select.promise
      ?.then(({ variant }) => {
        const amount = variant?.price?.amount;
        if (amount !== undefined && amount !== this.dataset.price) {
          this.dataset.price = amount;
          this.#render(amount);
        }
      })
      .catch((error) => {
        if (error?.name !== 'AbortError') console.warn('[tabby-installment-box] Variant update failed:', error);
      });
  };

  /** @param {string | undefined} price */
  async #render(price) {
    const amount = Number(price);
    if (!Number.isFinite(amount) || amount <= 0) return;

    const renderId = ++this.#renderCount;
    window.clearInterval(this.#pollTimer);

    try {
      await loadTabby();
    } catch (error) {
      console.warn('[tabby-installment-box]', error);
      return;
    }
    if (renderId !== this.#renderCount || !this.isConnected) return;

    // Tabby renders nothing when re-initialised into a container it already
    // used, so every render gets a fresh off-screen host.
    this.#source?.remove();
    const source = document.createElement('div');
    source.id = `TabbyPromoSource-${this.dataset.productId}-${renderId}`;
    source.className = 'installment-box__source';
    source.setAttribute('aria-hidden', 'true');
    this.append(source);
    this.#source = source;

    /** @type {Record<string, string>} */
    const config = {
      selector: `#${source.id}`,
      currency: this.dataset.currency ?? 'AED',
      price: amount.toFixed(2),
      lang: this.dataset.lang === 'ar' ? 'ar' : 'en',
      source: 'product',
    };
    if (this.dataset.publicKey) config.publicKey = this.dataset.publicKey;
    if (this.dataset.merchantCode) config.merchantCode = this.dataset.merchantCode;

    new /** @type {any} */ (window).TabbyPromo(config);
    this.#mirrorWhenReady(renderId);
  }

  /**
   * Tabby gives no render callback, so poll its shadow root until the text appears.
   * @param {number} renderId
   */
  #mirrorWhenReady(renderId) {
    const startedAt = Date.now();

    this.#pollTimer = window.setInterval(() => {
      if (renderId !== this.#renderCount) return window.clearInterval(this.#pollTimer);

      const root = this.#source?.querySelector('span')?.shadowRoot;
      const text = root?.querySelector(TEXT_SELECTOR);
      if (text) {
        window.clearInterval(this.#pollTimer);
        this.#mirror(text, root?.querySelector(LEARN_MORE_SELECTOR));
      } else if (Date.now() - startedAt > RENDER_TIMEOUT) {
        window.clearInterval(this.#pollTimer);
      }
    }, POLL_INTERVAL);
  }

  /**
   * Copies Tabby's promo wording into the box, keeping its bold amount.
   * @param {Element} text
   * @param {Element | null | undefined} learnMore
   */
  #mirror(text, learnMore) {
    const { terms, learnMore: button } = this.refs;
    const fragment = document.createDocumentFragment();

    for (const node of text.childNodes[0]?.childNodes ?? text.childNodes) {
      fragment.append(this.#plainCopy(node));
    }

    terms.replaceChildren(fragment);
    terms.normalize();

    const label = learnMore?.textContent?.trim();
    if (label) button.textContent = label;
    button.hidden = !learnMore;
  }

  /**
   * Rebuilds a Tabby node as unstyled text, keeping only <strong> for the amount.
   * @param {Node} node
   * @returns {Node}
   */
  #plainCopy(node) {
    if (node.nodeType !== Node.ELEMENT_NODE) return document.createTextNode(node.textContent ?? '');

    const element = /** @type {Element} */ (node);
    const copy = element.tagName === 'STRONG' ? document.createElement('strong') : document.createDocumentFragment();
    for (const child of element.childNodes) copy.append(this.#plainCopy(child));
    return copy;
  }
}

if (!customElements.get('tabby-installment-box')) {
  customElements.define('tabby-installment-box', TabbyInstallmentBox);
}
