/* =====================================================================
   ThreadElegance Store - GLOBAL CONFIGURATION
   ---------------------------------------------------------------------
   This is the ONLY file you normally need to edit.
   ===================================================================== */

window.STORE_CONFIG = {
  /* ---- Brand / contact details ---- */
  storeName: "ThreadElegance Store",
  tagline: "",
  whatsappNumber: "919711084312",        // country code + number, no "+" / spaces
  email: "ThreadEleganceStore@gmail.com",
  phone: "+919711084312",
  instagram: "https://www.instagram.com/threadelegancestore/",
  address: "846-A, Katra Mahesh Das, Nai Sarak, Chandni Chowk, Delhi, India",
  currency: "₹",

  /* ---- Google Drive auto-catalog ----
     1. Put your photos + .txt files in ONE Drive folder.
     2. Share the folder:  "Anyone with the link"  ->  Viewer.
     3. Create a Google Drive API key (see README) and paste it below.
     4. Paste the folder id (the long code in the folder URL).

     Naming rule the site understands:
       <group>_<imageNumber>.jpg   ->  1_1.jpg, 1_2.jpg, 1_3.jpg ...
       <group>.txt                 ->  1.txt   (info for saree group 1)

     Each <group> becomes ONE product. All its images become a
     swipeable gallery. The first image (lowest number) is the cover. */
  drive: {
    folderId: "19LjKR9KSomQOVc5r_S8fneon4uQYtZTd",

    // ---- OPTION A (recommended, NO API key / NO Cloud Console) ----
    // Deploy the included Google Apps Script (see google-apps-script.gs +
    // README section 3A), then paste its "/exec" web-app URL here:
    appsScriptUrl: "https://script.google.com/macros/s/AKfycbxbL8Wjm2w4dg8OwwcdOqr65lGstXFQcO6qdC9Ow2i20jr2fXv3mZcCrrwzFVdAB9Rg5Q/exec",

    // ---- OPTION B (alternative) ----
    // A Google Drive API key. Used only if appsScriptUrl is left blank.
    apiKey: "",
  },

  /* ---- .txt file format (all keys optional) ----
       Color: Maroon
       Name: Kanchipuram Silk Saree
       Price: 12999
       Details: A luxurious pure-silk saree with golden zari border.
                Comes with a contrast blouse piece.

     If you don't use keys, the FIRST line is treated as the Color and
     everything after it is treated as the Details paragraph. */

  /* If true, when Drive is not configured the site shows sample products
     so you can preview the design. Set false to ONLY ever show your real
     sarees from Google Drive (recommended for the live store). */
  showDemoWhenUnconfigured: false,
};
