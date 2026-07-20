import { NextResponse } from 'next/server';
import { getDb } from '../../../lib/db';

// GET /api/trend?category=F1&areas=CHINA,INDIA&table_type=Final%20Action
// Returns the full historical time series for one category across one or
// more chargeability areas, for the trend chart.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category');
  const areasParam = searchParams.get('areas');
  const tableType = searchParams.get('table_type') || 'Final Action';

  if (!category || !areasParam) {
    return NextResponse.json(
      { error: 'Query params "category" and "areas" are required.' },
      { status: 400 }
    );
  }

  const areaList = areasParam.split(',').map((s) => s.trim()).filter(Boolean);
  if (areaList.length === 0) {
    return NextResponse.json({ error: 'No areas provided.' }, { status: 400 });
  }

  const db = getDb();
  const placeholders = areaList.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT bulletin_date, chargeability_area, status, priority_date, raw_value
       FROM visa_dates_flat
       WHERE category = ? AND table_type = ? AND chargeability_area IN (${placeholders})
       ORDER BY bulletin_date`
    )
    .all(category, tableType, ...areaList);

  return NextResponse.json({ category, table_type: tableType, areas: areaList, rows });
}
