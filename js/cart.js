/* =====================================================================
   cart.js  -  Render cart from localStorage, edit quantities,
   collect shipping info, and place the order via WhatsApp.
   ===================================================================== */

const itemsWrap = document.getElementById("cart-items");
const summaryWrap = document.getElementById("cart-summary");
let summaryBuilt = false;   // build the form once; never wipe typed details

// Full catalog (with every image, details, type) so a cart item can open the
// same swipeable gallery modal it has on the Products page. Keyed by product id.
const CATALOG = new Map();

renderCart();
loadCatalog();

// Fetch the catalog in the background; once it arrives the cart images/names
// become clickable and open the rich gallery. Failing silently is fine — the
// click still opens a basic single-image gallery built from the cart item.
async function loadCatalog() {
  if (typeof window.loadProductsFromDrive !== "function") return;
  try {
    const result = await window.loadProductsFromDrive();
    (result.products || []).forEach((p) => CATALOG.set(p.id, p));
    // Re-render so older cart items (saved without a type) pick up their
    // "Saree Cloth" tag from the freshly loaded catalog.
    renderCart();
  } catch (e) {
    console.error("Cart: couldn't load catalog for gallery", e);
  }
}

// Open the gallery for a cart item: prefer the full catalog product, and fall
// back to a minimal product built from the stored cart fields.
function openItemGallery(it) {
  if (typeof window.openGallery !== "function") return;
  const product = CATALOG.get(it.id) || {
    id: it.id,
    group: it.group,
    name: it.name,
    price: it.price,
    color: it.color,
    colorSwatch: it.colorSwatch,
    images: it.image ? [it.image] : [],
    imagesAlt: [],
    thumbs: it.image ? [it.image] : [],
    thumbsAlt: [],
  };
  window.openGallery(product);
}

function renderCart() {
  const cart = window.getCart();
  const wrap = itemsWrap.closest(".cart-wrap");
  if (wrap) wrap.classList.toggle("is-empty", !cart.length);

  if (!cart.length) {
    itemsWrap.innerHTML = `
      <div class="empty-cart">
        <h3 style="color:var(--wine);font-family:var(--font-serif);font-size:1.6rem">Your cart is empty</h3>
        <p class="muted" style="margin:10px 0 22px">Discover sarees woven just for you.</p>
        <a href="products.html" class="btn btn-primary">Browse Collection</a>
      </div>`;
    summaryWrap.innerHTML = "";
    summaryBuilt = false;
    return;
  }

  renderItems();
  if (!summaryBuilt) buildSummary();
  updateTotals();
  bindItemEvents();
}

function renderItems() {
  const cart = window.getCart();
  itemsWrap.innerHTML = cart.map((it) => {
    const type = (it.type || (CATALOG.get(it.id) || {}).type || "").trim();
    // Offer a "Qty" dropdown with the current quantity pre-selected. The list
    // runs to at least 10, and grows to cover a larger existing quantity.
    const maxQty = Math.max(10, it.quantity);
    const options = Array.from({ length: maxQty }, (_, i) => i + 1)
      .map((n) => `<option value="${n}"${n === it.quantity ? " selected" : ""}>${n}</option>`)
      .join("");
    return `
    <div class="cart-item" data-id="${it.id}">
      <img src="${it.image}" alt="${it.name}" class="ci-open" data-open="${it.id}"
           title="View gallery"
           onerror="this.src='https://placehold.co/120x150/f3ebe0/8a7c80?text=Saree'">
      <div class="ci-info">
        <h4 class="ci-open" data-open="${it.id}" title="View gallery">${it.name}</h4>
        ${type
          ? `<span class="ci-tag">${type}</span>`
          : ""}
        <label class="ci-qty">
          <span class="ci-qty-label">Qty</span>
          <select data-qty="${it.id}" aria-label="Quantity for ${it.name}">${options}</select>
        </label>
      </div>
      <div class="ci-right">
        <div class="price">${window.SHOW_PRICE
          ? (it.price ? window.money(it.price * it.quantity) : "<small>On request</small>")
          : "<small>Price: Calculated on WhatsApp</small>"}</div>
        <button class="ci-remove" data-remove="${it.id}">✕ Remove</button>
      </div>
    </div>`;
  }).join("");
}

