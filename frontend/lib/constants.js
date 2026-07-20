// Preferred display order for chargeability areas (countries).
export const AREA_ORDER = [
  'ALL', 'CHINA', 'INDIA', 'MEXICO', 'PHILIPPINES', 'VIETNAM', 'EL_SV_GT_HN',
];

export const AREA_LABELS = {
  ALL: 'All Countries',
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
