#!/usr/bin/env python3
"""
U.S. Visa Bulletin scraper.

Crawls travel.state.gov's monthly Visa Bulletin pages from START_YEAR/START_MONTH
through END_YEAR/END_MONTH, extracts the four preference-date tables from each
page, and loads the results into a local SQLite database (see db/schema.sql).

    FINAL ACTION DATES FOR FAMILY-SPONSORED PREFERENCE CASES
    DATES FOR FILING FAMILY-SPONSORED VISA APPLICATIONS
    FINAL ACTION DATES FOR EMPLOYMENT-BASED PREFERENCE CASES
    DATES FOR FILING OF EMPLOYMENT-BASED VISA APPLICATIONS

URL structure:
    https://travel.state.gov/content/travel/en/legal/visa-law0/visa-bulletin/{folder_year}/visa-bulletin-for-{month}-{filename_year}.html

For October/November/December, the bulletin is filed under the *next* fiscal
year's folder, i.e. folder_year = filename_year + 1 (e.g. "October 2013" lives
under the "2014" folder). All other months have folder_year == filename_year.

Data logic:
    "C"  -> status CURRENT, and per spec the priority_date is stored as the
            first day of that bulletin's month/year.
    "U"  -> status UNAVAILABLE, priority_date is NULL.
    date -> status DATE, priority_date is the parsed cut-off date (ISO format).

Usage:
    pip install requests beautifulsoup4 --break-system-packages
    python3 scraper.py                       # scrape full default range
    python3 scraper.py --start 2024-01 --end 2024-12
    python3 scraper.py --db ./my_visa.db --delay 1.5
"""
import argparse
import datetime
import os
import re
import sqlite3
import sys
import time

import requests
from bs4 import BeautifulSoup, NavigableString, Tag

# --------------------------------------------------------------------------
# Config
# --------------------------------------------------------------------------

BASE_URL = "https://travel.state.gov/content/travel/en/legal/visa-law0/visa-bulletin/{folder_year}/visa-bulletin-for-{month_name}-{filename_year}.html"

MONTH_NAMES = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
]
MONTH_ABBR = {
    'JAN': 1, 'FEB': 2, 'MAR': 3, 'APR': 4, 'MAY': 5, 'JUN': 6,
    'JUL': 7, 'AUG': 8, 'SEP': 9, 'OCT': 10, 'NOV': 11, 'DEC': 12,
}

DEFAULT_START = (2013, 1)
DEFAULT_END = (2026, 6)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; VisaBulletinResearchBot/1.0; "
                  "+https://travel.state.gov/content/travel/en/legal/visa-law0/visa-bulletin.html)"
}

HERE = os.path.dirname(os.path.abspath(__file__))
SCHEMA_PATH = os.path.join(os.path.dirname(HERE), "db", "schema.sql")
DEFAULT_DB_PATH = os.path.join(os.path.dirname(HERE), "db", "visa_bulletin_2013_2026.db")


# --------------------------------------------------------------------------
# URL generation
# --------------------------------------------------------------------------

def month_range(start, end):
    """Yield (year, month) tuples from start=(y,m) to end=(y,m) inclusive."""
    y, m = start
    while (y, m) <= end:
        yield y, m
        m += 1
        if m > 12:
            m = 1
            y += 1


def bulletin_url(year, month):
    month_name = MONTH_NAMES[month - 1]
    if month in (10, 11, 12):
        folder_year = year + 1
    else:
        folder_year = year
    return BASE_URL.format(folder_year=folder_year, month_name=month_name, filename_year=year)


# --------------------------------------------------------------------------
# Normalization helpers (category / area / value parsing)
# --------------------------------------------------------------------------

def clean(s):
    if s is None:
        return ""
    s = s.replace('*', '')
    s = re.sub(r'\s+', ' ', s).strip()
    return s


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
    """
    Apply the data logic rule:
      'C' -> ('CURRENT', bulletin_date_iso)   -- i.e. first of the bulletin's month/year
      'U' -> ('UNAVAILABLE', None)
      'DDMMMYY' -> ('DATE', iso date)
    Returns (None, None) if the cell can't be interpreted (blank, footnote text, etc).
    """
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


# --------------------------------------------------------------------------
# HTML table extraction
# --------------------------------------------------------------------------

