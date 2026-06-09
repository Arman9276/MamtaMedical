/* ═══════════════════════════════════════════════════════════
   MAMTA MEDICAL — SHARED CONFIG (TEMPLATE)
   Single source of truth for values used by more than one page.
   Imported by products.html and admin.html (ES module scripts).

   HOW THIS WORKS
   • This template is committed to Git. The real js/config.js is NOT
     (it is listed in .gitignore).
   • On deploy, the GitHub Actions workflow generates js/config.js from
     this template, replacing the apiKey placeholder with the value stored
     in the repo secret FIREBASE_API_KEY.
   • For LOCAL development, copy this file to js/config.js once and paste
     your real key into the apiKey field:
         cp js/config.template.js js/config.js

   NOTE: the Firebase apiKey is a PUBLIC client identifier (it is shipped
   to every visitor's browser and is safe to expose). Real protection
   comes from firestore.rules + key restrictions in Google Cloud Console,
   not from hiding this string. Keeping it out of the repo is only to keep
   secret scanners quiet and the source clean.
═══════════════════════════════════════════════════════════ */

export const FIREBASE_CONFIG = {
            apiKey: "__FIREBASE_API_KEY__",
            authDomain: "mamta-medical-78051.firebaseapp.com",
            projectId: "mamta-medical-78051",
            storageBucket: "mamta-medical-78051.firebasestorage.app",
            messagingSenderId: "709240523334",
            appId: "1:709240523334:web:9102835fe41038d4ca9847"
        };

export const WA_NUM = '919426894254';
export const WA_PHONE = '+91 94268 94254';
