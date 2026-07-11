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
  // Remembered for the full-screen viewer so it can reuse the same photos,
  // low-res previews and captions without re-reading the product object.
  let curThumbs = [], curName = "";

  // Scroll position of the page BEHIND the modal, captured the moment we open so
  // we can drop the shopper back on the exact same spot when the gallery closes.
  let savedScrollY = 0;

  /* ---- picture zoom (pinch on touch, buttons + wheel on desktop) ----
     The zoom transform is applied to the CURRENT slide only, so it scales the
     photo in place and `overflow:hidden` on the slide clips the overflow. */
  const ZOOM_MIN = 1, ZOOM_MAX = 4, ZOOM_STEP = 0.6;
  let zoom = 1, panX = 0, panY = 0;

  function currentSlide() { return track.children[idx] || null; }

  // Turn noisy trackpad horizontal-wheel events into clean one-image-per-swipe
  // paging. The tricky part is a two-finger flick leaves a long "momentum" tail
  // of decaying events: if we page on all of them we skip several images, and if
  // we simply wait for a pause the next swipe "hangs" behind that momentum. So
  // we fire once when the accumulated travel passes a threshold, then latch —
  // re-arming only on a real gap (new gesture) or a rising edge (the finger
  // clearly pushing again), which momentum never produces because it only fades.
  function makeWheelPager(showFn) {
    let accum = 0, armed = true, lastT = 0, lastMag = 0, lastFireT = 0;
    return function (deltaX) {
      const now = Date.now();
      if (now - lastT > 140) { armed = true; accum = 0; lastMag = 0; }  // a pause = new swipe
      const mag = Math.abs(deltaX);
      // A fresh push (mag jumps back up) well after the last change re-arms us,
      // so a new swipe made during the previous swipe's momentum still counts.
      if (!armed && now - lastFireT > 220 && mag > lastMag + 12 && mag > 12) {
        armed = true; accum = 0;
      }
      lastT = now; lastMag = mag;
      if (!armed) return;
      accum += deltaX;
      if (Math.abs(accum) > 55) {
        showFn(accum > 0 ? 1 : -1);
        accum = 0; armed = false; lastFireT = now;
      }
    };
  }

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

  // Set an absolute zoom level anchored at a focal point (fx/fy screen coords)
  // so the exact spot under the cursor stays put. Omit fx/fy to zoom about the
  // centre of the stage. This drives the DESKTOP in-place zoom on the card image
  // (mobile zooms via pinch → full-screen viewer instead).
  function setZoom(z, fx, fy) {
    const nz = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
    const sr = stageEl.getBoundingClientRect();
    const cx = sr.left + sr.width / 2;
    const cy = sr.top + sr.height / 2;
    if (fx == null) { fx = cx; fy = cy; }
    if (zoom > 0) {
      panX = (fx - cx) - (nz / zoom) * (fx - cx - panX);
      panY = (fy - cy) - (nz / zoom) * (fy - cy - panY);
    }
    zoom = nz;
    if (zoom <= 1.01) { panX = 0; panY = 0; }
    applyZoom();
  }

  // Card zoom controls (shown on desktop) zoom the image in place.
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
    curThumbs = p.thumbs || [];
    curName = p.name || "";
    const previews = curThumbs;        // tiny, fast-loading low-res shown instantly
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
          : "<small style='font-size:1rem;color:#000'>Price on request</small>")
      : "<small style='font-size:1rem;color:#000'>Price: Calculated on WhatsApp</small>";

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

  // Set true only while the full-screen viewer rewinds its OWN history step on a
  // manual (X / Esc) close, so that self-triggered popstate doesn't also tear
  // down the card sitting underneath it.
  let fsPopSuppress = false;

  // A back gesture / Back button pops our pushed entry. Peel the layers in
  // order: the full-screen viewer first (if up), then the modal — so one Back
  // never skips straight off the page while a viewer is still open.
  window.addEventListener("popstate", () => {
    if (fsPopSuppress) { fsPopSuppress = false; return; }
    if (fsOpen) { closeFs(true); return; }
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

  /* ---- touch (mobile): the card stage is for browsing + launching. A tap
     ANYWHERE on the photo opens the immersive full-screen viewer; a horizontal
     flick swipes between images; and a PINCH jumps straight into the full-screen
     viewer while zooming toward the exact spot pinched (never a centred zoom).
     The pinch keeps flowing because the touch sequence stays bound to this
     stage even after the viewer opens on top, so we forward it to the viewer. */
  const tDist = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  const tMid = (a, b) => ({ x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 });
  // Two-finger gestures are ambiguous: fingers moving APART/together = a zoom;
  // fingers sliding together up/down = a scroll. We wait for the movement to
  // declare itself before doing anything, so a two-finger scroll never zooms.
  const PINCH_THRESH = 14;   // px change in finger spread → treat as a zoom
  const PAN_THRESH = 10;     // px the pair travels together → treat as a scroll
  let touchStartX = null, touchStartY = null;
  let twoFinger = false, gesture = null;   // gesture: "pinch" | "pan" | null
  let gStartDist = 0, gStartZoom = 1, gLastY = 0;

  stageEl.addEventListener("touchstart", (e) => {
    if (e.touches.length >= 2) {
      // Don't decide yet — wait to see if it's a pinch (zoom) or a pan (scroll).
      twoFinger = true; gesture = null; touchStartX = null;
      gStartDist = tDist(e.touches[0], e.touches[1]);
      gLastY = tMid(e.touches[0], e.touches[1]).y;
    } else if (e.touches.length === 1) {
      twoFinger = false; gesture = null;
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }
  }, { passive: true });

  // Non-passive so a declared PINCH can zoom and a two-finger PAN can scroll the
  // modal without the browser also acting. One-finger vertical scrolling still
  // flows natively because we return early and `touch-action: pan-y` makes that
  // gesture non-cancelable regardless of this listener.
  stageEl.addEventListener("touchmove", (e) => {
    if (!twoFinger || e.touches.length < 2) return;
    const curDist = tDist(e.touches[0], e.touches[1]);
    const mid = tMid(e.touches[0], e.touches[1]);
    if (!gesture) {
      if (Math.abs(curDist - gStartDist) > PINCH_THRESH) {
        // A genuine pinch → this is a zoom: open the full-screen viewer.
        gesture = "pinch";
        if (!fsOpen) openFs(idx);
        gStartDist = curDist;     // re-baseline so the zoom grows smoothly
        gStartZoom = fsZoom;      // fresh viewer starts at 1×
      } else if (Math.abs(mid.y - gLastY) > PAN_THRESH) {
        gesture = "pan";          // fingers sliding together → scroll the modal
      }
    }
    if (gesture === "pinch") {
      e.preventDefault();
      if (gStartDist > 0) fsZoomTo(gStartZoom * (curDist / gStartDist), mid.x, mid.y);
    } else if (gesture === "pan") {
      e.preventDefault();
      modal.scrollTop -= (mid.y - gLastY);   // move the page with the fingers
    }
    gLastY = mid.y;
  }, { passive: false });

  stageEl.addEventListener("touchend", (e) => {
    if (twoFinger) {
      if (e.touches.length < 2) { twoFinger = false; gesture = null; }
      touchStartX = null;
      return;
    }
    if (touchStartX === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - (touchStartY || 0);
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      showSlide(idx + (dx < 0 ? 1 : -1));
    } else if (Math.abs(dx) < 10 && Math.abs(dy) < 10 &&
               !e.target.closest(".mg-arrow, .mg-zoom")) {
      // Only a real TAP (barely any movement) opens full screen — a vertical
      // scroll drag must fall through so the page just scrolls, never zooms.
      openFs(idx);
    }
    touchStartX = null;
  }, { passive: true });

  /* ---- desktop: scroll wheel to zoom, drag to pan, double-click to toggle ---- */
  // Desktop trackpad / mouse on the card image (NO full-screen on desktop):
  //  • PINCH (wheel + ctrlKey) → zoom the image IN PLACE at the cursor.
  //  • Horizontal two-finger swipe → move between images (one per swipe).
  //  • Plain vertical scroll → left alone so it scrolls the modal up/down.
  const cardPager = makeWheelPager((dir) => showSlide(idx + dir));
  stageEl.addEventListener("wheel", (e) => {
    if (!modal.classList.contains("open")) return;
    if (e.target.closest(".mg-zoom")) return;
    if (e.ctrlKey) {
      e.preventDefault();
      setZoom(zoom + (e.deltaY < 0 ? ZOOM_STEP / 2 : -ZOOM_STEP / 2), e.clientX, e.clientY);
      return;
    }
    if (zoom <= 1.01 && Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      e.preventDefault();
      cardPager(e.deltaX);
      return;
    }
    // Plain vertical scroll → let the page/modal scroll.
  }, { passive: false });

  stageEl.addEventListener("dblclick", (e) => {
    // Desktop only — on touch a double-tap must not zoom the card stage.
    if (window.matchMedia("(pointer: coarse)").matches) return;
    if (e.target.closest(".mg-arrow, .mg-zoom")) return;
    setZoom(zoom > 1.01 ? 1 : 2.2, e.clientX, e.clientY);
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

  /* =====================================================================
     FULL-SCREEN immersive image viewer
     Tapping the photo inside the card gallery opens this edge-to-edge
     viewer. It gives the shopper the ENTIRE screen for the image with every
     kind of zoom (pinch, double-tap, on-screen +/- buttons, desktop wheel),
     free panning while zoomed, and left/right swiping between the saree's
     images. The cross (X) button — or the phone Back gesture — drops the
     shopper straight back onto the exact same card they came from.
     ===================================================================== */
  let fs = document.getElementById("mg-fs");
  if (!fs) {
    fs = document.createElement("div");
    fs.className = "mgfs";
    fs.id = "mg-fs";
    fs.innerHTML =
      `<div class="mgfs-track"></div>` +
      `<button type="button" class="mgfs-close" aria-label="Close full screen">&times;</button>` +
      `<button type="button" class="mgfs-arrow prev" aria-label="Previous image">\u2039</button>` +
      `<button type="button" class="mgfs-arrow next" aria-label="Next image">\u203A</button>` +
      `<div class="mgfs-zoom">` +
        `<button type="button" class="mgfs-zoom-btn mgfs-out" aria-label="Zoom out">\u2212</button>` +
        `<button type="button" class="mgfs-zoom-btn mgfs-in" aria-label="Zoom in">+</button>` +
      `</div>` +
      `<div class="mgfs-counter" aria-hidden="true"></div>` +
      `<div class="mgfs-thumbs" data-mgfs-thumbs></div>`;
    document.body.appendChild(fs);
  }
  const fsTrack = fs.querySelector(".mgfs-track");
  const fsInBtn = fs.querySelector(".mgfs-in");
  const fsOutBtn = fs.querySelector(".mgfs-out");
  const fsCounter = fs.querySelector(".mgfs-counter");
  const fsPrevBtn = fs.querySelector(".mgfs-arrow.prev");
  const fsNextBtn = fs.querySelector(".mgfs-arrow.next");
  const fsThumbs = fs.querySelector("[data-mgfs-thumbs]");

  const FS_MIN = 1, FS_MAX = 6, FS_STEP = 0.8;
  let fsOpen = false, fsIdx = 0;
  let fsZoom = 1, fsPanX = 0, fsPanY = 0;

  function fsSlide() { return fsTrack.children[fsIdx] || null; }

  function fsClampPan() {
    const s = fsSlide();
    if (!s) return;
    const maxX = (s.offsetWidth * (fsZoom - 1)) / 2;
    const maxY = (s.offsetHeight * (fsZoom - 1)) / 2;
    fsPanX = Math.max(-maxX, Math.min(maxX, fsPanX));
    fsPanY = Math.max(-maxY, Math.min(maxY, fsPanY));
  }

  function fsApply() {
    const s = fsSlide();
    if (!s) return;
    fsClampPan();
    s.style.transform = `translate(${fsPanX}px, ${fsPanY}px) scale(${fsZoom})`;
    fs.classList.toggle("zoomed", fsZoom > 1.01);
    if (fsInBtn) fsInBtn.disabled = fsZoom >= FS_MAX - 0.001;
    if (fsOutBtn) fsOutBtn.disabled = fsZoom <= FS_MIN + 0.001;
  }

  function fsResetZoom() {
    fsZoom = 1; fsPanX = 0; fsPanY = 0;
    fsTrack.querySelectorAll(".mgfs-slide").forEach((s) => { s.style.transform = ""; });
    fs.classList.remove("zoomed", "grabbing");
    if (fsInBtn) fsInBtn.disabled = false;
    if (fsOutBtn) fsOutBtn.disabled = true;
  }

  // Zoom toward a focal point (finger midpoint / cursor / tap) so the spot the
  // shopper aims at stays put under their finger — the natural "zoom into here".
  // fx/fy are screen coords; omit them to zoom about the centre of the screen.
  // The current slide overlays the whole viewer, so the viewer centre is the
  // slide's un-transformed (natural) centre — stable while it animates.
  function fsZoomTo(z, fx, fy) {
    const s = fsSlide();
    if (!s) return;
    const nz = Math.max(FS_MIN, Math.min(FS_MAX, z));
    const fr = fs.getBoundingClientRect();
    const cx = fr.left + fr.width / 2;
    const cy = fr.top + fr.height / 2;
    if (fx == null) { fx = cx; fy = cy; }
    if (fsZoom > 0) {
      fsPanX = (fx - cx) - (nz / fsZoom) * (fx - cx - fsPanX);
      fsPanY = (fy - cy) - (nz / fsZoom) * (fy - cy - fsPanY);
    }
    fsZoom = nz;
    if (fsZoom <= 1.01) { fsPanX = 0; fsPanY = 0; }
    fsApply();
  }

  function fsLoadSlide(k) {
    const hi = fsTrack.querySelector(`.mgfs-slide[data-si="${k}"] .mgfs-hi`);
    if (hi && !hi.getAttribute("src")) {
      hi.onload = () => hi.classList.add("loaded");
      hi.onerror = () => { window.driveImgError(hi); hi.classList.add("loaded"); };
      hi.src = hi.dataset.full;
    }
  }
  function fsEnsureLoaded(i) {
    const n = imgs.length;
    if (!n) return;
    new Set([(i - 1 + n) % n, i, (i + 1) % n]).forEach(fsLoadSlide);
  }

  function fsSyncThumbs() {
    if (!fsThumbs) return;
    fsThumbs.querySelectorAll("img").forEach((im) => {
      const active = +im.dataset.gi === fsIdx;
      im.classList.toggle("active", active);
      if (active) im.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
    });
  }

  function fsUpdateChrome() {
    if (fsCounter) fsCounter.textContent = imgs.length ? `${fsIdx + 1} / ${imgs.length}` : "";
    const many = imgs.length > 1;
    if (fsPrevBtn) fsPrevBtn.style.display = many ? "" : "none";
    if (fsNextBtn) fsNextBtn.style.display = many ? "" : "none";
    if (fsThumbs) fsThumbs.style.display = many ? "" : "none";
    fsSyncThumbs();
  }

  function fsShow(i) {
    if (!imgs.length) return;
    fsResetZoom();
    fsIdx = (i + imgs.length) % imgs.length;
    fsTrack.style.transform = `translateX(${-fsIdx * 100}%)`;
    fsEnsureLoaded(fsIdx);
    fsUpdateChrome();
  }

  function openFs(startIdx) {
    if (!imgs.length) return;
    const previews = curThumbs || [];
    fsTrack.style.transition = "none";
    fsTrack.innerHTML = imgs.map((src, i) => `
      <div class="mgfs-slide" data-si="${i}">
        ${previews[i] ? `<img class="mgfs-base" src="${previews[i]}" alt="" aria-hidden="true" draggable="false" onerror="this.remove()">` : ""}
        <img class="mgfs-hi" alt="${(curName || 'Saree') + ' — image ' + (i + 1)}" draggable="false"
             data-full="${src}">
      </div>`).join("");
    // Same thumbnail strip the card shows, so the shopper can jump straight to
    // any image (e.g. the blouse) without swiping through them one by one.
    if (fsThumbs) {
      const thumbList = previews.length ? previews : imgs;
      fsThumbs.innerHTML = thumbList.map((t, i) =>
        `<img src="${t}" data-gi="${i}" class="${i === fsIdx ? "active" : ""}"
          draggable="false" onerror="window.driveImgError(this)">`).join("");
      fsThumbs.querySelectorAll("img").forEach((im) =>
        im.addEventListener("click", (ev) => { ev.stopPropagation(); fsShow(+im.dataset.gi); }));
    }

    fsIdx = (startIdx + imgs.length) % imgs.length;
    fsTrack.style.transform = `translateX(${-fsIdx * 100}%)`;
    requestAnimationFrame(() => { fsTrack.style.transition = ""; });
    fsResetZoom();
    fsEnsureLoaded(fsIdx);
    fsUpdateChrome();

    fsOpen = true;
    fs.classList.add("open");
    // Add a history step so the phone Back gesture closes THIS viewer first,
    // returning to the card it opened from (the modal stays open underneath).
    if (!(history.state && history.state.fsOpen)) {
      history.pushState({ fsOpen: true }, "");
    }
  }

  function closeFs(fromPopstate) {
    if (!fsOpen) return;
    fsOpen = false;
    fs.classList.remove("open");
    fsResetZoom();
    // Keep the card underneath in sync so its thumbnails/arrows reflect the
    // image the shopper was last looking at full screen.
    showSlide(fsIdx);
    if (fromPopstate !== true && history.state && history.state.fsOpen) {
      fsPopSuppress = true;   // swallow the popstate this back() will fire
      history.back();
    }
  }

  if (fsInBtn) fsInBtn.addEventListener("click", (e) => { e.stopPropagation(); fsZoomTo(fsZoom + FS_STEP); });
  if (fsOutBtn) fsOutBtn.addEventListener("click", (e) => { e.stopPropagation(); fsZoomTo(fsZoom - FS_STEP); });
  if (fsPrevBtn) fsPrevBtn.addEventListener("click", (e) => { e.stopPropagation(); fsShow(fsIdx - 1); });
  if (fsNextBtn) fsNextBtn.addEventListener("click", (e) => { e.stopPropagation(); fsShow(fsIdx + 1); });
  fs.querySelector(".mgfs-close").addEventListener("click", () => closeFs());

  document.addEventListener("keydown", (e) => {
    if (!fsOpen) return;
    // Capture phase + stopPropagation so these keys act on the full-screen
    // viewer only and never leak down to the card modal underneath it.
    if (e.key === "Escape") { e.stopPropagation(); closeFs(); }
    else if (e.key === "ArrowLeft") { e.stopPropagation(); fsShow(fsIdx - 1); }
    else if (e.key === "ArrowRight") { e.stopPropagation(); fsShow(fsIdx + 1); }
  }, true);

  /* ---- full-screen touch: pinch-zoom, drag-to-pan, swipe, double-tap ---- */
  const fsDist = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  const fsMid = (a, b) => ({ x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 });
  let fsTStartX = null, fsTStartY = null, fsMoved = false;
  let fsPinchDist = 0, fsPinchZoom = 1;
  let fsPanLastX = 0, fsPanLastY = 0;
  let fsPinching = false, fsPanning = false, fsSwiping = false;
  let fsLastTap = 0;

  fs.addEventListener("touchstart", (e) => {
    if (e.target.closest(".mgfs-close, .mgfs-arrow, .mgfs-zoom, .mgfs-thumbs")) return;
    fsMoved = false; fsSwiping = false;
    if (e.touches.length === 2) {
      fsPinching = true; fsPanning = false;
      fsPinchDist = fsDist(e.touches[0], e.touches[1]);
      fsPinchZoom = fsZoom;
      fs.classList.add("grabbing");
    } else if (e.touches.length === 1) {
      fsTStartX = e.touches[0].clientX;
      fsTStartY = e.touches[0].clientY;
      if (fsZoom > 1.01) {
        fsPanning = true;
        fsPanLastX = e.touches[0].clientX;
        fsPanLastY = e.touches[0].clientY;
        fs.classList.add("grabbing");
      }
    }
  }, { passive: true });

  fs.addEventListener("touchmove", (e) => {
    if (fsPinching && e.touches.length === 2) {
      e.preventDefault();
      fsMoved = true;
      const m = fsMid(e.touches[0], e.touches[1]);
      if (fsPinchDist > 0) fsZoomTo(fsPinchZoom * (fsDist(e.touches[0], e.touches[1]) / fsPinchDist), m.x, m.y);
    } else if (fsPanning && e.touches.length === 1 && fsZoom > 1.01) {
      e.preventDefault();
      fsMoved = true;
      fsPanX += e.touches[0].clientX - fsPanLastX;
      fsPanY += e.touches[0].clientY - fsPanLastY;
      fsPanLastX = e.touches[0].clientX;
      fsPanLastY = e.touches[0].clientY;
      fsApply();
    } else if (e.touches.length === 1 && fsTStartX !== null && fsZoom <= 1.01) {
      // Not zoomed → a horizontal drag slides between images, following the
      // finger live so it clearly "moves" left/right, snapping on release.
      const dx = e.touches[0].clientX - fsTStartX;
      const dy = e.touches[0].clientY - fsTStartY;
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) fsMoved = true;
      if (fsSwiping || (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy))) {
        e.preventDefault();
        fsSwiping = true;
        fsTrack.style.transition = "none";
        fsTrack.style.transform = `translateX(calc(${-fsIdx * 100}% + ${dx}px))`;
      }
    }
  }, { passive: false });

  fs.addEventListener("touchend", (e) => {
    if (e.target.closest(".mgfs-close, .mgfs-arrow, .mgfs-zoom, .mgfs-thumbs")) return;
    if (fsPinching) {
      if (e.touches.length < 2) { fsPinching = false; fs.classList.remove("grabbing"); }
      if (fsZoom <= 1.01) fsResetZoom();
      fsTStartX = null;
      return;
    }
    if (fsPanning) {
      if (e.touches.length === 0) { fsPanning = false; fs.classList.remove("grabbing"); }
      fsTStartX = null;
      return;
    }
    if (fsTStartX === null) return;
    const dx = e.changedTouches[0].clientX - fsTStartX;
    if (fsSwiping) {
      // Commit to the next/previous image if dragged far enough, else snap back.
      fsSwiping = false;
      fsTrack.style.transition = "";
      const w = fs.getBoundingClientRect().width || window.innerWidth || 1;
      if (Math.abs(dx) > Math.min(70, w * 0.18)) {
        fsShow(fsIdx + (dx < 0 ? 1 : -1));
      } else {
        fsShow(fsIdx);   // didn't travel far enough → settle back on this image
      }
      fsTStartX = null;
      return;
    }
    if (!fsMoved) {
      const now = Date.now();
      if (now - fsLastTap < 300) {
        // Double-tap → toggle a strong zoom centred on the tapped spot.
        const t = e.changedTouches[0];
        fsZoomTo(fsZoom > 1.01 ? 1 : 3, t.clientX, t.clientY);
        fsLastTap = 0;
      } else {
        fsLastTap = now;
      }
    }
    fsTStartX = null;
  }, { passive: false });

  /* ---- full-screen desktop: pinch=zoom, two-finger horizontal swipe=navigate,
     drag pan (when zoomed), double-click ---- */
  const fsPager = makeWheelPager((dir) => fsShow(fsIdx + dir));
  fs.addEventListener("wheel", (e) => {
    if (!fsOpen) return;
    if (e.target.closest(".mgfs-zoom, .mgfs-arrow, .mgfs-close, .mgfs-thumbs")) return;
    // Trackpad pinch (ctrlKey) / Ctrl + wheel → zoom at the cursor.
    if (e.ctrlKey) {
      e.preventDefault();
      fsZoomTo(fsZoom + (e.deltaY < 0 ? FS_STEP / 2 : -FS_STEP / 2), e.clientX, e.clientY);
      return;
    }
    // Not zoomed + a mostly-horizontal two-finger swipe → move between images.
    if (fsZoom <= 1.01 && Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      e.preventDefault();
      fsPager(e.deltaX);
    }
  }, { passive: false });

  fs.addEventListener("dblclick", (e) => {
    if (e.target.closest(".mgfs-arrow, .mgfs-zoom, .mgfs-close")) return;
    fsZoomTo(fsZoom > 1.01 ? 1 : 3, e.clientX, e.clientY);
  });

  fs.addEventListener("dragstart", (e) => e.preventDefault());

  let fsMouseDown = false, fsMouseLastX = 0, fsMouseLastY = 0;
  fs.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "touch" || fsZoom <= 1.01) return;
    if (e.target.closest(".mgfs-arrow, .mgfs-zoom, .mgfs-close")) return;
    e.preventDefault();
    fsMouseDown = true; fsMouseLastX = e.clientX; fsMouseLastY = e.clientY;
    fs.classList.add("grabbing");
    try { fs.setPointerCapture(e.pointerId); } catch (_) {}
  });
  fs.addEventListener("pointermove", (e) => {
    if (!fsMouseDown) return;
    e.preventDefault();
    fsPanX += e.clientX - fsMouseLastX;
    fsPanY += e.clientY - fsMouseLastY;
    fsMouseLastX = e.clientX; fsMouseLastY = e.clientY;
    fsApply();
  });
  const fsEndMouse = () => { fsMouseDown = false; fs.classList.remove("grabbing"); };
  fs.addEventListener("pointerup", fsEndMouse);
  fs.addEventListener("pointercancel", fsEndMouse);
  fs.addEventListener("pointerleave", fsEndMouse);

  window.openGallery = openGallery;
  window.closeGallery = closeGallery;
  window.primeGallery = primeGallery;
})();