def classify_table(table, full_page_text_before_fn):
    """Return (broad_category, table_type) for a <table> tag, or (None, None)
    if it isn't one of the four target tables."""
    header_row = table.find('tr')
    if header_row is None:
        return None, None, None
    header_cells = [clean(c.get_text(' ')) for c in header_row.find_all(['th', 'td'])]
    if not header_cells:
        return None, None, None
    first_cell = header_cells[0].lower()

    if 'family' in first_cell:
        broad_category = 'Family-Sponsored'
    elif 'employment' in first_cell:
        broad_category = 'Employment-Based'
    else:
        return None, None, None

    before_text = full_page_text_before_fn(table).upper()
    idx_filing = before_text.rfind('DATES FOR FILING')
    idx_final_explicit = max(
        before_text.rfind('FINAL ACTION DATES'),
        before_text.rfind('APPLICATION FINAL ACTION DATES'),
    )
    if idx_filing == -1 and idx_final_explicit == -1:
        table_type = 'Final Action'
    elif idx_filing > idx_final_explicit:
        table_type = 'Dates for Filing'
    else:
        table_type = 'Final Action'

    return broad_category, table_type, header_cells


def extract_tables(html):
    """Parse an HTML page and yield (broad_category, table_type, header_cells, rows)
    for each of the four target tables found."""
    soup = BeautifulSoup(html, 'html.parser')

    # Precompute the full page text once, and for each table use its
    # position within that text to look "backwards" for section headings.
    full_text = soup.get_text('\n')

    html_str = str(soup)

    def text_before(table_tag):
        # Locate this table's position in the full page HTML and render
        # everything before it to plain text, so we can look "backwards"
        # for the nearest section heading (e.g. "DATES FOR FILING ...").
        table_html = str(table_tag)
        pos = html_str.find(table_html)
        if pos == -1:
            return full_text
        return BeautifulSoup(html_str[:pos], 'html.parser').get_text('\n')

    for table in soup.find_all('table'):
        broad_category, table_type, header_cells = classify_table(table, text_before)
        if broad_category is None:
            continue

        rows = []
        trs = table.find_all('tr')
        # Skip the header row (assumed to be trs[0])
        for tr in trs[1:]:
            cells = [clean(c.get_text(' ')) for c in tr.find_all(['td', 'th'])]
            if cells:
                rows.append(cells)

        # Some pages render an empty header row with the real labels as the
        # first data row instead (mirrors a quirk seen in the raw markdown
        # renderer too) -- detect and fix.
        if header_cells and all(not h for h in header_cells) and rows:
            header_cells = rows[0]
            rows = rows[1:]

        yield broad_category, table_type, header_cells, rows


# --------------------------------------------------------------------------
# Fetching
# --------------------------------------------------------------------------

def fetch_page(url, session, retries=3, delay=1.0, timeout=20):
    for attempt in range(1, retries + 1):
        try:
            resp = session.get(url, headers=HEADERS, timeout=timeout)
            if resp.status_code == 200:
                return resp.text
            print(f"  [warn] HTTP {resp.status_code} for {url} (attempt {attempt}/{retries})", file=sys.stderr)
        except requests.RequestException as e:
            print(f"  [warn] request error for {url}: {e} (attempt {attempt}/{retries})", file=sys.stderr)
        time.sleep(delay * attempt)
    return None


# --------------------------------------------------------------------------
# Database
# --------------------------------------------------------------------------

