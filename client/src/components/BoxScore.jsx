import { useState } from 'react';
import { ChevronDown, ChevronUp, BarChart3 } from 'lucide-react';
import { useThemedLogo } from '../utils/logo';

/**
 * BoxScore component — renders full player stats for completed games.
 * Supports sport-specific layouts:
 *   - basketball (NBA/NCAAB): Starters/Bench with unified columns
 *   - baseball (MLB): Batting lineup + Pitching tables
 *   - hockey (NHL): Skaters + Goalies tables
 *   - football (NFL): Passing, Rushing, Receiving, etc. grouped tables
 */
export default function BoxScore({ playerStats, game, alwaysExpanded = false }) {
  const [expanded, setExpanded] = useState(alwaysExpanded);

  if (!playerStats?.teams || playerStats.teams.length < 2) return null;

  const type = playerStats.type;
  const showContent = alwaysExpanded || expanded;

  return (
    <div className="space-y-2">
      {!alwaysExpanded && (
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
          className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-fg/70 uppercase tracking-wide px-3 py-1.5 rounded-lg bg-fg/5 hover:bg-fg/10 transition-colors"
        >
          <BarChart3 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          Box Score
          {expanded ? <ChevronUp className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <ChevronDown className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
        </button>
      )}

      {showContent && (
        <div className="space-y-4">
          {type === 'basketball' && <BasketballBoxScore data={playerStats} game={game} />}
          {type === 'baseball' && <BaseballBoxScore data={playerStats} game={game} />}
          {type === 'hockey' && <HockeyBoxScore data={playerStats} game={game} />}
          {type === 'football' && <FootballBoxScore data={playerStats} game={game} />}
        </div>
      )}
    </div>
  );
}

/* ── Shared table helpers ─────────────────────────────────────────── */

/** Which column indices should be highlighted as "key stats" */
const getKeyColumns = (columns) => {
  const keys = new Set();
  const keyLabels = ['PTS', 'G', 'HR', 'RBI', 'TD', 'YDS', 'H', 'R', 'ERA', 'K', 'SV%', 'QBR'];
  columns.forEach((col, i) => {
    if (keyLabels.includes(col)) keys.add(i);
  });
  return keys;
};

/** Which column indices should be dimmed (minutes, time-on-ice, etc.) */
const getDimColumns = (columns) => {
  const dims = new Set();
  const dimLabels = ['MIN', 'TOI', 'IP', 'PC-ST', 'NO', 'CAR', 'TGTS'];
  columns.forEach((col, i) => {
    if (dimLabels.includes(col)) dims.add(i);
  });
  return dims;
};

const StatTable = ({ columns, rows, teamLabel, teamLogo, sectionLabel, totals }) => {
  const tl = useThemedLogo();
  const keyColumns = getKeyColumns(columns);

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 px-2 pb-1">
        {teamLogo && <img src={tl(teamLogo)} alt={teamLabel} className="w-5 h-5 sm:w-6 sm:h-6" />}
        <span className="text-xs sm:text-sm font-semibold text-fg">{teamLabel}</span>
        {sectionLabel && <span className="text-[10px] sm:text-xs text-fg/60 uppercase tracking-wide">{sectionLabel}</span>}
      </div>
      <div className="overflow-x-auto -mx-1 px-1 scrollbar-thin">
        <table className="w-full text-[11px] sm:text-xs min-w-[480px]">
          <thead>
            <tr className="text-fg/60 border-b border-fg/10">
              <th className="text-left py-1 sm:py-1.5 pl-2 pr-1 font-medium sticky left-0 bg-inset z-10 whitespace-nowrap w-[22%]">Player</th>
              {columns.map((col, i) => (
                <th key={i} className="text-center py-1 sm:py-1.5 px-1 font-medium whitespace-nowrap">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={i}
                className={`
                  ${row.separator ? 'border-t border-fg/15' : 'border-b border-fg/[0.04]'}
                  ${!row.separator && i % 2 === 0 ? 'bg-fg/[0.02]' : ''}
                  hover:bg-fg/[0.06] transition-colors
                `}
              >
                {row.separator ? (
                  <td colSpan={columns.length + 1} className="py-1 sm:py-1.5 pl-2 text-[10px] sm:text-xs text-fg/60 uppercase font-semibold tracking-wide">
                    {row.separator}
                  </td>
                ) : (
                  <>
                    <td className="py-1 sm:py-1.5 pl-2 pr-1 sticky left-0 bg-inset z-10 overflow-hidden">
                      <span className="text-fg font-medium truncate block sm:hidden" title={row.name}>
                        {row.shortName || row.name}
                      </span>
                      <span className="text-fg font-medium truncate hidden sm:block" title={row.name}>
                        {row.name || row.shortName}
                      </span>
                    </td>
                    {row.stats.map((stat, j) => (
                      <td
                        key={j}
                        className={`text-center py-1 sm:py-1.5 px-1 whitespace-nowrap font-mono text-fg ${
                          keyColumns.has(j) ? 'font-semibold' : ''
                        }`}
                      >
                        {stat}
                      </td>
                    ))}
                  </>
                )}
              </tr>
            ))}

            {/* Team totals row */}
            {totals && (
              <tr className="border-t border-fg/15 bg-fg/[0.04]">
                <td className="py-1 sm:py-1.5 pl-2 pr-1 sticky left-0 bg-inset z-10">
                  <span className="text-fg/70 font-semibold text-[10px] sm:text-xs uppercase tracking-wide">Totals</span>
                </td>
                {totals.map((val, j) => (
                  <td
                    key={j}
                    className={`text-center py-1 sm:py-1.5 px-1 whitespace-nowrap font-mono text-fg font-semibold`}
                  >
                    {val}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/* ── Totals helper ────────────────────────────────────────────────── */

/**
 * Compute team totals for given rows + columns.
 * Sums numeric values; for percentage/ratio columns (FG%, 3PT%, FT%, AVG, OBP, SLG, SV%, FO%, PCT),
 * shows a dash instead of summing.
 */
const computeTotals = (rows, columns) => {
  const skipLabels = new Set(['FG%', '3PT%', 'FT%', 'AVG', 'OBP', 'SLG', 'SV%', 'FO%', 'PCT', 'ERA', 'QBR', 'RTG', '+/-', 'LONG']);
  const playerRows = rows.filter(r => !r.separator && r.stats);
  if (playerRows.length === 0) return null;

  return columns.map((col, j) => {
    if (skipLabels.has(col)) return '-';

    // Handle compound stats like "FG" = "8-15" → sum each part
    const firstVal = playerRows[0]?.stats?.[j];
    if (typeof firstVal === 'string' && firstVal.includes('-') && !firstVal.startsWith('-')) {
      // Looks like "X-Y" format (e.g., FG: 8-15, PC-ST: 65-42)
      let leftSum = 0, rightSum = 0;
      let isCompound = true;
      playerRows.forEach(r => {
        const parts = (r.stats?.[j] || '').split('-');
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
          leftSum += parseInt(parts[0]) || 0;
          rightSum += parseInt(parts[1]) || 0;
        } else {
          isCompound = false;
        }
      });
      if (isCompound) return `${leftSum}-${rightSum}`;
    }

    // Sum numeric values
    let sum = 0;
    let hasNumeric = false;
    playerRows.forEach(r => {
      const v = r.stats?.[j];
      const n = parseFloat(v);
      if (!isNaN(n)) {
        sum += n;
        hasNumeric = true;
      }
    });

    if (!hasNumeric) return '-';
    return Number.isInteger(sum) ? String(sum) : sum.toFixed(1);
  });
};

/* ── Basketball (NBA / NCAAB) ──────────────────────────────────── */

function BasketballBoxScore({ data, game }) {
  const { columns, teams } = data;

  const orderedTeams = orderTeams(teams, game);

  return (
    <div className="space-y-5">
      {orderedTeams.map((teamData, ti) => {
        const rows = [];

        // Starters
        if (teamData.starters?.length > 0) {
          rows.push({ separator: 'Starters' });
          teamData.starters.forEach(p => rows.push(p));
        }

        // Bench
        if (teamData.bench?.length > 0) {
          rows.push({ separator: 'Bench' });
          teamData.bench.forEach(p => rows.push(p));
        }

        const totals = computeTotals(rows, columns);

        return (
          <StatTable
            key={ti}
            columns={columns}
            rows={rows}
            teamLabel={teamData.team.abbreviation}
            teamLogo={teamData.team.logo}
            totals={totals}
          />
        );
      })}
    </div>
  );
}

/* ── Baseball (MLB) ───────────────────────────────────────────── */

function BaseballBoxScore({ data, game }) {
  const { battingColumns, pitchingColumns, teams } = data;

  const orderedTeams = orderTeams(teams, game);

  return (
    <div className="space-y-5">
      {orderedTeams.map((teamData, ti) => (
        <div key={ti} className="space-y-3">
          {/* Batting */}
          {teamData.batters?.length > 0 && (
            <StatTable
              columns={battingColumns}
              rows={teamData.batters}
              teamLabel={teamData.team.abbreviation}
              teamLogo={teamData.team.logo}
              sectionLabel="Batting"
              totals={computeTotals(teamData.batters, battingColumns)}
            />
          )}

          {/* Pitching */}
          {teamData.pitchers?.length > 0 && (
            <StatTable
              columns={pitchingColumns}
              rows={teamData.pitchers}
              teamLabel={teamData.team.abbreviation}
              teamLogo={teamData.team.logo}
              sectionLabel="Pitching"
              totals={computeTotals(teamData.pitchers, pitchingColumns)}
            />
          )}
        </div>
      ))}
    </div>
  );
}

/* ── Hockey (NHL) ─────────────────────────────────────────────── */

function HockeyBoxScore({ data, game }) {
  const { skaterColumns, goalieColumns, teams } = data;

  const orderedTeams = orderTeams(teams, game);

  return (
    <div className="space-y-5">
      {orderedTeams.map((teamData, ti) => (
        <div key={ti} className="space-y-3">
          {/* Skaters */}
          {teamData.skaters?.length > 0 && (
            <StatTable
              columns={skaterColumns}
              rows={teamData.skaters}
              teamLabel={teamData.team.abbreviation}
              teamLogo={teamData.team.logo}
              sectionLabel="Skaters"
              totals={computeTotals(teamData.skaters, skaterColumns)}
            />
          )}

          {/* Goalies */}
          {teamData.goalies?.length > 0 && (
            <StatTable
              columns={goalieColumns}
              rows={teamData.goalies}
              teamLabel={teamData.team.abbreviation}
              teamLogo={teamData.team.logo}
              sectionLabel="Goalies"
            />
          )}
        </div>
      ))}
    </div>
  );
}

/* ── Football (NFL) ───────────────────────────────────────────── */

function FootballBoxScore({ data, game }) {
  const { displayGroups, teams } = data;

  const orderedTeams = orderTeams(teams, game);

  const GROUP_LABELS = {
    passing: 'Passing',
    rushing: 'Rushing',
    receiving: 'Receiving',
    defensive: 'Defense',
    kicking: 'Kicking',
    punting: 'Punting',
  };

  return (
    <div className="space-y-5">
      {displayGroups.map(groupName => {
        const hasData = orderedTeams.some(t => t.groups?.[groupName]?.players?.length > 0);
        if (!hasData) return null;

        return (
          <div key={groupName} className="space-y-3">
            <div className="text-[10px] sm:text-xs text-fg/60 uppercase font-semibold tracking-wider">
              {GROUP_LABELS[groupName] || groupName}
            </div>
            {orderedTeams.map((teamData, ti) => {
              const group = teamData.groups?.[groupName];
              if (!group?.players?.length) return null;

              return (
                <StatTable
                  key={ti}
                  columns={group.columns}
                  rows={group.players}
                  teamLabel={teamData.team.abbreviation}
                  teamLogo={teamData.team.logo}
                  totals={computeTotals(group.players, group.columns)}
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/* ── Shared ordering helper ───────────────────────────────────── */

function orderTeams(teams, game) {
  const orderedTeams = [];
  if (game?.awayTeam && game?.homeTeam) {
    const away = teams.find(t => t.team.abbreviation === game.awayTeam.abbreviation);
    const home = teams.find(t => t.team.abbreviation === game.homeTeam.abbreviation);
    if (away) orderedTeams.push(away);
    if (home) orderedTeams.push(home);
  }
  if (orderedTeams.length === 0) orderedTeams.push(...teams);
  return orderedTeams;
}
