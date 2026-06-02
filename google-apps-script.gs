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

function doGet(e) {
  var folder = DriveApp.getFolderById(FOLDER_ID);
  var files = folder.getFiles();
  var out = [];

  while (files.hasNext()) {
    var f = files.next();
    var name = f.getName();
    var item = { name: name, id: f.getId() };

    // Include the text of .txt files inline (so the site needs no extra call)
    if (/\.txt$/i.test(name)) {
      try { item.text = f.getBlob().getDataAsString('UTF-8'); }
      catch (err) { item.text = ''; }
    }
    out.push(item);
  }

  return ContentService
    .createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}