class Database:
    def __init__(self, db_path, schema_path=SCHEMA_PATH):
        is_new = not os.path.exists(db_path)
        self.conn = sqlite3.connect(db_path)
        self.cur = self.conn.cursor()
        if is_new:
            with open(schema_path) as f:
                self.conn.executescript(f.read())
        else:
            # Make sure schema exists even for a pre-existing empty file.
            with open(schema_path) as f:
                self.conn.executescript(f.read())
        self._category_cache = {}
        self._area_cache = {}
        for bc, code, cid in self.cur.execute("SELECT broad_category, code, id FROM categories"):
            self._category_cache[(bc, code)] = cid
        for code, aid in self.cur.execute("SELECT code, id FROM chargeability_areas"):
            self._area_cache[code] = aid

    def get_or_create_bulletin(self, year, month, source_url):
        bulletin_date_iso = f"{year:04d}-{month:02d}-01"
        self.cur.execute(
            "INSERT OR IGNORE INTO bulletins (bulletin_year, bulletin_month, bulletin_date, source_url) "
            "VALUES (?,?,?,?)",
            (year, month, bulletin_date_iso, source_url),
        )
        self.cur.execute(
            "SELECT id FROM bulletins WHERE bulletin_year=? AND bulletin_month=?", (year, month)
        )
        return self.cur.fetchone()[0], bulletin_date_iso

    def get_category_id(self, broad_category, code, name=None):
        key = (broad_category, code)
        if key in self._category_cache:
            return self._category_cache[key]
        self.cur.execute(
            "INSERT OR IGNORE INTO categories (broad_category, code, name) VALUES (?,?,?)",
            (broad_category, code, name or code),
        )
        self.cur.execute("SELECT id FROM categories WHERE broad_category=? AND code=?", (broad_category, code))
        cid = self.cur.fetchone()[0]
        self._category_cache[key] = cid
        return cid

    def get_area_id(self, code, name):
        if code in self._area_cache:
            return self._area_cache[code]
        self.cur.execute("INSERT OR IGNORE INTO chargeability_areas (code, name) VALUES (?,?)", (code, name))
        self.cur.execute("SELECT id FROM chargeability_areas WHERE code=?", (code,))
        aid = self.cur.fetchone()[0]
        self._area_cache[code] = aid
        return aid

    def upsert_visa_date(self, bulletin_id, category_id, area_id, table_type, status, priority_date, raw_value):
        self.cur.execute(
            """INSERT OR REPLACE INTO visa_dates
               (bulletin_id, category_id, area_id, table_type, status, priority_date, raw_value)
               VALUES (?,?,?,?,?,?,?)""",
            (bulletin_id, category_id, area_id, table_type, status, priority_date, raw_value),
        )

    def commit(self):
        self.conn.commit()

    def close(self):
        self.conn.close()


# --------------------------------------------------------------------------
# Main scrape loop
# --------------------------------------------------------------------------

def scrape(start, end, db_path, delay=1.0, verbose=True):
    db = Database(db_path)
    session = requests.Session()

    total_months = 0
    total_rows = 0
    failed_urls = []

    for year, month in month_range(start, end):
        url = bulletin_url(year, month)
        if verbose:
            print(f"[{year}-{month:02d}] fetching {url}")
        html = fetch_page(url, session, delay=delay)
        if html is None:
            print(f"  [error] giving up on {url}", file=sys.stderr)
            failed_urls.append(url)
            time.sleep(delay)
            continue

        bulletin_id, bulletin_date_iso = db.get_or_create_bulletin(year, month, url)

        n_rows_this_page = 0
        for broad_category, table_type, header_cells, rows in extract_tables(html):
            if len(header_cells) < 2:
                continue

            area_ids = [None]
            for col in header_cells[1:]:
                code, name = normalize_area(col)
                area_ids.append(db.get_area_id(code, name) if code else None)

            for row in rows:
                if len(row) != len(header_cells):
                    continue
                raw_cat = row[0]
                if broad_category == 'Family-Sponsored':
                    cat_code = normalize_family_category(raw_cat)
                    cat_name = cat_code
                else:
                    cat_code = normalize_employment_category(raw_cat)
                    cat_name = raw_cat
                if cat_code is None:
                    continue
                category_id = db.get_category_id(broad_category, cat_code, cat_name)

                for idx in range(1, len(row)):
                    area_id = area_ids[idx]
                    if area_id is None:
                        continue
                    status, priority_date = parse_value(row[idx], bulletin_date_iso)
                    if status is None:
                        continue
                    db.upsert_visa_date(
                        bulletin_id, category_id, area_id, table_type,
                        status, priority_date, clean(row[idx]),
                    )
                    n_rows_this_page += 1

        db.commit()
        total_rows += n_rows_this_page
        total_months += 1
        if verbose:
            print(f"  -> {n_rows_this_page} data points saved")
        time.sleep(delay)

    db.close()

    print("\n=== Scrape summary ===")
    print(f"Months processed: {total_months}")
    print(f"Data points saved: {total_rows}")
    if failed_urls:
        print(f"Failed URLs ({len(failed_urls)}):")
        for u in failed_urls:
            print("  ", u)


def parse_ym(s):
    y, m = s.split('-')
    return int(y), int(m)


# --------------------------------------------------------------------------
# Auto mode -- for scheduled/cron use (e.g. GitHub Actions). Checks only the
# single month after whatever is already the latest one in the DB, and adds
# it if the Department of State has published it. Prints a clear marker line
# ("NEW_BULLETIN_ADDED ..." or "NO_NEW_BULLETIN") so a calling shell script
# can decide whether to commit/push.
# --------------------------------------------------------------------------

