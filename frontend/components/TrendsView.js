'use client';

import { useEffect, useMemo, useState } from 'react';
import { track } from '@vercel/analytics';
import posthog from 'posthog-js';
import TrendChart from './TrendChart';
import { AREA_LABELS, TABLE_TYPES, inferBroadCategory, sortAreas } from '../lib/constants';

const SERIES_KEY_SEP = '::';

export default function TrendsView({ meta, profile }) {
  const familyCategories = meta.categories.filter((c) => c.broad_category === 'Family-Sponsored');
  const employmentCategories = meta.categories.filter(
    (c) => c.broad_category === 'Employment-Based'
  );
  const categoryLabels = useMemo(() => {
    const map = {};
    for (const c of meta.categories) map[c.code] = c.name || c.code;
    return map;
  }, [meta.categories]);

  const [tableType, setTableType] = useState('Final Action');
  const [selectedCategories, setSelectedCategories] = useState(
    profile?.category ? [profile.category] : ['EB1']
  );
  const [selectedAreas, setSelectedAreas] = useState(profile?.area ? [profile.area] : ['ALL']);
  const [categoryGroupView, setCategoryGroupView] = useState(
    profile?.category ? inferBroadCategory(profile.category) : 'Employment-Based'
  );
  const [rawRows, setRawRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const areaOptions = sortAreas(meta.areas.map((a) => a.code));

  useEffect(() => {
    if (selectedCategories.length === 0 || selectedAreas.length === 0) {
      setRawRows([]);
      return;
    }
    setLoading(true);
    const params = new URLSearchParams({
      categories: selectedCategories.join(','),
      areas: selectedAreas.join(','),
      table_type: tableType,
    });
    fetch(`/api/trend?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setRawRows(d.rows || []);
        setLoading(false);
      });
  }, [selectedCategories, selectedAreas, tableType]);

  const seriesList = useMemo(() => {
    const list = [];
    for (const cat of selectedCategories) {
      for (const area of selectedAreas) {
        list.push(`${cat}${SERIES_KEY_SEP}${area}`);
      }
    }
    return list;
  }, [selectedCategories, selectedAreas]);

  const seriesLabels = useMemo(() => {
    const map = {};
    for (const cat of selectedCategories) {
      for (const area of selectedAreas) {
        map[`${cat}${SERIES_KEY_SEP}${area}`] =
          `${cat} · ${AREA_LABELS[area] || area}`;
      }
    }
    return map;
  }, [selectedCategories, selectedAreas]);

  const showYouAreHere = Boolean(
    profile?.category &&
      profile?.area &&
      profile.priorityDate &&
      selectedCategories.includes(profile.category) &&
      selectedAreas.includes(profile.area)
  );
  const priorityTs = showYouAreHere ? Date.parse(profile.priorityDate + 'T00:00:00Z') : null;
  const targetSeriesKey = showYouAreHere
    ? `${profile.category}${SERIES_KEY_SEP}${profile.area}`
    : null;

  const { chartData, yDomain, youAreHere } = useMemo(() => {
    const byDate = new Map();
    let min = Infinity;
    let max = -Infinity;

    for (const row of rawRows) {
      const key = `${row.category}${SERIES_KEY_SEP}${row.chargeability_area}`;
      if (!byDate.has(row.bulletin_date)) {
        byDate.set(row.bulletin_date, { bulletin_date: row.bulletin_date });
      }
      const point = byDate.get(row.bulletin_date);
      point[`${key}_status`] = row.status;
      point[`${key}_raw`] = row.raw_value;
      if (row.priority_date) {
        const ts = Date.parse(row.priority_date + 'T00:00:00Z');
        point[`${key}_ts`] = ts;
        if (ts < min) min = ts;
        if (ts > max) max = ts;
      }
    }

    const data = [...byDate.values()].sort((a, b) => (a.bulletin_date < b.bulletin_date ? -1 : 1));

    // The dot marks the user's own priority date (y = priorityTs exactly),
    // placed at the month on their own category+country series where that
    // cut-off first reaches/passes it, so it sits right on the line. If the
    // cut-off hasn't reached it yet, there is no such point -- instead we
    // mark the most recent month with a hollow dot plus a dashed connector
    // down to where the line actually is, so the (possibly large) gap reads
    // as "not current yet" rather than a stray, disconnected marker.
    let dot = null;
    if (priorityTs != null && targetSeriesKey) {
      const reached = data.find((p) => {
        const ts = p[`${targetSeriesKey}_ts`];
        return ts != null && ts >= priorityTs;
      });
      if (reached) {
        dot = { x: reached.bulletin_date, y: priorityTs, seriesKey: targetSeriesKey, reached: true };
      } else {
        for (let i = data.length - 1; i >= 0; i--) {
          const ts = data[i][`${targetSeriesKey}_ts`];
          if (ts != null) {
            dot = {
              x: data[i].bulletin_date,
              y: priorityTs,
              seriesKey: targetSeriesKey,
              reached: false,
              lineY: ts,
            };
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
  }, [rawRows, priorityTs, targetSeriesKey]);

  function toggleArea(code) {
    setSelectedAreas((prev) => {
      const adding = !prev.includes(code);
      track('country_selected', { country: code, selected: adding });
      posthog.capture('country_selected', { country: code, selected: adding });
      return adding ? [...prev, code] : prev.filter((a) => a !== code);
    });
  }

  function toggleCategory(code) {
    setSelectedCategories((prev) => {
      const adding = !prev.includes(code);
      track('category_selected', { category: code, selected: adding });
      posthog.capture('category_selected', { category: code, selected: adding });
      return adding ? [...prev, code] : prev.filter((c) => c !== code);
    });
  }

  function handleChartTypeChange(tt) {
    posthog.capture('chart_type_changed', { chart_type: tt });
    setTableType(tt);
  }

  let youAreHereHint = null;
  if (profile?.category && profile?.area) {
    if (!selectedCategories.includes(profile.category) && !selectedAreas.includes(profile.area)) {
      youAreHereHint = `Select ${profile.category} and ${AREA_LABELS[profile.area] || profile.area} below to see your priority date marked on the chart.`;
    } else if (!selectedCategories.includes(profile.category)) {
      youAreHereHint = `Select ${profile.category} below to see your priority date marked on the chart.`;
    } else if (!selectedAreas.includes(profile.area)) {
      youAreHereHint = `Select ${AREA_LABELS[profile.area] || profile.area} below to see your priority date marked on the chart.`;
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-start gap-6 mb-4">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Chart Type</label>
          <div className="inline-flex rounded-md shadow-sm border border-slate-300 overflow-hidden">
            {TABLE_TYPES.map((tt) => (
              <button
                key={tt}
                onClick={() => handleChartTypeChange(tt)}
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
          <div className="flex flex-wrap gap-2 max-w-2xl">
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

      <div className="mb-4">
        <div className="flex items-center gap-3 mb-2">
          <label className="text-xs font-medium text-slate-500">Categories</label>
          <div className="inline-flex rounded-md shadow-sm border border-slate-300 overflow-hidden">
            {['Family-Sponsored', 'Employment-Based'].map((f) => (
              <button
                key={f}
                onClick={() => setCategoryGroupView(f)}
                className={`px-3 py-1 text-xs font-medium ${
                  categoryGroupView === f
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {f === 'Family-Sponsored' ? 'Family' : 'Employment'}
              </button>
            ))}
          </div>
          {(() => {
            const otherGroup =
              categoryGroupView === 'Family-Sponsored' ? employmentCategories : familyCategories;
            const otherSelectedCount = otherGroup.filter((c) =>
              selectedCategories.includes(c.code)
            ).length;
            return (
              otherSelectedCount > 0 && (
                <span className="text-[11px] text-slate-400">
                  +{otherSelectedCount} selected in{' '}
                  {categoryGroupView === 'Family-Sponsored' ? 'Employment' : 'Family'}
                </span>
              )
            );
          })()}
        </div>
        <div className="flex flex-wrap gap-2">
          {(categoryGroupView === 'Family-Sponsored' ? familyCategories : employmentCategories).map(
            (c) => (
              <label
                key={c.code}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs cursor-pointer select-none ${
                  selectedCategories.includes(c.code)
                    ? 'bg-blue-50 border-blue-300 text-blue-700'
                    : 'bg-white border-slate-300 text-slate-600'
                }`}
              >
                <input
                  type="checkbox"
                  className="hidden"
                  checked={selectedCategories.includes(c.code)}
                  onChange={() => toggleCategory(c.code)}
                />
                {c.name || c.code}
              </label>
            )
          )}
        </div>
      </div>

      {youAreHereHint && <p className="text-xs text-amber-600 mb-3">{youAreHereHint}</p>}

      <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
        {loading ? (
          <div className="text-slate-400 text-sm py-12 text-center">Loading&hellip;</div>
        ) : (
          <TrendChart
            data={chartData}
            areas={seriesList}
            yDomain={yDomain}
            youAreHere={youAreHere}
            seriesLabels={seriesLabels}
          />
        )}
        <p className="text-xs text-slate-400 mt-2">
          Drag the handles below the chart to zoom into a date range. Y-axis shows the published
          cut-off priority date; gaps indicate the category was &ldquo;Unavailable&rdquo; that
          month. Each line is one category &middot; country combination.
        </p>
      </div>
    </div>
  );
}
