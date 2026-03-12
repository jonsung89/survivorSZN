import { useState, useEffect } from 'react';
import { X, Trophy, XCircle, Users } from 'lucide-react';
import { leagueAPI } from '../api';
import SportBadge from './SportBadge';
import CommishBadge from './CommishBadge';

const TABS = [
  { key: 'winners', label: 'Winners', icon: Trophy, color: 'text-amber-500' },
  { key: 'eliminated', label: 'Eliminated', icon: XCircle, color: 'text-red-500' },
  { key: 'active', label: 'Active', icon: Users, color: 'text-green-500' },
];

const formatMoney = (amount) => {
  if (!amount || amount <= 0) return null;
  return `$${amount.toLocaleString()}`;
};

export default function LeagueMembersDialog({ leagueId, leagueName, defaultTab, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(defaultTab || 'winners');

  // Prevent body scroll while dialog is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await leagueAPI.getMembersSummary(leagueId);
        if (!cancelled) setData(result);
      } catch (err) {
        console.error('Failed to load members:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [leagueId]);

  // Filter tabs to only show those with members
  const availableTabs = TABS.filter(t => data && data[t.key]?.length > 0);

  // If the default tab has no data, switch to first available
  useEffect(() => {
    if (data && availableTabs.length > 0 && !availableTabs.find(t => t.key === activeTab)) {
      setActiveTab(availableTabs[0].key);
    }
  }, [data]);

  const currentList = data?.[activeTab] || [];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center overscroll-none" onClick={onClose}>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="bg-elevated border border-fg/10 rounded-t-2xl sm:rounded-2xl p-5 w-full sm:max-w-md relative z-10 animate-in shadow-xl max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="text-lg font-semibold text-fg truncate">{leagueName}</h3>
              {data?.sportId && <SportBadge sportId={data.sportId} />}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {data && <p className="text-sm text-neutral-500 dark:text-neutral-400">{data.totalMembers} members</p>}
              {data?.entryFee > 0 && (
                <>
                  <span className="text-neutral-400 dark:text-neutral-500">·</span>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    {formatMoney(data.entryFee)} entry
                  </p>
                </>
              )}
              {data?.pot > 0 && (
                <>
                  <span className="text-neutral-400 dark:text-neutral-500">·</span>
                  <p className="text-sm font-medium text-emerald-500 dark:text-emerald-400">
                    {formatMoney(data.pot)} pot
                  </p>
                </>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors flex-shrink-0 ml-3">
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-neutral-300 dark:border-neutral-600 border-t-neutral-500 dark:border-t-neutral-300 rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Tabs */}
            {availableTabs.length > 1 && (
              <div className="flex gap-1 mb-4 bg-fg/[0.04] rounded-lg p-1">
                {availableTabs.map(tab => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.key;
                  const count = data[tab.key]?.length || 0;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key)}
                      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-md text-sm font-medium transition-all ${
                        isActive
                          ? 'bg-elevated shadow-sm text-fg'
                          : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300'
                      }`}
                    >
                      <Icon className={`w-4 h-4 ${isActive ? tab.color : ''}`} />
                      <span>{tab.label}</span>
                      <span className={`text-xs ${isActive ? 'text-neutral-500 dark:text-neutral-400' : 'text-neutral-400 dark:text-neutral-500'}`}>{count}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Single tab header (when only one category has members) */}
            {availableTabs.length === 1 && (() => {
              const tab = availableTabs[0];
              const Icon = tab.icon;
              return (
                <div className="flex items-center gap-2 mb-3">
                  <Icon className={`w-5 h-5 ${tab.color}`} />
                  <span className="text-base font-medium text-fg">{tab.label}</span>
                  <span className="text-sm text-neutral-500 dark:text-neutral-400">{data[tab.key]?.length}</span>
                </div>
              );
            })()}

            {/* Per-winner prize callout for winners tab */}
            {activeTab === 'winners' && data?.perWinnerPrize > 0 && (
              <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-emerald-500 dark:bg-emerald-600">
                <span className="text-sm font-semibold text-white">
                  {formatMoney(data.perWinnerPrize)} per winner
                </span>
              </div>
            )}

            {/* Members list */}
            <div className="overflow-y-auto max-h-[50vh] -mx-1 px-1 overscroll-contain">
              {currentList.length === 0 ? (
                <p className="text-neutral-500 dark:text-neutral-400 text-base text-center py-8">No members</p>
              ) : (
                <div className="space-y-0.5">
                  {currentList.map((m, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 py-2.5 px-2 rounded-lg hover:bg-fg/[0.03]"
                    >
                      {/* Rank/position */}
                      <span className="text-base font-medium text-neutral-500 dark:text-neutral-400 w-6 text-right flex-shrink-0">{i + 1}</span>

                      {/* Status icon */}
                      {activeTab === 'winners' && <span className="text-base">🏆</span>}
                      {activeTab === 'eliminated' && <XCircle className="w-5 h-5 text-red-500/60 flex-shrink-0" />}
                      {activeTab === 'active' && <div className="w-2.5 h-2.5 rounded-full bg-green-500 flex-shrink-0" />}

                      {/* Name + badges */}
                      <span className="text-base text-fg truncate">{m.displayName}</span>
                      {m.isCommissioner && <CommishBadge />}

                      {/* You badge */}
                      {m.isMe && (
                        <span className="text-xs text-neutral-500 dark:text-neutral-400 font-medium flex-shrink-0">(You)</span>
                      )}

                      {/* Winnings for winners */}
                      {activeTab === 'winners' && data?.perWinnerPrize > 0 && (
                        <span className="ml-auto text-sm font-medium text-emerald-500 dark:text-emerald-400 flex-shrink-0">
                          {formatMoney(data.perWinnerPrize)}
                        </span>
                      )}

                      {/* Strikes for eliminated */}
                      {activeTab === 'eliminated' && m.strikes > 0 && (
                        <span className="ml-auto text-sm text-neutral-500 dark:text-neutral-400 flex-shrink-0">
                          {m.strikes} strike{m.strikes !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
