'use client';

import posthog from 'posthog-js';
import { useEffect } from 'react';

export function PostHogProvider({ children }) {
  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
    if (!token) {
      if (process.env.NODE_ENV !== 'production') {
        console.error(
          'NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN is configured'
        );
      }
      return;
    }
    posthog.init(token, {
      api_host: '/ingest',
      ui_host: 'https://us.posthog.com',
      defaults: '2026-01-30',
      capture_exceptions: true,
      debug: process.env.NODE_ENV === 'development',
    });
  }, []);

  return children;
}
