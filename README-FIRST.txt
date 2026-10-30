GUIMBA BHW — OFFLINE PHILIPPINE LOCATION PATCH (v2)
===================================================
THIS PATCH MATCHES YOUR EXISTING FOLDER STRUCTURE:

secure-voting-system - v3.0/
  .env                        [KEEP YOUR EXISTING FILE]
  server.js                   [BACK UP, THEN REPLACE]
  sync-locations.js           [NEW]
  data/
    geo-cache/                [CREATED BY DOWNLOADER]
      regions.json
      provinces/...
      cities/...
      regioncities/...
      barangays/...
      manifest.json
  public/                     [LEAVE UNCHANGED]
    assets/
    css/style.css
    models/
    js/app.js
    index.html
  node_modules/               [LEAVE UNCHANGED]

IMPORTANT: The previous ZIP placed the frontend files in the wrong folder.
This patch does NOT replace any frontend files and uses the existing /api/geo/*
endpoints expected by your current public/js/app.js.

SETUP — ON COMPUTER WITH INTERNET
1. BACK UP your currently working server.js.
2. Extract ZIP, copy server.js and sync-locations.js to PROJECT ROOT,
   next to package.json, replacing server.js only after backing it up.
3. Open a VS Code terminal in the project root:
       node sync-locations.js
4. WAIT for SUCCESS. Download requires internet and may involve ~1,700 requests.
   If it fails, run the same command again to resume. Do not proceed unless
   data/geo-cache/manifest.json exists. The API may rate-limit or be unavailable.
5. On the main PC: node --env-file=.env server.js
6. In Chrome try http://localhost:3000/api/geo/regions
   You should see a JSON array of region names and codes.
7. Try the address dropdowns in registration.

TO USE ON A LAPTOP WITH NO INTERNET
8. Copy server.js AND the COMPLETE data/geo-cache folder to the other laptop.
   The offline laptop does NOT need sync-locations.js after the dataset is there.
9. Do NOT overwrite .env, public/, package.json, or your database.
10. Restart: node --env-file=.env server.js
11. Try http://localhost:3000/api/geo/regions and registration.

TROUBLESHOOTING
- 503 at /api/geo/regions: data/geo-cache/manifest.json is absent or incomplete.
- 503 at /api/geo/barangays/CODE: partial/corrupt cache, re-run sync.
- 'HTTP 429' or timeouts when syncing: server rate limiting / connectivity;
  wait and re-run to resume. Downloader must run ONCE where internet works.
- This ZIP does NOT contain a downloaded national dataset, because the source
  could not be accessed in this build environment. Do not claim this will work
  offline until the downloader reports SUCCESS and the folder is transferred.
- No MySQL schema changes or user-data migrations are involved.
- Use the NEWER frontend files you already run (public/js/app.js etc.).
