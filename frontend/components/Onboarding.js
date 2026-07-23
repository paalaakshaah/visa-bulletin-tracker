'use client';

import { useState } from 'react';
import { track } from '@vercel/analytics';
import { AREA_LABELS, inferBroadCategory, sortAreas } from '../lib/constants';

export default function Onboarding({ meta, initial, onComplete, onSkip }) {
  const familyCategories = meta.categories.filter((c) => c.broad_category === 'Family-Sponsored');
  const employmentCategories = meta.categories.filter(
    (c) => c.broad_category === 'Employment-Based'
  );
  const areaOptions = sortAreas(meta.areas.map((a) => a.code));

  const [broadFilter, setBroadFilter] = useState(
    initial?.category ? inferBroadCategory(initial.category) : 'Family-Sponsored'
  );
  const categoryOptions = broadFilter === 'Family-Sponsored' ? familyCategories : employmentCategories;

  const [category, setCategory] = useState(initial?.category || categoryOptions[0]?.code || '');
  const [priorityMonth, setPriorityMonth] = useState(
    initial?.priorityDate ? initial.priorityDate.slice(0, 7) : ''
  );
  const [area, setArea] = useState(initial?.area || 'ALL');

  function handleBroadFilterChange(f) {
    setBroadFilter(f);
    const opts = f === 'Family-Sponsored' ? familyCategories : employmentCategories;
    setCategory(opts[0]?.code || '');
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!category || !priorityMonth) return;
    track('onboarding_completed', { category, area });
    onComplete({ category, priorityDate: `${priorityMonth}-01`, area });
  }

  function handleSkip() {
    track('onboarding_skipped');
    onSkip();
  }

  return (
    <div className="max-w-lg mx-auto py-12">
      <h1 className="text-2xl font-bold text-slate-900 mb-2">Welcome to the Visa Bulletin Tracker</h1>
      <p className="text-sm text-slate-500 mb-8">
        Tell us your category, country of birth, and priority date and we&rsquo;ll set the
        dashboard to your case and mark exactly where you stand on the trend chart.
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Category Group</label>
          <div className="inline-flex rounded-md shadow-sm border border-slate-300 overflow-hidden">
            {['Family-Sponsored', 'Employment-Based'].map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => handleBroadFilterChange(f)}
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
          <label className="block text-xs font-medium text-slate-500 mb-1">
            What category of visa have you applied for?
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-md border-slate-300 text-sm py-1.5 pl-2 pr-8 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
            {categoryOptions.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name || c.code}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">
            What is your country of birth?
          </label>
          <select
            value={area}
            onChange={(e) => setArea(e.target.value)}
            className="w-full rounded-md border-slate-300 text-sm py-1.5 pl-2 pr-8 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
            {areaOptions.map((code) => (
              <option key={code} value={code}>
                {AREA_LABELS[code] || code}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">
            What is your priority date?
          </label>
          <input
            type="month"
            value={priorityMonth}
            onChange={(e) => setPriorityMonth(e.target.value)}
            required
            className="w-full rounded-md border-slate-300 text-sm py-1.5 pl-2 pr-2 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-4 pt-2">
          <button
            type="submit"
            disabled={!category || !priorityMonth}
            className="px-4 py-2 rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Show my trends
          </button>
          <button
            type="button"
            onClick={handleSkip}
            className="text-sm font-medium text-slate-500 hover:text-slate-700"
          >
            Skip for now
          </button>
        </div>
      </form>
    </div>
  );
}
