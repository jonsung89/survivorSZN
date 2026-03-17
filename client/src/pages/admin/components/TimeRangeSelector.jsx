const OPTIONS = [
  { label: '7D', value: 7 },
  { label: '30D', value: 30 },
  { label: '90D', value: 90 },
];

export default function TimeRangeSelector({ value, onChange }) {
  return (
    <div className="flex items-center bg-fg/5 rounded-lg p-1 gap-0.5">
      {OPTIONS.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
            value === opt.value
              ? 'bg-surface text-fg shadow-sm'
              : 'text-fg/40 hover:text-fg/60'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
