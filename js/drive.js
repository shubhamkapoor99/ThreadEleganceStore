/* =====================================================================
   drive.js  -  Auto-load the saree catalog from a public Google Drive
   folder. Groups images by "<group>_<n>" and reads "<group>.txt".
   ===================================================================== */

const DRIVE_API = "https://www.googleapis.com/drive/v3/files";

/* ---- helpers ---------------------------------------------------- */

// Direct, no-CORS-needed image URLs for a PUBLIC Drive file (works in <img>).
// NOTE: the file/folder must be shared "Anyone with the link -> Viewer",
// otherwise every one of these returns 403 / a sign-in page and the <img>
// falls back to the placeholder.
// Free, no-account image CDN (Cloudflare-backed wsrv.nl). It fetches the public
// Drive image once, resizes it, converts it to lightweight WebP, and serves it
// from a global edge cache — so repeat views are fast and Drive's slow
// on-the-fly resizing / rate-limiting is bypassed. No API key, no signup, no cost.
function wsrvImg(srcUrl, size) {
  const params = new URLSearchParams({
    url: srcUrl, w: String(size), output: "webp", q: "82",
  });
  return `https://wsrv.nl/?${params.toString()}`;
}

function driveImageUrl(id, size = 1600) {
  // Primary: optimised, edge-cached WebP sourced from the public Drive image.
  return wsrvImg(`https://lh3.googleusercontent.com/d/${id}=w${size}`, size);
}

// Automatic onerror fallback: go straight to Drive's own thumbnail endpoint
// (different infrastructure + transcodes any format) if the CDN is unavailable.
function driveImageUrlAlt(id, size = 1600) {
  return `https://drive.google.com/thumbnail?id=${id}&sz=w${size}`;
}

// Build a responsive srcset (several widths) for a Drive image, so phones pull
// a small file and large screens a bigger one — all via the same free CDN.
function driveImageSrcset(id, widths = [320, 480, 640, 800]) {
  return widths.map((w) => `${driveImageUrl(id, w)} ${w}w`).join(", ");
}

// Global <img> error handler: try the alternate Drive endpoint once, then
// finally fall back to a neutral placeholder. Usage in markup:
//   onerror="window.driveImgError(this)"  data-alt="<alternate url>"
window.driveImgError = function (img) {
  const alt = img.getAttribute("data-alt");
  if (alt && !img.dataset.triedAlt) {
    img.dataset.triedAlt = "1";
    img.removeAttribute("srcset");   // force the browser to use the fallback src
    img.src = alt;
    return;
  }
  img.onerror = null;
  img.removeAttribute("srcset");
  img.src = "https://placehold.co/600x800/f3ebe0/8a7c80?text=Saree";
  img.classList.add("loaded");
};

// A small map so color names render as a coloured swatch.
const COLOR_SWATCHES = {
  red: "#c0392b", maroon: "#7b1e2b", pink: "#e84393", magenta: "#c2185b",
  orange: "#e67e22", yellow: "#f1c40f", gold: "#d4af37", cream: "#f5e6c8",
  beige: "#d8c3a5", brown: "#8d5524", green: "#2e7d32", olive: "#808000",
  teal: "#008080", blue: "#1f6feb", navy: "#1b264f", purple: "#6c3483",
  violet: "#7d3c98", lavender: "#b57edc", grey: "#7f8c8d", gray: "#7f8c8d",
  black: "#222222", white: "#f8f8f8", silver: "#c0c0c0", peach: "#ffcba4",
  mustard: "#e1ad01", rust: "#b7410e", wine: "#722f37",
};

function colorToSwatch(name = "") {
  const key = name.trim().toLowerCase().split(/[\s/,-]/)[0];
  return COLOR_SWATCHES[key] || "#b08d57";
}

/* ---- .txt parsing ----------------------------------------------- */

