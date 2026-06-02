/* =====================================================================
   ui.js  -  Small UX helpers shared by every page:
   page loader fade-out, scroll-reveal, and 3D pointer tilt on cards.
   ===================================================================== */

/* ----- page loader ----- */
window.addEventListener("load", () => {
  const loader = document.querySelector(".loader");
  if (loader) setTimeout(() => loader.classList.add("hide"), 350);
});

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
function initTilt(root = document) {
  if (window.matchMedia("(pointer: coarse)").matches) return; // skip on touch
  root.querySelectorAll(".card").forEach(attachTilt);
}

window.initReveal = initReveal;
window.initTilt = initTilt;

document.addEventListener("DOMContentLoaded", () => {
  initReveal();
  initTilt();
});
