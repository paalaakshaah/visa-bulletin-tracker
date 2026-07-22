// Preferred display order for chargeability areas (countries).
export const AREA_ORDER = [
  'ALL', 'CHINA', 'INDIA', 'MEXICO', 'PHILIPPINES', 'VIETNAM', 'EL_SV_GT_HN',
];

export const AREA_LABELS = {
  ALL: 'All Other Countries',
  CHINA: 'China',
  INDIA: 'India',
  MEXICO: 'Mexico',
  PHILIPPINES: 'Philippines',
  VIETNAM: 'Vietnam',
  EL_SV_GT_HN: 'El Salvador / Guatemala / Honduras',
};

export function sortAreas(areaCodes) {
  return [...areaCodes].sort((a, b) => {
    const ia = AREA_ORDER.indexOf(a);
    const ib = AREA_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
}

export const CHART_COLORS = [
  '#2563eb', // blue
  '#dc2626', // red
  '#16a34a', // green
  '#d97706', // amber
  '#7c3aed', // violet
  '#0891b2', // cyan
  '#db2777', // pink
];

export const TABLE_TYPES = ['Final Action', 'Dates for Filing'];

export function formatMonthLabel(isoDate) {
  if (!isoDate) return '';
  const [y, m] = isoDate.split('-');
  const d = new Date(Date.UTC(Number(y), Number(m) - 1, 1));
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

const MONTH_ABBR = [
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
];

// USCIS visa bulletin tables print priority dates as DDMMMYY, e.g. "22DEC05".
export function formatPriorityDate(isoDate) {
  if (!isoDate) return isoDate;
  const [y, m, d] = isoDate.split('-');
  if (!y || !m || !d) return isoDate;
  return `${d}${MONTH_ABBR[Number(m) - 1]}${y.slice(2)}`;
}

// Every category code in this dataset starts with "F" (family-sponsored) or
// "EB" (employment-based) -- see db/schema.sql / categories table.
export function inferBroadCategory(categoryCode) {
  return categoryCode && categoryCode.startsWith('EB') ? 'Employment-Based' : 'Family-Sponsored';
}

export const VISA_PROFILE_KEY = 'visaBulletinProfile';

// Compact, human-readable rendering of a day delta, e.g. 45 -> "45d",
// 90 -> "3mo", 800 -> "2.2y". Sign is included.
export function formatDeltaDays(days) {
  const sign = days > 0 ? '+' : days < 0 ? '−' : '';
  const abs = Math.abs(days);
  if (abs >= 365) return `${sign}${(abs / 365).toFixed(1)}y`;
  if (abs >= 30) return `${sign}${Math.round(abs / 30)}mo`;
  return `${sign}${abs}d`;
}
