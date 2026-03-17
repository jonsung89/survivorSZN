import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import useChartTheme from './useChartTheme';

function CustomTooltip({ active, payload, label, theme }) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-lg px-3 py-2 shadow-lg border text-sm"
      style={{
        backgroundColor: theme.tooltip.bg,
        borderColor: theme.tooltip.border,
        color: theme.tooltip.text,
      }}
    >
      <p className="font-medium mb-1">{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="font-medium">{entry.value?.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

export default function HorizontalBarChart({ data, dataKey = 'views', labelKey = 'path', color, height = 250, formatLabel }) {
  const theme = useChartTheme();

  const defaultFormat = (val) => {
    if (typeof val !== 'string') return val;
    // Shorten paths: /league/abc-123 → /league/...
    if (val.length > 20) {
      const parts = val.split('/').filter(Boolean);
      if (parts.length > 1) return '/' + parts[0] + '/...';
      return val.substring(0, 18) + '…';
    }
    return val;
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 5, right: 20, left: 5, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} horizontal={false} />
        <XAxis
          type="number"
          tick={{ fill: theme.axisLabel, fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <YAxis
          type="category"
          dataKey={labelKey}
          tickFormatter={formatLabel || defaultFormat}
          tick={{ fill: theme.axisLabel, fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          width={100}
        />
        <Tooltip content={<CustomTooltip theme={theme} />} cursor={false} />
        <Bar
          dataKey={dataKey}
          fill={color || theme.colors.primary}
          radius={[0, 4, 4, 0]}
          maxBarSize={24}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
