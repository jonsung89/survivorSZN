import { TIEBREAKER_TYPES } from '../../utils/bracketSlots';

export default function TiebreakerInput({ type, value, onChange, disabled }) {
  const tbConfig = TIEBREAKER_TYPES[type] || TIEBREAKER_TYPES.total_score;

  if (type !== 'total_score') return null;

  return (
    <div className="bg-fg/5 border border-fg/10 rounded-xl p-4">
      <label className="block text-fg/80 text-sm font-medium mb-2">
        Tiebreaker: {tbConfig.name}
      </label>
      <p className="text-fg/50 text-xs mb-3">{tbConfig.description}</p>
      <input
        type="number"
        min="50"
        max="300"
        value={value || ''}
        onChange={e => onChange(parseInt(e.target.value) || null)}
        placeholder="e.g., 145"
        disabled={disabled}
        className="input-field text-center text-lg font-mono"
      />
    </div>
  );
}
