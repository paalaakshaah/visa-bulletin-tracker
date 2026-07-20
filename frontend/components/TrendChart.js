'use client';

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Brush,
} from 'recharts';
import { AREA_LABELS, CHART_COLORS, formatMonthLabel } from '../lib/constants';

function formatTick(ts) {
  if (ts == null) return '';
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function CustomTooltip({ active, payload, label, areas }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-md shadow-md px-3 py-2 text-xs">
      <div className="font-semibold text-slate-700 mb-1">{formatMonthLabel(label)}</div>
      {areas.map((area, i) => {
        const point = payload[0]?.payload;
        if (!point) return null;
        const status = point[`${area}_status`];
        const raw = point[`${area}_raw`];
        if (status === undefined) return null;
        const display =
          status === 'CURRENT' ? 'Current' : status === 'UNAVAILABLE' ? 'Unavailable' : raw;
        return (
          <div key={area} className="flex items-center gap-2 py-0.5">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
            />
            <span className="text-slate-500">{AREA_LABELS[area] || area}:</span>
            <span className="font-medium text-slate-800">{display}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function TrendChart({ data, areas, yDomain }) {
  if (!data || data.length === 0) {
    return <div className="text-slate-400 text-sm py-12 text-center">No data to display.</div>;
  }

  return (
    <div className="w-full h-[420px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="bulletin_date"
            tickFormatter={formatMonthLabel}
            minTickGap={30}
            tick={{ fontSize: 11, fill: '#64748b' }}
          />
          <YAxis
            type="number"
            domain={yDomain}
            tickFormatter={formatTick}
            tick={{ fontSize: 11, fill: '#64748b' }}
            width={80}
          />
          <Tooltip content={<CustomTooltip areas={areas} />} />
          <Legend
            formatter={(value) => AREA_LABELS[value] || value}
            wrapperStyle={{ fontSize: 12 }}
          />
          {areas.map((area, i) => (
            <Line
              key={area}
              type="monotone"
              dataKey={`${area}_ts`}
              name={area}
              stroke={CHART_COLORS[i % CHART_COLORS.length]}
              strokeWidth={2}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          ))}
          <Brush
            dataKey="bulletin_date"
            height={24}
            travellerWidth={8}
            stroke="#2563eb"
            tickFormatter={formatMonthLabel}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
