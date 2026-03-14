import { useMemo } from 'react';

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
// ESPN coords: x 0-50 (court width), y 0-25 (half-court depth, 0 = baseline)
// Our horizontal court: court width is Y-axis, court length is X-axis
// Near (right) half = home team, Far (left) half = away team

export function espnToSvg(espnX, espnY) {
  // Maps to NEAR (right) half — home team
  // ESPN x (0-50, court width) → SVG y (0-500): y = espnX * 10
  // ESPN y (0-25, depth from baseline) → SVG x: x = L - espnY * (MID / 25)
  return { x: L - espnY * (MID / 25), y: espnX * 10 };
}

export function espnToSvgFar(espnX, espnY) {
  // Maps to FAR (left) half — away team (mirrored)
  // ESPN x → SVG y mirrored: y = W - espnX * 10
  // ESPN y → SVG x: x = espnY * (MID / 25)
  return { x: espnY * (MID / 25), y: W - espnX * 10 };
}

// ── Colors (light maple hardwood) ──
const PAINT_C = 'rgba(160,110,60,0.18)';
const LINE    = '#ffffff';
const LW      = 2;
const LO      = 0.92;

export default function BasketballCourt({ courtType = 'nba', homeLogo, children, className = '' }) {
  const paintW    = PAINT_W[courtType] || PAINT_W.nba;
  const paintTop  = (W - paintW) / 2; // y position of paint top edge
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

  // Basket assembly
  const basket = (bx, by, dir) => (
    <g>
      {/* Backboard — perpendicular to length, so it's vertical in our horizontal layout */}
      <line x1={bx + dir * 17} y1={by - BACKBOARD_W / 2}
            x2={bx + dir * 17} y2={by + BACKBOARD_W / 2}
            stroke="#999" strokeWidth="3.5" />
      {/* Rim glow */}
      <circle cx={bx} cy={by} r="20" fill="url(#rimGlow)" />
      {/* Rim */}
      <circle cx={bx} cy={by} r="7.5" fill="none" stroke="#ff6b00" strokeWidth="2.2" />
      {/* Net */}
      {[-5, 0, 5].map(dy => (
        <line key={dy}
          x1={bx - dir * 5} y1={by + dy}
          x2={bx - dir * 12} y2={by + dy * 0.6}
          stroke="rgba(255,255,255,0.15)" strokeWidth="0.7" />
      ))}
    </g>
  );

  const pad = 25; // apron padding

  return (
    <div className={`relative ${className}`}
      style={{
        maxWidth: 400,
        margin: '0 auto',
        perspective: '600px',
        perspectiveOrigin: '50% 30%',
      }}
    >
      <div style={{
        transform: 'rotateX(30deg)',
        transformStyle: 'preserve-3d',
        transformOrigin: '50% 0%',
        marginBottom: 0,
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
            {/* Wood plank pattern — planks run along court length (horizontal) */}
            <pattern id="woodPlanks" patternUnits="userSpaceOnUse" width="940" height="84">
              {/* Natural maple hardwood — like a real NBA court */}
              <rect x="0" y="0"  width="940" height="42" fill="#f2d8a8" />
              <rect x="0" y="42" width="940" height="42" fill="#ebcf9c" />
              {/* Plank seams */}
              <line x1="0" y1="0"  x2="940" y2="0"  stroke="rgba(0,0,0,0.06)" strokeWidth="1" />
              <line x1="0" y1="42" x2="940" y2="42" stroke="rgba(0,0,0,0.05)" strokeWidth="0.8" />
              {/* Grain lines */}
              <line x1="0" y1="14" x2="940" y2="15" stroke="rgba(0,0,0,0.02)" strokeWidth="0.5" />
              <line x1="0" y1="28" x2="940" y2="27" stroke="rgba(0,0,0,0.015)" strokeWidth="0.5" />
              <line x1="0" y1="56" x2="940" y2="57" stroke="rgba(0,0,0,0.02)" strokeWidth="0.5" />
              <line x1="0" y1="70" x2="940" y2="69" stroke="rgba(0,0,0,0.015)" strokeWidth="0.5" />
            </pattern>

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
            fill="#6b4c30" rx="4" />

          {/* Court surface */}
          <rect x="0" y="0" width={L} height={W} fill="url(#woodPlanks)" />

          {/* Paint areas */}
          <rect x={L - PAINT_DEPTH} y={paintTop} width={PAINT_DEPTH} height={paintW} fill={PAINT_C} />
          <rect x={0}               y={paintTop} width={PAINT_DEPTH} height={paintW} fill={PAINT_C} />

          {/* ── Center court ── */}
          <line x1={MID} y1={0} x2={MID} y2={W} stroke={LINE} strokeWidth={LW} opacity={LO} />
          <circle cx={MID} cy={250} r={CENTER_CIRCLE_R} fill="none"
            stroke={LINE} strokeWidth={LW} opacity={LO} />
          <circle cx={MID} cy={250} r="20" fill="none"
            stroke={LINE} strokeWidth="1.5" opacity={LO * 0.5} />

          {/* Center court logo — on top of circle, bigger than the ring */}
          {homeLogo && (
            <image
              href={homeLogo}
              x={MID - 120}
              y={250 - 120}
              width={240}
              height={240}
              opacity="0.5"
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
      </div>{/* close 3D transform */}
    </div>
  );
}