def get_latest_bulletin(db_path):
    if not os.path.exists(db_path):
        return None
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    try:
        cur.execute(
            "SELECT bulletin_year, bulletin_month FROM bulletins "
            "ORDER BY bulletin_year DESC, bulletin_month DESC LIMIT 1"
        )
        row = cur.fetchone()
    except sqlite3.OperationalError:
        row = None
    conn.close()
    return row


def next_month(year, month):
    month += 1
    if month > 12:
        month = 1
        year += 1
    return year, month


def update_url_list(year, month, url):
    """Best-effort: append the new month to scraper/url_list.json if present."""
    url_list_path = os.path.join(HERE, "url_list.json")
    if not os.path.exists(url_list_path):
        return
    import json
    try:
        with open(url_list_path) as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError):
        return
    if any(e.get("year") == year and e.get("month") == month for e in data):
        return
    data.append({
        "year": year,
        "month": month,
        "month_name": MONTH_NAMES[month - 1],
        "url": url,
    })
    with open(url_list_path, "w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")


def scrape_auto(db_path, delay=1.0):
    latest = get_latest_bulletin(db_path)
    if latest is None:
        print(
            "NO_BASELINE: --db has no bulletins yet. Run a full scrape first "
            "(e.g. `python3 scraper.py --db " + db_path + "`) before using --auto.",
            file=sys.stderr,
        )
        sys.exit(1)

    year, month = next_month(*latest)
    url = bulletin_url(year, month)
    print(f"[auto] latest in db: {latest[0]}-{latest[1]:02d}; checking {year}-{month:02d} -> {url}")

    session = requests.Session()
    html = fetch_page(url, session, retries=2, delay=delay)
    if html is None:
        print("NO_NEW_BULLETIN")
        return

    db = Database(db_path)
    bulletin_id, bulletin_date_iso = db.get_or_create_bulletin(year, month, url)

    n_rows = 0
    for broad_category, table_type, header_cells, rows in extract_tables(html):
        if len(header_cells) < 2:
            continue
        area_ids = [None]
        for col in header_cells[1:]:
            code, name = normalize_area(col)
            area_ids.append(db.get_area_id(code, name) if code else None)
        for row in rows:
            if len(row) != len(header_cells):
                continue
            raw_cat = row[0]
            if broad_category == 'Family-Sponsored':
                cat_code = normalize_family_category(raw_cat)
                cat_name = cat_code
            else:
                cat_code = normalize_employment_category(raw_cat)
                cat_name = raw_cat
            if cat_code is None:
                continue
            category_id = db.get_category_id(broad_category, cat_code, cat_name)
            for idx in range(1, len(row)):
                area_id = area_ids[idx]
                if area_id is None:
                    continue
                status, priority_date = parse_value(row[idx], bulletin_date_iso)
                if status is None:
                    continue
                db.upsert_visa_date(
                    bulletin_id, category_id, area_id, table_type,
                    status, priority_date, clean(row[idx]),
                )
                n_rows += 1

    db.commit()
    db.close()

    if n_rows < 30:
        print(f"WARNING: only {n_rows} rows parsed for {year}-{month:02d} -- possible parsing issue", file=sys.stderr)

    update_url_list(year, month, url)
    print(f"NEW_BULLETIN_ADDED {year}-{month:02d} ({n_rows} rows)")


def main():
    ap = argparse.ArgumentParser(description="Scrape historical U.S. Visa Bulletin data into SQLite.")
    ap.add_argument('--start', default=f"{DEFAULT_START[0]}-{DEFAULT_START[1]:02d}",
                     help="Start month, YYYY-MM (default 2013-01)")
    ap.add_argument('--end', default=f"{DEFAULT_END[0]}-{DEFAULT_END[1]:02d}",
                     help="End month, YYYY-MM (default 2026-06)")
    ap.add_argument('--db', default=DEFAULT_DB_PATH, help="Path to SQLite DB file")
    ap.add_argument('--delay', type=float, default=1.0, help="Seconds to wait between requests")
    ap.add_argument('--auto', action='store_true',
                     help="Check only for the single month after the latest one already in --db, "
                          "and add it if published. Prints NEW_BULLETIN_ADDED / NO_NEW_BULLETIN. "
                          "Intended for scheduled/cron use (e.g. GitHub Actions).")
    args = ap.parse_args()

    if args.auto:
        scrape_auto(args.db, delay=args.delay)
        return

    start = parse_ym(args.start)
    end = parse_ym(args.end)
    scrape(start, end, args.db, delay=args.delay)


if __name__ == '__main__':
    main()
