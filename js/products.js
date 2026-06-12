/* =====================================================================
   products.js  -  Render the auto-loaded catalog, color filter,
   quantity steppers, add-to-cart, and the swipeable gallery modal.
   ===================================================================== */

let ALL_PRODUCTS = [];
let ACTIVE_COLOR = "all";   // lowercased colour key, or "all"
let ACTIVE_TYPE = "all";    // lowercased saree-cloth key, or "all"
let ACTIVE_COLOR_LABEL = "";
let ACTIVE_COLOR_SWATCH = "";
let ACTIVE_TYPE_LABEL = "";
let PRICE_BOUNDS = null;    // { min, max } across the catalog (only when prices show)
let ACTIVE_PRICE = null;    // { min, max } current selection, or null when unused

const grid = document.getElementById("product-grid");
const sortSel = document.getElementById("sort-select");
const countLabel = document.getElementById("result-count");
const colorFilter = document.getElementById("color-filter");
const typeFilter = document.getElementById("type-filter");
const priceFilter = document.getElementById("price-filter");
const priceRow = document.getElementById("price-row");

initFilterUI();
init();

// The "Filter" dropdown: clicking the button opens the menu of categories;
// clicking a category (Colour / Saree Cloth / Price Range) expands its options.
function initFilterUI() {
  const toggle = document.getElementById("filter-toggle");
  const menu = document.getElementById("filter-menu");
  if (!toggle || !menu) return;

  const setOpen = (open) => {
    menu.hidden = !open;
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
  };
  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    setOpen(menu.hidden);
  });

  // Accordion: open one category at a time.
  menu.querySelectorAll(".filter-group-head").forEach((head) => {
    head.addEventListener("click", () => {
      const group = head.closest(".filter-group");
      const wasOpen = group.classList.contains("open");
      menu.querySelectorAll(".filter-group").forEach((g) => g.classList.remove("open"));
      menu.querySelectorAll(".filter-group-head").forEach((h) => h.setAttribute("aria-expanded", "false"));
      if (!wasOpen) { group.classList.add("open"); head.setAttribute("aria-expanded", "true"); }
    });
  });

  // Close when clicking anywhere outside the filter panel.
  document.addEventListener("click", (e) => {
    if (!menu.hidden && !e.target.closest(".filters")) setOpen(false);
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") setOpen(false); });
}

// Reflect the chosen value next to a category head (e.g. "All" → "Blue").
function setFilterSummary(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text || "All";
}

// Show the currently-applied filters as removable chips, to the RIGHT of the
// Filter button. Only non-default selections appear.
function renderActiveFilters() {
  const wrap = document.getElementById("filter-active");
  if (!wrap) return;
  const chips = [];
  if (ACTIVE_COLOR !== "all") {
    chips.push(`<span class="active-chip">${ACTIVE_COLOR_SWATCH
      ? `<span class="dot" style="background:${ACTIVE_COLOR_SWATCH}"></span>` : ""}${ACTIVE_COLOR_LABEL}
      <button class="x" type="button" data-clear="color" aria-label="Clear colour filter">&times;</button></span>`);
  }
  if (ACTIVE_TYPE !== "all") {
    chips.push(`<span class="active-chip">${ACTIVE_TYPE_LABEL}
      <button class="x" type="button" data-clear="type" aria-label="Clear cloth filter">&times;</button></span>`);
  }
  if (window.SHOW_PRICE && ACTIVE_PRICE && PRICE_BOUNDS &&
      (ACTIVE_PRICE.min > PRICE_BOUNDS.min || ACTIVE_PRICE.max < PRICE_BOUNDS.max)) {
    chips.push(`<span class="active-chip">${window.money(ACTIVE_PRICE.min)} – ${window.money(ACTIVE_PRICE.max)}
      <button class="x" type="button" data-clear="price" aria-label="Clear price filter">&times;</button></span>`);
  }
  wrap.innerHTML = chips.join("");
  wrap.querySelectorAll("[data-clear]").forEach((b) =>
    b.addEventListener("click", (e) => { e.stopPropagation(); clearFilter(b.dataset.clear); }));
}

// Reset a single filter back to its default and refresh the grid.
function clearFilter(kind) {
  if (kind === "color") {
    ACTIVE_COLOR = "all"; ACTIVE_COLOR_LABEL = ""; ACTIVE_COLOR_SWATCH = "";
    if (colorFilter) colorFilter.querySelectorAll(".chip").forEach((c) =>
      c.classList.toggle("active", c.dataset.color === "all"));
    setFilterSummary("color-current", "All");
  } else if (kind === "type") {
    ACTIVE_TYPE = "all"; ACTIVE_TYPE_LABEL = "";
    if (typeFilter) typeFilter.querySelectorAll(".chip").forEach((c) =>
      c.classList.toggle("active", c.dataset.type === "all"));
    setFilterSummary("type-current", "All");
  } else if (kind === "price" && PRICE_BOUNDS) {
    ACTIVE_PRICE = { ...PRICE_BOUNDS };
    const minI = priceFilter && priceFilter.querySelector(".range-min");
    const maxI = priceFilter && priceFilter.querySelector(".range-max");
    const fill = priceFilter && priceFilter.querySelector(".range-fill");
    const loL = priceFilter && priceFilter.querySelector(".range-lo");
    const hiL = priceFilter && priceFilter.querySelector(".range-hi");
    if (minI && maxI) {
      minI.value = PRICE_BOUNDS.min; maxI.value = PRICE_BOUNDS.max;
      if (fill) { fill.style.left = "0%"; fill.style.right = "0%"; }
      if (loL) loL.textContent = window.money(PRICE_BOUNDS.min);
      if (hiL) hiL.textContent = window.money(PRICE_BOUNDS.max);
    }
    setFilterSummary("price-current", "All");
  }
  renderActiveFilters();
  render();
}

async function init() {
  showSkeleton();
  let result;
  try {
    result = await window.loadProductsFromDrive();
  } catch (e) {
    console.error(e);
    grid.innerHTML = `<div class="notice">Couldn't load the catalog from Google Drive.<br>
      <b>Check your API key & folder sharing</b> in <code>js/config.js</code>.<br><br>
      <small>${(e.message || e).toString().slice(0, 220)}</small></div>`;
    return;
  }

  ALL_PRODUCTS = result.products || [];
  if (result.unconfigured) {
    grid.className = "";
    grid.innerHTML = `<div class="notice">Your collection isn't connected yet.<br>
      Connect your Google Drive folder in <code>js/config.js</code> so your uploaded sarees
      appear here automatically.<br><br>
      <small>Easiest: deploy <b>google-apps-script.gs</b> and paste its URL into
      <b>drive.appsScriptUrl</b> — see <b>README.md → section 3</b>.</small></div>`;
    return;
  }
  if (!ALL_PRODUCTS.length) {
    grid.className = "";
    grid.innerHTML = `<div class="notice">No sarees found in your Drive folder yet.<br>
      Upload images named <b>1_1.jpg, 1_2.jpg…</b> and a <b>1.txt</b> file to start.</div>`;
    return;
  }
  buildColorFilter();
  buildTypeFilter();
  buildPriceFilter();
  render();
}

// Build the price-range slider — ONLY when prices are shown (config.priceDisplay
// === "ON"). When prices are hidden the whole row stays hidden.
function buildPriceFilter() {
  if (!priceFilter || !priceRow) return;
  if (!window.SHOW_PRICE) { priceRow.hidden = true; return; }

  const priced = ALL_PRODUCTS.map((p) => Number(p.price)).filter((v) => v > 0);
  if (priced.length < 2) { priceRow.hidden = true; return; }   // nothing to range over

  const step = nicePriceStep(Math.max(...priced) - Math.min(...priced));
  const lo = Math.floor(Math.min(...priced) / step) * step;
  const hi = Math.ceil(Math.max(...priced) / step) * step;
  if (hi <= lo) { priceRow.hidden = true; return; }

  PRICE_BOUNDS = { min: lo, max: hi };
  ACTIVE_PRICE = { min: lo, max: hi };
  priceRow.hidden = false;

  priceFilter.innerHTML = `
    <div class="range">
      <div class="range-track"><div class="range-fill"></div></div>
      <input type="range" class="range-min" min="${lo}" max="${hi}" step="${step}" value="${lo}" aria-label="Minimum price">
      <input type="range" class="range-max" min="${lo}" max="${hi}" step="${step}" value="${hi}" aria-label="Maximum price">
    </div>
    <div class="range-vals"><span class="range-lo"></span><span class="range-hi"></span></div>`;

  const minI = priceFilter.querySelector(".range-min");
  const maxI = priceFilter.querySelector(".range-max");
  const fill = priceFilter.querySelector(".range-fill");
  const loL = priceFilter.querySelector(".range-lo");
  const hiL = priceFilter.querySelector(".range-hi");
  const span = hi - lo;

  const update = (rerender) => {
    let a = Math.min(+minI.value, +maxI.value);
    let b = Math.max(+minI.value, +maxI.value);
    ACTIVE_PRICE = { min: a, max: b };
    fill.style.left = ((a - lo) / span) * 100 + "%";
    fill.style.right = ((hi - b) / span) * 100 + "%";
    loL.textContent = window.money(a);
    hiL.textContent = window.money(b);
    setFilterSummary("price-current", (a <= lo && b >= hi) ? "All" : `${window.money(a)} – ${window.money(b)}`);
    renderActiveFilters();
    if (rerender) render();
  };

  // Stop the two thumbs from crossing each other.
  minI.addEventListener("input", () => { if (+minI.value > +maxI.value) minI.value = maxI.value; update(true); });
  maxI.addEventListener("input", () => { if (+maxI.value < +minI.value) maxI.value = minI.value; update(true); });
  update(false);
}

// Pick a tidy slider step so the thumbs snap to round prices.
function nicePriceStep(range) {
  if (range <= 1000) return 50;
  if (range <= 5000) return 100;
  if (range <= 20000) return 500;
  return 1000;
}

// Build the colour filter chips from the colours found in the saree .txt files.
function buildColorFilter() {
  if (!colorFilter) return;

  const seen = new Map();   // lowercase key -> { label, swatch }
  ALL_PRODUCTS.forEach((p) => {
    const label = (p.color || "").trim();
    if (!label) return;
    const key = label.toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, { label, swatch: p.colorSwatch || window.colorToSwatch(label) });
    }
  });

  if (seen.size <= 1) {        // nothing useful to filter by
    colorFilter.innerHTML = "";
    const group = document.getElementById("color-group");
    if (group) group.hidden = true;
    return;
  }

  const chips = [`<button class="chip${ACTIVE_COLOR === "all" ? " active" : ""}" data-color="all">All</button>`];
  [...seen.entries()]
    .sort((a, b) => a[1].label.localeCompare(b[1].label))
    .forEach(([key, { label, swatch }]) => {
      chips.push(
        `<button class="chip${ACTIVE_COLOR === key ? " active" : ""}" data-color="${key}">
           <span class="dot" style="background:${swatch}"></span>${label}
         </button>`
      );
    });
  colorFilter.innerHTML = chips.join("");

  colorFilter.querySelectorAll(".chip").forEach((chip) =>
    chip.addEventListener("click", () => {
      ACTIVE_COLOR = chip.dataset.color;
      ACTIVE_COLOR_LABEL = ACTIVE_COLOR === "all" ? "" : chip.textContent.trim();
      const dot = chip.querySelector(".dot");
      ACTIVE_COLOR_SWATCH = dot ? dot.style.background : "";
      colorFilter.querySelectorAll(".chip").forEach((c) =>
        c.classList.toggle("active", c.dataset.color === ACTIVE_COLOR));
      setFilterSummary("color-current", chip.textContent.trim());
      renderActiveFilters();
      render();
    }));
}

