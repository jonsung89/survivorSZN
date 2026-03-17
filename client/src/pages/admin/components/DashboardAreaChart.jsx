import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
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
          <span className="text-fg/50">{entry.name}:</span>
          <span className="font-medium">{entry.value?.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

export default function DashboardAreaChart({ data, dataKeys, height = 280, showLegend = false }) {
  const theme = useChartTheme();

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
        <defs>
          {dataKeys.map(dk => (
            <linearGradient key={dk.key} id={`gradient-${dk.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={dk.color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={dk.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={formatDate}
          tick={{ fill: theme.axisLabel, fontSize: 12 }}
          axisLine={{ stroke: theme.grid }}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fill: theme.axisLabel, fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip content={<CustomTooltip theme={theme} />} />
        {showLegend && (
          <Legend
            wrapperStyle={{ fontSize: 12, color: theme.axisLabel }}
          />
        )}
        {dataKeys.map(dk => (
          <Area
            key={dk.key}
            type="monotone"
            dataKey={dk.key}
            name={dk.label}
            stroke={dk.color}
            strokeWidth={2}
            fill={`url(#gradient-${dk.key})`}
            dot={false}
            activeDot={{ r: 4, stroke: dk.color, strokeWidth: 2, fill: theme.tooltip.bg }}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
