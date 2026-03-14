import { useMemo } from 'react';
import { useTheme } from '../context/ThemeContext';

// ┌─────────────────────────────────────────────────────────────────────────────┐
// │                      BASKETBALL COURT — SVG COMPONENT                      │
// │                                                                            │
// │  Renders a full NBA/NCAAB basketball court in a HORIZONTAL layout with     │
// │  3D perspective (CSS rotateX). Used by Gamecast and ShotChart to           │
// │  visualize shot locations from ESPN play-by-play data.                     │
// │                                                                            │
// │  KEY CONCEPTS:                                                             │
// │  • SVG coordinate system: 940×500 (94ft × 50ft), 10 SVG units = 1 foot    │
// │  • X-axis = court length (baseline to baseline), Y-axis = court width      │
// │  • Right half = "near" (home team), Left half = "far" (away team)          │
// │  • 3D effect via CSS perspective + rotateX(35deg) on parent div            │
// │  • offy on basket assembly fakes elevation above the tilted court          │
// │                                                                            │
// │  ESPN COORDINATE SYSTEM (play-by-play data):                               │
// │  • ESPN x: 0–50 → court WIDTH in feet (left sideline to right sideline)    │
// │  • ESPN y: 0–~47 → DEPTH from the BASKET center, NOT the baseline         │
// │    - y=0 is at the basket (5.25ft in front of the baseline)                │
// │    - y=25 is roughly half-court                                            │
// │    - y=47 is roughly the opposite basket                                   │
// │  • Shot distance is measured from the CENTER OF THE RIM to the shooter     │
// │  • Free throws: ESPN sends (25, 0) as a sentinel — Gamecast overrides      │
// │    this to y=14.5 (FT line is 15ft from backboard, ~13.75ft from rim)      │
// │                                                                            │
// │  COORDINATE MAPPING (ESPN → SVG):                                          │
// │  • Near half: svgX = NEAR_BASKET.x - espnY × 10                           │
// │               svgY = (espnX / 50) × 500                                   │
// │  • Far half:  svgX = FAR_BASKET.x + espnY × 10                            │
// │               svgY = 500 - (espnX / 50) × 500                             │
// │  • Teams are mirrored — near side maps directly, far side flips Y          │
// │                                                                            │
// │  DEBUG MODE (admin only, toggled from Gamecast):                            │
// │  • showDebug prop renders colored reference dots at key ESPN coordinates    │
// │  • Magenta = (0,0), Green = (50,25), Yellow = (25,25), Orange = (25,0)     │
// │  • Dots appear on both halves of the court for visual verification          │
// └─────────────────────────────────────────────────────────────────────────────┘

// ── Full-court dimensions — HORIZONTAL layout ──
// 94ft court length along X-axis (940 SVG units), 50ft width along Y-axis (500 SVG units)
// Scale: 10 SVG units = 1 foot
const L = 940;   // court length (x-axis), 94ft
const W = 500;   // court width (y-axis), 50ft
const MID = L / 2; // 470 — center court x

// Basket centers — 5.25ft (52.5 SVG units) from each baseline along x-axis
// These are the anchor points for ESPN coordinate mapping (ESPN y=0 maps here)
const NEAR_BASKET = { x: L - 52.5, y: 250 };  // 887.5, 250 — right end (home team)
const FAR_BASKET  = { x: 52.5,     y: 250 };   // 52.5, 250  — left end (away team)

// Regulation court measurements (all in SVG units, 10 units = 1ft)
const PAINT_DEPTH     = 190;  // 19ft — baseline to free-throw line
const FT_CIRCLE_R     = 60;   // 6ft radius
const RESTRICTED_R    = 40;   // 4ft radius (restricted area arc)
const CORNER_3_DEPTH  = 140;  // 14ft — baseline to where 3pt arc begins
const CENTER_CIRCLE_R = 60;   // 6ft radius
const BACKBOARD_W     = 60;   // 6ft (not directly used, kept for reference)

// Paint width differs between leagues: NBA = 16ft, NCAAB = 12ft
const PAINT_W = { nba: 160, ncaab: 120 };

// ── ESPN → SVG coordinate mapping ──
// See block comment above for full coordinate system documentation.
// ESPN coords are BASKET-ANCHORED: y=0 is the basket, not the baseline.
// This was a critical fix — before basket-anchoring, all shots were ~5.25ft too close.

