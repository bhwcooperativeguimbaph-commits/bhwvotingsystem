# V7: Compact Notifications and Reliable PDF Export

## Updates
- **Member notifications**: compact My Notifications toggle, closed by default; unread badge, expandable panel, per-member saved message list, mark read.
- **Reports**: replaced HTML screenshot PDF capture with programmatic jsPDF drawing. Includes election identity and scheduled dates, verification status, turnout, candidates ranked per position, total votes, outcomes, tie notices, registered/voted/turnout by area, each candidate's area breakdown (overall PDF), counting methodology, generated date, page footers and page numbers. Area PDF includes area-specific totals and candidates with a warning that area leaders are not separate official winners.
- Added explicit jsPDF UMD script and V7 cache-busting app.js URL.

## Installation
Replace the project files, retain your existing `.env`, restart the Node server, and hard refresh the browser (Ctrl+Shift+R). The browser needs internet access to load jsPDF from Cloudflare CDN unless you bundle it locally.

## Verification checklist
1. Sign in as a member; the dashboard shows only the **My Notifications** button and unread count. Open it to see all historical messages; close it without losing messages. Log out and sign back in to verify persistence.
2. As administrator, open a finalized report and export Overall and each Area report. Open the PDF and verify visible text on every page, including election ID, counts, candidate outcomes, all area breakdowns and page numbers.
3. Test an election with enough candidates and areas to span multiple pages. Confirm no clipped rows and no empty exported pages.

**Limitation**: Full browser rendering, CDN access and MySQL integration must be checked against your deployment. JavaScript syntax/static checks alone cannot confirm them.
