import { useState, useEffect, useMemo } from 'react';
import { RefreshCw, Search, ChevronDown, Clock, Download, Check, AlertTriangle, Database } from 'lucide-react';
import { adminAPI } from '../../api';
import Loading from '../../components/Loading';

export default function AdminProspects() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedRank, setExpandedRank] = useState(null);
  const [selectedYear, setSelectedYear] = useState(null);
  const [years, setYears] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);

  // Staging state
  const [staged, setStaged] = useState(null); // fetched but not yet confirmed
  const [fetching, setFetching] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const load = async (year) => {
    try {
      const result = await adminAPI.getProspects(year);
      setData(result.prospects || []);
      if (result.years?.length) setYears(result.years);
      if (result.draftYear && !selectedYear) setSelectedYear(result.draftYear);
      setLastUpdated(result.lastUpdated || null);
    } catch (err) {
      console.error('Failed to load prospects:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(selectedYear); }, []);

  const handleYearChange = (year) => {
    setSelectedYear(year);
    setLoading(true);
    setStaged(null);
    load(year);
  };

  const handleFetch = async () => {
    setFetching(true);
    try {
      const result = await adminAPI.fetchProspects();
      setStaged(result);
    } catch (err) {
      console.error('Failed to fetch prospects:', err);
    } finally {
      setFetching(false);
    }
  };

  const handleConfirm = async () => {
    if (!staged?.prospects?.length) return;
    setConfirming(true);
    try {
      const result = await adminAPI.confirmProspects(staged.prospects, staged.draftYear);
      setData(result.prospects || []);
      if (result.years?.length) setYears(result.years);
      setSelectedYear(result.draftYear);
      setLastUpdated(result.lastUpdated || null);
      setStaged(null);
    } catch (err) {
      console.error('Failed to confirm prospects:', err);
    } finally {
      setConfirming(false);
    }
  };

  const handleDiscard = () => {
    setStaged(null);
  };

  // Use staged data for display when available, otherwise DB data
  const displayProspects = staged?.prospects || data || [];
  const isStaged = !!staged;

  const filtered = useMemo(() => {
    if (!displayProspects.length) return [];
    if (!search.trim()) return displayProspects;
    const q = search.toLowerCase();
    return displayProspects.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.school || '').toLowerCase().includes(q) ||
      (p.position || '').toLowerCase().includes(q)
    );
  }, [displayProspects, search]);

  if (loading) return <Loading />;

  const matchedCount = displayProspects.filter(p => p.espnId).length;
  const currentYear = new Date().getMonth() >= 6 ? new Date().getFullYear() + 1 : new Date().getFullYear();

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-fg">NBA Prospects</h1>
          <div className="flex items-center gap-3 mt-1">
            {data?.length > 0 && !isStaged && (
              <span className="flex items-center gap-1.5 text-sm text-fg/40">
                <Database className="w-3.5 h-3.5" />
                {data.length} prospects ({matchedCount} ESPN matched)
              </span>
            )}
            {lastUpdated && !isStaged && (
              <span className="flex items-center gap-1.5 text-sm text-fg/40">
                <Clock className="w-3.5 h-3.5" />
                Last fetched {new Date(lastUpdated).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} at {new Date(lastUpdated).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Year dropdown */}
          <select
            value={selectedYear || currentYear}
            onChange={(e) => handleYearChange(parseInt(e.target.value))}
            className="px-3 py-2 rounded-lg bg-fg/5 border border-fg/10 text-sm font-medium text-fg"
          >
            {/* Always show current year + any years in DB */}
            {[...new Set([currentYear, ...years])].sort((a, b) => b - a).map(y => (
              <option key={y} value={y}>{y} Draft</option>
            ))}
          </select>

          {/* Fetch from sources button */}
          <button
            onClick={handleFetch}
            disabled={fetching}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-fg/5 hover:bg-fg/10 text-sm font-medium text-fg transition-colors disabled:opacity-50"
          >
            <Download className={`w-4 h-4 ${fetching ? 'animate-pulse' : ''}`} />
            {fetching ? 'Fetching...' : 'Fetch Latest'}
          </button>
        </div>
      </div>

      {/* Staging banner */}
      {isStaged && (
        <div className="mb-4 p-4 rounded-xl border-2 border-amber-500/30 bg-amber-500/5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-fg">
                Staged Data — Review Before Saving
              </p>
              <p className="text-sm text-fg/60 mt-1">
                Fetched {staged.totalCount} prospects from Tankathon + ESPN ({staged.matchedCount} ESPN matched).
                Review the data below and confirm to save to database, or discard to keep existing data.
              </p>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={handleConfirm}
                  disabled={confirming}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  {confirming ? 'Saving...' : `Confirm & Save (${selectedYear || currentYear})`}
                </button>
                <button
                  onClick={handleDiscard}
                  className="px-4 py-2 rounded-lg bg-fg/5 hover:bg-fg/10 text-sm font-medium text-fg transition-colors"
                >
                  Discard
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg/30" />
        <input
          type="text"
          placeholder="Search by name, school, or position..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-surface border border-fg/10 rounded-lg text-sm text-fg placeholder:text-fg/30 focus:outline-none focus:border-fg/20"
        />
      </div>

      {/* Empty state */}
      {!displayProspects.length && !isStaged && (
        <div className="bg-surface rounded-xl border border-fg/5 p-12 text-center">
          <Database className="w-10 h-10 text-fg/20 mx-auto mb-3" />
          <p className="text-fg/50 text-sm mb-1">No prospect data for {selectedYear || currentYear}</p>
          <p className="text-fg/30 text-sm">Click "Fetch Latest" to pull data from Tankathon + ESPN</p>
        </div>
      )}

      {/* Table */}
      {filtered.length > 0 && (
        <div className="bg-surface rounded-xl border border-fg/5 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-fg/10">
                  <th className="text-center px-3 py-2.5 text-fg/50 font-medium w-12">#</th>
                  <th className="text-left px-3 py-2.5 text-fg/50 font-medium">Player</th>
                  <th className="text-left px-3 py-2.5 text-fg/50 font-medium hidden sm:table-cell">Pos</th>
                  <th className="text-left px-3 py-2.5 text-fg/50 font-medium hidden md:table-cell">Size</th>
                  <th className="text-left px-3 py-2.5 text-fg/50 font-medium hidden lg:table-cell">Year</th>
                  <th className="text-center px-3 py-2.5 text-fg/50 font-medium">PPG</th>
                  <th className="text-center px-3 py-2.5 text-fg/50 font-medium">RPG</th>
                  <th className="text-center px-3 py-2.5 text-fg/50 font-medium">APG</th>
                  <th className="text-center px-3 py-2.5 text-fg/50 font-medium hidden sm:table-cell">STL</th>
                  <th className="text-center px-3 py-2.5 text-fg/50 font-medium hidden sm:table-cell">BLK</th>
                  <th className="w-8 px-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <ProspectRow
                    key={p.rank}
                    prospect={p}
                    isExpanded={expandedRank === p.rank}
                    onToggle={() => setExpandedRank(expandedRank === p.rank ? null : p.rank)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {filtered.length === 0 && displayProspects.length > 0 && (
        <div className="bg-surface rounded-xl border border-fg/5 p-8 text-center">
          <p className="text-fg/40 text-sm">No prospects match your search.</p>
        </div>
      )}
    </div>
  );
}

function ProspectRow({ prospect: p, isExpanded, onToggle }) {
  const s = p.espnStats || p.stats || {};
  const tankStats = p.stats || {};
  return (
    <>
      <tr
        className="border-b border-fg/5 last:border-0 cursor-pointer hover:bg-fg/3 transition-colors"
        onClick={onToggle}
      >
        <td className="px-3 py-2.5 text-center text-fg/60 font-mono">{p.rank}</td>
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-2.5">
            {p.headshotUrl ? (
              <img
                src={p.headshotUrl}
                alt=""
                className="w-8 h-8 rounded-full object-cover bg-fg/5 flex-shrink-0"
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            ) : p.logo ? (
              <img src={p.logo} alt="" className="w-6 h-6 object-contain flex-shrink-0" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-fg/5 flex-shrink-0" />
            )}
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-fg font-medium">{p.name}</span>
                {p.jersey && (
                  <span className="text-fg/30 text-sm">#{p.jersey}</span>
                )}
              </div>
              <div className="text-fg/40 text-sm sm:hidden">{p.position} | {p.school}</div>
              <div className="text-fg/40 text-sm hidden sm:block">{p.school}</div>
            </div>
          </div>
        </td>
        <td className="px-3 py-2.5 text-fg/70 hidden sm:table-cell">{p.position}</td>
        <td className="px-3 py-2.5 text-fg/70 hidden md:table-cell">
          {p.height}{p.weight ? ` / ${p.weight}` : ''}
        </td>
        <td className="px-3 py-2.5 text-fg/70 hidden lg:table-cell">{p.year}</td>
        <td className="px-3 py-2.5 text-center text-fg font-semibold">{s.ppg || tankStats.pts || '—'}</td>
        <td className="px-3 py-2.5 text-center text-fg/70">{s.rpg || tankStats.reb || '—'}</td>
        <td className="px-3 py-2.5 text-center text-fg/70">{s.apg || tankStats.ast || '—'}</td>
        <td className="px-3 py-2.5 text-center text-fg/70 hidden sm:table-cell">{s.spg || tankStats.stl || '—'}</td>
        <td className="px-3 py-2.5 text-center text-fg/70 hidden sm:table-cell">{s.bpg || tankStats.blk || '—'}</td>
        <td className="px-2 py-2.5">
          <ChevronDown className={`w-4 h-4 text-fg/30 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={11} className="px-4 pb-3 pt-0">
            <div className="bg-fg/3 rounded-lg border border-fg/5 p-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <DetailItem label="Position" value={p.position} />
                <DetailItem label="School" value={p.school} />
                <DetailItem label="Height" value={p.height || '—'} />
                <DetailItem label="Weight" value={p.weight ? `${p.weight} lbs` : '—'} />
                <DetailItem label="Year" value={p.year || '—'} />
                {p.espnId && <DetailItem label="ESPN ID" value={p.espnId} />}
                {p.jersey && <DetailItem label="Jersey" value={`#${p.jersey}`} />}
                {s.gp > 0 && <DetailItem label="Games Played" value={s.gp} />}
              </div>

              {/* ESPN Season Stats */}
              {p.espnStats && (
                <div className="mt-3 pt-3 border-t border-fg/10">
                  <p className="text-sm font-medium text-fg/50 mb-2">ESPN Season Stats</p>
                  <div className="flex flex-wrap gap-4">
                    {[
                      { l: 'PPG', v: s.ppg },
                      { l: 'RPG', v: s.rpg },
                      { l: 'APG', v: s.apg },
                      { l: 'SPG', v: s.spg },
                      { l: 'BPG', v: s.bpg },
                      { l: 'MPG', v: s.mpg },
                      { l: 'FG%', v: s.fgPct != null ? s.fgPct.toFixed(1) : null },
                      { l: '3P%', v: s.threePct != null ? s.threePct.toFixed(1) : null },
                      { l: 'FT%', v: s.ftPct != null ? s.ftPct.toFixed(1) : null },
                      { l: 'GP', v: s.gp },
                    ].filter(x => x.v != null && x.v !== 0).map(x => (
                      <div key={x.l} className="text-center">
                        <div className="text-fg font-semibold">{x.v}</div>
                        <div className="text-fg/40 text-sm">{x.l}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tankathon Stats (fallback) */}
              {!p.espnStats && Object.keys(tankStats).length > 0 && (
                <div className="mt-3 pt-3 border-t border-fg/10">
                  <p className="text-sm font-medium text-fg/50 mb-2">Tankathon Stats (Per Game)</p>
                  <div className="flex flex-wrap gap-4">
                    {Object.entries(tankStats).map(([key, val]) => (
                      <div key={key} className="text-center">
                        <div className="text-fg font-semibold">{val}</div>
                        <div className="text-fg/40 text-sm uppercase">{key}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function DetailItem({ label, value }) {
  return (
    <div>
      <p className="text-sm text-fg/40">{label}</p>
      <p className="text-sm text-fg font-medium">{value}</p>
    </div>
  );
}