/**
 * Map ESPN x (0–50) to SVG Y coordinate.
 * ESPN x represents lateral position across the court width (50ft).
 * Direct proportional mapping: espnX=0 → svgY=0 (top), espnX=50 → svgY=500 (bottom)
 */
function espnXtoSvgY(espnX) {
  return (espnX / 50) * W;
}

/**
 * Validate ESPN coordinates — reject garbage sentinels or out-of-range values.
 * ESPN occasionally sends extreme values (e.g., -999) for plays without location data.
 */
function validEspn(espnX, espnY) {
  if (espnX == null || espnY == null) return false;
  if (espnX < -100 || espnX > 100 || espnY < -100 || espnY > 100) return false;
  return true;
}

/**
 * Convert ESPN coordinates to SVG position on the NEAR (right/home) half.
 * espnY=0 maps to NEAR_BASKET.x (887.5), increasing y moves toward center court.
 * Returns { x, y } in SVG coordinates, or null if invalid.
 */
export function espnToSvg(espnX, espnY) {
  if (!validEspn(espnX, espnY)) return null;
  const svgX = NEAR_BASKET.x - espnY * 10;
  const svgY = espnXtoSvgY(espnX);
  return { x: svgX, y: svgY };
}

/**
 * Convert ESPN coordinates to SVG position on the FAR (left/away) half.
 * Mirrors the near-side mapping: espnY=0 maps to FAR_BASKET.x (52.5),
 * increasing y moves toward center court. Y-axis is also flipped.
 * Returns { x, y } in SVG coordinates, or null if invalid.
 */
export function espnToSvgFar(espnX, espnY) {
  if (!validEspn(espnX, espnY)) return null;
  const svgX = FAR_BASKET.x + espnY * 10;
  const svgY = W - espnXtoSvgY(espnX);
  return { x: svgX, y: svgY };
}

// ── Colors (light maple hardwood) ──
const PAINT_C = 'rgba(160,110,60,0.18)';
const LINE    = '#ffffff';
const LW      = 2;
const LO      = 0.92;

/**
 * BasketballCourt — renders a full SVG basketball court with 3D perspective.
 *
 * @param {string}  courtType  — 'nba' or 'ncaab' (affects paint width: 16ft vs 12ft)
 * @param {string}  homeLogo   — URL for home team logo, displayed at center court
 * @param {string}  homeColor  — hex color for home team (used on base pads)
 * @param {ReactNode} children — SVG elements overlaid on the court (shot markers, etc.)
 * @param {string}  className  — additional CSS classes for the wrapper div
 * @param {boolean} showDebug  — admin-only: show colored reference dots at key ESPN coordinates
 */
