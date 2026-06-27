/* =====================================================================
   gallery.js  -  Shared swipeable gallery modal used by BOTH the
   Products page and the Home page "Featured Sarees" section.
   Any page that includes the #gallery-modal markup + this script gets
   window.openGallery(product). Optionally set window.onGalleryAdd to a
   callback that runs after the modal's "Add to Cart" (e.g. to refresh a
   product grid).

   Performance: the stage is a horizontal slider track. The current image
   and its immediate neighbours load first so the open + arrow taps feel
   instant, and the remaining slides preload quietly in the background so
   every swipe is ready without waiting for a fresh full-size fetch.
   ===================================================================== */
(function () {
  const modal = document.getElementById("gallery-modal");
  if (!modal) return;

  const stageEl = modal.querySelector(".mg-stage");
  // The markup ships a single static <img data-mstage>; we render our own
  // sliding track instead, so hide the static node (kept for backwards compat).
  const staticImg = modal.querySelector("[data-mstage]");
  if (staticImg) staticImg.style.display = "none";

  // Lift the close button out of the animated card and pin it to the modal
  // (which has no transform) so it stays fixed in the viewport — always
  // reachable while scrolling, with no jump after the open animation.
  const closeBtn = modal.querySelector("[data-mclose]");
  if (closeBtn && closeBtn.parentElement !== modal) modal.appendChild(closeBtn);

  // Build (once) the sliding track and keep the arrows on top of it.
  let track = stageEl.querySelector(".mg-track");
  if (!track) {
    track = document.createElement("div");
    track.className = "mg-track";
    const nextArrow = stageEl.querySelector(".mg-arrow.next");
    stageEl.insertBefore(track, nextArrow || null);
  }

  let imgs = [], imgsAlt = [], idx = 0;

  // Assign a slide's high-res src the first time it's needed, then cache it.
  function loadSlide(k) {
    const hi = track.querySelector(`.mg-slide[data-si="${k}"] .mg-hi`);
    if (hi && !hi.getAttribute("src")) {
      hi.onload = () => hi.classList.add("loaded");
      hi.onerror = () => { window.driveImgError(hi); hi.classList.add("loaded"); };
      hi.src = hi.dataset.full;
    }
  }

  // Load slide i and its neighbours so the open + arrow taps feel instant.
  function ensureLoaded(i) {
    const n = imgs.length;
    if (!n) return;
    new Set([(i - 1 + n) % n, i, (i + 1) % n]).forEach(loadSlide);
  }

  // Quietly preload every remaining slide once the browser is idle, so any
  // later swipe shows an already-decoded image with no fetch wait.
  function preloadAll() {
    const run = () => imgs.forEach((_, k) => loadSlide(k));
    if ("requestIdleCallback" in window) requestIdleCallback(run, { timeout: 1500 });
    else setTimeout(run, 350);
  }

  function buildTrack(p) {
    imgs = p.images || [];
    imgsAlt = p.imagesAlt || [];
    const previews = p.thumbs || [];   // tiny, fast-loading low-res shown instantly
    idx = 0;

    track.style.transition = "none";          // don't animate the initial position
    track.style.transform = "translateX(0)";
    track.innerHTML = imgs.map((src, i) => `
      <div class="mg-slide" data-si="${i}">
        ${previews[i] ? `<img class="mg-base" src="${previews[i]}" alt="" aria-hidden="true" onerror="this.remove()">` : ""}
        <img class="mg-hi" alt="${(p.name || 'Saree') + ' — image ' + (i + 1)}"
             data-full="${src}" data-alt="${imgsAlt[i] || ''}">
      </div>`).join("");

    // Re-enable the slide animation on the next frame.
    requestAnimationFrame(() => { track.style.transition = ""; });

    ensureLoaded(0);
    preloadAll();
    syncThumbs();
  }

  // Warm a product's gallery images BEFORE the modal opens (called on hover /
  // touch of a product card). By the time the shopper actually taps to open,
  // the first full-size image is already fetched & cached, so it appears
  // instantly instead of waiting ~2s for a fresh CDN resize.
  const primed = new Set();
  function primeGallery(p) {
    if (!p || !Array.isArray(p.images) || !p.images.length) return;
    const key = p.id || p.name;
    if (primed.has(key)) return;
    primed.add(key);
    const warm = (url) => { if (url) { const im = new Image(); im.decoding = "async"; im.src = url; } };
    warm(p.images[0]);                                  // the first (visible) image now
    const rest = () => p.images.slice(1).forEach(warm); // the rest when idle
    if ("requestIdleCallback" in window) requestIdleCallback(rest, { timeout: 2500 });
    else setTimeout(rest, 450);
  }

  function syncThumbs() {
    modal.querySelectorAll("[data-mthumbs] img").forEach((im) =>
      im.classList.toggle("active", +im.dataset.gi === idx));
  }

  function showSlide(i) {
    if (!imgs.length) return;
    idx = (i + imgs.length) % imgs.length;
    track.style.transform = `translateX(${-idx * 100}%)`;
    ensureLoaded(idx);
    syncThumbs();
  }

  function openGallery(p) {
    if (!p) return;

    modal.querySelector("[data-mtitle]").textContent = p.name;
    const typeEl = modal.querySelector("[data-mtype]");
    if (typeEl) {
      const t = (p.type || "").trim();
      typeEl.innerHTML = t ? `<span class="m-type-label">Saree Cloth:</span> ${t}` : "";
      typeEl.style.display = t ? "" : "none";
    }
    modal.querySelector("[data-mdetails]").textContent =
      p.details || "Exquisite handpicked saree with a matching blouse piece.";
    modal.querySelector("[data-mprice]").innerHTML = window.SHOW_PRICE
      ? (p.price
          ? window.money(p.price)
          : "<small style='font-size:1rem;color:var(--muted)'>Price on request</small>")
      : "<small style='font-size:1rem;color:var(--muted)'>Price: Calculated on WhatsApp</small>";

    // "Add to Cart" / "Buy Now" mirror the product-card buttons exactly:
    // add one more of this saree (with a toast), or add + jump to the cart.
    const addBtn = modal.querySelector("[data-madd]");
    if (addBtn) {
      addBtn.onclick = () => {
        window.addOneToCart(p);
        const inCart = window.getCart().find((c) => c.id === p.id);
        const count = inCart ? inCart.quantity : 1;
        if (typeof window.showToast === "function")
          window.showToast(`Added to cart — quantity is now ${count} for ${p.name}.`);
        if (typeof window.onGalleryAdd === "function") window.onGalleryAdd();
      };
    }
    const buyBtn = modal.querySelector("[data-mbuy]");
    if (buyBtn) {
      buyBtn.onclick = () => {
        if (!window.getCart().some((c) => c.id === p.id)) window.addOneToCart(p);
        window.location.href = "cart.html";
      };
    }

    // Thumbnails strip below the stage.
    const thumbsWrap = modal.querySelector("[data-mthumbs]");
    const thumbList = p.thumbs || p.images || [];
    const thumbAltList = p.thumbsAlt || p.imagesAlt || [];
    thumbsWrap.innerHTML = thumbList.map((t, i) =>
      `<img src="${t}" data-gi="${i}" class="${i === 0 ? "active" : ""}"
        data-alt="${thumbAltList[i] || ''}" onerror="window.driveImgError(this)">`).join("");
    thumbsWrap.querySelectorAll("img").forEach((im) =>
      im.addEventListener("click", () => showSlide(+im.dataset.gi)));

    buildTrack(p);

    modal.classList.add("open");
    lockScroll();
  }

  // Freeze the page behind the modal WITHOUT touching html/body overflow (which
  // can stop a fixed overlay from scrolling on mobile). Instead we swallow
  // scroll gestures that start outside the modal; gestures inside it scroll the
  // modal normally, and its `overscroll-behavior: contain` stops them from
  // bleeding through to the page at the edges. Works on touch + desktop alike.
  function blockBgScroll(e) {
    if (!modal.contains(e.target)) e.preventDefault();
  }
  function lockScroll() {
    document.body.classList.add("modal-open");
    document.addEventListener("touchmove", blockBgScroll, { passive: false });
    document.addEventListener("wheel", blockBgScroll, { passive: false });
  }
  function unlockScroll() {
    document.body.classList.remove("modal-open");
    document.removeEventListener("touchmove", blockBgScroll, { passive: false });
    document.removeEventListener("wheel", blockBgScroll, { passive: false });
  }

  function closeGallery() {
    modal.classList.remove("open");
    unlockScroll();
  }

  modal.querySelector("[data-mclose]").addEventListener("click", closeGallery);
  modal.querySelector(".modal-bg").addEventListener("click", closeGallery);
  modal.querySelector(".mg-arrow.prev").addEventListener("click", () => showSlide(idx - 1));
  modal.querySelector(".mg-arrow.next").addEventListener("click", () => showSlide(idx + 1));
  document.addEventListener("keydown", (e) => {
    if (!modal.classList.contains("open")) return;
    if (e.key === "Escape") closeGallery();
    if (e.key === "ArrowLeft") showSlide(idx - 1);
    if (e.key === "ArrowRight") showSlide(idx + 1);
  });

  /* swipe on touch */
  let touchX = null;
  stageEl.addEventListener("touchstart", (e) => (touchX = e.touches[0].clientX), { passive: true });
  stageEl.addEventListener("touchend", (e) => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 40) showSlide(idx + (dx < 0 ? 1 : -1));
    touchX = null;
  });

  window.openGallery = openGallery;
  window.closeGallery = closeGallery;
  window.primeGallery = primeGallery;
})();
