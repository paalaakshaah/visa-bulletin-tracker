import './globals.css';

export const metadata = {
  title: 'U.S. Visa Bulletin Tracker',
  description: 'Historical U.S. Visa Bulletin final action & filing dates, January 2013 - June 2026',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900 min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
