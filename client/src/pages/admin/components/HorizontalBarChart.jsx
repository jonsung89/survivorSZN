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

export default function HorizontalBarChart({ data, dataKey = 'views', labelKey = 'path', color, height = 250, formatLabel, onBarClick }) {
  const theme = useChartTheme();

  // Compute YAxis width based on longest label (~7px per char at 12px font)
  const longestLabel = data.reduce((max, row) => {
    const label = formatLabel ? formatLabel(row[labelKey]) : String(row[labelKey] || '');
    return label.length > max ? label.length : max;
  }, 0);
  const yAxisWidth = Math.min(220, Math.max(80, longestLabel * 7 + 12));

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
          tickFormatter={formatLabel}
          tick={{ fill: theme.axisLabel, fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          width={yAxisWidth}
        />
        <Tooltip content={<CustomTooltip theme={theme} />} cursor={false} />
        <Bar
          dataKey={dataKey}
          fill={color || theme.colors.primary}
          radius={[0, 4, 4, 0]}
          maxBarSize={24}
          cursor={onBarClick ? 'pointer' : undefined}
          onClick={onBarClick ? (barData) => onBarClick(barData) : undefined}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
