import { NextResponse } from 'next/server';
import { getDb } from '../../../lib/db';

const MS_PER_DAY = 1000 * 60 * 60 * 24;

// Compares a cell to the same category/area cell from the previous bulletin
// and classifies the movement. `delta_days` is only meaningful when both
// months are real cut-off dates (positive = date advanced = good news,
// negative = retrogression = bad news).
function computeMovement(curr, prev) {
  if (!prev) return { movement: 'NEW', delta_days: null };

  if (curr.status === 'CURRENT' && prev.status === 'CURRENT') {
    return { movement: 'NO_CHANGE', delta_days: null };
  }
  if (curr.status === 'UNAVAILABLE' && prev.status === 'UNAVAILABLE') {
    return { movement: 'NO_CHANGE', delta_days: null };
  }
  if (curr.status === 'CURRENT' && prev.status !== 'CURRENT') {
    return { movement: 'BECAME_CURRENT', delta_days: null };
  }
  if (curr.status !== 'CURRENT' && prev.status === 'CURRENT') {
    return { movement: 'LOST_CURRENT', delta_days: null };
  }
  if (curr.status === 'UNAVAILABLE' && prev.status !== 'UNAVAILABLE') {
    return { movement: 'BECAME_UNAVAILABLE', delta_days: null };
  }
  if (curr.status !== 'UNAVAILABLE' && prev.status === 'UNAVAILABLE') {
    return { movement: 'BECAME_AVAILABLE', delta_days: null };
  }

  // Both months are real cut-off dates.
  const deltaDays = Math.round(
    (Date.parse(curr.priority_date) - Date.parse(prev.priority_date)) / MS_PER_DAY
  );
  if (deltaDays === 0) return { movement: 'NO_CHANGE', delta_days: 0 };
  return { movement: deltaDays > 0 ? 'ADVANCED' : 'RETROGRESSED', delta_days: deltaDays };
}

// GET /api/dashboard?bulletin_date=2026-06-01&table_type=Final%20Action
// Returns every category x chargeability-area cell for one bulletin month,
// for the main dashboard grid, each annotated with how it moved relative to
// the previous bulletin. Defaults to the latest available month and the
// "Final Action" table if not specified.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const requestedDate = searchParams.get('bulletin_date');
  const tableType = searchParams.get('table_type') || 'Final Action';

  const db = getDb();

  const bulletinDate =
    requestedDate ||
    db.prepare('SELECT MAX(bulletin_date) AS d FROM bulletins').get().d;

  const previousDate = db
    .prepare('SELECT MAX(bulletin_date) AS d FROM bulletins WHERE bulletin_date < ?')
    .get(bulletinDate).d;

  const selectRows = db.prepare(
    `SELECT broad_category, category, category_name, chargeability_area,
            chargeability_area_name, status, priority_date, raw_value
     FROM visa_dates_flat
     WHERE bulletin_date = ? AND table_type = ?
     ORDER BY broad_category, category, chargeability_area`
  );

  const rows = selectRows.all(bulletinDate, tableType);

  const previousByKey = new Map();
  if (previousDate) {
    for (const row of selectRows.all(previousDate, tableType)) {
      previousByKey.set(`${row.category}|${row.chargeability_area}`, row);
    }
  }

  for (const row of rows) {
    const prev = previousByKey.get(`${row.category}|${row.chargeability_area}`);
    Object.assign(row, computeMovement(row, prev));
  }

  return NextResponse.json({
    bulletin_date: bulletinDate,
    previous_bulletin_date: previousDate,
    table_type: tableType,
    rows,
  });
}
