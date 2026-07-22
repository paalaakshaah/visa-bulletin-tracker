import { NextResponse } from 'next/server';
import { getDb } from '../../../lib/db';

// GET /api/trend?categories=F1,EB2&areas=CHINA,INDIA&table_type=Final%20Action
// Returns the full historical time series for every (category, chargeability
// area) pair in the cross product of the given lists, for the trend chart.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const categoriesParam = searchParams.get('categories');
  const areasParam = searchParams.get('areas');
  const tableType = searchParams.get('table_type') || 'Final Action';

  if (!categoriesParam || !areasParam) {
    return NextResponse.json(
      { error: 'Query params "categories" and "areas" are required.' },
      { status: 400 }
    );
  }

  const categoryList = categoriesParam.split(',').map((s) => s.trim()).filter(Boolean);
  const areaList = areasParam.split(',').map((s) => s.trim()).filter(Boolean);
  if (categoryList.length === 0 || areaList.length === 0) {
    return NextResponse.json({ error: 'No categories or areas provided.' }, { status: 400 });
  }

  const db = getDb();
  const categoryPlaceholders = categoryList.map(() => '?').join(',');
  const areaPlaceholders = areaList.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT bulletin_date, category, chargeability_area, status, priority_date, raw_value
       FROM visa_dates_flat
       WHERE table_type = ?
         AND category IN (${categoryPlaceholders})
         AND chargeability_area IN (${areaPlaceholders})
       ORDER BY bulletin_date`
    )
    .all(tableType, ...categoryList, ...areaList);

  return NextResponse.json({
    table_type: tableType,
    categories: categoryList,
    areas: areaList,
    rows,
  });
}
