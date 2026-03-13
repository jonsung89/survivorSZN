import { Crown } from 'lucide-react';

export default function CommishBadge() {
  return (
    <span className="relative group/commish flex-shrink-0 inline-flex items-center">
      <button
        onMouseDown={(e) => { if (document.activeElement === e.currentTarget) { e.preventDefault(); e.currentTarget.blur(); } }}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
        className="inline-flex items-center text-amber-500 leading-none focus:outline-none"
      ><Crown className="w-4 h-4" /></button>
      <div className="pointer-events-none opacity-0 group-focus-within/commish:opacity-100 transition-opacity duration-150 absolute top-full left-1/2 -translate-x-1/2 mt-1 px-2 py-1 rounded bg-neutral-800 text-white text-xs font-medium whitespace-nowrap z-50 shadow-lg">
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-b-4 border-l-transparent border-r-transparent border-b-neutral-800" />
        Commissioner
      </div>
    </span>
  );
}