// Build the Saree Cloth filter chips from the "type" field in the .txt files.
function buildTypeFilter() {
  if (!typeFilter) return;

  const seen = new Map();   // lowercase key -> label
  ALL_PRODUCTS.forEach((p) => {
    const label = (p.type || "").trim();
    if (!label) return;
    const key = label.toLowerCase();
    if (!seen.has(key)) seen.set(key, label);
  });

  if (seen.size <= 1) {        // nothing useful to filter by
    typeFilter.innerHTML = "";
    const wrap = typeFilter.closest(".filter-group");
    if (wrap) wrap.hidden = true;
    return;
  }

  const chips = [`<button class="chip${ACTIVE_TYPE === "all" ? " active" : ""}" data-type="all">All</button>`];
  [...seen.entries()]
    .sort((a, b) => a[1].localeCompare(b[1]))
    .forEach(([key, label]) => {
      chips.push(`<button class="chip${ACTIVE_TYPE === key ? " active" : ""}" data-type="${key}">${label}</button>`);
    });
  typeFilter.innerHTML = chips.join("");

  typeFilter.querySelectorAll(".chip").forEach((chip) =>
    chip.addEventListener("click", () => {
      ACTIVE_TYPE = chip.dataset.type;
      ACTIVE_TYPE_LABEL = ACTIVE_TYPE === "all" ? "" : chip.textContent.trim();
      typeFilter.querySelectorAll(".chip").forEach((c) =>
        c.classList.toggle("active", c.dataset.type === ACTIVE_TYPE));
      setFilterSummary("type-current", chip.textContent.trim());
      renderActiveFilters();
      render();
    }));
}

