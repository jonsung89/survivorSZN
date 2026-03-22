import { useState } from 'react';
import { BarChart3, Check, Plus, X, StopCircle } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

export default function PollCard({ message, currentUserId, commissionerId, onVote, onAddOption, onEndPoll, isPinned, isVoted, members = [], onCollapse }) {
  const { isDark } = useTheme();
  const metadata = typeof message.metadata === 'string' ? JSON.parse(message.metadata) : message.metadata;
  const { question, options, votes = {}, config = {}, status } = metadata;
  const isActive = status === 'active';
  const isCreator = (message.user_id || message.userId) === currentUserId;
  const isCommissioner = currentUserId === commissionerId;
  const canEnd = isActive && (isCreator || isCommissioner);
  const userVotes = votes[currentUserId] || [];
  const hasVoted = userVotes.length > 0;
  const totalVoters = Object.keys(votes).length;

  const [selected, setSelected] = useState([]);
  const [showAddOption, setShowAddOption] = useState(false);
  const [newOptionText, setNewOptionText] = useState('');
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [expandedOptionId, setExpandedOptionId] = useState(null);

  const getVoteCount = (optionId) => {
    return Object.values(votes).filter(v => v.includes(optionId)).length;
  };

  const getVoterNames = (optionId) => {
    return Object.entries(votes)
      .filter(([, picked]) => picked.includes(optionId))
      .map(([userId]) => {
        if (userId === currentUserId) return 'You';
        const member = members.find(m => (m.userId || m.user_id || m.id) === userId);
        return member?.displayName || member?.display_name || 'Unknown';
      });
  };

  const maxVotes = Math.max(1, ...options.map(o => getVoteCount(o.id)));

  const handleSelect = (optionId) => {
    if (!isActive || hasVoted) return;
    if (config.allowMultiple) {
      setSelected(prev => prev.includes(optionId) ? prev.filter(id => id !== optionId) : [...prev, optionId]);
    } else {
      setSelected([optionId]);
    }
  };

  const handleVote = () => {
    if (selected.length === 0) return;
    onVote(selected);
    setSelected([]);
  };

  const handleAddOption = () => {
    const trimmed = newOptionText.trim();
    if (!trimmed) return;
    onAddOption(trimmed);
    setNewOptionText('');
    setShowAddOption(false);
  };

  const showResults = hasVoted || !isActive;

  if (isPinned) {
    return (
      <div
        className="flex items-center gap-3 px-4 py-2.5 cursor-pointer"
        style={{
          background: isDark ? 'rgba(139,92,246,0.1)' : 'rgba(0,0,0,0.03)',
          borderTop: isDark ? '1px solid rgba(139,92,246,0.2)' : '1px solid rgba(0,0,0,0.08)',
        }}
      >
        <BarChart3 className="w-4 h-4 text-violet-500 flex-shrink-0" />
        <span className="text-sm font-medium text-fg truncate flex-1">{question}</span>
        <span className="text-sm font-semibold text-violet-500 flex-shrink-0">{isVoted ? 'View' : 'Vote'}</span>
      </div>
    );
  }

  return (
    <div
      className="w-full rounded-xl overflow-hidden"
      style={{
        background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
        border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.08)',
      }}
    >
      {/* Header */}
      <div
        className={`px-4 py-3 flex items-center gap-2 ${onCollapse ? 'cursor-pointer' : ''}`}
        onClick={onCollapse}
        style={{
          background: isDark
            ? 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(99,102,241,0.1))'
            : 'rgba(0,0,0,0.04)',
        }}
      >
        <BarChart3 className="w-4 h-4 text-violet-500 flex-shrink-0" />
        <span className="text-sm font-semibold text-fg">Poll</span>
        {!isActive && (
          <span className="text-sm text-fg/40 ml-auto">Ended</span>
        )}
        {isActive && totalVoters > 0 && (
          <span className="text-sm text-fg/40 ml-auto">{totalVoters} vote{totalVoters !== 1 ? 's' : ''}</span>
        )}
      </div>

      {/* Question */}
      <div className="px-4 pt-3 pb-2">
        <p className="text-base font-semibold text-fg">{question}</p>
        {config.allowMultiple && isActive && !hasVoted && (
          <p className="text-sm text-fg/40 mt-0.5">Select multiple</p>
        )}
      </div>

      {/* Options */}
      <div className="px-4 pb-3 space-y-2">
        {options.map(option => {
          const count = getVoteCount(option.id);
          const pct = totalVoters > 0 ? Math.round((count / totalVoters) * 100) : 0;
          const isSelected = selected.includes(option.id);
          const isUserPick = userVotes.includes(option.id);
          const isWinner = !isActive && count === maxVotes && count > 0;

          if (showResults) {
            const isOptionExpanded = expandedOptionId === option.id;
            const voterNames = isOptionExpanded ? getVoterNames(option.id) : [];
            return (
              <div key={option.id}>
                <div
                  className="relative rounded-lg overflow-hidden cursor-pointer"
                  style={{ minHeight: 40 }}
                  onClick={() => count > 0 && setExpandedOptionId(isOptionExpanded ? null : option.id)}
                >
                  {/* Bar */}
                  <div
                    className="absolute inset-y-0 left-0 rounded-lg transition-all duration-500"
                    style={{
                      width: `${pct}%`,
                      background: isUserPick
                        ? (isDark ? 'rgba(139,92,246,0.25)' : 'rgba(0,0,0,0.08)')
                        : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'),
                    }}
                  />
                  <div className="relative flex items-center justify-between px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {isUserPick && <Check className="w-4 h-4 text-violet-500 flex-shrink-0" />}
                      <span className={`text-sm ${isUserPick ? 'font-semibold text-fg' : 'text-fg/80'} ${isWinner ? 'font-semibold' : ''}`}>
                        {option.text}
                      </span>
                    </div>
                    <span className={`text-sm flex-shrink-0 ml-2 ${isUserPick ? 'font-semibold text-violet-500' : 'text-fg/50'}`}>
                      {count > 0 ? `${pct}% · ${count}` : `${pct}%`}
                    </span>
                  </div>
                </div>
                {isOptionExpanded && voterNames.length > 0 && (
                  <div className="ml-6 mt-1 mb-1 space-y-0.5">
                    {voterNames.map((name, idx) => (
                      <p key={idx} className="text-sm text-fg/50 pl-2">{name}</p>
                    ))}
                  </div>
                )}
              </div>
            );
          }

          return (
            <button
              key={option.id}
              onClick={() => handleSelect(option.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                isSelected
                  ? (isDark ? 'bg-violet-500/20 ring-1 ring-violet-500/40' : 'bg-indigo-50 ring-1 ring-indigo-400')
                  : (isDark ? 'bg-fg/5 hover:bg-fg/10' : 'bg-fg/5 hover:bg-fg/10')
              }`}
            >
              <div className={`w-5 h-5 rounded-${config.allowMultiple ? 'md' : 'full'} border-2 flex items-center justify-center flex-shrink-0 ${
                isSelected
                  ? 'border-violet-500 bg-violet-500'
                  : (isDark ? 'border-fg/30' : 'border-fg/20')
              }`}>
                {isSelected && <Check className="w-3 h-3 text-white" />}
              </div>
              <span className="text-sm text-fg">{option.text}</span>
            </button>
          );
        })}
      </div>

      {/* Add option */}
      {isActive && config.allowAddOptions && !showAddOption && (
        <div className="px-4 pb-3">
          <button
            onClick={() => setShowAddOption(true)}
            className="flex items-center gap-1.5 text-sm text-violet-500 hover:text-violet-400 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add option
          </button>
        </div>
      )}
      {showAddOption && (
        <div className="px-4 pb-3 flex gap-2">
          <input
            type="text"
            value={newOptionText}
            onChange={e => setNewOptionText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddOption()}
            placeholder="Type an option..."
            maxLength={100}
            className="flex-1 px-3 py-2 rounded-lg text-sm text-fg bg-fg/5 border border-fg/10 outline-none focus:border-violet-500/50"
            autoFocus
          />
          <button onClick={handleAddOption} className="px-3 py-2 rounded-lg bg-violet-500 text-white text-sm font-medium">
            Add
          </button>
          <button onClick={() => { setShowAddOption(false); setNewOptionText(''); }} className="p-2 text-fg/40 hover:text-fg/60">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Vote button */}
      {isActive && !hasVoted && selected.length > 0 && (
        <div className="px-4 pb-3">
          <button
            onClick={handleVote}
            className="w-full py-2.5 rounded-lg bg-violet-500 text-white text-sm font-semibold hover:bg-violet-600 transition-colors"
          >
            Vote
          </button>
        </div>
      )}

      {/* Footer */}
      <div className="px-4 py-2.5 flex items-center justify-between border-t" style={{ borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }}>
        <span className="text-sm text-fg/40">
          {totalVoters} vote{totalVoters !== 1 ? 's' : ''}
        </span>
        {canEnd && !showEndConfirm && (
          <button
            onClick={() => setShowEndConfirm(true)}
            className="flex items-center gap-1 text-sm text-fg/40 hover:text-red-400 transition-colors"
          >
            <StopCircle className="w-3.5 h-3.5" />
            End Poll
          </button>
        )}
        {showEndConfirm && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-fg/50">End poll?</span>
            <button onClick={() => { onEndPoll(); setShowEndConfirm(false); }} className="text-sm font-medium text-red-400">Yes</button>
            <button onClick={() => setShowEndConfirm(false)} className="text-sm text-fg/40">No</button>
          </div>
        )}
      </div>
    </div>
  );
}
