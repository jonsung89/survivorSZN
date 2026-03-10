import { useState } from 'react';
import { Settings, Trophy, Clock, Hash, ChevronDown, DollarSign } from 'lucide-react';
import { SCORING_PRESETS, TIEBREAKER_TYPES } from '../../utils/bracketSlots';

const ROUND_LABELS = ['R64', 'R32', 'Sweet 16', 'Elite 8', 'Final Four', 'Championship'];

export default function BracketSetup({ config, onChange }) {
  const [showCustomScoring, setShowCustomScoring] = useState(config.scoringPreset === 'custom');

  const handleChange = (field, value) => {
    const updated = { ...config, [field]: value };
    if (field === 'scoringPreset') {
      if (value === 'custom') {
        setShowCustomScoring(true);
        updated.customScoring = config.customScoring || [1, 2, 4, 8, 16, 32];
      } else {
        setShowCustomScoring(false);
        updated.customScoring = null;
      }
    }
    onChange(updated);
  };

  const handleCustomScoringChange = (roundIdx, value) => {
    const scoring = [...(config.customScoring || [1, 2, 4, 8, 16, 32])];
    scoring[roundIdx] = parseInt(value) || 0;
    handleChange('customScoring', scoring);
    // Also keep preset as custom
    onChange({ ...config, scoringPreset: 'custom', customScoring: scoring });
  };

  return (
    <div className="space-y-5">
      {/* Bracket Challenge Info */}
      <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4">
        <div className="flex gap-3">
          <Trophy className="w-5 h-5 text-orange-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-fg/80 mb-1">March Madness Bracket Challenge</p>
            <ul className="space-y-1 list-disc list-inside text-fg/50">
              <li>Members fill out a 64-team NCAA tournament bracket</li>
              <li>Points are awarded for each correct pick</li>
              <li>Later rounds are worth more points</li>
              <li>Once submitted, brackets are locked</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Max Brackets Per User */}
      <div>
        <label className="block text-fg/80 text-sm font-medium mb-2">
          <Hash className="w-4 h-4 inline mr-2" />
          Brackets Per Member
        </label>
        <select
          value={config.maxBracketsPerUser || 1}
          onChange={e => handleChange('maxBracketsPerUser', parseInt(e.target.value))}
          className="input-field"
        >
          <option value={1}>1 bracket</option>
          <option value={2}>2 brackets</option>
          <option value={3}>3 brackets</option>
          <option value={5}>5 brackets</option>
        </select>
        <p className="text-fg/40 text-xs mt-1">Each bracket counts as one entry. Members pay the entry fee per bracket.</p>
      </div>

      {/* Scoring System */}
      <div>
        <label className="block text-fg/80 text-sm font-medium mb-2">
          <Trophy className="w-4 h-4 inline mr-2" />
          Scoring System
        </label>
        <select
          value={config.scoringPreset || 'standard'}
          onChange={e => handleChange('scoringPreset', e.target.value)}
          className="input-field"
        >
          {Object.entries(SCORING_PRESETS).map(([key, preset]) => (
            <option key={key} value={key}>
              {preset.name} ({preset.points.join('-')})
            </option>
          ))}
          <option value="custom">Custom</option>
        </select>

        {/* Scoring Preview */}
        <div className="mt-3 grid grid-cols-6 gap-1.5">
          {ROUND_LABELS.map((label, idx) => {
            const points = showCustomScoring
              ? (config.customScoring || [1, 2, 4, 8, 16, 32])[idx]
              : (SCORING_PRESETS[config.scoringPreset]?.points || SCORING_PRESETS.standard.points)[idx];
            return (
              <div key={label} className="text-center">
                <div className="text-[10px] text-fg/40 mb-1 truncate">{label}</div>
                {showCustomScoring ? (
                  <input
                    type="number"
                    min="0"
                    max="999"
                    value={points}
                    onChange={e => handleCustomScoringChange(idx, e.target.value)}
                    className="w-full text-center text-sm font-mono py-1 rounded-lg bg-fg/5 border border-fg/10 text-fg focus:outline-none focus:border-fg/30"
                  />
                ) : (
                  <div className="text-sm font-mono font-medium text-fg/70 py-1 rounded-lg bg-fg/5">
                    {points}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-fg/40 text-xs mt-2">Points awarded per correct pick in each round</p>
      </div>

      {/* Tiebreaker */}
      <div>
        <label className="block text-fg/80 text-sm font-medium mb-2">
          <Settings className="w-4 h-4 inline mr-2" />
          Tiebreaker Method
        </label>
        <select
          value={config.tiebreakerType || 'total_score'}
          onChange={e => handleChange('tiebreakerType', e.target.value)}
          className="input-field"
        >
          {Object.entries(TIEBREAKER_TYPES).map(([key, tb]) => (
            <option key={key} value={key}>{tb.name}</option>
          ))}
        </select>
        <p className="text-fg/40 text-xs mt-1">
          {TIEBREAKER_TYPES[config.tiebreakerType || 'total_score']?.description}
        </p>
      </div>

      {/* Entry Deadline */}
      <div>
        <label className="block text-fg/80 text-sm font-medium mb-2">
          <Clock className="w-4 h-4 inline mr-2" />
          Entry Deadline
        </label>
        <input
          type="datetime-local"
          value={config.entryDeadline || ''}
          onChange={e => handleChange('entryDeadline', e.target.value)}
          className="input-field"
        />
        <p className="text-fg/40 text-xs mt-1">
          Leave empty to auto-lock when the first tournament game tips off
        </p>
      </div>

      {/* Entry Fee */}
      <div>
        <label className="block text-fg/80 text-sm font-medium mb-2">
          <DollarSign className="w-4 h-4 inline mr-2" />
          Entry Fee (per bracket)
        </label>
        <div className="relative">
          <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-fg/40" />
          <input
            type="number"
            min="0"
            step="1"
            value={config.entryFee || ''}
            onChange={e => handleChange('entryFee', e.target.value)}
            placeholder="0"
            className="w-full pl-10 pr-4 py-3 rounded-xl bg-fg/5 border border-fg/10 text-fg placeholder-fg/40 focus:outline-none focus:border-fg/30 transition-all"
          />
        </div>
        <p className="text-fg/40 text-xs mt-1">Leave at $0 for a free challenge. Each bracket submitted = one entry fee.</p>
      </div>
    </div>
  );
}
