import { NextResponse } from 'next/server';
import { getDb } from '../../../lib/db';

// GET /api/meta
// Returns the list of available bulletin months, categories, and
// chargeability areas, so the frontend can populate its filter dropdowns.
export async function GET() {
  const db = getDb();

  const months = db
    .prepare('SELECT bulletin_date FROM bulletins ORDER BY bulletin_date')
    .all()
    .map((r) => r.bulletin_date);

  const categories = db
    .prepare(
      'SELECT broad_category, code, name FROM categories ORDER BY broad_category, sort_order, code'
    )
    .all();

  const areas = db
    .prepare('SELECT code, name FROM chargeability_areas ORDER BY code')
    .all();

  const latest = months.length ? months[months.length - 1] : null;

  return NextResponse.json({ months, categories, areas, latest });
}
