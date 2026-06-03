/* =====================================================================
   products.js  -  Render the auto-loaded catalog, color filter,
   quantity steppers, add-to-cart, and the swipeable gallery modal.
   ===================================================================== */

let ALL_PRODUCTS = [];
let ACTIVE_COLOR = "all";   // lowercased colour key, or "all"

const grid = document.getElementById("product-grid");
const sortSel = document.getElementById("sort-select");
const countLabel = document.getElementById("result-count");
const colorFilter = document.getElementById("color-filter");

init();

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
  if (result.demo) {
    const banner = document.getElementById("demo-banner");
    if (banner) banner.style.display = "block";
  }
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
  render();
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
      colorFilter.querySelectorAll(".chip").forEach((c) =>
        c.classList.toggle("active", c.dataset.color === ACTIVE_COLOR));
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
    grid.innerHTML = `<div class="notice">No sarees in this colour. Try another filter.</div>`;
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
