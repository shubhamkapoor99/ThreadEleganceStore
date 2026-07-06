/**
 * ThreadElegance Store — Google Drive catalog feed
 * ---------------------------------------------------------------
 * This tiny Google Apps Script lets your website read your Drive
 * folder(s) WITHOUT any API key or Google Cloud Console setup.
 *
 * SETUP (one time, ~3 minutes):
 *   1. Open https://script.google.com  ->  New project.
 *   2. Delete the sample code, paste THIS whole file.
 *   3. The folder ids below are already set to your folders.
 *   4. Click  Deploy  ->  New deployment.
 *   5. "Select type" (gear icon)  ->  Web app.
 *   6. Execute as:  Me.   Who has access:  Anyone.
 *   7. Click Deploy, then Authorize access (allow your account).
 *   8. Copy the "Web app URL" (it ends with /exec).
 *   9. Paste that URL into  js/config.js  ->  drive.appsScriptUrl.
 *
 * TWO-FOLDER SETUP (current):
 *   • IMAGE_FOLDER_ID — holds all saree images (and the video). This folder
 *     MUST be shared "Anyone with the link -> Viewer", because each visitor's
 *     browser loads the pictures directly from Google. If it isn't public the
 *     images fall back to a grey placeholder.
 *   • TEXT_FOLDER_ID  — holds the ".txt" detail files only. This script reads
 *     their text itself (it runs as YOU, "Execute as: Me"), so this folder can
 *     stay private/restricted — no public sharing needed.
 *
 *   Images and their ".txt" are matched by the group number in the file name
 *   (e.g. 28_1.png in the image folder pairs with 28.txt in the text folder),
 *   so the two folders can live apart and still assemble into one product.
 *
 * IMPORTANT: after editing folder ids you must Deploy -> Manage deployments ->
 * edit the deployment -> New version, or the live URL keeps the old code.
 */

// Images (+ video) — share this folder "Anyone with the link -> Viewer".
var IMAGE_FOLDER_ID = '1ixNsc36cf89W4YT5zVkJk7-I3LY4K8B9';
// ".txt" detail files — read as the owner, so this one may stay private.
var TEXT_FOLDER_ID = '19LjKR9KSomQOVc5r_S8fneon4uQYtZTd';
// Every folder to scan. Add more ids here if you ever split things further.
var FOLDER_IDS = [IMAGE_FOLDER_ID, TEXT_FOLDER_ID];
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

// Reads every configured folder, bundles each .txt inline, caches the JSON,
// returns it. Files from all folders are merged into ONE list; the site groups
// them into products by the number in each file name, so images and their .txt
// can live in separate folders.
function buildCatalog_(cache) {
  var arr = [];
  var seen = {};   // guard against the same file id appearing twice

  for (var i = 0; i < FOLDER_IDS.length; i++) {
    var id = FOLDER_IDS[i];
    if (!id) continue;
    var files = DriveApp.getFolderById(id).getFiles();

    while (files.hasNext()) {
      var f = files.next();
      var fileId = f.getId();
      if (seen[fileId]) continue;   // skip if the same folder id was listed twice
      seen[fileId] = true;

      var name = f.getName();
      // Send the MIME type so the site can recognise ANY image format Drive
      // knows about (jpg, jpeg, heic, webp, tiff, …), not only files ending .png.
      var item = { name: name, id: fileId, mimeType: f.getMimeType() };

      // Include the text of .txt files inline (so the site needs no extra call)
      if (/\.txt$/i.test(name)) {
        try { item.text = f.getBlob().getDataAsString('UTF-8'); }
        catch (err) { item.text = ''; }
      }
      arr.push(item);
    }
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
