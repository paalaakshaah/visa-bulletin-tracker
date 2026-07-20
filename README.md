# U.S. Visa Bulletin Tracker

A complete pipeline for tracking and visualizing U.S. Department of State Visa
Bulletin data, January 2013 &ndash; August 2026: a Python scraper, a SQLite
database (already populated with the full historical run), and a Next.js +
Tailwind dashboard/trend-chart frontend.

```
scraper/          Python scraper (requests + BeautifulSoup) + parser used to build the DB
  scraper.py       Standalone scraper: fetch -> parse -> load into SQLite
  parser.py        Variant used to build this bundle from pre-fetched raw_bulletins/*.md
  url_list.json    The exact 164 URLs (Jan 2013 - Aug 2026) with the Oct/Nov/Dec fiscal-year rule applied
db/
  schema.sql                  SQLite DDL (tables, indexes, seed data, flattened view)
  visa_bulletin_2013_2026.db  Pre-built database, ~21,500 rows, ready to use
raw_bulletins/     Trimmed source excerpts (one .md per month) used to build the DB
frontend/          Next.js 14 + Tailwind + Recharts app (dashboard + trend charts)
```

## 1. The data

Two "cut-off date" tables have been published every month since October 2015:
Final Action Dates (when a visa can actually be issued) and Dates for Filing
(when you may submit paperwork, usually earlier). Before October 2015, the
bulletin only published one table per category ("cut-off dates") -- those
months are stored as `table_type = 'Final Action'` and there simply is no
`'Dates for Filing'` row for them, since that concept didn't exist yet.

Every cell in the source tables is one of:
- a date, e.g. `01SEP17`
- `C` &rarr; **Current**: stored as `status='CURRENT'` with `priority_date` set
  to the first day of that bulletin's month, per the requested data rule.
- `U` &rarr; **Unavailable**: stored as `status='UNAVAILABLE'` with
  `priority_date = NULL`.

Categories and chargeability areas are not static over 13 years:
- The EB-5 row was split into Unreserved / Rural / High-Unemployment /
  Infrastructure set-asides starting ~March 2022 (EB-5 Reform & Integrity Act).
- El Salvador/Guatemala/Honduras and Vietnam appeared as their own
  oversubscribed chargeability-area columns in some years and not others.

The schema and parser handle all of this by normalizing into stable category
codes (`F1`, `F2A`, `EB1`, `EB3-OW`, `EB5-Rural`, ...) and area codes
(`ALL`, `CHINA`, `INDIA`, `MEXICO`, `PHILIPPINES`, `VIETNAM`, `EL_SV_GT_HN`)
while keeping the original `raw_value` for every cell so nothing is lost.

## 2. Database

See `db/schema.sql` for the full DDL. Summary:

- `bulletins` &mdash; one row per published month (`bulletin_date`, `source_url`)
- `categories` &mdash; normalized preference categories (Family-Sponsored / Employment-Based)
- `chargeability_areas` &mdash; countries/areas (grows over time, see above)
- `visa_dates` &mdash; the actual data: `(bulletin_id, category_id, area_id, table_type)` &rarr; `status`, `priority_date`, `raw_value`
- `visa_dates_flat` &mdash; a view joining everything into flat, query-ready columns (`bulletin_date`, `category`, `chargeability_area`, `table_type`, `priority_date`, ...) for easy reporting/ad-hoc SQL

`db/visa_bulletin_2013_2026.db` is already populated with all 164 months
(~21,500 data points). You don't need to re-run the scraper to use the
frontend -- `frontend/data/visa_bulletin.db` is already a ready-to-use copy
of the same database.

## 3. Re-running the scraper

The included database was built via a specialized fetch pipeline available in
this environment; `scraper/scraper.py` is the standalone version for you to
run yourself (e.g. to pick up new months as they're published):

```bash
cd scraper
pip install -r requirements.txt --break-system-packages
python3 scraper.py                          # full 2013-01 .. 2026-06 range
python3 scraper.py --start 2026-07 --end 2026-07   # just one new month
```

By default it writes to `../db/visa_bulletin.db` (upserts, so re-running is
safe and incremental). Flags: `--start YYYY-MM`, `--end YYYY-MM`, `--db PATH`,
`--delay SECONDS` (politeness delay between requests, default 1s).

## 4. Frontend

```bash
cd frontend
npm install
npm run dev
```

Then open http://localhost:3000. Two views:

- **Dashboard** &mdash; a grid of every category x country for a chosen month,
  with a month picker, Final Action/Filing toggle, and Family/Employment
  filter. Cells are color-coded (green = Current, red = Unavailable, else the
  cut-off date).
- **Trends** &mdash; pick a broad category, a specific preference category
  (F1, EB-2, EB-5 Rural, ...), a table type, and one or more countries to plot
  their cut-off date history as a line chart. Drag the handles under the
  chart to zoom into any date range.

The frontend reads directly from `frontend/data/visa_bulletin.db` (a copy of
the database) via `better-sqlite3` in Next.js API routes
(`app/api/meta`, `app/api/dashboard`, `app/api/trend`). To refresh the data
the frontend sees, just re-copy the updated database:

```bash
cp db/visa_bulletin_2013_2026.db frontend/data/visa_bulletin.db
```
