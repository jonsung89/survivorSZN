// Bracket Slot Utilities
// 63 games in a 64-team single-elimination bracket
//
// Slot numbering:
//   1-8:   East R64      9-16:  West R64     17-24: South R64    25-32: Midwest R64
//   33-36: East R32      37-40: West R32     41-44: South R32    45-48: Midwest R32
//   49-50: East S16      51-52: West S16     53-54: South S16    55-56: Midwest S16
//   57:    East E8       58:    West E8      59:    South E8     60:    Midwest E8
//   61:    FF (East vs West winner)    62: FF (South vs Midwest winner)
//   63:    Championship

const ROUND_BOUNDARIES = [
  { round: 0, name: 'Round of 64', shortName: 'R64', start: 1, end: 32, gamesPerRegion: 8 },
  { round: 1, name: 'Round of 32', shortName: 'R32', start: 33, end: 48, gamesPerRegion: 4 },
  { round: 2, name: 'Sweet 16', shortName: 'S16', start: 49, end: 56, gamesPerRegion: 2 },
  { round: 3, name: 'Elite 8', shortName: 'E8', start: 57, end: 60, gamesPerRegion: 1 },
  { round: 4, name: 'Final Four', shortName: 'F4', start: 61, end: 62, gamesPerRegion: 0 },
  { round: 5, name: 'Championship', shortName: 'CHAMP', start: 63, end: 63, gamesPerRegion: 0 },
];

// Default region names — used as fallback when tournament data isn't available.
// Actual region names should come from tournament data (data-driven).
const DEFAULT_REGIONS = ['East', 'West', 'South', 'Midwest'];
const REGIONS = DEFAULT_REGIONS;

// Standard bracket seed matchups for R64 (1v16, 8v9, 5v12, 4v13, 6v11, 3v14, 7v10, 2v15)
const SEED_MATCHUPS = [
  [1, 16], [8, 9], [5, 12], [4, 13], [6, 11], [3, 14], [7, 10], [2, 15],
];

const SCORING_PRESETS = {
  standard: { name: 'Standard', points: [1, 2, 4, 8, 16, 32] },
  espn:     { name: 'ESPN',     points: [10, 20, 40, 80, 160, 320] },
  cbs:      { name: 'CBS',      points: [1, 2, 3, 5, 8, 13] },
  yahoo:    { name: 'Yahoo',    points: [1, 2, 4, 8, 16, 32] },
};

const TIEBREAKER_TYPES = {
  total_score: { name: 'Championship Total Score', description: 'Predict the combined final score of the championship game' },
  most_upsets: { name: 'Most Upsets Correct', description: 'Whoever correctly predicted the most upsets wins the tiebreak' },
  higher_seed_wins: { name: 'Higher Seed Wins', description: 'Most correct picks where a higher-seeded team won' },
};

function getSlotRound(slot) {
  for (const rb of ROUND_BOUNDARIES) {
    if (slot >= rb.start && slot <= rb.end) return rb.round;
  }
  return -1;
}

function getRoundInfo(round) {
  return ROUND_BOUNDARIES[round] || null;
}

function getNextSlot(slot) {
  const round = getSlotRound(slot);
  if (round >= 5) return null; // Championship has no next
  const currentRound = ROUND_BOUNDARIES[round];
  const nextRound = ROUND_BOUNDARIES[round + 1];
  const offset = slot - currentRound.start;
  return nextRound.start + Math.floor(offset / 2);
}

function getSiblingSlot(slot) {
  const round = getSlotRound(slot);
  const currentRound = ROUND_BOUNDARIES[round];
  const offset = slot - currentRound.start;
  return offset % 2 === 0 ? slot + 1 : slot - 1;
}

function getChildSlots(slot) {
  const round = getSlotRound(slot);
  if (round === 0) return null; // R64 has no children — teams come from tournament_data
  const prevRound = ROUND_BOUNDARIES[round - 1];
  const offset = slot - ROUND_BOUNDARIES[round].start;
  return [prevRound.start + offset * 2, prevRound.start + offset * 2 + 1];
}

function getRegionForSlot(slot, regions = DEFAULT_REGIONS) {
  const round = getSlotRound(slot);
  if (round >= 4) return null; // Final Four and Championship are cross-region
  const currentRound = ROUND_BOUNDARIES[round];
  const offset = slot - currentRound.start;
  const regionIndex = Math.floor(offset / currentRound.gamesPerRegion);
  return regions[regionIndex] || null;
}

