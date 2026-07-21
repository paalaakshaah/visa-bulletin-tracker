'use client';

import { useEffect, useMemo, useState } from 'react';
import TrendChart from './TrendChart';
import { AREA_LABELS, TABLE_TYPES, inferBroadCategory, sortAreas } from '../lib/constants';

export default function TrendsView({ meta, profile }) {
  const familyCategories = meta.categories.filter((c) => c.broad_category === 'Family-Sponsored');
  const employmentCategories = meta.categories.filter(
    (c) => c.broad_category === 'Employment-Based'
  );

  const [broadFilter, setBroadFilter] = useState(
    profile?.category ? inferBroadCategory(profile.category) : 'Employment-Based'
  );
  const [category, setCategory] = useState(
    profile?.category ||
      employmentCategories.find((c) => c.code === 'EB2')?.code ||
      employmentCategories[0]?.code ||
      ''
  );
  const [tableType, setTableType] = useState('Final Action');
  const [selectedAreas, setSelectedAreas] = useState(() => {
    const defaults = ['ALL', 'CHINA', 'INDIA'];
    if (profile?.area && !defaults.includes(profile.area)) {
      return [...defaults, profile.area];
    }
    return defaults;
  });
  const [rawRows, setRawRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const categoryOptions = broadFilter === 'Family-Sponsored' ? familyCategories : employmentCategories;
  const areaOptions = sortAreas(meta.areas.map((a) => a.code));

  // Keep `category` valid whenever the broad group changes.
  useEffect(() => {
    if (!categoryOptions.find((c) => c.code === category)) {
      setCategory(categoryOptions[0]?.code || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [broadFilter]);

  useEffect(() => {
    if (!category || selectedAreas.length === 0) {
      setRawRows([]);
      return;
    }
    setLoading(true);
    const params = new URLSearchParams({
      category,
      areas: selectedAreas.join(','),
      table_type: tableType,
    });
    fetch(`/api/trend?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setRawRows(d.rows || []);
        setLoading(false);
      });
  }, [category, selectedAreas, tableType]);

  const showYouAreHere = Boolean(
    profile?.category &&
      profile.category === category &&
      profile.area &&
      selectedAreas.includes(profile.area) &&
      profile.priorityDate
  );
  const priorityTs = showYouAreHere ? Date.parse(profile.priorityDate + 'T00:00:00Z') : null;
  const targetArea = showYouAreHere ? profile.area : null;

  const { chartData, yDomain, youAreHere } = useMemo(() => {
    const byDate = new Map();
    let min = Infinity;
    let max = -Infinity;

    for (const row of rawRows) {
      if (!byDate.has(row.bulletin_date)) {
        byDate.set(row.bulletin_date, { bulletin_date: row.bulletin_date });
      }
      const point = byDate.get(row.bulletin_date);
      point[`${row.chargeability_area}_status`] = row.status;
      point[`${row.chargeability_area}_raw`] = row.raw_value;
      if (row.priority_date) {
        const ts = Date.parse(row.priority_date + 'T00:00:00Z');
        point[`${row.chargeability_area}_ts`] = ts;
        if (ts < min) min = ts;
        if (ts > max) max = ts;
      }
    }

    const data = [...byDate.values()].sort((a, b) => (a.bulletin_date < b.bulletin_date ? -1 : 1));

    // The dot marks the user's own priority date (y = priorityTs exactly),
    // placed at the month on their country's line where that cut-off first
    // reaches/passes it, so it sits right on the line. If the cut-off
    // hasn't reached it yet, there is no such point -- instead we mark the
    // most recent month with a hollow dot plus a dashed connector down to
    // where the line actually is, so the (possibly large) gap reads as
    // "not current yet" rather than a stray, disconnected marker.
    let dot = null;
    if (priorityTs != null && targetArea) {
      const reached = data.find((p) => {
        const ts = p[`${targetArea}_ts`];
        return ts != null && ts >= priorityTs;
      });
      if (reached) {
        dot = { x: reached.bulletin_date, y: priorityTs, area: targetArea, reached: true };
      } else {
        for (let i = data.length - 1; i >= 0; i--) {
          const ts = data[i][`${targetArea}_ts`];
          if (ts != null) {
            dot = { x: data[i].bulletin_date, y: priorityTs, area: targetArea, reached: false, lineY: ts };
            break;
          }
        }
      }
    }

    if (dot != null) {
      if (dot.y < min) min = dot.y;
      if (dot.y > max) max = dot.y;
    }

    if (min === Infinity) {
      return { chartData: data, yDomain: ['auto', 'auto'], youAreHere: dot };
    }
    const pad = Math.max((max - min) * 0.05, 1000 * 60 * 60 * 24 * 30);
    return { chartData: data, yDomain: [min - pad, max + pad], youAreHere: dot };
  }, [rawRows, priorityTs, targetArea]);

  function toggleArea(code) {
    setSelectedAreas((prev) =>
      prev.includes(code) ? prev.filter((a) => a !== code) : [...prev, code]
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-start gap-6 mb-6">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Category Group</label>
          <div className="inline-flex rounded-md shadow-sm border border-slate-300 overflow-hidden">
            {['Family-Sponsored', 'Employment-Based'].map((f) => (
              <button
                key={f}
                onClick={() => setBroadFilter(f)}
                className={`px-3 py-1.5 text-sm font-medium ${
                  broadFilter === f
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {f === 'Family-Sponsored' ? 'Family' : 'Employment'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-md border-slate-300 text-sm py-1.5 pl-2 pr-8 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
            {categoryOptions.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name || c.code}
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
          <label className="block text-xs font-medium text-slate-500 mb-1">Countries</label>
          <div className="flex flex-wrap gap-2 max-w-md">
            {areaOptions.map((code) => (
              <label
                key={code}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs cursor-pointer select-none ${
                  selectedAreas.includes(code)
                    ? 'bg-blue-50 border-blue-300 text-blue-700'
                    : 'bg-white border-slate-300 text-slate-600'
                }`}
              >
                <input
                  type="checkbox"
                  className="hidden"
                  checked={selectedAreas.includes(code)}
                  onChange={() => toggleArea(code)}
                />
                {AREA_LABELS[code] || code}
              </label>
            ))}
          </div>
        </div>
      </div>

      {profile?.category && !showYouAreHere && (
        <p className="text-xs text-amber-600 mb-3">
          {profile.category !== category
            ? `Switch the Category above to ${profile.category} to see your priority date marked on the chart.`
            : `Select ${AREA_LABELS[profile.area] || profile.area} under Countries above to see your priority date marked on the chart.`}
        </p>
      )}

      <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
        {loading ? (
          <div className="text-slate-400 text-sm py-12 text-center">Loading&hellip;</div>
        ) : (
          <TrendChart data={chartData} areas={selectedAreas} yDomain={yDomain} youAreHere={youAreHere} />
        )}
        <p className="text-xs text-slate-400 mt-2">
          Drag the handles below the chart to zoom into a date range. Y-axis shows the published
          cut-off priority date; gaps indicate the category was &ldquo;Unavailable&rdquo; that month.
        </p>
      </div>
    </div>
  );
}