function showSkeleton() {
  grid.innerHTML = "";
  grid.className = "skeleton-grid";
  for (let i = 0; i < 6; i++) {
    grid.insertAdjacentHTML("beforeend", `
      <div class="skeleton"><div class="sk-img"></div>
        <div class="sk-body"><div class="sk-line"></div><div class="sk-line short"></div></div></div>`);
  }
}

function getVisible() {
  let list = [...ALL_PRODUCTS];
  if (ACTIVE_COLOR !== "all") {
    list = list.filter((p) => (p.color || "").trim().toLowerCase() === ACTIVE_COLOR);
  }
  if (ACTIVE_TYPE !== "all") {
    list = list.filter((p) => (p.type || "").trim().toLowerCase() === ACTIVE_TYPE);
  }
  // Price range only applies when prices are shown and the shopper narrowed it.
  if (window.SHOW_PRICE && ACTIVE_PRICE && PRICE_BOUNDS &&
      (ACTIVE_PRICE.min > PRICE_BOUNDS.min || ACTIVE_PRICE.max < PRICE_BOUNDS.max)) {
    list = list.filter((p) => {
      const v = Number(p.price);
      if (!v) return true;   // keep "price on request" items visible
      return v >= ACTIVE_PRICE.min && v <= ACTIVE_PRICE.max;
    });
  }
  const s = sortSel ? sortSel.value : "";
  if (s === "low") list = [...list].sort((a, b) => a.price - b.price);
  if (s === "high") list = [...list].sort((a, b) => b.price - a.price);
  if (s === "name") list = [...list].sort((a, b) => a.name.localeCompare(b.name));
  return list;
}

