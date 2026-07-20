'use client';

import { useEffect, useState } from 'react';
import DashboardView from '../components/DashboardView';
import TrendsView from '../components/TrendsView';

export default function HomePage() {
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('dashboard');

  useEffect(() => {
    fetch('/api/meta')
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load metadata (${r.status})`);
        return r.json();
      })
      .then(setMeta)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <header className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">
          U.S. Visa Bulletin Tracker
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Family-sponsored &amp; employment-based preference dates, January 2013 &ndash; June 2026
        </p>
      </header>

      <nav className="flex gap-1 mb-6 border-b border-slate-200">
        {[
          { id: 'dashboard', label: 'Dashboard' },
          { id: 'trends', label: 'Trends' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 mb-4">
          {error}. Make sure <code>data/visa_bulletin.db</code> exists (see README).
        </div>
      )}

      {!meta && !error && (
        <div className="text-slate-400 text-sm">Loading&hellip;</div>
      )}

      {meta && (
        <>
          <div className={tab === 'dashboard' ? 'block' : 'hidden'}>
            <DashboardView meta={meta} />
          </div>
          <div className={tab === 'trends' ? 'block' : 'hidden'}>
            <TrendsView meta={meta} />
          </div>
        </>
      )}
    </div>
  );
}
