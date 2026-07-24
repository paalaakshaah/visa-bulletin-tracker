'use client';

export default function UscisCaseStatusLink() {
  return (
    <div className="mt-10 pt-6 border-t border-slate-200 text-center">
      <a
        href="https://egov.uscis.gov/"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
      >
        Check My Case Status on USCIS
      </a>
    </div>
  );
}
