TASK 19 — Daily Summary View (Per Project / Per Day)
1) WHAT WE WANT

A compact Daily Summary screen that shows, for the selected project and date (default = today), a one-page summary supervisors can read in ~10 seconds. It must work offline (from local data) and online (using Supabase). The view is read-only and links to full PDFs and individual entries.

2) WHY

Supervisors and owners want a single daily snapshot (per project) — not the raw log list. This increases trust, speeds decisions, and prepares the app for the Notification feature (daily push). Build using existing data (assets → work_items → field_logs).

3) WHAT TO DELIVER (exact)
A. UI (pwa/index.html + pwa/style.css + pwa/app.js)

Add a new top-nav tab: Daily Summary.

Layout — top-to-bottom (compact):

Header row

Project selector (existing)

Date picker (default: today; prev/next arrows)

Refresh / Sync button

Key KPIs (small cards)

Total active assets today (count)

Total work items touched today (count)

Total photos today (count)

Unique field entries today (count)

Per-Asset accordion (collapsed by default)

Asset header line: ASSET NAME — (type) — [total photos] — [work items touched]

Expand shows per work_item rows:

Work Item (item_code) | Qty today | Cumulative (if target) | Remaining (if target) | #photos | Link: View entries


Under each work_item show 1–2 sample thumbnails (click to open gallery modal) and a small “Open PDF” button linking to that asset/day PDF (generate locally if needed).

Bottom: small timeline / activity list (latest 10 entries today) — each entry shows time, asset, work_type, qty, crew size, hash (short form), and quick view photo icon.

Behavior

Default date = today's date (Asia/Manila).

If no entries exist → show “No activity today” with quick button “Open Field Entry”.

Works offline reading localStorage; if online, show counts from Supabase (sync if user requests).

B. Data aggregation logic (pwa/app.js / pwa/sync_client.js)

Query local field_logs filtered by project_id and date.

Aggregate:

unique assets touched (group by asset_id)

unique work_items touched (group by asset_id + item_code/work_type)

sum of quantity_today as text for display (we do not parse units for totals) — show raw values per row (e.g., 2.5 blocks, 10 m3). For “totals” card use counts (not summed numeric) unless unit uniform per work_item — keep simple.

count photos (entries with photo)

latest N entries for timeline, sorted desc by timestamp

When online, offer a Sync button to refresh aggregates from Supabase.

C. PDF & Link behavior

Each asset/work_item row includes a small “View Day PDF” action:

If local PDF exists for that day, open it.

Else generate local PDF on demand (reuse pdf_local.js) and show download link + display SHA-256 hash.

Add a “Download Project Daily Summary (PDF)” button that renders the summary page into a neat one-page PDF (uses pdf_local.js) and includes top KPIs + asset/work_item table + last 10 entries + hash.

D. Offline & Performance

Use cached thumbnails for quick load (gallery already implemented).

Keep aggregations client-side for offline.

If project has >200 entries today, paginate per-asset results or limit thumbnails to first 6 per asset to avoid UI jank.

E. Files to update

pwa/index.html — add tab + date picker UI.

pwa/style.css — styles for KPI cards, accordions, small tables.

pwa/app.js — new renderDailySummary(projectId, date) + helpers aggregateDailyData().

pwa/pdf_local.js — add generateDailySummaryPDF(project, date, summaryData) (reuses existing PDF routines).

pwa/sync_client.js — optional: server fetch for aggregated day data when online.

pwa/README.md — document the new feature and offline behavior.

F. Acceptance Criteria (plain tests)

Open PWA, select project → open Daily Summary: default date = today, UI loads quickly from local data.

KPI cards show correct counts matching raw Field Logs.

Assets accordion lists only assets with activity that date (count matches).

Each expanded work_item row displays quantity_today (per entry aggregated or listed), cumulative & remaining if target set, #photos, and “View entries / View PDF” links.

Timeline shows latest 10 entries for the date, with clickable photo preview.

“Download Project Daily Summary (PDF)” produces a single PDF with summary + SHA-256, downloadable offline.

Sync/Refresh updates aggregates from Supabase when online.

No UI crashes for projects with 500+ entries (thumbnails limited).

Works correctly when device is offline (uses localStorage), and when online (uses Supabase data after sync).

Implementation notes for builder (short)

Keep numeric totals conservative: do not attempt complex unit math. Show counts and textual quantities. If later we want numeric aggregation, require same-unit enforcement per work_item.

Reuse existing gallery modal and pdf_local.js functions to avoid duplication.

Keep mobile-first responsive design: KPI cards stack vertically on narrow screens.

Timezone: Asia/Manila for date boundaries.