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

  // Take full control of scroll position across history changes. Otherwise the
  // browser auto-restores a (wrong) scroll position when we rewind the gallery's
  // history step on close, dropping the shopper somewhere else on the page. With
  // this off, our own save/restore in lock/unlockScroll is the single source of
  // truth, so closing a card always returns to the exact spot it opened from.
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";

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

  // Inject the zoom in / out controls once. They live inside the stage so the
  // zoom is scoped to the picture only (never the surrounding card / page).
  let zoomCtrls = stageEl.querySelector(".mg-zoom");
  if (!zoomCtrls) {
    zoomCtrls = document.createElement("div");
    zoomCtrls.className = "mg-zoom";
    zoomCtrls.innerHTML =
      `<button type="button" class="mg-zoom-btn mg-zoom-out" aria-label="Zoom out">\u2212</button>` +
      `<button type="button" class="mg-zoom-btn mg-zoom-in" aria-label="Zoom in">+</button>`;
    stageEl.appendChild(zoomCtrls);
  }
  const zoomInBtn = zoomCtrls.querySelector(".mg-zoom-in");
  const zoomOutBtn = zoomCtrls.querySelector(".mg-zoom-out");

  let imgs = [], imgsAlt = [], idx = 0;

  // Scroll position of the page BEHIND the modal, captured the moment we open so
  // we can drop the shopper back on the exact same spot when the gallery closes.
  let savedScrollY = 0;

  /* ---- picture zoom (pinch on touch, buttons + wheel on desktop) ----
     The zoom transform is applied to the CURRENT slide only, so it scales the
     photo in place and `overflow:hidden` on the slide clips the overflow. */
  const ZOOM_MIN = 1, ZOOM_MAX = 4, ZOOM_STEP = 0.6;
  let zoom = 1, panX = 0, panY = 0;

  function currentSlide() { return track.children[idx] || null; }

  function clampPan() {
    const slide = currentSlide();
    if (!slide) return;
    const maxX = (slide.offsetWidth * (zoom - 1)) / 2;
    const maxY = (slide.offsetHeight * (zoom - 1)) / 2;
    panX = Math.max(-maxX, Math.min(maxX, panX));
    panY = Math.max(-maxY, Math.min(maxY, panY));
  }

  function applyZoom() {
    const slide = currentSlide();
    if (!slide) return;
    clampPan();
    slide.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
    stageEl.classList.toggle("zoomed", zoom > 1.01);
    if (zoomInBtn) zoomInBtn.disabled = zoom >= ZOOM_MAX - 0.001;
    if (zoomOutBtn) zoomOutBtn.disabled = zoom <= ZOOM_MIN + 0.001;
  }

  function resetZoom() {
    zoom = 1; panX = 0; panY = 0;
    track.querySelectorAll(".mg-slide").forEach((s) => { s.style.transform = ""; });
    stageEl.classList.remove("zoomed", "grabbing");
    if (zoomInBtn) zoomInBtn.disabled = false;
    if (zoomOutBtn) zoomOutBtn.disabled = true;
  }

  // Set an absolute zoom level, keeping the current view roughly centred by
  // scaling the existing pan offset along with it.
  function setZoom(z) {
    const prev = zoom;
    zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
    if (prev > 0) { panX *= zoom / prev; panY *= zoom / prev; }
    if (zoom <= 1.01) { panX = 0; panY = 0; }
    applyZoom();
  }

  if (zoomInBtn) zoomInBtn.addEventListener("click", (e) => { e.stopPropagation(); setZoom(zoom + ZOOM_STEP); });
  if (zoomOutBtn) zoomOutBtn.addEventListener("click", (e) => { e.stopPropagation(); setZoom(zoom - ZOOM_STEP); });

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
        ${previews[i] ? `<img class="mg-base" src="${previews[i]}" alt="" aria-hidden="true" draggable="false" onerror="this.remove()">` : ""}
        <img class="mg-hi" alt="${(p.name || 'Saree') + ' — image ' + (i + 1)}" draggable="false"
             data-full="${src}" data-alt="${imgsAlt[i] || ''}">
      </div>`).join("");

    // Re-enable the slide animation on the next frame.
    requestAnimationFrame(() => { track.style.transition = ""; });

    resetZoom();
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
    resetZoom();                      // a fresh slide always starts un-zoomed
    idx = (i + imgs.length) % imgs.length;
    track.style.transform = `translateX(${-idx * 100}%)`;
    ensureLoaded(idx);
    syncThumbs();
  }

  function openGallery(p) {
    if (!p) return;

    modal.querySelector("[data-mtitle]").innerHTML =
      (window.nameToHtml ? window.nameToHtml(p.name) : p.name);
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
        // Tear the modal down (and rewind its history step) BEFORE leaving, so
        // the cart page's history back-stack doesn't carry a stale gallery entry.
        closeGallery();
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

    // Only push a history entry on a real closed -> open transition (tying it to
    // the modal's own state instead of a separate flag that could drift out of
    // sync). This adds a "gallery" step to history so the phone's back gesture
    // (edge swipe) or hardware/browser Back button closes THIS modal first,
    // leaving the shopper on the exact same spot of the same page they opened
    // the card from — instead of navigating away to the sarees listing.
    const wasOpen = modal.classList.contains("open");
    modal.classList.add("open");
    lockScroll();
    if (!wasOpen && !(history.state && history.state.galleryOpen)) {
      history.pushState({ galleryOpen: true }, "");
    }
  }

  // Belt-and-braces on top of the position:fixed body lock: swallow any scroll
  // gesture that starts outside the modal so a hard/rubber-band flick can't drag
  // the frozen page. Gestures inside the modal scroll it normally, and its
  // `overscroll-behavior: contain` stops them bleeding through at the edges.
  function blockBgScroll(e) {
    if (!modal.contains(e.target)) e.preventDefault();
  }
  function lockScroll() {
    // Remember where the shopper was, then pin the page there. Using
    // position:fixed + a negative top offset (instead of plain overflow:hidden)
    // is the one technique mobile Safari/Chrome honour without snapping the page
    // back to the top — so closing the gallery restores the exact same area.
    savedScrollY = window.scrollY || window.pageYOffset || 0;
    document.body.style.top = `-${savedScrollY}px`;
    document.body.classList.add("modal-open");
    document.addEventListener("touchmove", blockBgScroll, { passive: false });
    document.addEventListener("wheel", blockBgScroll, { passive: false });
  }
  function unlockScroll() {
    const y = savedScrollY;
    // The site sets html { scroll-behavior: smooth }, which would make the
    // restore visibly animate (snap to top, then scroll down to the card's
    // spot). Force an INSTANT jump so the page is already exactly where it was
    // the moment the modal disappears — no scrolling motion at all.
    const rootStyle = document.documentElement.style;
    const prevBehavior = rootStyle.scrollBehavior;
    rootStyle.scrollBehavior = "auto";

    document.body.classList.remove("modal-open");
    document.body.style.top = "";
    window.scrollTo(0, y);
    // Re-apply next frame: some mobile browsers need a tick to reflow the page
    // height after position:fixed is removed before scrollTo takes effect.
    requestAnimationFrame(() => {
      window.scrollTo(0, y);
      rootStyle.scrollBehavior = prevBehavior;
    });

    document.removeEventListener("touchmove", blockBgScroll, { passive: false });
    document.removeEventListener("wheel", blockBgScroll, { passive: false });
  }

  // fromPopstate === true means the browser already went back (via swipe/Back),
  // so we must NOT call history.back() again — just tear the modal down.
  function closeGallery(fromPopstate) {
    if (!modal.classList.contains("open")) return;
    modal.classList.remove("open");
    resetZoom();
    unlockScroll();
    // Manual close (X / backdrop / Esc): rewind the "gallery" history step we
    // added on open so a later back gesture doesn't have a stale entry to pop.
    // On a popstate close the browser already rewound it, so don't double-pop.
    if (fromPopstate !== true && history.state && history.state.galleryOpen) {
      history.back();
    }
  }

  // A back gesture / Back button pops our pushed entry: close the modal instead
  // of letting the browser leave the page.
  window.addEventListener("popstate", () => {
    if (modal.classList.contains("open")) closeGallery(true);
  });

  // If the page is restored from the back/forward cache (e.g. after a "Buy Now"
  // jump to the cart and then Back), make sure we don't come back to a stale
  // open modal sitting on top of the page.
  window.addEventListener("pageshow", (e) => {
    if (e.persisted && modal.classList.contains("open")) closeGallery(true);
  });

  modal.querySelector("[data-mclose]").addEventListener("click", () => closeGallery());
  modal.querySelector(".modal-bg").addEventListener("click", () => closeGallery());
  modal.querySelector(".mg-arrow.prev").addEventListener("click", () => showSlide(idx - 1));
  modal.querySelector(".mg-arrow.next").addEventListener("click", () => showSlide(idx + 1));
  document.addEventListener("keydown", (e) => {
    if (!modal.classList.contains("open")) return;
    if (e.key === "Escape") closeGallery();
    if (e.key === "ArrowLeft") showSlide(idx - 1);
    if (e.key === "ArrowRight") showSlide(idx + 1);
  });

  /* ---- touch: pinch-to-zoom, drag-to-pan (when zoomed), swipe (when not) ---- */
  const touchDist = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  let touchStartX = null, touchStartY = null;
  let pinchStartDist = 0, pinchStartZoom = 1;
  let panLastX = 0, panLastY = 0;
  let isPinching = false, isPanning = false;

  stageEl.addEventListener("touchstart", (e) => {
    if (e.touches.length === 2) {
      isPinching = true; isPanning = false;
      pinchStartDist = touchDist(e.touches[0], e.touches[1]);
      pinchStartZoom = zoom;
      stageEl.classList.add("grabbing");
    } else if (e.touches.length === 1) {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      if (zoom > 1.01) {
        isPanning = true;
        panLastX = e.touches[0].clientX;
        panLastY = e.touches[0].clientY;
        stageEl.classList.add("grabbing");
      }
    }
  }, { passive: true });

  stageEl.addEventListener("touchmove", (e) => {
    if (isPinching && e.touches.length === 2) {
      e.preventDefault();
      if (pinchStartDist > 0) setZoom(pinchStartZoom * (touchDist(e.touches[0], e.touches[1]) / pinchStartDist));
    } else if (isPanning && e.touches.length === 1 && zoom > 1.01) {
      e.preventDefault();
      panX += e.touches[0].clientX - panLastX;
      panY += e.touches[0].clientY - panLastY;
      panLastX = e.touches[0].clientX;
      panLastY = e.touches[0].clientY;
      applyZoom();
    }
  }, { passive: false });

  stageEl.addEventListener("touchend", (e) => {
    if (isPinching) {
      if (e.touches.length < 2) { isPinching = false; stageEl.classList.remove("grabbing"); }
      if (zoom <= 1.01) resetZoom();
      touchStartX = null;
      return;
    }
    if (isPanning) {
      if (e.touches.length === 0) { isPanning = false; stageEl.classList.remove("grabbing"); }
      touchStartX = null;
      return;
    }
    // No zoom in play → treat a horizontal flick as a slide change.
    if (touchStartX === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - (touchStartY || 0);
    if (zoom <= 1.01 && Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      showSlide(idx + (dx < 0 ? 1 : -1));
    }
    touchStartX = null;
  }, { passive: true });

  /* ---- desktop: scroll wheel to zoom, drag to pan, double-click to toggle ---- */
  stageEl.addEventListener("wheel", (e) => {
    if (!modal.classList.contains("open")) return;
    if (e.target.closest(".mg-zoom")) return;
    e.preventDefault();
    setZoom(zoom + (e.deltaY < 0 ? ZOOM_STEP / 2 : -ZOOM_STEP / 2));
  }, { passive: false });

  stageEl.addEventListener("dblclick", (e) => {
    if (e.target.closest(".mg-arrow, .mg-zoom")) return;
    setZoom(zoom > 1.01 ? 1 : 2.2);
  });

  // Belt-and-braces: cancel any native drag that still tries to start on the
  // image so it can't interrupt the pan gesture.
  stageEl.addEventListener("dragstart", (e) => e.preventDefault());

  let mouseDragging = false, mouseLastX = 0, mouseLastY = 0;
  stageEl.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "touch" || zoom <= 1.01) return;
    if (e.target.closest(".mg-arrow, .mg-zoom")) return;
    e.preventDefault();                       // block native image drag / text selection
    mouseDragging = true; mouseLastX = e.clientX; mouseLastY = e.clientY;
    stageEl.classList.add("grabbing");
    try { stageEl.setPointerCapture(e.pointerId); } catch (_) {}
  });
  stageEl.addEventListener("pointermove", (e) => {
    if (!mouseDragging) return;
    e.preventDefault();
    panX += e.clientX - mouseLastX;
    panY += e.clientY - mouseLastY;
    mouseLastX = e.clientX; mouseLastY = e.clientY;
    applyZoom();
  });
  const endMouseDrag = () => { mouseDragging = false; stageEl.classList.remove("grabbing"); };
  stageEl.addEventListener("pointerup", endMouseDrag);
  stageEl.addEventListener("pointercancel", endMouseDrag);
  stageEl.addEventListener("pointerleave", endMouseDrag);

  window.openGallery = openGallery;
  window.closeGallery = closeGallery;
  window.primeGallery = primeGallery;
})();
