import './globals.css';
import { Analytics } from '@vercel/analytics/react';

const SITE_URL = 'https://green-card-bulletin-tracker.vercel.app';
const TITLE = 'U.S. Visa Bulletin Tracker';
const DESCRIPTION =
  'Track U.S. Department of State Visa Bulletin final action & filing dates back to January 2013. See historical trends by category and country, and where your own priority date stands.';

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    'visa bulletin',
    'visa bulletin tracker',
    'priority date',
    'green card priority date',
    'USCIS visa bulletin',
    'final action date',
    'dates for filing',
    'EB-2',
    'EB-3',
    'family sponsored visa',
    'employment based visa',
  ],
  robots: { index: true, follow: true },
  alternates: { canonical: '/' },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: TITLE,
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900 min-h-screen antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
