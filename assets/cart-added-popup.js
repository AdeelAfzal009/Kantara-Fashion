/**
 * Behaviour for snippets/cart-added-popup.liquid.
 *
 * Waits for a successful add to cart (the theme's `shopify:cart:lines-update`
 * event with action "add"), fills the popup with the added line and
 * "You may also like" recommendations, and opens it as a modal dialog.
 */
import { formatMoney } from '@theme/money-formatting';

const CART_LINES_UPDATE = 'shopify:cart:lines-update';
const RECOMMENDATION_LIMIT = 8;

const dialog = /** @type {HTMLDialogElement | null} */ (document.getElementById('cart-added-popup'));

if (dialog) {
  const itemSlot = dialog.querySelector('[data-cart-added-item]');
  const recsBlock = /** @type {HTMLElement} */ (dialog.querySelector('[data-cart-added-recs]'));
  const rail = dialog.querySelector('[data-cart-added-rail]');
  const moneyFormat = dialog.dataset.moneyFormat || '{{amount}}';
  const currency = dialog.dataset.currency || '';
  const root = dialog.dataset.root || '/';

  /** @type {Map<string, Promise<Card[]>>} */
  const recsCache = new Map();

  /** @param {unknown} value */
  const escapeHtml = (value) =>
    String(value ?? '').replace(
      /[&<>"']/g,
      (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char
    );

  /** @param {number} cents */
  const money = (cents) => formatMoney(cents, moneyFormat, currency);

  /**
   * @param {string | null | undefined} src
   * @param {number} width
   */
  const sizedImage = (src, width) => {
    if (!src) return '';
    try {
      const url = new URL(src, window.location.origin);
      url.searchParams.set('width', String(width));
      return url.toString();
    } catch {
      return src;
    }
  };

  /** @param {any} item - line item from /cart.js */
  const renderItem = (item) => {
    const options = (item.options_with_values ?? [])
      .filter((/** @type {any} */ option) => option.value !== 'Default Title')
      .map(
        (/** @type {any} */ option) =>
          `${escapeHtml(String(option.name).replace(' (cm)', ''))}: <b>${escapeHtml(option.value)}</b>`
      )
      .join('<br>');
    const image = sizedImage(item.image, 300);

    if (!itemSlot) return;
    itemSlot.innerHTML = `
      <a class="cart-added__thumb" href="${escapeHtml(item.url)}">
        ${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(item.product_title)}" width="100" height="124">` : ''}
      </a>
      <div class="cart-added__info">
        ${options ? `<p class="cart-added__options">${options}</p>` : ''}
        <p class="cart-added__title">${escapeHtml(item.product_title)}</p>
        <p class="cart-added__price">${escapeHtml(money(item.final_price))}</p>
      </div>`;
  };

  /**
   * @typedef {{ id: number, title: string, url: string, image: string, price: number, available: boolean }} Card
   */

  /** @returns {Promise<Card[]>} Related products from Shopify's recommendations. */
  const fetchRelated = (/** @type {string} */ productId) =>
    fetch(
      `${root}recommendations/products.json?product_id=${encodeURIComponent(productId)}&limit=${RECOMMENDATION_LIMIT}&intent=related`
    )
      .then((response) => (response.ok ? response.json() : { products: [] }))
      .then((data) =>
        (data.products ?? []).map((/** @type {any} */ product) => ({
          id: product.id,
          title: product.title,
          url: product.url,
          image: product.featured_image,
          price: product.price,
          available: product.available,
        }))
      );

  /**
   * Shopify returns no related products until it has enough store data, so fall
   * back to the catalogue (prices there are decimal strings, not cents).
   * @returns {Promise<Card[]>}
   */
  const fetchCatalogue = () =>
    fetch(`${root}products.json?limit=${RECOMMENDATION_LIMIT + 1}`)
      .then((response) => (response.ok ? response.json() : { products: [] }))
      .then((data) =>
        (data.products ?? []).map((/** @type {any} */ product) => ({
          id: product.id,
          title: product.title,
          url: `${root}products/${product.handle}`,
          image: product.images?.[0]?.src ?? '',
          price: Math.round(parseFloat(product.variants?.[0]?.price ?? '0') * 100),
          available: (product.variants ?? []).some((/** @type {any} */ variant) => variant.available),
        }))
      );

  /** @param {string} productId */
  const fetchRecommendations = (productId) => {
    let request = recsCache.get(productId);
    if (!request) {
      request = fetchRelated(productId)
        .then((cards) => (cards.length ? cards : fetchCatalogue()))
        .catch(() => []);
      recsCache.set(productId, request);
    }
    return request;
  };

  /** @param {any} item */
  const renderRecommendations = async (item) => {
    recsBlock.hidden = true;
    if (!rail || !item.product_id) return;

    const products = (await fetchRecommendations(String(item.product_id)))
      .filter((product) => product.available && product.id !== item.product_id)
      .slice(0, RECOMMENDATION_LIMIT);
    if (!products.length) return;

    rail.innerHTML = products
      .map((product) => {
        const image = sizedImage(product.image, 400);
        return `
          <a class="cart-added__card" href="${escapeHtml(product.url)}">
            <span class="cart-added__card-media">
              ${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(product.title)}" width="200" height="250">` : ''}
            </span>
            <span class="cart-added__card-title">${escapeHtml(product.title)}</span>
            <span class="cart-added__card-price">${escapeHtml(money(product.price))}</span>
          </a>`;
      })
      .join('');
    rail.scrollLeft = 0;
    recsBlock.hidden = false;
  };

  /** @param {any} item */
  const open = (item) => {
    renderItem(item);
    renderRecommendations(item);
    if (!dialog.open) dialog.showModal();
  };

  dialog.addEventListener('click', (event) => {
    const target = /** @type {Element} */ (event.target);
    // A click on the dialog element itself is a click on the backdrop.
    if (target === dialog || target.closest('[data-cart-added-close]')) dialog.close();
  });

  document.addEventListener(CART_LINES_UPDATE, (event) => {
    const update = /** @type {any} */ (event);
    if (update.action !== 'add' || !update.promise) return;

    const variantId = String(update.lines?.[0]?.merchandiseId ?? '')
      .split('/')
      .pop();

    // Adds from a modal (e.g. quick add) open the popup once that modal closes,
    // so its focus restoration runs first.
    const sourceModal = /** @type {HTMLDialogElement | null} */ (
      event.target instanceof Element ? event.target.closest('dialog:modal') : null
    );

    update.promise
      .then((/** @type {any} */ { detail }) => {
        if (detail?.didError) return;

        const items = detail?.items ?? [];
        const item = items.find((/** @type {any} */ line) => String(line.variant_id) === variantId) ?? items[0];
        if (!item) return;

        if (sourceModal?.open) {
          sourceModal.addEventListener('close', () => open(item), { once: true });
        } else {
          open(item);
        }
      })
      .catch((/** @type {any} */ error) => {
        if (error?.name !== 'AbortError') console.warn('[cart-added-popup] Add to cart failed:', error);
      });
  });
}