export default function BasketballCourt({ courtType = 'nba', homeLogo, homeColor, children, className = '', showDebug = false }) {
  const { isDark } = useTheme();
  const paintW    = PAINT_W[courtType] || PAINT_W.nba;
  const paintTop  = (W - paintW) / 2; // y position of paint top edge

  // Court colors — solid fill, consistent across all screen sizes
  const woodLight = '#c4a46a';
  const woodDark  = '#b89a60';
  const apronColor = '#6e5230';
  const threeR    = courtType === 'nba' ? 237.5 : 221.75;

  // ── Three-point arcs (horizontal layout) ──
  // Near (right) half — arc opens leftward toward center
  const nearThreeArc = useMemo(() => {
    const { x: bx, y: by } = NEAR_BASKET;
    const cornerX = L - CORNER_3_DEPTH;
    const dx = bx - cornerX;
    const dy = Math.sqrt(threeR * threeR - dx * dx);
    // Corner 3s run along right baseline (x=L), arc sweeps from top to bottom
    return `M ${L} ${by - dy} L ${cornerX} ${by - dy} A ${threeR} ${threeR} 0 0 0 ${cornerX} ${by + dy} L ${L} ${by + dy}`;
  }, [threeR]);

  // Far (left) half — arc opens rightward toward center
  const farThreeArc = useMemo(() => {
    const { x: bx, y: by } = FAR_BASKET;
    const cornerX = CORNER_3_DEPTH;
    const dx = cornerX - bx;
    const dy = Math.sqrt(threeR * threeR - dx * dx);
    return `M 0 ${by + dy} L ${cornerX} ${by + dy} A ${threeR} ${threeR} 0 0 0 ${cornerX} ${by - dy} L 0 ${by - dy}`;
  }, [threeR]);

  // ── Restricted area arcs ──
  const nearRestrictedArc = useMemo(() => {
    const { x: bx, y: by } = NEAR_BASKET;
    return `M ${bx} ${by - RESTRICTED_R} A ${RESTRICTED_R} ${RESTRICTED_R} 0 0 0 ${bx} ${by + RESTRICTED_R}`;
  }, []);
  const farRestrictedArc = useMemo(() => {
    const { x: bx, y: by } = FAR_BASKET;
    return `M ${bx} ${by + RESTRICTED_R} A ${RESTRICTED_R} ${RESTRICTED_R} 0 0 0 ${bx} ${by - RESTRICTED_R}`;
  }, []);

  // ── Free-throw circles ──
  // Near FT line x = L - PAINT_DEPTH = 750
  const nearFtX = L - PAINT_DEPTH;
  const farFtX  = PAINT_DEPTH;

  // Near: solid half faces center (left), dashed faces basket (right)
  const nearFtSolid  = `M ${nearFtX} ${250 - FT_CIRCLE_R} A ${FT_CIRCLE_R} ${FT_CIRCLE_R} 0 0 0 ${nearFtX} ${250 + FT_CIRCLE_R}`;
  const nearFtDashed = `M ${nearFtX} ${250 + FT_CIRCLE_R} A ${FT_CIRCLE_R} ${FT_CIRCLE_R} 0 0 0 ${nearFtX} ${250 - FT_CIRCLE_R}`;
  // Far: solid half faces center (right), dashed faces basket (left)
  const farFtSolid  = `M ${farFtX} ${250 + FT_CIRCLE_R} A ${FT_CIRCLE_R} ${FT_CIRCLE_R} 0 0 1 ${farFtX} ${250 - FT_CIRCLE_R}`;
  const farFtDashed = `M ${farFtX} ${250 - FT_CIRCLE_R} A ${FT_CIRCLE_R} ${FT_CIRCLE_R} 0 0 1 ${farFtX} ${250 + FT_CIRCLE_R}`;

  // Hash marks on paint sides (perpendicular to sideline)
  const hashMarks = (baselineX, dir) => {
    const marks = [];
    for (let i = 1; i <= 4; i++) {
      const x = baselineX + dir * (PAINT_DEPTH / 5) * i;
      marks.push(
        <g key={`h${dir}${i}`}>
          <line x1={x} y1={paintTop - 6} x2={x} y2={paintTop}
            stroke={LINE} strokeWidth="1" opacity={LO * 0.6} />
          <line x1={x} y1={paintTop + paintW} x2={x} y2={paintTop + paintW + 6}
            stroke={LINE} strokeWidth="1" opacity={LO * 0.6} />
        </g>,
      );
    }
    return marks;
  };

  // Theme-aware hoop colors
  const poleColor = isDark ? '#777' : '#555';
  const braceColor = isDark ? '#888' : '#666';
  const bbFill = isDark ? '#e8e8e8' : '#ffffff';
  const bbStroke = isDark ? '#bbb' : '#888';
  const bracketColor = isDark ? '#999' : '#555';
  const bracketDetail = isDark ? '#aaa' : '#777';
  const netColor = isDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.18)';
  const netRingColor = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)';

  // ── Basket assembly ──
  // Renders a full basket structure: base pad → pole → horizontal arm → backboard → bracket → rim + net
  //
  // 3D PERSPECTIVE NOTES:
  // The court has CSS rotateX(35deg), so "up" (perpendicular to court surface) projects
  // as -Y in SVG coordinates. The offy offset fakes the hoop's elevation above the court.
  //
  // PARAMETERS:
  //   bx, by — basket center position in SVG coords (e.g., NEAR_BASKET = 887.5, 250)
  //   dir — direction multiplier: +1 for near (right) side, -1 for far (left) side
  //         Controls which way the backboard/pole face (toward their respective baseline)
  //
  // COORDINATE ALIGNMENT:
  // The rim center (rimCx) is placed at the basket position (bx), which is where
  // ESPN coordinate (25, 0) maps to. Shot distance is measured from rim center to shooter.
  const basePadColor = homeColor ? `#${homeColor.replace('#', '')}` : '#1a3a6e';
  const basket = (bx, by, dir) => {
    const offy = -24;                   // vertical offset to fake elevation above tilted court
    const rimCx = bx;                   // rim center X = basket position (ESPN 25,0 maps here)
    const rimCy = by + offy;            // rim center Y = 250 + offy = 226 (elevated above court)
    const rimR = 9;                     // rim radius in SVG units

    // ── Backboard — parallelogram to show 3D perspective ──
    // Front face X (the side facing the court)
    const bbFrontX = rimCx + dir * 14;  // behind the rim toward baseline
    const bbHalfW = 28;               // half-width along Y (6ft board)
    const bbRise = 28;                // 3D height of backboard
    const bbShift = dir * 4;          // small shift = near-vertical left/right edges
    const bbDepthX = dir * 5;         // X-axis thickness (top face depth)
    // Front face corners (near-vertical parallelogram)
    const fb1 = { x: bbFrontX, y: rimCy + bbHalfW };
    const fb2 = { x: bbFrontX, y: rimCy - bbHalfW };
    const ft1 = { x: bbFrontX + bbShift, y: rimCy - bbHalfW - bbRise };
    const ft2 = { x: bbFrontX + bbShift, y: rimCy + bbHalfW - bbRise };
    // Top face back edge (extends in X for thickness)
    const bt1 = { x: ft1.x + bbDepthX, y: ft1.y };
    const bt2 = { x: ft2.x + bbDepthX, y: ft2.y };

    // ── Pole & base — fully behind baseline ──
    const baselineX = dir === 1 ? L : 0;
    const poleX = baselineX + dir * 16;
    const poleBaseY = by;             // ground level (court center Y=250)
    const poleTopY = rimCy;           // elevated (212), pole goes "up" = -Y

    // Base pad — centered on pole, behind baseline
    const padW = 32;
    const padH = 44;

    return (
      <g>
        {/* ── Base pad — colored padding, fully behind baseline ── */}
        <rect
          x={poleX - padW / 2} y={poleBaseY - padH / 2}
          width={padW} height={padH}
          fill={basePadColor}
          stroke={isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.12)'}
          strokeWidth="1" rx="2"
        />

        {/* ── Vertical pole — from base straight up to arm ── */}
        {/* Shift top AWAY from court (dir * 10) to counteract perspective pushing bottom outward */}
        <line x1={poleX} y1={poleBaseY} x2={poleX + dir * 10} y2={poleTopY}
          stroke={isDark ? '#aaa' : '#999'} strokeWidth="5" strokeLinecap="round" />
        <line x1={poleX - 1.5} y1={poleBaseY} x2={poleX + dir * 10 - 1.5} y2={poleTopY}
          stroke={isDark ? '#ccc' : '#bbb'} strokeWidth="1" opacity="0.4" />

        {/* ── Horizontal arm — pole top to back of backboard (lowered connection) ── */}
        <line x1={poleX + dir * 10} y1={poleTopY} x2={bt1.x} y2={rimCy}
          stroke={isDark ? '#aaa' : '#999'} strokeWidth="4" strokeLinecap="round" />

        {/* ── Backboard — front face + top face for 3D depth ── */}
        {/* Top face (visible from above, adds X-axis thickness) */}
        <path
          d={`M ${ft1.x} ${ft1.y} L ${bt1.x} ${bt1.y} L ${bt2.x} ${bt2.y} L ${ft2.x} ${ft2.y} Z`}
          fill={isDark ? '#ccc' : '#ddd'} stroke={bbStroke} strokeWidth="0.8"
        />
        {/* Side face (visible edge — bottom/left side of backboard) */}
        <path
          d={`M ${fb1.x} ${fb1.y} L ${ft2.x} ${ft2.y} L ${bt2.x} ${bt2.y} L ${fb1.x + bbDepthX} ${fb1.y} Z`}
          fill={isDark ? '#bbb' : '#ccc'} stroke={bbStroke} strokeWidth="0.8"
        />
        {/* Front face (near-vertical edges) */}
        <path
          d={`M ${fb1.x} ${fb1.y} L ${fb2.x} ${fb2.y} L ${ft1.x} ${ft1.y} L ${ft2.x} ${ft2.y} Z`}
          fill={bbFill} stroke={bbStroke} strokeWidth="1.5"
        />
        {/* Inner target square (on front face) */}
        <path
          d={`M ${bbFrontX} ${rimCy - 10}
              L ${bbFrontX + bbShift * 0.4} ${rimCy - 10 - bbRise * 0.4}
              L ${bbFrontX + bbShift * 0.4} ${rimCy + 10 - bbRise * 0.4}
              L ${bbFrontX} ${rimCy + 10} Z`}
          fill="none" stroke={bbStroke} strokeWidth="0.8" opacity="0.35"
        />

        {/* ── Bracket — backboard front face to rim ── */}
        <line x1={bbFrontX} y1={rimCy} x2={rimCx + dir * rimR} y2={rimCy}
          stroke={bracketColor} strokeWidth="2.5" />

        {/* ── Rim glow ── */}
        <circle cx={rimCx} cy={rimCy} r={rimR + 8} fill="url(#rimGlow)" />

        {/* ── Net — white mesh (drawn first so rim renders on top) ── */}
        {Array.from({ length: 10 }, (_, i) => {
          const angle = (i / 10) * Math.PI * 2;
          const startX = rimCx + Math.cos(angle) * (rimR - 1);
          const startY = rimCy + Math.sin(angle) * (rimR - 1);
          const endX = rimCx + Math.cos(angle) * 2.5;
          const endY = rimCy + 18;
          return (
            <line key={`net-${i}`}
              x1={startX} y1={startY} x2={endX} y2={endY}
              stroke={isDark ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.85)'}
              strokeWidth="0.8" />
          );
        })}
        <ellipse cx={rimCx} cy={rimCy + 10} rx={5} ry={2}
          fill="none" stroke={isDark ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.6)'}
          strokeWidth="0.6" />
        <ellipse cx={rimCx} cy={rimCy + 18} rx={3} ry={1.2}
          fill="none" stroke={isDark ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.5)'}
          strokeWidth="0.5" />

        {/* ── Rim — orange ring (on top of net) ── */}
        <circle cx={rimCx} cy={rimCy} r={rimR}
          fill="none" stroke="#d84315" strokeWidth="2.8" />
        <circle cx={rimCx} cy={rimCy} r={rimR - 1.5}
          fill="none" stroke="#ff6d00" strokeWidth="0.7" opacity="0.4" />
      </g>
    );
  };

  const pad = 25; // apron padding

  return (
    <div className={`relative ${className}`}
      style={{
        margin: '0 auto',
        padding: '0 10%',
        perspective: '800px',
        perspectiveOrigin: '50% 30%',
      }}
    >
      <div style={{
        transform: 'rotateX(35deg)',
        transformStyle: 'preserve-3d',
        transformOrigin: '50% 0%',
      }}>
        <svg
          viewBox={`${-pad} ${-pad} ${L + pad * 2} ${W + pad * 2}`}
          className="w-full"
          xmlns="http://www.w3.org/2000/svg"
          style={{
            borderRadius: 6,
            filter: 'drop-shadow(0 12px 32px rgba(0,0,0,0.35))',
          }}
        >
          <defs>
            <radialGradient id="spotlight" cx="50%" cy="50%" r="60%">
              <stop offset="0%" stopColor="#fff" stopOpacity="0.04" />
              <stop offset="100%" stopColor="#000" stopOpacity="0.06" />
            </radialGradient>

            <radialGradient id="rimGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#ff6b00" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#ff6b00" stopOpacity="0" />
            </radialGradient>

            {/* Center court logo clip */}
            <clipPath id="centerLogoClip">
              <circle cx={MID} cy={250} r={CENTER_CIRCLE_R - 4} />
            </clipPath>
          </defs>

          {/* Arena floor apron — darker stained wood border like a real court */}
          <rect x={-pad} y={-pad} width={L + pad * 2} height={W + pad * 2}
            fill={apronColor} rx="4" />

          {/* Court surface — solid fill for consistent color across all screen sizes */}
          <rect x="0" y="0" width={L} height={W} fill={woodLight} />

          {/* Paint areas */}
          <rect x={L - PAINT_DEPTH} y={paintTop} width={PAINT_DEPTH} height={paintW} fill={PAINT_C} />
          <rect x={0}               y={paintTop} width={PAINT_DEPTH} height={paintW} fill={PAINT_C} />

          {/* ── Center court ── */}
          <line x1={MID} y1={0} x2={MID} y2={W} stroke={LINE} strokeWidth={LW} opacity={LO} />
          {!homeLogo && (
            <>
              <circle cx={MID} cy={250} r={CENTER_CIRCLE_R} fill="none"
                stroke={LINE} strokeWidth={LW} opacity={LO} />
              <circle cx={MID} cy={250} r="20" fill="none"
                stroke={LINE} strokeWidth="1.5" opacity={LO * 0.5} />
            </>
          )}

          {/* Center court logo — on top of circle, bigger than the ring */}
          {homeLogo && (
            <image
              href={homeLogo}
              x={MID - 120}
              y={250 - 120}
              width={240}
              height={240}
              opacity="0.7"
              preserveAspectRatio="xMidYMid meet"
            />
          )}

          {/* Outer boundary */}
          <rect x="0" y="0" width={L} height={W}
            fill="none" stroke={LINE} strokeWidth="3" opacity={LO} />

          {/* ========= NEAR HALF (right) — Home ========= */}

          <rect x={nearFtX} y={paintTop} width={PAINT_DEPTH} height={paintW}
            fill="none" stroke={LINE} strokeWidth={LW} opacity={LO} />
          <line x1={nearFtX} y1={paintTop} x2={nearFtX} y2={paintTop + paintW}
            stroke={LINE} strokeWidth={LW} opacity={LO} />
          <path d={nearFtSolid} fill="none" stroke={LINE} strokeWidth="1.5" opacity={LO} />
          <path d={nearFtDashed} fill="none" stroke={LINE} strokeWidth="1.5" opacity={LO * 0.6}
            strokeDasharray="8 8" />
          <path d={nearThreeArc} fill="none" stroke={LINE} strokeWidth={LW} opacity={LO} />
          <path d={nearRestrictedArc} fill="none" stroke={LINE} strokeWidth="1.5" opacity={LO} />
          {hashMarks(L, -1)}
          {basket(NEAR_BASKET.x, NEAR_BASKET.y, 1)}

          {/* ========= FAR HALF (left) — Away ========= */}

          <rect x={0} y={paintTop} width={PAINT_DEPTH} height={paintW}
            fill="none" stroke={LINE} strokeWidth={LW} opacity={LO} />
          <line x1={farFtX} y1={paintTop} x2={farFtX} y2={paintTop + paintW}
            stroke={LINE} strokeWidth={LW} opacity={LO} />
          <path d={farFtSolid} fill="none" stroke={LINE} strokeWidth="1.5" opacity={LO} />
          <path d={farFtDashed} fill="none" stroke={LINE} strokeWidth="1.5" opacity={LO * 0.6}
            strokeDasharray="8 8" />
          <path d={farThreeArc} fill="none" stroke={LINE} strokeWidth={LW} opacity={LO} />
          <path d={farRestrictedArc} fill="none" stroke={LINE} strokeWidth="1.5" opacity={LO} />
          {hashMarks(0, 1)}
          {basket(FAR_BASKET.x, FAR_BASKET.y, -1)}

          {/* Spotlight / lighting overlay */}
          <rect x="0" y="0" width={L} height={W} fill="url(#spotlight)" />

          {/* ── Debug reference dots (admin only) ──
              Colored dots at key ESPN coordinates to verify coordinate mapping.
              Each dot shows its ESPN (x, y) value with a leader line to a label.
              Near side = home team (right half), Far side = away team (left half).
              Colors: magenta=(0,0), green=(50,25), yellow=(25,25), orange=(25,0)
              The orange (25,0) dot should align with the rim center on each side. */}

          {/* Debug dots — near (right/home) side */}
          {showDebug && <>
            {/* ESPN (0, 0) → SVG (887.5, 0) — top-right corner, label below */}
            <circle cx={887.5} cy={0} r="12" fill="#ff00ff" stroke="#fff" strokeWidth="2" />
            <line x1={887.5} y1={14} x2={887.5} y2={38} stroke="#ff00ff" strokeWidth="2" />
            <rect x={827.5} y={40} width="120" height="28" rx="6" fill="#ff00ff" />
            <text x={887.5} y={60} textAnchor="middle" fill="#fff" fontSize="18" fontWeight="900">(0, 0)</text>

            {/* ESPN (50, 25) → SVG (637.5, 500) — bottom-center-right, label above */}
            <circle cx={637.5} cy={500} r="12" fill="#00ff00" stroke="#fff" strokeWidth="2" />
            <line x1={637.5} y1={486} x2={637.5} y2={462} stroke="#00ff00" strokeWidth="2" />
            <rect x={577.5} y={432} width="120" height="28" rx="6" fill="#00ff00" />
            <text x={637.5} y={452} textAnchor="middle" fill="#000" fontSize="18" fontWeight="900">(50, 25)</text>

            {/* ESPN (25, 25) → SVG (637.5, 250) — center of near half, label below */}
            <circle cx={637.5} cy={250} r="12" fill="#ffff00" stroke="#fff" strokeWidth="2" />
            <line x1={637.5} y1={264} x2={637.5} y2={288} stroke="#ffff00" strokeWidth="2" />
            <rect x={577.5} y={290} width="120" height="28" rx="6" fill="#ffff00" />
            <text x={637.5} y={310} textAnchor="middle" fill="#000" fontSize="18" fontWeight="900">(25, 25)</text>

            {/* ESPN (25, 0) → SVG (887.5, 250) — basket/rim center, label below */}
            <circle cx={887.5} cy={250} r="12" fill="#ff6600" stroke="#fff" strokeWidth="2" />
            <line x1={887.5} y1={264} x2={887.5} y2={288} stroke="#ff6600" strokeWidth="2" />
            <rect x={827.5} y={290} width="120" height="28" rx="6" fill="#ff6600" />
            <text x={887.5} y={310} textAnchor="middle" fill="#fff" fontSize="18" fontWeight="900">(25, 0)</text>
          </>}

          {/* Debug dots — far (left/away) side (mirrored from near side) */}
          {showDebug && <>
            {/* ESPN (0, 0) → SVG (52.5, 500) — bottom-left corner, label above */}
            <circle cx={52.5} cy={500} r="12" fill="#ff00ff" stroke="#fff" strokeWidth="2" />
            <line x1={52.5} y1={486} x2={52.5} y2={462} stroke="#ff00ff" strokeWidth="2" />
            <rect x={-7.5} y={432} width="120" height="28" rx="6" fill="#ff00ff" />
            <text x={52.5} y={452} textAnchor="middle" fill="#fff" fontSize="18" fontWeight="900">(0, 0)</text>

            {/* ESPN (50, 25) → SVG (302.5, 0) — top-center-left, label below */}
            <circle cx={302.5} cy={0} r="12" fill="#00ff00" stroke="#fff" strokeWidth="2" />
            <line x1={302.5} y1={14} x2={302.5} y2={38} stroke="#00ff00" strokeWidth="2" />
            <rect x={242.5} y={40} width="120" height="28" rx="6" fill="#00ff00" />
            <text x={302.5} y={60} textAnchor="middle" fill="#000" fontSize="18" fontWeight="900">(50, 25)</text>

            {/* ESPN (25, 25) → SVG (302.5, 250) — center of far half, label below */}
            <circle cx={302.5} cy={250} r="12" fill="#ffff00" stroke="#fff" strokeWidth="2" />
            <line x1={302.5} y1={264} x2={302.5} y2={288} stroke="#ffff00" strokeWidth="2" />
            <rect x={242.5} y={290} width="120" height="28" rx="6" fill="#ffff00" />
            <text x={302.5} y={310} textAnchor="middle" fill="#000" fontSize="18" fontWeight="900">(25, 25)</text>

            {/* ESPN (25, 0) → SVG (52.5, 250) — basket/rim center, label below */}
            <circle cx={52.5} cy={250} r="12" fill="#ff6600" stroke="#fff" strokeWidth="2" />
            <line x1={52.5} y1={264} x2={52.5} y2={288} stroke="#ff6600" strokeWidth="2" />
            <rect x={-7.5} y={290} width="120" height="28" rx="6" fill="#ff6600" />
            <text x={52.5} y={310} textAnchor="middle" fill="#fff" fontSize="18" fontWeight="900">(25, 0)</text>
          </>}

          {/* Child overlays */}
          {children}
        </svg>

        {/* Court platform edge */}
        <div style={{
          height: 8,
          background: 'linear-gradient(to bottom, #b8956c, #967550)',
          borderRadius: '0 0 6px 6px',
          marginTop: -1,
        }} />
      </div>

    </div>
  );
}
