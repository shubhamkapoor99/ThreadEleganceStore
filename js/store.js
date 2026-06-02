/* =====================================================================
   store.js  -  Shared cart/"session" logic (localStorage, no backend),
   plus the shared navbar + footer rendering and WhatsApp checkout.
   ===================================================================== */

const CART_KEY = "cart";
const CFG = window.STORE_CONFIG;
const money = (n) => `${CFG.currency}${Number(n || 0).toLocaleString("en-IN")}`;

/* ---------- pricing switch (single source of truth) ----------------
   Driven by STORE_CONFIG.priceDisplay ("ON" / "OFF"). Every page reads
   window.SHOW_PRICE so flipping the config value updates the whole site. */
const SHOW_PRICE = String(CFG.priceDisplay ?? "ON").trim().toUpperCase() !== "OFF";
const PRICE_HIDDEN_TEXT = "Calculated on WhatsApp";
// Plain-text price for one product: respects the switch and the "no price" case.
const priceLabel = (price) =>
  !SHOW_PRICE ? PRICE_HIDDEN_TEXT : (price ? money(price) : "Price on request");

/* ---------- robust persistence layer ------------------------------
   Tries localStorage first; if it's unavailable or blocked (private
   mode, strict privacy settings, some file:// contexts) it falls back
   to a year-long cookie, and finally to in-memory. This keeps the cart
   from resetting to zero on reload in far more environments. */
