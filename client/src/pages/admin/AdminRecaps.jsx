import { useState, useEffect, useCallback } from 'react';
import { Sparkles, ChevronDown, ChevronRight, Save, Loader2 } from 'lucide-react';
import { adminAPI } from '../../api';
import { useToast } from '../../components/Toast';
import { useTheme } from '../../context/ThemeContext';
import Loading from '../../components/Loading';

export default function AdminRecaps() {
  const { isDark } = useTheme();
  const { showToast } = useToast();
  const [tournaments, setTournaments] = useState([]);
  const [selectedTournament, setSelectedTournament] = useState('');
  const [recaps, setRecaps] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tournamentsLoading, setTournamentsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [editState, setEditState] = useState({});
  const [saving, setSaving] = useState(false);

  // Load tournaments
  useEffect(() => {
    adminAPI.getTournaments()
      .then(data => {
        const list = data.tournaments || [];
        setTournaments(list);
        if (list.length > 0) setSelectedTournament(list[0].id);
      })
      .catch(() => showToast('Failed to load tournaments', 'error'))
      .finally(() => setTournamentsLoading(false));
  }, []);

  // Load recaps when tournament changes
  const loadRecaps = useCallback(async () => {
    if (!selectedTournament) return;
    setLoading(true);
    try {
      const data = await adminAPI.getRecaps(selectedTournament);
      setRecaps(data.recaps || []);
    } catch {
      showToast('Failed to load recaps', 'error');
    } finally {
      setLoading(false);
    }
  }, [selectedTournament]);

  useEffect(() => { loadRecaps(); }, [loadRecaps]);

  const toggleExpand = (id) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    const recap = recaps.find(r => r.id === id);
    if (!recap) return;
    const meta = recap.metadata || {};
    setEditState({
      tldr: recap.tldr || '',
      membersTab: meta.membersTab || '',
      gamesTab: meta.gamesTab || '',
      todayTab: meta.todayTab || '',
    });
  };

  const handleSave = async (id) => {
    setSaving(true);
    try {
      await adminAPI.updateRecap(id, editState);
      showToast('Recap updated', 'success');
      await loadRecaps();
    } catch {
      showToast('Failed to save recap', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Group recaps by date
  const grouped = recaps.reduce((acc, r) => {
    const date = r.recap_date?.split('T')[0] || 'Unknown';
    if (!acc[date]) acc[date] = [];
    acc[date].push(r);
    return acc;
  }, {});
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  if (tournamentsLoading) return <Loading />;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Sparkles className="w-6 h-6 text-amber-500" />
        <h1 className="text-2xl font-display font-bold text-fg">Recaps</h1>
      </div>

      {/* Tournament selector */}
      <div className="mb-6">
        <select
          value={selectedTournament}
          onChange={e => setSelectedTournament(e.target.value)}
          className={`px-3 py-2 rounded-lg text-sm border ${
            isDark
              ? 'bg-white/5 border-white/10 text-fg'
              : 'bg-white border-gray-200 text-fg'
          }`}
        >
          {tournaments.map(t => (
            <option key={t.id} value={t.id}>{t.name} ({t.year})</option>
          ))}
        </select>
      </div>

      {loading && <Loading />}

      {!loading && recaps.length === 0 && (
        <p className="text-fg/50 text-sm">No recaps found for this tournament.</p>
      )}

      {!loading && sortedDates.map(date => {
        const d = new Date(date + 'T12:00:00');
        const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

        return (
          <div key={date} className="mb-6">
            <h2 className="text-sm font-semibold text-fg/50 uppercase tracking-wider mb-2">{label}</h2>
            <div className="space-y-2">
              {grouped[date].map(recap => {
                const isExpanded = expandedId === recap.id;
                return (
                  <div
                    key={recap.id}
                    className="rounded-xl border"
                    style={{
                      background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.8)',
                      borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
                    }}
                  >
                    <button
                      onClick={() => toggleExpand(recap.id)}
                      className="w-full flex items-center justify-between px-4 py-3 text-left"
                    >
                      <div>
                        <span className="text-sm font-medium text-fg">{recap.league_name}</span>
                        {recap.tldr && (
                          <p className="text-sm text-fg/50 mt-0.5 line-clamp-1">{recap.tldr}</p>
                        )}
                      </div>
                      {isExpanded
                        ? <ChevronDown className="w-4 h-4 text-fg/40 flex-shrink-0" />
                        : <ChevronRight className="w-4 h-4 text-fg/40 flex-shrink-0" />
                      }
                    </button>

                    {isExpanded && (
                      <div className="px-4 pb-4 space-y-4 border-t"
                        style={{ borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }}
                      >
                        {/* TLDR */}
                        <div className="mt-4">
                          <label className="block text-sm font-medium text-fg/70 mb-1">TLDR</label>
                          <textarea
                            value={editState.tldr}
                            onChange={e => setEditState(s => ({ ...s, tldr: e.target.value }))}
                            rows={2}
                            className={`w-full px-3 py-2 rounded-lg text-sm border resize-y ${
                              isDark
                                ? 'bg-white/5 border-white/10 text-fg'
                                : 'bg-white border-gray-200 text-fg'
                            }`}
                          />
                        </div>

                        {/* Members Tab */}
                        <div>
                          <label className="block text-sm font-medium text-fg/70 mb-1">Members Tab</label>
                          <textarea
                            value={editState.membersTab}
                            onChange={e => setEditState(s => ({ ...s, membersTab: e.target.value }))}
                            rows={10}
                            className={`w-full px-3 py-2 rounded-lg text-sm font-mono border resize-y ${
                              isDark
                                ? 'bg-white/5 border-white/10 text-fg'
                                : 'bg-white border-gray-200 text-fg'
                            }`}
                          />
                        </div>

                        {/* Games Tab */}
                        <div>
                          <label className="block text-sm font-medium text-fg/70 mb-1">Games Tab</label>
                          <textarea
                            value={editState.gamesTab}
                            onChange={e => setEditState(s => ({ ...s, gamesTab: e.target.value }))}
                            rows={10}
                            className={`w-full px-3 py-2 rounded-lg text-sm font-mono border resize-y ${
                              isDark
                                ? 'bg-white/5 border-white/10 text-fg'
                                : 'bg-white border-gray-200 text-fg'
                            }`}
                          />
                        </div>

                        {/* Today Tab */}
                        <div>
                          <label className="block text-sm font-medium text-fg/70 mb-1">Today Tab</label>
                          <textarea
                            value={editState.todayTab}
                            onChange={e => setEditState(s => ({ ...s, todayTab: e.target.value }))}
                            rows={10}
                            className={`w-full px-3 py-2 rounded-lg text-sm font-mono border resize-y ${
                              isDark
                                ? 'bg-white/5 border-white/10 text-fg'
                                : 'bg-white border-gray-200 text-fg'
                            }`}
                          />
                        </div>

                        {/* Save */}
                        <button
                          onClick={() => handleSave(recap.id)}
                          disabled={saving}
                          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-amber-500 text-black hover:bg-amber-400 transition-colors disabled:opacity-50"
                        >
                          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                          Save Changes
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
