/* =====================================================================
   products.js  -  Render the auto-loaded catalog, color filter,
   quantity steppers, add-to-cart, and the swipeable gallery modal.
   ===================================================================== */

let ALL_PRODUCTS = [];
let activeColor = "all";

const grid = document.getElementById("product-grid");
const chipsWrap = document.getElementById("color-chips");
const sortSel = document.getElementById("sort-select");
const countLabel = document.getElementById("result-count");

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
  buildColorChips();
  render();
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

function buildColorChips() {
  const colors = [...new Set(ALL_PRODUCTS.map((p) => p.color).filter(Boolean))];
  const chip = (label, value, swatch) => `
    <button class="chip ${value === "all" ? "active" : ""}" data-color="${value}">
      ${swatch ? `<span class="dot" style="background:${swatch}"></span>` : ""}${label}
    </button>`;
  chipsWrap.innerHTML =
    chip("All Colors", "all", "") +
    colors.map((c) => chip(c, c.toLowerCase(), window.colorToSwatch(c))).join("");

  chipsWrap.querySelectorAll(".chip").forEach((b) => {
    b.addEventListener("click", () => {
      chipsWrap.querySelectorAll(".chip").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      activeColor = b.dataset.color;
      render();
    });
  });
}

function getVisible() {
  let list = ALL_PRODUCTS.filter(
    (p) => activeColor === "all" || (p.color || "").toLowerCase() === activeColor
  );
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
    const priceHtml = p.price
      ? `<span class="price">${window.money(p.price)}</span>`
      : `<span class="price"><small>Price on request</small></span>`;
    return `
      <div class="card reveal ${i % 3 === 1 ? "d1" : i % 3 === 2 ? "d2" : ""}" data-id="${p.id}">
        <div class="card-inner">
          <div class="card-media">
            <img src="${p.cover || p.images[0]}" alt="${p.name}" loading="lazy"
                 data-alt="${p.coverAlt || (p.imagesAlt && p.imagesAlt[0]) || ''}"
                 onload="this.classList.add('loaded')"
                 onerror="window.driveImgError(this)">
            <span class="shine"></span>
            <span class="badge-color"><span class="dot" style="background:${p.colorSwatch}"></span>${p.color}</span>
            <button class="card-view" data-view="${p.id}">View Gallery</button>
          </div>
          <div class="card-body">
            <h3>${p.name}</h3>
            <p class="desc">${p.details || "Exquisite handpicked saree with matching blouse."}</p>
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
