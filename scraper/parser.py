#!/usr/bin/env python3
"""
Parser for scraped U.S. Visa Bulletin pages (raw_bulletins/*.md) into the
visa_bulletin.db SQLite database defined by db/schema.sql.

Usage:
    python3 parser.py

Reads every raw_bulletins/{year}-{month}.md file, extracts the four data
tables (Family Final Action, Family Filing, Employment Final Action,
Employment Filing), normalizes categories/areas/values, and populates the
database. Also prints a summary report of what was parsed and any rows or
files that could not be interpreted, for spot-checking.
"""
import os
import re
import sys
import json
import sqlite3
import datetime

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.dirname(HERE)
RAW_DIR = os.path.join(OUT_DIR, "raw_bulletins")
DB_DIR = os.path.join(OUT_DIR, "db")
SCHEMA_PATH = os.path.join(DB_DIR, "schema.sql")
# Build the DB in a scratch location first -- the outputs mount does not allow
# deleting/overwriting files in place, so we build here and copy the final
# file into outputs/db/ only once at the very end (see bottom of main()).
BUILD_DIR = "/tmp/visa_build"
DB_PATH = os.path.join(BUILD_DIR, "visa_bulletin.db")
URL_LIST_PATH = os.path.join(HERE, "url_list.json")

MONTH_ABBR = {
    'JAN': 1, 'FEB': 2, 'MAR': 3, 'APR': 4, 'MAY': 5, 'JUN': 6,
    'JUL': 7, 'AUG': 8, 'SEP': 9, 'OCT': 10, 'NOV': 11, 'DEC': 12,
}


def clean(s):
    s = s.replace('*', '')
    s = re.sub(r'\s+', ' ', s).strip()
    return s


def find_tables(text):
    """Return list of dicts: {start_line, header_cells, rows: [[cells],...]}"""
    lines = text.split('\n')
    tables = []
    i = 0
    n = len(lines)

    def is_row(line):
        s = line.strip()
        return s.startswith('|') and s.endswith('|') and len(s) > 1

    def is_sep(line):
        s = line.strip()
        if not (s.startswith('|') and s.endswith('|')):
            return False
        inner = s.strip('|')
        return bool(inner) and set(inner.replace('|', '').replace(':', '').strip()) <= set('- ')

    while i < n:
        if is_row(lines[i]) and i + 1 < n and is_sep(lines[i + 1]):
            header_cells = split_row(lines[i])
            j = i + 2
            rows = []
            while j < n and is_row(lines[j]):
                rows.append(split_row(lines[j]))
                j += 1
            tables.append({'start_line': i, 'header': header_cells, 'rows': rows})
            i = j
        else:
            i += 1
    return tables


def split_row(line):
    parts = line.strip().strip('|').split('|')
    return [clean(p) for p in parts]


def classify_table_type(full_text_upper, start_char_idx):
    before = full_text_upper[:start_char_idx]
    idx_filing = before.rfind('DATES FOR FILING')
    idx_final_explicit = max(
        before.rfind('FINAL ACTION DATES'),
        before.rfind('APPLICATION FINAL ACTION DATES'),
    )
    if idx_filing == -1 and idx_final_explicit == -1:
        # Pre-Oct-2015 bulletins have no explicit section headers at all --
        # they only ever published a single "cut-off date" table per category,
        # equivalent to today's Final Action Dates.
        return 'Final Action'
    if idx_filing > idx_final_explicit:
        return 'Dates for Filing'
    return 'Final Action'


def normalize_area(label):
    l = clean(label).upper()
    compact = re.sub(r'[^A-Z]', '', l)
    if 'ALL' in compact and 'CHARGEABIL' in compact:
        return 'ALL', 'All Chargeability Areas Except Those Listed'
    if 'CHINA' in compact:
        return 'CHINA', 'CHINA-mainland born'
    if 'INDIA' in compact:
        return 'INDIA', 'INDIA'
    if 'MEXICO' in compact:
        return 'MEXICO', 'MEXICO'
    if 'PHILIPPINES' in compact:
        return 'PHILIPPINES', 'PHILIPPINES'
    if 'VIETNAM' in compact:
        return 'VIETNAM', 'VIETNAM'
    if 'ELSALVADOR' in compact or 'GUATEMALA' in compact or 'HONDURAS' in compact:
        return 'EL_SV_GT_HN', 'EL SALVADOR / GUATEMALA / HONDURAS'
    return None, None


