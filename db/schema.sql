-- =====================================================================
-- U.S. Visa Bulletin historical database schema (SQLite)
-- =====================================================================

PRAGMA foreign_keys = ON;

-- One row per published monthly bulletin (Jan 2013 - Jun 2026)
CREATE TABLE IF NOT EXISTS bulletins (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    bulletin_year   INTEGER NOT NULL,
    bulletin_month  INTEGER NOT NULL CHECK (bulletin_month BETWEEN 1 AND 12),
    bulletin_date   TEXT NOT NULL,              -- ISO date, first of the month, e.g. '2026-06-01'
    source_url      TEXT,
    UNIQUE (bulletin_year, bulletin_month)
);

-- Preference categories, both Family-Sponsored and Employment-Based.
-- Some employment categories (EB-5 set-asides) only exist from ~March 2022 onward;
-- that's fine, they simply won't have visa_dates rows before then.
CREATE TABLE IF NOT EXISTS categories (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    broad_category  TEXT NOT NULL CHECK (broad_category IN ('Family-Sponsored', 'Employment-Based')),
    code            TEXT NOT NULL,               -- e.g. 'F1', 'F2A', 'EB1', 'EB3-OW', 'EB5-Rural'
    name            TEXT NOT NULL,                -- human readable label
    sort_order      INTEGER NOT NULL DEFAULT 0,
    UNIQUE (broad_category, code)
);

-- Chargeability areas / countries (grows over time: e.g. VIETNAM and
-- EL SALVADOR/GUATEMALA/HONDURAS were added as oversubscribed areas
-- in certain years and later removed as demand shifted).
CREATE TABLE IF NOT EXISTS chargeability_areas (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    code    TEXT NOT NULL UNIQUE,   -- e.g. 'ALL', 'CHINA', 'INDIA', 'MEXICO', 'PHILIPPINES', 'VIETNAM', 'EL_SV_GT_HN'
    name    TEXT NOT NULL           -- display name, e.g. 'All Chargeability Areas Except Those Listed'
);

-- The actual data: one row per (bulletin, category, chargeability area, table_type).
CREATE TABLE IF NOT EXISTS visa_dates (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    bulletin_id     INTEGER NOT NULL REFERENCES bulletins(id) ON DELETE CASCADE,
    category_id     INTEGER NOT NULL REFERENCES categories(id),
    area_id         INTEGER NOT NULL REFERENCES chargeability_areas(id),
    table_type      TEXT NOT NULL CHECK (table_type IN ('Final Action', 'Dates for Filing')),
    status          TEXT NOT NULL CHECK (status IN ('DATE', 'CURRENT', 'UNAVAILABLE')),
    -- priority_date: the cut-off priority date, ISO format (YYYY-MM-DD).
    --   status = 'DATE'        -> the actual parsed cut-off date
    --   status = 'CURRENT'     -> per spec, stored as the first day of the bulletin's month/year
    --   status = 'UNAVAILABLE' -> NULL (no numbers authorized at all)
    priority_date   TEXT,
    raw_value       TEXT NOT NULL,   -- original cell text as published ('C', 'U', '01SEP17', ...)
    UNIQUE (bulletin_id, category_id, area_id, table_type)
);

CREATE INDEX IF NOT EXISTS idx_visa_dates_bulletin   ON visa_dates(bulletin_id);
CREATE INDEX IF NOT EXISTS idx_visa_dates_category   ON visa_dates(category_id);
CREATE INDEX IF NOT EXISTS idx_visa_dates_area       ON visa_dates(area_id);
CREATE INDEX IF NOT EXISTS idx_visa_dates_lookup     ON visa_dates(category_id, area_id, table_type);
CREATE INDEX IF NOT EXISTS idx_bulletins_date        ON bulletins(bulletin_date);

-- Convenience flattened view for querying/reporting (matches the
-- "priority_date / category / table_type / bulletin_date" shape
-- requested for the frontend and any ad-hoc analysis).
CREATE VIEW IF NOT EXISTS visa_dates_flat AS
SELECT
    vd.id,
    b.bulletin_date,
    b.bulletin_year,
    b.bulletin_month,
    c.broad_category,
    c.code            AS category,
    c.name            AS category_name,
    a.code            AS chargeability_area,
    a.name            AS chargeability_area_name,
    vd.table_type,
    vd.status,
    vd.priority_date,
    vd.raw_value
FROM visa_dates vd
JOIN bulletins b         ON vd.bulletin_id = b.id
JOIN categories c        ON vd.category_id = c.id
JOIN chargeability_areas a ON vd.area_id = a.id;

-- ---------------------------------------------------------------------
-- Seed data: known categories and chargeability areas.
-- (Parser will also INSERT OR IGNORE any new ones it discovers, so this
-- list is a helpful baseline/documentation but not strictly required.)
-- ---------------------------------------------------------------------
INSERT OR IGNORE INTO categories (broad_category, code, name, sort_order) VALUES
    ('Family-Sponsored', 'F1',  'F1 - Unmarried Sons/Daughters of U.S. Citizens', 1),
    ('Family-Sponsored', 'F2A', 'F2A - Spouses/Children of Permanent Residents', 2),
    ('Family-Sponsored', 'F2B', 'F2B - Unmarried Sons/Daughters (21+) of Permanent Residents', 3),
    ('Family-Sponsored', 'F3',  'F3 - Married Sons/Daughters of U.S. Citizens', 4),
    ('Family-Sponsored', 'F4',  'F4 - Brothers/Sisters of Adult U.S. Citizens', 5),
    ('Employment-Based', 'EB1', 'EB-1 - Priority Workers', 1),
    ('Employment-Based', 'EB2', 'EB-2 - Advanced Degree/Exceptional Ability', 2),
    ('Employment-Based', 'EB3', 'EB-3 - Skilled Workers/Professionals', 3),
    ('Employment-Based', 'EB3-OW', 'EB-3 Other Workers', 4),
    ('Employment-Based', 'EB4', 'EB-4 - Certain Special Immigrants', 5),
    ('Employment-Based', 'EB4-R', 'EB-4 Certain Religious Workers', 6),
    ('Employment-Based', 'EB5', 'EB-5 - Employment Creation (legacy, pre-2015 single category)', 7),
    ('Employment-Based', 'EB5-NonRegional', 'EB-5 Non-Regional Center (C5/T5)', 8),
    ('Employment-Based', 'EB5-Regional', 'EB-5 Regional Center Pilot (I5/R5)', 9),
    ('Employment-Based', 'EB5-Unreserved', 'EB-5 Unreserved', 10),
    ('Employment-Based', 'EB5-Rural', 'EB-5 Set Aside: Rural (20%)', 11),
    ('Employment-Based', 'EB5-HighUnemployment', 'EB-5 Set Aside: High Unemployment (10%)', 12),
    ('Employment-Based', 'EB5-Infrastructure', 'EB-5 Set Aside: Infrastructure (2%)', 13);

INSERT OR IGNORE INTO chargeability_areas (code, name) VALUES
    ('ALL', 'All Chargeability Areas Except Those Listed'),
    ('CHINA', 'CHINA-mainland born'),
    ('INDIA', 'INDIA'),
    ('MEXICO', 'MEXICO'),
    ('PHILIPPINES', 'PHILIPPINES'),
    ('VIETNAM', 'VIETNAM'),
    ('EL_SV_GT_HN', 'EL SALVADOR / GUATEMALA / HONDURAS');
