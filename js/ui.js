/* =====================================================================
   ui.js  -  Small UX helpers shared by every page:
   page loader fade-out, scroll-reveal, and 3D pointer tilt on cards.
   ===================================================================== */

/* ----- page loader -----
   Hide as soon as the DOM is interactive instead of waiting for the full
   `load` event (which also waits on the heavy 3D hero + remote Drive
   images). A short safety timeout guarantees it never stays stuck. */
function hideLoader() {
  const loader = document.querySelector(".loader");
  if (loader) loader.classList.add("hide");
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", hideLoader);
} else {
  hideLoader();
}
window.addEventListener("load", hideLoader);
setTimeout(hideLoader, 1500);

/* ----- scroll reveal ----- */
function initReveal(root = document) {
  const els = root.querySelectorAll(".reveal:not(.in)");
  if (!("IntersectionObserver" in window)) {
    els.forEach((el) => el.classList.add("in"));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
    });
  }, { threshold: 0.12 });
  els.forEach((el) => io.observe(el));
}

/* ----- 3D tilt on product cards (pointer-driven) ----- */
function attachTilt(card) {
  const inner = card.querySelector(".card-inner");
  if (!inner) return;
  const MAX = 9; // degrees
  card.addEventListener("pointermove", (e) => {
    // Freeze the card while the shopper is using the quantity stepper /
    // add-to-cart controls so it doesn't tilt or zoom under the cursor.
    if (card.classList.contains("interacting")) { inner.style.transform = ""; return; }
    const r = card.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    inner.style.transform =
      `rotateY(${px * MAX}deg) rotateX(${-py * MAX}deg) translateZ(6px)`;
  });
  card.addEventListener("pointerleave", () => {
    inner.style.transform = "";
  });
}

// Mark the card as "interacting" while the pointer is over the controls area,
// which neutralizes the hover zoom + tilt (see .card.interacting in styles.css).
function attachStableControls(card) {
  const body = card.querySelector(".card-body");
  if (!body) return;
  body.addEventListener("pointerenter", () => card.classList.add("interacting"));
  body.addEventListener("pointerleave", () => card.classList.remove("interacting"));
}

function initTilt(root = document) {
  root.querySelectorAll(".card").forEach(attachStableControls);
  if (window.matchMedia("(pointer: coarse)").matches) return; // skip tilt on touch
  root.querySelectorAll(".card").forEach(attachTilt);
}

window.initReveal = initReveal;
window.initTilt = initTilt;

document.addEventListener("DOMContentLoaded", () => {
  initReveal();
  initTilt();
});
