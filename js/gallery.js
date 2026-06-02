/* =====================================================================
   gallery.js  -  Shared swipeable gallery modal used by BOTH the
   Products page and the Home page "Featured Sarees" section.
   Any page that includes the #gallery-modal markup + this script gets
   window.openGallery(product). Optionally set window.onGalleryAdd to a
   callback that runs after the modal's "Add to Cart" (e.g. to refresh a
   product grid).
   ===================================================================== */
(function () {
  const modal = document.getElementById("gallery-modal");
  if (!modal) return;

  let imgs = [], imgsAlt = [], idx = 0;

  function openGallery(p) {
    if (!p) return;
    imgs = p.images || [];
    imgsAlt = p.imagesAlt || [];
    idx = 0;

    modal.querySelector("[data-mtitle]").textContent = p.name;
    modal.querySelector("[data-mcolor-dot]").style.background = p.colorSwatch;
    modal.querySelector("[data-mcolor]").textContent = p.color;
    modal.querySelector("[data-mdetails]").textContent =
      p.details || "Exquisite handpicked saree with a matching blouse piece.";
    modal.querySelector("[data-mprice]").innerHTML = p.price
      ? window.money(p.price)
      : "<small style='font-size:1rem;color:var(--muted)'>Price on request</small>";

    const addBtn = modal.querySelector("[data-madd]");
    addBtn.onclick = () => {
      window.addOneToCart(p);
      addBtn.textContent = "Added to Cart ✓";
      setTimeout(() => (addBtn.textContent = "Add to Cart"), 1300);
      if (typeof window.onGalleryAdd === "function") window.onGalleryAdd();
    };

    const thumbsWrap = modal.querySelector("[data-mthumbs]");
    const thumbList = p.thumbs || p.images || [];
    const thumbAltList = p.thumbsAlt || p.imagesAlt || [];
    thumbsWrap.innerHTML = thumbList.map((t, i) =>
      `<img src="${t}" data-gi="${i}" class="${i === 0 ? "active" : ""}"
        data-alt="${thumbAltList[i] || ''}" onerror="window.driveImgError(this)">`).join("");
    thumbsWrap.querySelectorAll("img").forEach((im) =>
      im.addEventListener("click", () => showSlide(+im.dataset.gi)));

    showSlide(0);
    modal.classList.add("open");
    document.body.style.overflow = "hidden";
  }

  function showSlide(i) {
    if (!imgs.length) return;
    idx = (i + imgs.length) % imgs.length;
    const stage = modal.querySelector("[data-mstage]");
    delete stage.dataset.triedAlt;
    stage.setAttribute("data-alt", imgsAlt[idx] || "");
    stage.onerror = () => window.driveImgError(stage);
    stage.src = imgs[idx];
    modal.querySelectorAll("[data-mthumbs] img").forEach((im) =>
      im.classList.toggle("active", +im.dataset.gi === idx));
  }

  function closeGallery() {
    modal.classList.remove("open");
    document.body.style.overflow = "";
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
  const stageEl = modal.querySelector("[data-mstage]");
  stageEl.addEventListener("touchstart", (e) => (touchX = e.touches[0].clientX), { passive: true });
  stageEl.addEventListener("touchend", (e) => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 40) showSlide(idx + (dx < 0 ? 1 : -1));
    touchX = null;
  });

  window.openGallery = openGallery;
  window.closeGallery = closeGallery;
})();
