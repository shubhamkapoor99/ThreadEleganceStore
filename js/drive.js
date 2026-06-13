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
function driveImageUrl(id, size = 1600) {
  // lh3 tends to be the most reliable for real photos at larger sizes.
  return `https://lh3.googleusercontent.com/d/${id}=w${size}`;
}

// Alternate endpoint, used as an automatic onerror fallback.
function driveImageUrlAlt(id, size = 1600) {
  return `https://drive.google.com/thumbnail?id=${id}&sz=w${size}`;
}

// Global <img> error handler: try the alternate Drive endpoint once, then
// finally fall back to a neutral placeholder. Usage in markup:
//   onerror="window.driveImgError(this)"  data-alt="<alternate url>"
window.driveImgError = function (img) {
  const alt = img.getAttribute("data-alt");
  if (alt && !img.dataset.triedAlt) {
    img.dataset.triedAlt = "1";
    img.src = alt;
    return;
  }
  img.onerror = null;
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
  return result;
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
  return files.map((f) => ({ name: f.name, id: f.id, text: f.text }));
}

/* ---- group files into products (shared by both sources) --------- */
async function assembleProducts(files, fetchText) {
  const groups = {};   // group -> { images:[{n,id}], txtId, txtText }
  const imageRe = /^(\w+?)_(\d+)\.(jpe?g|png|webp|gif|avif)$/i;
  const singleRe = /^(\w+?)\.(jpe?g|png|webp|gif|avif)$/i;
  const txtRe = /^(\w+?)\.txt$/i;

  for (const f of files) {
    let m;
    if ((m = f.name.match(imageRe))) {
      const g = m[1], n = parseInt(m[2], 10);
      (groups[g] ||= { images: [], txtId: null, txtText: undefined }).images.push({ n, id: f.id });
    } else if ((m = f.name.match(singleRe))) {
      const g = m[1];
      (groups[g] ||= { images: [], txtId: null, txtText: undefined }).images.push({ n: 1, id: f.id });
    } else if ((m = f.name.match(txtRe))) {
      const g = m[1];
      const grp = (groups[g] ||= { images: [], txtId: null, txtText: undefined });
      grp.txtId = f.id;
      if (typeof f.text === "string") grp.txtText = f.text;   // inline text (Apps Script)
    }
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
      cover: driveImageUrl(grp.images[0].id, 800),
      coverAlt: driveImageUrlAlt(grp.images[0].id, 800),
      images: grp.images.map((im) => driveImageUrl(im.id, 1600)),
      imagesAlt: grp.images.map((im) => driveImageUrlAlt(im.id, 1600)),
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

/* ---- main loader ------------------------------------------------- */

async function loadProductsFromDrive() {
  const cfg = window.STORE_CONFIG.drive || {};

  // Option A (recommended): Google Apps Script web app — no API key needed.
  if (cfg.appsScriptUrl) {
    const files = await listViaAppsScript(cfg.appsScriptUrl);
    const products = await assembleProducts(files, null);
    return { products };
  }

  // Option B: Drive API key.
  if (cfg.apiKey && cfg.folderId) {
    const files = await listDriveFiles(cfg.folderId, cfg.apiKey);
    const products = await assembleProducts(
      files, (id) => fetchTextFile(id, cfg.apiKey)
    );
    return { products };
  }

  // Not configured yet.
  return { products: [], unconfigured: true };
}

window.loadProductsFromDrive = loadProductsFromDrive;
window.colorToSwatch = colorToSwatch;
