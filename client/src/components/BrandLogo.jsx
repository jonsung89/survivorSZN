import AppIcon from './AppIcon';

/**
 * BrandLogo — reusable logo container with background + padding.
 *
 * Change `bg` to swap the vibe for holidays, events, etc:
 *   - Default violet:   "from-violet-500 to-indigo-600"
 *   - Christmas:        "from-red-600 to-green-700"
 *   - Halloween:        "from-orange-500 to-orange-700"
 *   - St. Patrick's:    "from-emerald-500 to-emerald-700"
 *   - July 4th:         "from-blue-600 to-red-600"
 *   - Valentine's:      "from-pink-500 to-rose-600"
 *   - Dark mode:        "from-slate-700 to-slate-900"
 *
 * Props:
 *   size      — 'xs' | 'sm' | 'md' | 'lg' | 'xl' (default 'md')
 *   bg        — tailwind gradient classes (default brand violet)
 *   iconColor — SVG fill color (default 'white')
 *   className — extra classes on the outer container
 */

const sizes = {
  xs: { container: 'w-6 h-6 rounded-lg p-0.5' },
  sm: { container: 'w-8 h-8 rounded-lg p-1' },
  md: { container: 'w-10 h-10 rounded-xl p-1.5' },
  lg: { container: 'w-16 h-16 rounded-2xl p-2' },
  xl: { container: 'w-20 h-20 rounded-2xl p-2.5' },
};

export default function BrandLogo({
  size = 'md',
  bg = 'from-violet-500 to-indigo-600',
  iconColor = 'white',
  className = '',
}) {
  const s = sizes[size] || sizes.md;

  return (
    <div className={`${s.container} bg-gradient-to-br ${bg} flex items-center justify-center shadow-lg ${className}`}>
      <AppIcon className="w-full h-full" color={iconColor} />
    </div>
  );
}