def normalize_family_category(label):
    l = clean(label).upper()
    if l in ('F1', 'F2A', 'F2B', 'F3', 'F4'):
        return l
    return None


def normalize_employment_category(label):
    l = clean(label).lower()
    if 'rural' in l:
        return 'EB5-Rural'
    if 'high unemployment' in l:
        return 'EB5-HighUnemployment'
    if 'infrastructure' in l:
        return 'EB5-Infrastructure'
    if 'unreserved' in l:
        return 'EB5-Unreserved'
    if 'non-regional' in l or 'non regional' in l:
        return 'EB5-NonRegional'
    if 'regional center' in l:
        return 'EB5-Regional'
    if l.startswith('5th') or 'targeted employment' in l:
        return 'EB5'
    if 'certain religious' in l:
        return 'EB4-R'
    if 'other workers' in l:
        return 'EB3-OW'
    if l == '1st':
        return 'EB1'
    if l == '2nd':
        return 'EB2'
    if l == '3rd':
        return 'EB3'
    if l == '4th':
        return 'EB4'
    return None


def parse_value(raw, bulletin_date_iso):
    v = clean(raw)
    if not v:
        return None, None
    vu = v.upper()
    if vu == 'C':
        return 'CURRENT', bulletin_date_iso
    if vu == 'U':
        return 'UNAVAILABLE', None
    m = re.match(r'^(\d{2})([A-Z]{3})(\d{2})$', vu)
    if m:
        day, mon_abbr, yy = m.groups()
        mon = MONTH_ABBR.get(mon_abbr)
        if mon:
            yy_i = int(yy)
            year = (1900 + yy_i) if yy_i >= 50 else (2000 + yy_i)
            try:
                d = datetime.date(year, mon, int(day))
                return 'DATE', d.isoformat()
            except ValueError:
                return None, None
    return None, None


