'use client';

import { useEffect, useState } from 'react';
import DashboardView from '../components/DashboardView';
import TrendsView from '../components/TrendsView';
import Onboarding from '../components/Onboarding';
import { AREA_LABELS, formatMonthLabel, formatPriorityDate, VISA_PROFILE_KEY } from '../lib/constants';

export default function HomePage() {
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('trends');
  // undefined = not checked yet, null = no saved profile, {skipped:true} = skipped, else {category, priorityDate}
  const [profile, setProfile] = useState(undefined);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    fetch('/api/meta')
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load metadata (${r.status})`);
        return r.json();
      })
      .then(setMeta)
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(VISA_PROFILE_KEY);
      setProfile(saved ? JSON.parse(saved) : null);
    } catch {
      setProfile(null);
    }
  }, []);

  function saveProfile(p) {
    try {
      localStorage.setItem(VISA_PROFILE_KEY, JSON.stringify(p));
    } catch {
      // localStorage unavailable; profile just won't persist across reloads
    }
    setProfile(p);
    setEditing(false);
  }

  const hasCase = Boolean(profile && !profile.skipped);
  const showOnboarding = profile === null || editing;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <header className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">
          U.S. Visa Bulletin Tracker &mdash; {meta ? formatMonthLabel(meta.latest) : '…'}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Family-sponsored &amp; employment-based preference dates
        </p>
        {meta && !showOnboarding && (
          <p className="text-xs text-slate-400 mt-1">
            {hasCase ? (
              <>
                Your case: {profile.category}
                {profile.area && profile.area !== 'ALL'
                  ? `, born in ${AREA_LABELS[profile.area] || profile.area}`
                  : ''}
                , priority date {formatPriorityDate(profile.priorityDate)}
                {' '}&middot;{' '}
                <button onClick={() => setEditing(true)} className="underline hover:text-slate-600">
                  Change my info
                </button>
              </>
            ) : (
              <button onClick={() => setEditing(true)} className="underline hover:text-slate-600">
                Add your case details
              </button>
            )}
          </p>
        )}
      </header>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 mb-4">
          {error}. Make sure <code>data/visa_bulletin.db</code> exists (see README).
        </div>
      )}

      {!meta && !error && (
        <div className="text-slate-400 text-sm">Loading&hellip;</div>
      )}

      {meta && showOnboarding && (
        <Onboarding
          meta={meta}
          initial={hasCase ? profile : null}
          onComplete={saveProfile}
          onSkip={() => saveProfile({ skipped: true })}
        />
      )}

      {meta && !showOnboarding && (
        <>
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

          <div className={tab === 'dashboard' ? 'block' : 'hidden'}>
            <DashboardView meta={meta} profile={hasCase ? profile : null} />
          </div>
          <div className={tab === 'trends' ? 'block' : 'hidden'}>
            <TrendsView meta={meta} profile={hasCase ? profile : null} />
          </div>
        </>
      )}
    </div>
  );
}
