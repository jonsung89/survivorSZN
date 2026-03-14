import { useMemo } from 'react';
import { useTheme } from '../context/ThemeContext';

// ── Full-court dimensions — HORIZONTAL layout ──
// Length along X-axis (94ft = 940), width along Y-axis (50ft = 500)
// 10 SVG units = 1 foot
const L = 940;   // court length (x-axis)
const W = 500;   // court width (y-axis)
const MID = L / 2; // 470 — center court x

// Basket centers (5.25ft from each baseline along x-axis)
const NEAR_BASKET = { x: L - 52.5, y: 250 };  // right end (home)
const FAR_BASKET  = { x: 52.5,     y: 250 };   // left end (away)

// Regulation measurements
const PAINT_DEPTH     = 190;  // 19ft from baseline to FT line
const FT_CIRCLE_R     = 60;   // 6ft
const RESTRICTED_R    = 40;   // 4ft
const CORNER_3_DEPTH  = 140;  // 14ft from baseline
const CENTER_CIRCLE_R = 60;   // 6ft
const BACKBOARD_W     = 60;   // 6ft

// Paint width: NBA = 16ft, NCAAB = 12ft
const PAINT_W = { nba: 160, ncaab: 120 };

// ── ESPN → SVG coordinate mapping ──
// ESPN coords: x 0-50 (court width in feet), y 0-47 (depth from baseline in feet)
// Our horizontal court: court width is Y-axis (500), court length is X-axis (940)
// Near (right) half = home team, Far (left) half = away team
// 10 SVG units per foot
//
// ESPN coordinates are approximate — wing 3-pointers are consistently ~2ft short.
// nudgeThreePointer() corrects 3pt shots that fall inside the arc.
//
// Y-axis inset: ESPN x=0 and x=50 map to the sidelines, but corner 3s are ~3ft
// inside. Scale to [Y_MIN, Y_MAX] so edge shots stay within the court.
const Y_MIN = 15;   // 1.5ft inset from top sideline
const Y_MAX = W - 15; // 1.5ft inset from bottom sideline

// X-axis inset: keep shots from landing on/past the baselines
const X_BASELINE_PAD = 20; // 2ft inset from each baseline

/** Map ESPN x (0-50) to SVG y, scaled to stay inside sidelines */
function espnXtoSvgY(espnX) {
  return Y_MIN + (espnX / 50) * (Y_MAX - Y_MIN);
}

/** Returns null if coordinates are invalid (garbage sentinel or out of range) */
function validEspn(espnX, espnY) {
  if (espnX == null || espnY == null) return false;
  if (espnX < -100 || espnX > 100 || espnY < -100 || espnY > 100) return false;
  return true;
}

export function espnToSvg(espnX, espnY) {
  if (!validEspn(espnX, espnY)) return null;
  // +3ft offset: ESPN coords land ~3ft too close to the baseline
  const svgX = Math.max(MID, Math.min(L - X_BASELINE_PAD, L - (espnY + 3) * 10));
  const svgY = Math.max(Y_MIN, Math.min(Y_MAX, espnXtoSvgY(espnX)));
  return { x: svgX, y: svgY };
}

export function espnToSvgFar(espnX, espnY) {
  if (!validEspn(espnX, espnY)) return null;
  // +3ft offset: ESPN coords land ~3ft too close to the baseline
  const svgX = Math.max(X_BASELINE_PAD, Math.min(MID, (espnY + 3) * 10));
  const svgY = Math.max(Y_MIN, Math.min(Y_MAX, W - espnXtoSvgY(espnX)));
  return { x: svgX, y: svgY };
}

/**
 * Nudge a 3-point shot radially outward if ESPN coords place it inside the arc.
 * Call this ONLY for plays where text includes "three point".
 * @param {{ x: number, y: number }} pt - SVG coordinate from espnToSvg/espnToSvgFar
 * @param {'nba'|'ncaab'} courtType
 * @param {boolean} isNear - true for near (right) half, false for far (left) half
 * @returns {{ x: number, y: number }} corrected point
 */
export function nudgeThreePointer(pt, courtType = 'nba', isNear = true) {
  if (!pt) return pt;
  const basket = isNear ? NEAR_BASKET : FAR_BASKET;
  const arcR = (courtType === 'ncaab' ? 221.75 : 237.5) + 15; // push slightly past arc
  const dx = pt.x - basket.x;
  const dy = pt.y - basket.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < arcR && dist > 0) {
    const scale = arcR / dist;
    return {
      x: Math.max(X_BASELINE_PAD, Math.min(L - X_BASELINE_PAD, basket.x + dx * scale)),
      y: Math.max(Y_MIN, Math.min(Y_MAX, basket.y + dy * scale)),
    };
  }
  return pt;
}

// ── Colors (light maple hardwood) ──
const PAINT_C = 'rgba(160,110,60,0.18)';
const LINE    = '#ffffff';
const LW      = 2;
const LO      = 0.92;

export default function BasketballCourt({ courtType = 'nba', homeLogo, homeColor, children, className = '' }) {
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

  // Basket assembly — ESPN-style with 3D backboard, pole, base pad, and net
  // The court is CSS rotateX(35deg). offy=-38 fakes elevation above the court.
  // "Up" (perpendicular to court) projects as -Y in SVG after the tilt.
  const basePadColor = homeColor ? `#${homeColor.replace('#', '')}` : '#1a3a6e';
  const basket = (bx, by, dir) => {
    const offy = -38;
    const offx = dir * 8;
    const rimCx = bx + offx;
    const rimCy = by + offy;          // 250 - 38 = 212
    const rimR = 9;

    // ── Backboard — parallelogram to show 3D perspective ──
    // Front face X (the side facing the court)
    const bbFrontX = rimCx + dir * 14;  // closer to rim (was 20)
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
        <line x1={bbFrontX} y1={rimCy} x2={rimCx + dir * 2} y2={rimCy}
          stroke={bracketColor} strokeWidth="2.5" />

        {/* ── Rim glow ── */}
        <circle cx={rimCx} cy={rimCy} r={rimR + 8} fill="url(#rimGlow)" />

        {/* ── Rim — orange ring ── */}
        <circle cx={rimCx} cy={rimCy} r={rimR}
          fill="none" stroke="#d84315" strokeWidth="2.8" />
        <circle cx={rimCx} cy={rimCy} r={rimR - 1.5}
          fill="none" stroke="#ff6d00" strokeWidth="0.7" opacity="0.4" />

        {/* ── Net — white mesh ── */}
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
          {basket(NEAR_BASKET.x + 15, NEAR_BASKET.y, 1)}

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
          {basket(FAR_BASKET.x - 15, FAR_BASKET.y, -1)}

          {/* Spotlight / lighting overlay */}
          <rect x="0" y="0" width={L} height={W} fill="url(#spotlight)" />

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