function parseInfoText(text, group) {
  const result = {
    name: `Saree ${group}`,
    color: "Assorted",
    price: 0,
    details: "",
    type: "",          // Saree Cloth / fabric (from the "type" key)
    tags: [],          // Shop-by-occasion tags (Bridal / Wedding / Festive / Everyday)
  };
  if (!text) return result;

  // Add one (or several comma/slash/"and"-separated) occasion tag(s), stripping
  // any leading list markers like "1." , "-", "*" so a numbered list works too.
  const pushTag = (value) => {
    String(value)
      .split(/\s*[,/]\s*|\s+and\s+/i)
      .forEach((part) => {
        const clean = part.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, "").trim();
        if (clean && !result.tags.some((t) => t.toLowerCase() === clean.toLowerCase())) {
          result.tags.push(clean);
        }
      });
  };

  const lines = text.replace(/\r/g, "").split("\n");
  const detailParts = [];
  let nameSet = false;          // an explicit Title/Name key was given
  let firstPlainUsedAsName = false;
  let collectingTags = false;   // inside a "Tag:" section that lists tags on the next lines

  lines.forEach((raw) => {
    const line = raw.trim();
    if (!line) return;
    const m = line.match(/^([a-zA-Z ]+?)\s*[:\-]\s*(.*)$/);
    if (m) {
      const key = m[1].trim().toLowerCase();
      const val = m[2].trim();
      if (key === "name" || key === "title") { result.name = val; nameSet = true; collectingTags = false; return; }
      if (key === "color" || key === "colour") { result.color = val; collectingTags = false; return; }
      if (key === "type" || key === "cloth" || key === "fabric" || key === "material") {
        result.type = val; collectingTags = false; return;
      }
      if (key === "price" || key === "cost" || key === "mrp") {
        const num = parseInt(val.replace(/[^\d]/g, ""), 10);
        if (!isNaN(num)) result.price = num;
        collectingTags = false; return;
      }
      if (key === "details" || key === "description" || key === "desc" || key === "blouse") {
        if (val) detailParts.push(val);
        collectingTags = false; return;
      }
      if (key === "tag" || key === "tags" || key === "occasion" || key === "occasions") {
        // Inline form ("Tag: Bridal, Wedding") OR a section header ("Tag:")
        // followed by a numbered/bulleted list of tags on the lines below.
        if (val) { pushTag(val); collectingTags = false; }
        else { collectingTags = true; }
        return;
      }
    }
    // A non-key line while inside a "Tag:" section is one of the listed tags.
    if (collectingTags) { pushTag(line); return; }
    // Plain line (no recognised key): the FIRST one becomes the saree title
    // (unless a Title/Name key was already given), the rest become details.
    if (!nameSet && !firstPlainUsedAsName) {
      result.name = line;
      firstPlainUsedAsName = true;
    } else {
      detailParts.push(line);
    }
  });

  result.details = detailParts.join(" ").trim();

  // Some sources hand back HTML-encoded text (e.g. "Red &amp; Gold"), which would
  // otherwise show the raw "&amp;" on the card. Decode entities so "&" and friends
  // render correctly wherever the text is placed via innerHTML.
  result.name = decodeEntities(result.name);
  result.color = decodeEntities(result.color);
  result.type = decodeEntities(result.type);
  result.details = decodeEntities(result.details);
  result.tags = result.tags.map(decodeEntities);
  return result;
}

// Turn HTML entities (&amp;, &#39;, &quot; …) back into plain characters.
function decodeEntities(str = "") {
  if (!str || str.indexOf("&") === -1) return str;
  const el = document.createElement("textarea");
  el.innerHTML = str;
  return el.value;
}

/* ---- Drive REST calls ------------------------------------------- */

async function listDriveFiles(folderId, apiKey) {
  const files = [];
  let pageToken = "";
  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed=false`,
      key: apiKey,
      fields: "nextPageToken, files(id,name,mimeType)",
      pageSize: "1000",
      orderBy: "name_natural",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const res = await fetch(`${DRIVE_API}?${params.toString()}`);
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Drive API ${res.status}: ${txt}`);
    }
    const data = await res.json();
    files.push(...(data.files || []));
    pageToken = data.nextPageToken || "";
  } while (pageToken);
  return files;
}