function getRegionSlots(regionIndex, round) {
  const rb = ROUND_BOUNDARIES[round];
  if (!rb || round >= 4) return [];
  const start = rb.start + regionIndex * rb.gamesPerRegion;
  const end = start + rb.gamesPerRegion;
  const slots = [];
  for (let s = start; s < end; s++) slots.push(s);
  return slots;
}

// Get all 63 slots organized by region for display
function getBracketStructure(regions = DEFAULT_REGIONS) {
  const structure = {
    regions: regions.map((name, idx) => ({
      name,
      index: idx,
      rounds: [0, 1, 2, 3].map(round => ({
        round,
        ...ROUND_BOUNDARIES[round],
        slots: getRegionSlots(idx, round),
      })),
    })),
    finalFour: {
      semifinals: [61, 62],
      championship: 63,
      // Slot 61: region 0 E8 winner vs region 1 E8 winner
      // Slot 62: region 2 E8 winner vs region 3 E8 winner
      semifinalRegions: [
        { slot: 61, regions: [regions[0] || 'Region 1', regions[1] || 'Region 2'] },
        { slot: 62, regions: [regions[2] || 'Region 3', regions[3] || 'Region 4'] },
      ],
    },
  };
  return structure;
}

// Get all downstream slots that could contain a given team
function getDownstreamSlots(slot) {
  const downstream = [];
  let current = getNextSlot(slot);
  while (current !== null) {
    downstream.push(current);
    current = getNextSlot(current);
  }
  return downstream;
}

// Cascade-remove a team from all downstream picks
function cascadeRemovePicks(picks, fromSlot, teamId) {
  const newPicks = { ...picks };
  const downstream = getDownstreamSlots(fromSlot);
  for (const ds of downstream) {
    if (newPicks[ds] === teamId) {
      delete newPicks[ds];
    }
  }
  return newPicks;
}

// Calculate bracket score
function calculateBracketScore(picks, results, scoringSystem) {
  let totalScore = 0;
  const roundScores = [0, 0, 0, 0, 0, 0];
  let correctPicks = 0;
  let totalDecided = 0;

  for (let slot = 1; slot <= 63; slot++) {
    const result = results[slot] || results[String(slot)];
    if (!result || result.status !== 'final') continue;
    totalDecided++;

    const round = getSlotRound(slot);
    const userPick = picks[slot] || picks[String(slot)];

    if (userPick && String(userPick) === String(result.winning_team_id)) {
      const points = scoringSystem[round] || 0;
      totalScore += points;
      roundScores[round] += points;
      correctPicks++;
    }
  }

  return { totalScore, roundScores, correctPicks, totalDecided };
}

// Calculate maximum possible remaining points
function calculatePotentialPoints(picks, results, scoringSystem) {
  let potential = 0;

  for (let slot = 1; slot <= 63; slot++) {
    const round = getSlotRound(slot);
    const result = results[slot] || results[String(slot)];
    const userPick = picks[slot] || picks[String(slot)];

    if (!userPick) continue;

    if (!result || result.status === 'pending' || result.status === 'in_progress') {
      // Game not decided — check if picked team is still alive
      if (isTeamStillAlive(String(userPick), slot, picks, results)) {
        potential += scoringSystem[round] || 0;
      }
    } else if (result.status === 'final' && String(userPick) === String(result.winning_team_id)) {
      potential += scoringSystem[round] || 0; // Already earned
    }
  }

  return potential;
}

function isTeamStillAlive(teamId, targetSlot, picks, results) {
  // A team is still alive if it hasn't lost in any earlier-round slot
  // Walk from R64 up to the slot before targetSlot
  for (let slot = 1; slot <= 63; slot++) {
    if (slot >= targetSlot) break;
    const result = results[slot] || results[String(slot)];
    if (result && result.status === 'final' && String(result.losing_team_id) === teamId) {
      return false;
    }
  }
  return true;
}

// Count picks made
function countPicks(picks) {
  return Object.keys(picks).filter(k => picks[k]).length;
}

module.exports = {
  ROUND_BOUNDARIES,
  REGIONS,
  DEFAULT_REGIONS,
  SEED_MATCHUPS,
  SCORING_PRESETS,
  TIEBREAKER_TYPES,
  getSlotRound,
  getRoundInfo,
  getNextSlot,
  getSiblingSlot,
  getChildSlots,
  getRegionForSlot,
  getRegionSlots,
  getBracketStructure,
  getDownstreamSlots,
  cascadeRemovePicks,
  calculateBracketScore,
  calculatePotentialPoints,
  isTeamStillAlive,
  countPicks,
};
