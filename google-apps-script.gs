/**
 * ThreadElegance Store — Google Drive catalog feed
 * ---------------------------------------------------------------
 * This tiny Google Apps Script lets your website read your Drive
 * folder WITHOUT any API key or Google Cloud Console setup.
 *
 * SETUP (one time, ~3 minutes):
 *   1. Open https://script.google.com  ->  New project.
 *   2. Delete the sample code, paste THIS whole file.
 *   3. The FOLDER_ID below is already set to your folder.
 *   4. Click  Deploy  ->  New deployment.
 *   5. "Select type" (gear icon)  ->  Web app.
 *   6. Execute as:  Me.   Who has access:  Anyone.
 *   7. Click Deploy, then Authorize access (allow your account).
 *   8. Copy the "Web app URL" (it ends with /exec).
 *   9. Paste that URL into  js/config.js  ->  drive.appsScriptUrl.
 *
 * ALSO: share the Drive folder itself as
 *   "Anyone with the link"  ->  Viewer
 * so the saree images can be shown on the website.
 */

var FOLDER_ID = '19LjKR9KSomQOVc5r_S8fneon4uQYtZTd';
// Keep the built catalog cached for the maximum allowed (6 h) so it never goes
// cold on its own between visits.
var CACHE_TTL_SECONDS = 21600;   // 6 hours (CacheService maximum)

/**
 * KEEP IT ALWAYS-FAST (no external pinger needed):
 * Add a time-driven trigger that runs warmCache() every 10 minutes —
 *   Apps Script editor  ->  Triggers (clock icon)  ->  Add Trigger
 *   Function: warmCache | Event source: Time-driven | Minutes timer: Every 10 minutes
 * That rebuilds the cache on Google's own servers, so the slow blob-read is
 * never paid by a real visitor and the catalog also stays current automatically.
 */

function doGet(e) {
  var fresh = e && e.parameter && e.parameter.fresh;   // ?fresh=1 forces a rebuild
  var cache = CacheService.getScriptCache();

  // Fast path: return the cached JSON instead of re-reading every file + .txt
  // blob on each visit (reading blobs is the slow part of this script).
  if (!fresh) {
    var hit = readCache_(cache);
    if (hit) return out_(hit);
  }

  return out_(buildCatalog_(cache));
}

// Time-driven trigger target: rebuild + cache the catalog on a schedule so the
// cache is always warm for real visitors. Safe to run manually too.
function warmCache() {
  buildCatalog_(CacheService.getScriptCache());
}

// Reads the whole folder, bundles each .txt inline, caches the JSON, returns it.
function buildCatalog_(cache) {
  var folder = DriveApp.getFolderById(FOLDER_ID);
  var files = folder.getFiles();
  var arr = [];

  while (files.hasNext()) {
    var f = files.next();
    var name = f.getName();
    // Send the MIME type so the site can recognise ANY image format Drive
    // knows about (jpg, jpeg, heic, webp, tiff, …), not only files ending .png.
    var item = { name: name, id: f.getId(), mimeType: f.getMimeType() };

    // Include the text of .txt files inline (so the site needs no extra call)
    if (/\.txt$/i.test(name)) {
      try { item.text = f.getBlob().getDataAsString('UTF-8'); }
      catch (err) { item.text = ''; }
    }
    arr.push(item);
  }

  var payload = JSON.stringify(arr);
  writeCache_(cache, payload, CACHE_TTL_SECONDS);
  return payload;
}

function out_(payload) {
  return ContentService
    .createTextOutput(payload)
    .setMimeType(ContentService.MimeType.JSON);
}

/* CacheService values are capped at ~100 KB each, so the JSON is split into
   ~90 KB chunks across multiple keys and stitched back together on read. */
function writeCache_(cache, payload, ttl) {
  var chunkSize = 90000;
  var n = Math.ceil(payload.length / chunkSize);
  if (n > 25) { cache.remove('cat_n'); return; }   // very large catalog: skip caching
  var parts = {};
  for (var i = 0; i < n; i++) {
    parts['cat_' + i] = payload.substring(i * chunkSize, (i + 1) * chunkSize);
  }
  parts['cat_n'] = String(n);
  cache.putAll(parts, ttl);
}

function readCache_(cache) {
  var nStr = cache.get('cat_n');
  if (!nStr) return null;
  var n = parseInt(nStr, 10);
  if (!(n > 0)) return null;
  var keys = [];
  for (var i = 0; i < n; i++) keys.push('cat_' + i);
  var map = cache.getAll(keys);
  var s = '';
  for (var j = 0; j < n; j++) {
    var part = map['cat_' + j];
    if (part == null) return null;   // a chunk expired -> treat as a miss, rebuild
    s += part;
  }
  return s;
}
