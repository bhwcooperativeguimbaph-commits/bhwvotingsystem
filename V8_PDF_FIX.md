# V8 PDF export fix

The PDF export is now **fully local** and does not require jsPDF, html2pdf, internet access, npm package downloads or the Cloudflare CDN.

Files changed:
- `public/js/report-pdf.js` — self-contained PDF generator using PDF 1.4 commands, text and tables, with page numbering and area-level detail.
- `public/js/app.js` — downloads verified results with the new local generator.
- `public/index.html` — loads `/js/report-pdf.js?v=20261026-v8` and the matching version of app.js.

## Installation
Unzip over your project and keep `.env` and your existing MySQL data. Restart the server, then use Ctrl+Shift+R to refresh Chrome. Open `http://localhost:3000/js/report-pdf.js?v=20261026-v8` to verify it is served locally.

## Validation
A sample report was exported with the exact script and checked with pdfinfo/pdftotext, including multi-page content and an area report. This is a simulated smoke test, not a connection to your own local database.

## Scope
Only verified aggregate election results are exported. Individual ballots and voter identities are never included. The report uses standard built-in PDF fonts; unsupported non-Latin characters are transliterated where possible.
