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

export default function DashboardBarChart({ data, dataKey = 'count', xAxisKey = 'month', color, height = 200, formatLabel }) {
  const theme = useChartTheme();

  const defaultFormatLabel = (val) => {
    if (xAxisKey === 'month' && val?.includes('-')) {
      const [, m] = val.split('-');
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return months[parseInt(m) - 1] || val;
    }
    return val;
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} vertical={false} />
        <XAxis
          dataKey={xAxisKey}
          tickFormatter={formatLabel || defaultFormatLabel}
          tick={{ fill: theme.axisLabel, fontSize: 12 }}
          axisLine={{ stroke: theme.grid }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: theme.axisLabel, fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip content={<CustomTooltip theme={theme} />} cursor={false} />
        <Bar
          dataKey={dataKey}
          fill={color || theme.colors.primary}
          radius={[4, 4, 0, 0]}
          maxBarSize={40}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
