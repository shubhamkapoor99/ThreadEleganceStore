# ThreadElegance Store
https://drive.google.com/drive/folders/1ixNsc36cf89W4YT5zVkJk7-I3LY4K8B9?usp=sharing
A modern, **fully static** online saree store — no backend, no login. Cart &
"session" data live in the browser (`localStorage`), and orders are placed
through **WhatsApp**, exactly like the original site. The catalog is loaded
**automatically from a Google Drive folder**, the home page has a real
**3D (WebGL / Three.js) hero**, and the products page has a **colour filter**
and a swipeable image gallery.

---

## 1. How it works (the no-backend model)

| Concern | How it's handled |
|---|---|
| **Login / sessions** | None. The cart is stored in `localStorage` under the `cart` key, so it survives refreshes and page changes. See `js/store.js`. |
| **Orders** | On the cart page the buyer fills shipping details; checkout opens a pre-filled **WhatsApp** message (`https://wa.me/<number>?text=...`). You confirm the order in chat. |
| **Products** | Auto-discovered from your Google Drive folder (see below). No code edits needed to add products. |
| **Hosting** | 100% static files → free on **GitHub Pages**. |

---

## 2. Add products via Google Drive (automatic)

Put **all** your photos and text files in **one** Drive folder and follow this
naming rule. Each *group number* becomes **one product**; all its images become
a swipeable gallery.

```
1_1.jpg     ← Saree 1, image 1  (this is the cover)
1_2.jpg     ← Saree 1, image 2
1_3.jpg     ← Saree 1, image 3
1.txt       ← Saree 1, details

2_1.jpg     ← Saree 2, image 1
2_2.jpg     ← Saree 2, image 2
2.txt       ← Saree 2, details
```

- Supported image types: `.jpg .jpeg .png .webp .gif .avif`
- The lowest-numbered image (`_1`) is used as the card cover.

### The `.txt` file format

All keys are optional. Recommended:

```
Color: Maroon
Name: Kanchipuram Silk Saree
Price: 12999
Details: A luxurious pure-silk saree with a golden zari border. Comes with a
contrast temple-motif blouse piece.
```

Shortcut format (no keys) — **first line = colour**, the rest = details:

```
Red
Soft Banarasi georgette with golden motifs and a matching blouse piece.
```

> `Color` powers the **colour filter** on the products page (chips are built
> automatically from whatever colours you use). `Price` is optional — without it
> the item shows "Price on request".

---

## 3. One-time setup: connect your Drive folder

Google won't let a website read a Drive folder without a credential **you** own.
Pick **one** of the two options below. First, for both options:

> **Share the folder** so the images can be displayed: open your Drive folder →
> **Share** → *General access* → **Anyone with the link** → **Viewer**.

### 3A. Apps Script — recommended (no API key, no Cloud Console)

1. Open <https://script.google.com> → **New project**.
2. Delete the sample, paste the whole **`google-apps-script.gs`** file (included
   in this project — your folder ID is already filled in).
3. **Deploy → New deployment →** type **Web app**.
4. **Execute as: Me**, **Who has access: Anyone** → **Deploy** → **Authorize**.
5. Copy the **Web app URL** (ends with `/exec`).
6. Paste it into **`js/config.js`**:

```js
drive: {
  folderId: "19LjKR9KSomQOVc5r_S8fneon4uQYtZTd",
  appsScriptUrl: "https://script.google.com/macros/s/XXXXXXXX/exec",
  apiKey: "",
},
```

Refresh the site — your sarees load automatically. To add products later you
**only upload files to Drive**; no need to touch the script again.

### 3B. Drive API key — alternative

1. <https://console.cloud.google.com/> → create/pick a project.
2. **APIs & Services → Library →** enable **"Google Drive API"**.
3. **Credentials → Create credentials → API key** → copy it.
4. *(Recommended)* Restrict the key to **Google Drive API** and to your site URL.
5. In **`js/config.js`** leave `appsScriptUrl: ""` and set:

```js
drive: {
  folderId: "19LjKR9KSomQOVc5r_S8fneon4uQYtZTd",
  appsScriptUrl: "",
  apiKey: "PASTE_YOUR_KEY_HERE",
},
```

> By default the store shows **only your real sarees** from Google Drive. Until
> you connect it, the pages show a short "connect your Drive" message instead of
> any placeholder images. To preview with samples, set
> `showDemoWhenUnconfigured: true` in `js/config.js`.

> **Which to choose?** 3A needs no API key and is easiest. 3B is fine too — note
> a browser API key is visible in page source (normal for public read-only data;
> keep it restricted as in step 4).

---

## 4. Other settings (`js/config.js`)

```js
storeName, tagline      // branding
whatsappNumber          // your WhatsApp (country code, no + or spaces)
email, phone, address   // contact + footer
currency                // default "₹"
```

---

## 5. Run locally

Because the site uses ES modules + `fetch`, open it through a tiny local server
(not by double-clicking the file):

```bash
# any one of these from inside the project folder
python -m http.server 8000
# or
npx serve
```

Then visit <http://localhost:8000>.

---

## 6. Host free on GitHub Pages

1. Create a new repository on GitHub (e.g. `threadelegance-store`).
2. Upload **all files in this folder** (keep the structure; include the hidden
   `.nojekyll` file).

   ```bash
   git init
   git add .
   git commit -m "ThreadElegance Store"
   git branch -M main
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```
3. On GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a
   branch → Branch: `main` / root → Save**.
4. Wait ~1 minute. Your store is live at
   `https://<you>.github.io/<repo>/`.
5. Add that URL to your API key's website restrictions (step 5 above).

---

## 7. File map

```
index.html        Home page with 3D hero + featured sarees
products.html     Full catalog, colour filter, gallery modal
cart.html         Cart + shipping form + WhatsApp checkout
about.html        Brand story
contact.html      WhatsApp / email / phone / store address
css/styles.css    Theme, layout, animations, 3D card tilt
js/config.js      ← edit me (Drive key, contact, branding)
js/drive.js       Drive fetch + group images + parse .txt
js/store.js       Cart/localStorage + shared navbar/footer + WhatsApp order
js/products.js    Products page rendering & gallery
js/cart.js        Cart page rendering & checkout
js/three-hero.js  Three.js 3D silk + golden dust hero
js/ui.js          Loader, scroll-reveal, 3D pointer tilt
google-apps-script.gs  Paste into script.google.com (Option 3A)
.nojekyll         Tells GitHub Pages to serve files as-is
```