async function fetchTextFile(id, apiKey) {
  try {
    const res = await fetch(`${DRIVE_API}/${id}?alt=media&key=${apiKey}`);
    if (!res.ok) return "";
    return await res.text();
  } catch (e) {
    return "";
  }
}

/* ---- Apps Script source (no API key needed) --------------------- */
// Expects the web app to return JSON: [{ name, id, text? }, ...]
async function listViaAppsScript(url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`Apps Script ${res.status}`);
  const data = await res.json();
  const files = Array.isArray(data) ? data : (data.files || []);
  return files.map((f) => ({ name: f.name, id: f.id, text: f.text, mimeType: f.mimeType }));
}

/* ---- group files into products (shared by both sources) --------- */
async function assembleProducts(files, fetchText) {
  const groups = {};   // group -> { images:[{n,id}], txtId, txtText }
  const txtRe = /^(\w+?)\.txt$/i;
  // A generous extension list — but we primarily trust the Drive MIME type, so
  // ANY image format Drive recognises (incl. iPhone .heic/.heif, .jfif, .tiff,
  // .bmp, .svg, …) is picked up, not just .png. Drive transparently serves a
  // browser-friendly version, and the <img> onerror fallback covers the rest.
  const imageExtRe = /\.(jpe?g|jfif|pjpe?g|png|apng|webp|gif|avif|bmp|dib|heic|heif|tiff?|svg|ico)$/i;
  const isImageFile = (f) =>
    (f.mimeType && /^image\//i.test(f.mimeType)) || imageExtRe.test(f.name || "");

  for (const f of files) {
    const name = f.name || "";
    let m;
    if ((m = name.match(txtRe))) {
      const g = m[1];
      const grp = (groups[g] ||= { images: [], txtId: null, txtText: undefined });
      grp.txtId = f.id;
      if (typeof f.text === "string") grp.txtText = f.text;   // inline text (Apps Script)
      continue;
    }
    if (!isImageFile(f)) continue;
    // Read the "<group>_<n>" (or single "<group>") name AFTER dropping whatever
    // image extension it has, so grouping no longer depends on the file type.
    const base = name.replace(/\.[^.]+$/, "").trim();
    let g, n;
    if ((m = base.match(/^(\w+?)_(\d+)$/))) { g = m[1]; n = parseInt(m[2], 10); }
    else if ((m = base.match(/^(\w+)$/)))   { g = m[1]; n = 1; }
    else continue;
    (groups[g] ||= { images: [], txtId: null, txtText: undefined }).images.push({ n, id: f.id });
  }

  const groupKeys = Object.keys(groups);
  const products = [];
  await Promise.all(groupKeys.map(async (g) => {
    const grp = groups[g];
    if (!grp.images.length) return;
    grp.images.sort((a, b) => a.n - b.n);
    let raw = grp.txtText;
    if (raw === undefined && grp.txtId && fetchText) raw = await fetchText(grp.txtId);
    const info = parseInfoText(raw || "", g);
    products.push({
      id: `g${g}`,
      group: g,
      name: info.name,
      color: info.color,
      colorSwatch: colorToSwatch(info.color),
      price: info.price,
      details: info.details,
      type: info.type,
      tags: info.tags,
      cover: driveImageUrl(grp.images[0].id, 600),
      coverAlt: driveImageUrlAlt(grp.images[0].id, 600),
      coverSrcset: driveImageSrcset(grp.images[0].id),
      // The gallery modal previews use a moderate width (1280) instead of 1600:
      // good on high-DPI screens but markedly faster to resize/fetch & cache.
      images: grp.images.map((im) => driveImageUrl(im.id, 1280)),
      imagesAlt: grp.images.map((im) => driveImageUrlAlt(im.id, 1280)),
      thumbs: grp.images.map((im) => driveImageUrl(im.id, 220)),
      thumbsAlt: grp.images.map((im) => driveImageUrlAlt(im.id, 220)),
    });
  }));

  products.sort((a, b) => {
    const na = parseInt(a.group, 10), nb = parseInt(b.group, 10);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return String(a.group).localeCompare(String(b.group));
  });
  return products;
}

/* ---- catalog cache ----------------------------------------------
   The Drive/Apps-Script feed (which already bundles every saree's .txt text)
   is the slowest part of a page load, and each page — home, products, cart —
   used to refetch the WHOLE catalog independently. We cache the assembled
   products so the feed is fetched once and reused across pages/reloads:
     • sessionStorage  -> instant when moving between pages in the same tab
     • localStorage    -> survives reloads/new tabs for a short TTL
   Add "?fresh=1" to any URL to bypass the cache and pull the latest from Drive. */
const CATALOG_CACHE_KEY = "te_catalog_v3";   // bump when cached image URLs change
const CATALOG_TTL_MS = 10 * 60 * 1000;   // 10 minutes

// Returns { products, fresh } or null. `fresh` is false once the copy is older
// than the TTL — we still return it (so the page can paint instantly) but the
// caller can revalidate in the background.
function readCatalogCache() {
  try {
    const raw =
      sessionStorage.getItem(CATALOG_CACHE_KEY) ||
      localStorage.getItem(CATALOG_CACHE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || !obj.t || !Array.isArray(obj.products) || !obj.products.length) return null;
    return { products: obj.products, fresh: (Date.now() - obj.t) <= CATALOG_TTL_MS };
  } catch (e) { return null; }
}

function writeCatalogCache(products) {
  if (!Array.isArray(products) || !products.length) return;
  try {
    const raw = JSON.stringify({ t: Date.now(), products });
    try { sessionStorage.setItem(CATALOG_CACHE_KEY, raw); } catch (e) { /* ignore */ }
    try { localStorage.setItem(CATALOG_CACHE_KEY, raw); } catch (e) { /* ignore */ }
  } catch (e) { /* ignore */ }
}

// Pull a fresh catalog straight from the configured source (no cache).
// Returns an array of products, or null when Drive isn't configured yet.
async function fetchFreshCatalog(cfg) {
  if (cfg.appsScriptUrl) {
    const files = await listViaAppsScript(cfg.appsScriptUrl);
    return await assembleProducts(files, null);
  }
  if (cfg.apiKey && cfg.folderId) {
    const files = await listDriveFiles(cfg.folderId, cfg.apiKey);
    return await assembleProducts(files, (id) => fetchTextFile(id, cfg.apiKey));
  }
  return null;
}

/* ---- main loader ------------------------------------------------- */
// opts.onUpdate(result) — optional callback fired when a background refresh
// finds newer data than the cached copy that was returned (stale-while-revalidate),
// so the grid can repaint with the latest sarees without blocking first paint.

async function loadProductsFromDrive(opts = {}) {
  const cfg = window.STORE_CONFIG.drive || {};
  const wantsFresh = /[?&]fresh=1\b/.test(location.search);

  // Serve the cached catalog INSTANTLY for a fast first paint. If it's stale,
  // refresh in the background and notify the caller only if something changed.
  if (!wantsFresh) {
    const cached = readCatalogCache();
    if (cached) {
      if (!cached.fresh) {
        (async () => {
          try {
            const updated = await fetchFreshCatalog(cfg);
            if (Array.isArray(updated) && updated.length) {
              writeCatalogCache(updated);
              if (typeof opts.onUpdate === "function" &&
                  JSON.stringify(updated) !== JSON.stringify(cached.products)) {
                opts.onUpdate({ products: updated });
              }
            }
          } catch (e) { /* keep showing the cached catalog */ }
        })();
      }
      return { products: cached.products, cached: true };
    }
  }

  // No usable cache (e.g. very first visit): fetch fresh and block until ready.
  const fresh = await fetchFreshCatalog(cfg);
  if (Array.isArray(fresh)) {
    writeCatalogCache(fresh);
    return { products: fresh };
  }

  // Not configured yet.
  return { products: [], unconfigured: true };
}

window.loadProductsFromDrive = loadProductsFromDrive;
window.colorToSwatch = colorToSwatch;
window.driveImageUrl = driveImageUrl;
window.driveImageSrcset = driveImageSrcset;
