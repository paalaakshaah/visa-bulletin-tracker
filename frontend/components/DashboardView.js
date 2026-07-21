'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AREA_LABELS,
  TABLE_TYPES,
  formatMonthLabel,
  formatPriorityDate,
  inferBroadCategory,
  sortAreas,
} from '../lib/constants';

function Cell({ row }) {
  if (!row) {
    return <td className="px-3 py-2 text-center text-slate-300 text-sm">&mdash;</td>;
  }
  if (row.status === 'CURRENT') {
    return (
      <td className="px-3 py-2 text-center text-sm">
        <span className="inline-block rounded-full bg-green-100 text-green-700 font-medium px-2 py-0.5">
          Current
        </span>
      </td>
    );
  }
  if (row.status === 'UNAVAILABLE') {
    return (
      <td className="px-3 py-2 text-center text-sm">
        <span className="inline-block rounded-full bg-red-100 text-red-700 font-medium px-2 py-0.5">
          Unavailable
        </span>
      </td>
    );
  }
  return (
    <td className="px-3 py-2 text-center text-sm text-slate-700 font-mono">
      {formatPriorityDate(row.priority_date)}
    </td>
  );
}

export default function DashboardView({ meta, profile }) {
  const [bulletinDate, setBulletinDate] = useState(meta.latest);
  const [tableType, setTableType] = useState('Final Action');
  const [broadFilter, setBroadFilter] = useState(
    profile?.category ? inferBroadCategory(profile.category) : 'Employment-Based'
  );
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ bulletin_date: bulletinDate, table_type: tableType });
    fetch(`/api/dashboard?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      });
  }, [bulletinDate, tableType]);

  const grouped = useMemo(() => {
    if (!data) return { areas: [], families: [], employments: [] };
    const areaSet = new Set();
    const byCategory = new Map(); // category code -> { broad_category, category_name, cells: Map(area -> row) }

    for (const row of data.rows) {
      areaSet.add(row.chargeability_area);
      if (!byCategory.has(row.category)) {
        byCategory.set(row.category, {
          broad_category: row.broad_category,
          category: row.category,
          category_name: row.category_name,
          cells: new Map(),
        });
      }
      byCategory.get(row.category).cells.set(row.chargeability_area, row);
    }

    const areas = sortAreas([...areaSet]);
    const all = [...byCategory.values()];
    const families = all.filter((c) => c.broad_category === 'Family-Sponsored');
    const employments = all.filter((c) => c.broad_category === 'Employment-Based');
    return { areas, families, employments };
  }, [data]);

  const showFamily = broadFilter === 'All' || broadFilter === 'Family-Sponsored';
  const showEmployment = broadFilter === 'All' || broadFilter === 'Employment-Based';

  function renderTable(title, categories) {
    if (categories.length === 0) return null;
    return (
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-slate-800 mb-2">{title}</h2>
        <div className="overflow-x-auto rounded-lg border border-slate-200 shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 bg-white">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Category
                </th>
                {grouped.areas.map((a) => (
                  <th
                    key={a}
                    className="px-3 py-2 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap"
                  >
                    {AREA_LABELS[a] || a}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {categories.map((c) => (
                <tr key={c.category} className="hover:bg-slate-50">
                  <td className="px-3 py-2 text-sm font-medium text-slate-800 whitespace-nowrap">
                    {c.category_name || c.category}
                  </td>
                  {grouped.areas.map((a) => (
                    <Cell key={a} row={c.cells.get(a)} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-end gap-4 mb-6">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Bulletin Month</label>
          <select
            value={bulletinDate}
            onChange={(e) => setBulletinDate(e.target.value)}
            className="rounded-md border-slate-300 text-sm py-1.5 pl-2 pr-8 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
            {[...meta.months].reverse().map((m) => (
              <option key={m} value={m}>
                {formatMonthLabel(m)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Chart Type</label>
          <div className="inline-flex rounded-md shadow-sm border border-slate-300 overflow-hidden">
            {TABLE_TYPES.map((tt) => (
              <button
                key={tt}
                onClick={() => setTableType(tt)}
                className={`px-3 py-1.5 text-sm font-medium ${
                  tableType === tt
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {tt === 'Final Action' ? 'Final Action Dates' : 'Dates for Filing'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Category Group</label>
          <div className="inline-flex rounded-md shadow-sm border border-slate-300 overflow-hidden">
            {['All', 'Family-Sponsored', 'Employment-Based'].map((f) => (
              <button
                key={f}
                onClick={() => setBroadFilter(f)}
                className={`px-3 py-1.5 text-sm font-medium ${
                  broadFilter === f
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {f === 'All' ? 'All' : f === 'Family-Sponsored' ? 'Family' : 'Employment'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading && <div className="text-slate-400 text-sm">Loading&hellip;</div>}

      {!loading && data && (
        <>
          {showFamily && renderTable('Family-Sponsored Preferences', grouped.families)}
          {showEmployment && renderTable('Employment-Based Preferences', grouped.employments)}
          {grouped.families.length === 0 && grouped.employments.length === 0 && (
            <div className="text-slate-400 text-sm">No data for this month.</div>
          )}
        </>
      )}
    </div>
  );
}