const persist = (() => {
  const mem = {};
  let ls = null;
  try {
    const t = "__te_test__";
    window.localStorage.setItem(t, "1");
    window.localStorage.removeItem(t);
    ls = window.localStorage;
  } catch { ls = null; }

  const readCookie = (name) => {
    const m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : null;
  };
  const writeCookie = (name, val) => {
    try {
      document.cookie =
        `${name}=${encodeURIComponent(val)}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
    } catch { /* ignore */ }
  };

  return {
    get(key) {
      if (ls) { try { const v = ls.getItem(key); if (v !== null) return v; } catch { /* ignore */ } }
      const c = readCookie(key);
      if (c !== null && c !== "") return c;
      return key in mem ? mem[key] : null;
    },
    set(key, val) {
      mem[key] = val;
      if (ls) { try { ls.setItem(key, val); } catch { writeCookie(key, val); } }
      else writeCookie(key, val);
    },
    remove(key) {
      delete mem[key];
      if (ls) { try { ls.removeItem(key); } catch { /* ignore */ } }
      writeCookie(key, "");
    },
  };
})();

/* ---------- cart "session" (persisted across reloads) ---------- */
const getCart = () => {
  try { return JSON.parse(persist.get(CART_KEY)) || []; }
  catch { return []; }
};
const setCart = (cart) => {
  persist.set(CART_KEY, JSON.stringify(cart));
  updateCartCount();
};
const cartCount = () => getCart().reduce((s, i) => s + i.quantity, 0);
const cartTotal = () => getCart().reduce((s, i) => s + (Number(i.price) || 0) * i.quantity, 0);

function addToCart(item, qty = 1) {
  const cart = getCart();
  const found = cart.find((i) => i.id === item.id);
  if (found) found.quantity += qty;
  else cart.push({ ...item, quantity: qty });
  setCart(cart);
  bumpCartIcon();
}
// Normalize a catalog product into the minimal shape stored in the cart.
function productCartShape(p) {
  return {
    id: p.id, group: p.group, name: p.name, price: p.price, color: p.color,
    colorSwatch: p.colorSwatch, image: p.cover || (p.images && p.images[0]),
  };
}
// Add exactly one more of this product (used by the gallery modal).
function addOneToCart(p) {
  const existing = getCart().find((c) => c.id === p.id);
  if (existing) setQuantity(p.id, existing.quantity + 1);
  else addToCart(productCartShape(p), 1);
}
function setQuantity(id, qty) {
  let cart = getCart();
  const it = cart.find((i) => i.id === id);
  if (it) {
    it.quantity = qty;
    cart = cart.filter((i) => i.quantity > 0);
    setCart(cart);
  }
}
function removeFromCart(id) {
  setCart(getCart().filter((i) => i.id !== id));
}
function clearCart() {
  persist.remove(CART_KEY);
  updateCartCount();
}

function updateCartCount() {
  const c = cartCount();
  document.querySelectorAll(".js-cart-count").forEach((el) => {
    el.textContent = c;
    el.classList.toggle("is-empty", c === 0);
  });
}
function bumpCartIcon() {
  document.querySelectorAll(".js-cart-link").forEach((el) => {
    el.classList.remove("cart-bump");
    void el.offsetWidth;
    el.classList.add("cart-bump");
  });
}

/* ---------- WhatsApp order (no backend checkout) ------------------- */
function buildWhatsAppOrder(shipping) {
  const cart = getCart();
  let msg = `*New Order — ${CFG.storeName}*\n\n`;
  if (shipping) {
    msg += `*Name:* ${shipping.name}\n`;
    msg += `*Floor/Unit:* ${shipping.floor}\n`;
    msg += `*Area:* ${shipping.area}\n`;
    msg += `*State:* ${shipping.state}\n`;
    msg += `*Country:* ${shipping.country || "India"}\n\n`;
  }
  msg += `*Items:*\n`;
  cart.forEach((it, i) => {
    const line = SHOW_PRICE
      ? (it.price ? `${money(it.price * it.quantity)}` : "Price on request")
      : PRICE_HIDDEN_TEXT;
    const code = (it.group !== undefined && it.group !== null && it.group !== "")
      ? `\n   Code: ${it.group}`
      : "";
    msg += `${i + 1}. ${it.name}  x${it.quantity}  — ${line}${code}\n`;
  });
  msg += `\n*Total:* ${SHOW_PRICE ? money(cartTotal()) : PRICE_HIDDEN_TEXT}`;
  return `https://wa.me/${CFG.whatsappNumber}?text=${encodeURIComponent(msg)}`;
}

/* ---------- shared navbar + footer --------------------------------- */
function renderChrome(active) {
  const links = [
    ["index.html", "Home"],
    ["products.html", "Sarees"],
    ["about.html", "About"],
    ["contact.html", "Contact"],
  ];
  const navItems = links.map(
    ([href, label]) =>
      `<a href="${href}" class="nav-link ${active === href ? "active" : ""}">${label}</a>`
  ).join("");

  const header = document.querySelector("[data-chrome='header']");
  if (header) {
    header.innerHTML = `
      <nav class="navbar" id="navbar">
        <div class="nav-inner">
          <a href="index.html" class="brand">
            <span class="brand-text">${CFG.storeName}</span>
          </a>
          <div class="nav-links" id="navLinks">
            ${navItems}
          </div>
          <div class="nav-right">
            <a href="cart.html" class="nav-cart js-cart-link" aria-label="Cart">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8">
                <path d="M3 3h2l.4 2M7 13h10l3-8H6.4M7 13L5.4 5M7 13l-2 4h12" stroke-linecap="round" stroke-linejoin="round"/>
                <circle cx="9" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/>
              </svg>
              <span class="js-cart-count cart-badge">0</span>
            </a>
            <button class="nav-toggle" id="navToggle" aria-label="Menu" aria-expanded="false">
              <span></span><span></span><span></span>
            </button>
          </div>
        </div>
      </nav>`;

    const toggle = header.querySelector("#navToggle");
    const linksEl = header.querySelector("#navLinks");
    const setOpen = (open) => {
      linksEl.classList.toggle("open", open);
      toggle.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    };
    toggle.addEventListener("click", () => setOpen(!linksEl.classList.contains("open")));
    linksEl.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => setOpen(false)));

    const nav = header.querySelector("#navbar");
    const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 30);
    window.addEventListener("scroll", onScroll);
    onScroll();
  }

  const footer = document.querySelector("[data-chrome='footer']");
  if (footer) {
    footer.innerHTML = `
      <div class="footer-inner">
        <div class="footer-col">
          <h4>${CFG.storeName}</h4>
          ${CFG.tagline ? `<p>${CFG.tagline}</p>` : ""}
          <p class="muted">${CFG.address}</p>
        </div>
        <div class="footer-col">
          <h4>Shop</h4>
          <a href="products.html">All Sarees</a>
          <a href="cart.html">My Cart</a>
          <a href="about.html">About Us</a>
        </div>
        <div class="footer-col">
          <h4>Reach Us</h4>
          <a href="https://wa.me/${CFG.whatsappNumber}" target="_blank" rel="noopener" class="footer-social">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
              <path d="M12 2a10 10 0 0 0-8.6 15l-1.3 4.7 4.8-1.3A10 10 0 1 0 12 2zm0 18a8 8 0 0 1-4.1-1.1l-.3-.2-2.8.8.8-2.8-.2-.3A8 8 0 1 1 12 20zm4.5-5.9c-.2-.1-1.4-.7-1.7-.8-.2-.1-.4-.1-.5.1l-.7.9c-.1.2-.3.2-.5.1a6.5 6.5 0 0 1-3.2-2.8c-.1-.2 0-.4.1-.5l.4-.5c.1-.1.1-.3.2-.4 0-.1 0-.3 0-.4l-.7-1.7c-.2-.4-.4-.4-.5-.4h-.5c-.2 0-.4.1-.6.3-.2.2-.8.8-.8 1.9s.8 2.2.9 2.4c.1.1 1.6 2.5 4 3.5.6.3 1 .4 1.4.5.6.2 1.1.2 1.5.1.5-.1 1.4-.6 1.6-1.1.2-.6.2-1 .1-1.1z"/>
            </svg>WhatsApp</a>
          <a href="mailto:${CFG.email}" class="footer-social">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="3" y="5" width="18" height="14" rx="2.5"/>
              <path d="M4 7l8 6 8-6"/>
            </svg>${CFG.email}</a>
          <a href="tel:${CFG.phone}" class="footer-social">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M5 4h3l2 5-2.5 1.5a11 11 0 0 0 5 5L19 18l-1 3a16 16 0 0 1-13-13z"/>
            </svg>${CFG.phone}</a>
          ${CFG.instagram ? `<a href="${CFG.instagram}" target="_blank" rel="noopener" class="footer-social">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="5"/>
              <circle cx="12" cy="12" r="4"/>
              <circle cx="17.4" cy="6.6" r="1.1" fill="currentColor" stroke="none"/>
            </svg>Instagram</a>` : ""}
        </div>
      </div>
      <div class="footer-bottom">© ${new Date().getFullYear()} ${CFG.storeName}. Made with ♥ in India.</div>`;
  }

  // Floating WhatsApp button
  if (!document.querySelector(".wa-float")) {
    const a = document.createElement("a");
    a.href = `https://wa.me/${CFG.whatsappNumber}`;
    a.target = "_blank";
    a.className = "wa-float";
    a.title = "Chat on WhatsApp";
    a.innerHTML = `<svg viewBox="0 0 32 32" width="28" height="28" fill="currentColor"><path d="M16 .5C7.4.5.5 7.4.5 16c0 2.8.8 5.5 2.2 7.9L.5 31.5l7.8-2.1C10.6 30.7 13.2 31.5 16 31.5 24.6 31.5 31.5 24.6 31.5 16S24.6.5 16 .5zm0 28c-2.5 0-4.9-.7-7-1.9l-.5-.3-4.6 1.2 1.2-4.5-.3-.5C3.4 20.9 2.7 18.5 2.7 16 2.7 8.6 8.6 2.7 16 2.7S29.3 8.6 29.3 16 23.4 28.5 16 28.5zm7.4-9.2c-.4-.2-2.4-1.2-2.7-1.3-.4-.1-.6-.2-.9.2s-1 1.3-1.3 1.5c-.2.2-.5.3-.9.1-.4-.2-1.7-.6-3.2-2-1.2-1-2-2.4-2.2-2.8-.2-.4 0-.6.2-.8l.6-.7c.2-.2.3-.4.4-.7.1-.2.1-.5 0-.7-.1-.2-.9-2.2-1.3-3-.3-.8-.6-.7-.9-.7h-.7c-.2 0-.6.1-.9.4-.3.4-1.2 1.2-1.2 2.9s1.2 3.4 1.4 3.6c.2.2 2.4 3.7 5.9 5.2.8.4 1.5.6 2 .7.8.3 1.6.2 2.2.1.7-.1 2.1-.9 2.4-1.7.3-.8.3-1.5.2-1.7-.1-.2-.4-.3-.8-.5z"/></svg>`;
    document.body.appendChild(a);
  }

  // Inject a gold "TE" favicon so every page has a branded tab icon.
  if (!document.querySelector("link[rel='icon']")) {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'>
      <rect width='64' height='64' rx='14' fill='%235b0e2d'/>
      <text x='50%' y='54%' dominant-baseline='middle' text-anchor='middle'
        font-family='Georgia,serif' font-size='30' font-weight='700' fill='%23e8d39a'>TE</text></svg>`;
    const link = document.createElement("link");
    link.rel = "icon";
    link.type = "image/svg+xml";
    link.href = "data:image/svg+xml," + svg.replace(/\n\s*/g, "");
    document.head.appendChild(link);
  }

  updateCartCount();
}

/* expose */
Object.assign(window, {
  getCart, setCart, addToCart, setQuantity, removeFromCart, clearCart,
  cartCount, cartTotal, updateCartCount, buildWhatsAppOrder, renderChrome, money,
  productCartShape, addOneToCart,
  SHOW_PRICE, PRICE_HIDDEN_TEXT, priceLabel,
});
