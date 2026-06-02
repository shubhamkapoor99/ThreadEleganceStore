/* =====================================================================
   cart.js  -  Render cart from localStorage, edit quantities,
   collect shipping info, and place the order via WhatsApp.
   ===================================================================== */

const itemsWrap = document.getElementById("cart-items");
const summaryWrap = document.getElementById("cart-summary");
let summaryBuilt = false;   // build the form once; never wipe typed details

renderCart();

function renderCart() {
  const cart = window.getCart();

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
  itemsWrap.innerHTML = cart.map((it) => `
    <div class="cart-item" data-id="${it.id}">
      <img src="${it.image}" alt="${it.name}"
           onerror="this.src='https://placehold.co/120x150/f3ebe0/8a7c80?text=Saree'">
      <div>
        <h4>${it.name}</h4>
        <span class="ci-color"><span class="dot" style="background:${it.colorSwatch || '#b08d57'}"></span>${it.color || "—"}</span>
        <div class="qty" style="margin-top:12px" data-qty="${it.id}">
          <button data-step="-1">−</button>
          <input type="number" min="1" value="${it.quantity}" data-input="${it.id}">
          <button data-step="1">+</button>
        </div>
      </div>
      <div class="ci-right">
        <div class="price">${it.price ? window.money(it.price * it.quantity) : "<small>On request</small>"}</div>
        <button class="ci-remove" data-remove="${it.id}">✕ Remove</button>
      </div>
    </div>`).join("");
}

function buildSummary() {
  summaryWrap.innerHTML = `
    <div class="summary">
      <h3>Order Summary</h3>
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
      </form>

      <button id="checkout-btn" class="btn btn-gold" style="width:100%;justify-content:center;margin-top:8px">
        Checkout via WhatsApp
      </button>
      <button id="clear-btn" class="btn btn-outline" style="width:100%;justify-content:center;margin-top:10px">
        Clear Cart
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
  set("sum-subtotal", window.money(total));
  set("sum-total", window.money(total));
}

function refresh() {           // update list + totals WITHOUT touching the form
  if (!window.getCart().length) { renderCart(); return; }
  renderItems();
  updateTotals();
  bindItemEvents();
}

function bindItemEvents() {
  itemsWrap.querySelectorAll("[data-qty]").forEach((q) => {
    const id = q.dataset.qty;
    const input = q.querySelector("input");
    q.querySelectorAll("button").forEach((btn) =>
      btn.addEventListener("click", () => {
        const v = Math.max(1, (parseInt(input.value) || 1) + parseInt(btn.dataset.step));
        window.setQuantity(id, v);
        refresh();
      }));
    input.addEventListener("change", () => {
      const v = parseInt(input.value) || 0;
      if (v < 1) window.removeFromCart(id); else window.setQuantity(id, v);
      refresh();
    });
  });

  itemsWrap.querySelectorAll("[data-remove]").forEach((b) =>
    b.addEventListener("click", () => { window.removeFromCart(b.dataset.remove); refresh(); }));
}

function checkout() {
  const form = document.getElementById("ship-form");
  if (!form.checkValidity()) { form.reportValidity(); return; }
  const data = Object.fromEntries(new FormData(form).entries());
  if (!window.getCart().length) { alert("Your cart is empty."); return; }
  const url = window.buildWhatsAppOrder(data);
  window.open(url, "_blank");
}
