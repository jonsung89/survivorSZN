import { getSportModule, getSportBadgeClasses } from '../sports';

export default function SportBadge({ sportId, label }) {
  const sportMod = getSportModule(sportId);
  const text = label || sportMod.name;

  if (sportMod.logo) {
    return (
      <img
        src={sportMod.logo}
        alt={text}
        className={`w-auto object-contain flex-shrink-0 ${sportMod.logoDarkClass || ''}`}
        style={{ height: sportMod.logoHeight || 36 }}
      />
    );
  }

  return (
    <span className={`text-[10px] font-bold tracking-wide uppercase px-1.5 py-0.5 rounded flex-shrink-0 ${getSportBadgeClasses(sportId)}`}>
      {text}
    </span>
  );
}
