import { NextResponse } from 'next/server';
import { getDb } from '../../../lib/db';

// GET /api/dashboard?bulletin_date=2026-06-01&table_type=Final%20Action
// Returns every category x chargeability-area cell for one bulletin month,
// for the main dashboard grid. Defaults to the latest available month and
// the "Final Action" table if not specified.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const requestedDate = searchParams.get('bulletin_date');
  const tableType = searchParams.get('table_type') || 'Final Action';

  const db = getDb();

  const bulletinDate =
    requestedDate ||
    db.prepare('SELECT MAX(bulletin_date) AS d FROM bulletins').get().d;

  const rows = db
    .prepare(
      `SELECT broad_category, category, category_name, chargeability_area,
              chargeability_area_name, status, priority_date, raw_value
       FROM visa_dates_flat
       WHERE bulletin_date = ? AND table_type = ?
       ORDER BY broad_category, category, chargeability_area`
    )
    .all(bulletinDate, tableType);

  return NextResponse.json({ bulletin_date: bulletinDate, table_type: tableType, rows });
}