def main():
    with open(URL_LIST_PATH) as f:
        url_list = json.load(f)
    url_map = {(u['year'], u['month']): u['url'] for u in url_list}

    os.makedirs(BUILD_DIR, exist_ok=True)
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)
    conn = sqlite3.connect(DB_PATH)
    conn.executescript(open(SCHEMA_PATH).read())
    cur = conn.cursor()

    category_cache = {}
    for row in cur.execute("SELECT broad_category, code, id FROM categories"):
        category_cache[(row[0], row[1])] = row[2]

    area_cache = {}
    for row in cur.execute("SELECT code, id FROM chargeability_areas"):
        area_cache[row[0]] = row[1]

    def get_category_id(broad_category, code, name=None):
        key = (broad_category, code)
        if key in category_cache:
            return category_cache[key]
        cur.execute(
            "INSERT OR IGNORE INTO categories (broad_category, code, name) VALUES (?,?,?)",
            (broad_category, code, name or code),
        )
        cur.execute(
            "SELECT id FROM categories WHERE broad_category=? AND code=?", (broad_category, code)
        )
        cid = cur.fetchone()[0]
        category_cache[key] = cid
        return cid

    def get_area_id(code, name):
        if code in area_cache:
            return area_cache[code]
        cur.execute("INSERT OR IGNORE INTO chargeability_areas (code, name) VALUES (?,?)", (code, name))
        cur.execute("SELECT id FROM chargeability_areas WHERE code=?", (code,))
        aid = cur.fetchone()[0]
        area_cache[code] = aid
        return aid

    files = sorted(f for f in os.listdir(RAW_DIR) if f.endswith('.md'))

    total_rows_inserted = 0
    files_with_no_tables = []
    files_with_family_only_final = []
    unrecognized_categories = set()
    row_count_by_file = {}

    for fname in files:
        year, month = fname[:-3].split('-')
        year, month = int(year), int(month)
        bulletin_date_iso = f"{year:04d}-{month:02d}-01"
        source_url = url_map.get((year, month), '')

        cur.execute(
            "INSERT OR IGNORE INTO bulletins (bulletin_year, bulletin_month, bulletin_date, source_url) VALUES (?,?,?,?)",
            (year, month, bulletin_date_iso, source_url),
        )
        cur.execute(
            "SELECT id FROM bulletins WHERE bulletin_year=? AND bulletin_month=?", (year, month)
        )
        bulletin_id = cur.fetchone()[0]

        with open(os.path.join(RAW_DIR, fname), encoding='utf-8') as f:
            text = f.read()
        text_upper = text.upper()

        tables = find_tables(text)
        if not tables:
            files_with_no_tables.append(fname)
            continue

        # map each table's start_line back to a character index in `text`
        # (needed for classify_table_type, which works on char offsets)
        lines = text.split('\n')
        line_char_offsets = [0]
        for ln in lines:
            line_char_offsets.append(line_char_offsets[-1] + len(ln) + 1)

        n_rows_this_file = 0
        table_types_seen = set()

        for t in tables:
            header = t['header']
            rows_local = t['rows']
            # Some pages render an empty header row (all blank cells) with the
            # real column labels as the first data row instead. Detect and fix.
            if header and all(not h.strip() for h in header) and rows_local:
                header = rows_local[0]
                rows_local = rows_local[1:]
            t = dict(t)
            t['header'] = header
            t['rows'] = rows_local
            if len(header) < 2:
                continue
            first_cell = header[0].lower()
            if 'family' in first_cell:
                broad_category = 'Family-Sponsored'
            elif 'employment' in first_cell:
                broad_category = 'Employment-Based'
            else:
                continue  # not one of our 4 target tables (e.g. DV region table)

            start_char = line_char_offsets[t['start_line']]
            table_type = classify_table_type(text_upper, start_char)
            table_types_seen.add((broad_category, table_type))

            # Precompute area id for each header column (skip col 0 = category label)
            area_ids = [None]
            for col in header[1:]:
                code, name = normalize_area(col)
                if code is None:
                    area_ids.append(None)
                else:
                    area_ids.append(get_area_id(code, name))

            for row in t['rows']:
                if len(row) != len(header):
                    continue
                raw_cat = row[0]
                if broad_category == 'Family-Sponsored':
                    cat_code = normalize_family_category(raw_cat)
                    cat_name = cat_code
                else:
                    cat_code = normalize_employment_category(raw_cat)
                    cat_name = raw_cat
                if cat_code is None:
                    if raw_cat and not re.match(r'^\*|note|section|employment|family', raw_cat, re.I):
                        unrecognized_categories.add((fname, raw_cat))
                    continue
                category_id = get_category_id(broad_category, cat_code, cat_name)

                for idx in range(1, len(row)):
                    area_id = area_ids[idx]
                    if area_id is None:
                        continue
                    status, priority_date = parse_value(row[idx], bulletin_date_iso)
                    if status is None:
                        continue
                    cur.execute(
                        """INSERT OR REPLACE INTO visa_dates
                           (bulletin_id, category_id, area_id, table_type, status, priority_date, raw_value)
                           VALUES (?,?,?,?,?,?,?)""",
                        (bulletin_id, category_id, area_id, table_type, status, priority_date, clean(row[idx])),
                    )
                    n_rows_this_file += 1
                    total_rows_inserted += 1

        if ('Family-Sponsored', 'Dates for Filing') not in table_types_seen and \
           ('Employment-Based', 'Dates for Filing') not in table_types_seen:
            files_with_family_only_final.append(fname)

        row_count_by_file[fname] = n_rows_this_file

    conn.commit()

    # ---- Report ----
    print(f"Files processed: {len(files)}")
    print(f"Total visa_dates rows inserted: {total_rows_inserted}")
    print(f"Files with zero tables found: {len(files_with_no_tables)} -> {files_with_no_tables}")
    print(f"Files with only Final Action tables (no Filing tables, expected pre-Oct-2015): "
          f"{len(files_with_family_only_final)} -> {files_with_family_only_final}")
    low_row_files = {k: v for k, v in row_count_by_file.items() if v < 30}
    print(f"Files with suspiciously few rows (<30): {low_row_files}")
    if unrecognized_categories:
        print(f"Unrecognized category labels ({len(unrecognized_categories)}):")
        for item in sorted(unrecognized_categories):
            print("   ", item)

    cur.execute("SELECT COUNT(*) FROM bulletins")
    print("bulletins rows:", cur.fetchone()[0])
    cur.execute("SELECT COUNT(*) FROM categories")
    print("categories rows:", cur.fetchone()[0])
    cur.execute("SELECT COUNT(*) FROM chargeability_areas")
    print("chargeability_areas rows:", cur.fetchone()[0])
    cur.execute("SELECT COUNT(*) FROM visa_dates")
    print("visa_dates rows:", cur.fetchone()[0])

    conn.close()


if __name__ == '__main__':
    main()