function buildSummary() {
  summaryWrap.innerHTML = `
    <div class="summary">
      <div class="summary-head">
        <h3>Order Summary</h3>
        <button id="clear-btn" type="button" class="clear-cart-link">Clear Cart</button>
      </div>
      <div class="row"><span>Items</span><span id="sum-items">0</span></div>
      <div class="row"><span>Subtotal</span><span id="sum-subtotal">₹0</span></div>
      <div class="row"><span>Shipping</span><span>Calculated on WhatsApp</span></div>
      <div class="row total"><span>Total</span><span id="sum-total">₹0</span></div>

      <h3 style="margin:24px 0 4px;font-size:1.1rem">Shipping Details</h3>
      <form id="ship-form" class="form-grid">
        <div class="field full"><label>Full Name</label><input name="name" required placeholder="Your name"></div>
        <div class="field"><label>Floor / Unit</label><input name="floor" required placeholder="e.g. 2nd Floor"></div>
        <div class="field"><label>Area</label><input name="area" required placeholder="Area / Locality"></div>
        <div class="field full"><label>State</label>
          <select name="state" required>
            <option value="">Select State</option>
            ${["Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh","Goa","Gujarat","Haryana","Himachal Pradesh","Jharkhand","Karnataka","Kerala","Madhya Pradesh","Maharashtra","Manipur","Meghalaya","Mizoram","Nagaland","Odisha","Punjab","Rajasthan","Sikkim","Tamil Nadu","Telangana","Tripura","Uttar Pradesh","Uttarakhand","West Bengal","Andaman and Nicobar Islands","Chandigarh","Dadra and Nagar Haveli and Daman and Diu","Delhi","Jammu and Kashmir","Ladakh","Lakshadweep","Puducherry"]
              .map((s) => `<option value="${s}">${s}</option>`).join("")}
          </select>
        </div>
        <div class="field full"><label>Country</label>
          <select name="country" required>
            ${["India","Australia","Bangladesh","Canada","Germany","Malaysia","Nepal","New Zealand","Pakistan","Singapore","South Africa","Sri Lanka","United Arab Emirates","United Kingdom","United States"]
              .map((c) => `<option value="${c}"${c === "India" ? " selected" : ""}>${c}</option>`).join("")}
          </select>
        </div>
      </form>

      <button id="checkout-btn" class="btn btn-gold" style="width:100%;justify-content:center;margin-top:8px">
        Checkout via WhatsApp
      </button>
    </div>`;

  document.getElementById("checkout-btn").addEventListener("click", checkout);
  document.getElementById("clear-btn").addEventListener("click", () => {
    if (confirm("Remove all items from your cart?")) { window.clearCart(); renderCart(); }
  });
  summaryBuilt = true;
}

function updateTotals() {
  const total = window.cartTotal();
  const items = window.cartCount();
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set("sum-items", items);
  const totalText = window.SHOW_PRICE ? window.money(total) : window.PRICE_HIDDEN_TEXT;
  set("sum-subtotal", totalText);
  set("sum-total", totalText);
}

function refresh() {           // update list + totals WITHOUT touching the form
  if (!window.getCart().length) { renderCart(); return; }
  renderItems();
  updateTotals();
  bindItemEvents();
}

function bindItemEvents() {
  itemsWrap.querySelectorAll("select[data-qty]").forEach((sel) => {
    const id = sel.dataset.qty;
    sel.addEventListener("change", () => {
      const v = Math.max(1, parseInt(sel.value) || 1);
      window.setQuantity(id, v);
      refresh();
    });
  });

  itemsWrap.querySelectorAll("[data-remove]").forEach((b) =>
    b.addEventListener("click", () => { window.removeFromCart(b.dataset.remove); refresh(); }));

  // Clicking a cart item's image or name opens the same gallery as Products.
  itemsWrap.querySelectorAll("[data-open]").forEach((el) => {
    el.addEventListener("click", () => {
      const it = window.getCart().find((c) => c.id === el.dataset.open);
      if (it) openItemGallery(it);
    });
    // Warm the full-size images on hover/touch so the gallery opens instantly.
    const warm = () => {
      const p = CATALOG.get(el.dataset.open);
      if (p && typeof window.primeGallery === "function") window.primeGallery(p);
    };
    el.addEventListener("pointerenter", warm, { once: true });
    el.addEventListener("touchstart", warm, { once: true, passive: true });
  });
}

function checkout() {
  const form = document.getElementById("ship-form");
  if (!form.checkValidity()) { form.reportValidity(); return; }
  const data = Object.fromEntries(new FormData(form).entries());
  if (!window.getCart().length) { alert("Your cart is empty."); return; }
  const url = window.buildWhatsAppOrder(data);
  window.open(url, "_blank");
}