function render() {
  const list = getVisible();
  grid.className = "product-grid";
  countLabel.textContent = `${list.length} saree${list.length === 1 ? "" : "s"}`;

  if (!list.length) {
    grid.innerHTML = `<div class="notice">No sarees match these filters. Try another colour or cloth.</div>`;
    return;
  }

  grid.innerHTML = list.map((p, i) => {
    const inCart = window.getCart().find((c) => c.id === p.id);
    const qty = inCart ? inCart.quantity : 0;
    const priceHtml = window.SHOW_PRICE
      ? (p.price
          ? `<span class="price">${window.money(p.price)}</span>`
          : `<span class="price"><small>Price on request</small></span>`)
      : `<span class="price"><small>Price: Calculated on WhatsApp</small></span>`;
    return `
      <div class="card reveal ${i % 3 === 1 ? "d1" : i % 3 === 2 ? "d2" : ""}" data-id="${p.id}">
        <div class="card-inner">
          <div class="card-media">
            <img src="${p.cover || p.images[0]}" alt="${p.name}" loading="lazy"
                 data-alt="${p.coverAlt || (p.imagesAlt && p.imagesAlt[0]) || ''}"
                 onload="this.classList.add('loaded')"
                 onerror="window.driveImgError(this)">
            <span class="shine"></span>
            ${p.color && p.color.trim() && p.color.trim().toLowerCase() !== "assorted"
              ? `<span class="badge-color"><span class="dot" style="background:${p.colorSwatch}"></span>${p.color}</span>`
              : ""}
            <button class="card-view" data-view="${p.id}">View Gallery</button>
          </div>
          <div class="card-body">
            <h3>${p.name}</h3>
            ${p.type && p.type.trim()
              ? `<span class="card-tag">${p.type.trim()}</span>`
              : ""}
            <div class="card-foot">
              ${priceHtml}
              <div class="qty" data-qty="${p.id}">
                <button data-step="-1">−</button>
                <input type="number" min="0" value="${qty}" data-input="${p.id}">
                <button data-step="1">+</button>
              </div>
            </div>
            <div class="add-line">
              <button class="btn btn-primary" data-add="${p.id}">Add to Cart</button>
            </div>
          </div>
        </div>
      </div>`;
  }).join("");

  bindCardEvents();
  window.initReveal(grid);
  window.initTilt(grid);
}

function bindCardEvents() {
  const open = (id) => {
    const p = ALL_PRODUCTS.find((x) => x.id === id);
    if (p) window.openGallery(p);
  };
  grid.querySelectorAll("[data-view]").forEach((b) =>
    b.addEventListener("click", (e) => { e.stopPropagation(); open(b.dataset.view); }));
  grid.querySelectorAll(".card-media img").forEach((img) =>
    img.addEventListener("click", () => open(img.closest(".card").dataset.id)));

  // The stepper only changes the local number; "Add to Cart" commits it.
  grid.querySelectorAll("[data-qty]").forEach((q) => {
    const input = q.querySelector("input");
    q.querySelectorAll("button").forEach((btn) =>
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        input.value = Math.max(0, (parseInt(input.value) || 0) + parseInt(btn.dataset.step));
      }));
    input.addEventListener("change", () => {
      input.value = Math.max(0, parseInt(input.value) || 0);
    });
    input.addEventListener("click", (e) => e.stopPropagation());
  });

  grid.querySelectorAll("[data-add]").forEach((b) =>
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      const p = ALL_PRODUCTS.find((x) => x.id === b.dataset.add);
      const input = grid.querySelector(`[data-input="${p.id}"]`);
      const qty = Math.max(1, parseInt(input.value) || 1);
      input.value = qty;
      commitQty(p, qty);          // set cart quantity to the chosen value
      b.textContent = "Added ✓";
      setTimeout(() => (b.textContent = "Add to Cart"), 1200);
    }));
}

// Set the cart quantity for a product to an absolute value.
function commitQty(p, qty) {
  const exists = window.getCart().some((c) => c.id === p.id);
  if (exists) window.setQuantity(p.id, qty);
  else if (qty > 0) window.addToCart(window.productCartShape(p), qty);
}

// The shared gallery (js/gallery.js) calls this after its "Add to Cart"
// so the grid's quantity steppers stay in sync.
window.onGalleryAdd = render;

if (sortSel) sortSel.addEventListener("change", render);
