/**
 * Avatar Component
 * Displays a user avatar with a consistent gradient background based on user ID
 */

// Modern gradient combinations for avatars
const AVATAR_GRADIENTS = [
  'from-violet-500 to-purple-600',
  'from-pink-500 to-rose-600',
  'from-orange-500 to-red-600',
  'from-amber-500 to-orange-600',
  'from-emerald-500 to-teal-600',
  'from-cyan-500 to-blue-600',
  'from-blue-500 to-indigo-600',
  'from-indigo-500 to-purple-600',
  'from-fuchsia-500 to-pink-600',
  'from-rose-500 to-red-600',
  'from-teal-500 to-cyan-600',
  'from-sky-500 to-blue-600',
];

// Generate consistent gradient based on user ID or name
export const getAvatarGradient = (identifier) => {
  if (!identifier) return AVATAR_GRADIENTS[0];
  const hash = String(identifier).split('').reduce((acc, char) => {
    return char.charCodeAt(0) + ((acc << 5) - acc);
  }, 0);
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
};

/**
 * Avatar component with gradient background
 * 
 * @param {string} userId - User ID for consistent gradient generation
 * @param {string} name - Display name (first letter will be shown)
 * @param {string} size - Size variant: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
 * @param {boolean} isOnline - Show online indicator
 * @param {boolean} showOnlineRing - Show ring around avatar when online
 * @param {function} onClick - Click handler
 * @param {string} className - Additional CSS classes
 */
export default function Avatar({ 
  userId, 
  name, 
  size = 'md', 
  isOnline = false, 
  showOnlineRing = false,
  onClick,
  className = ''
}) {
  const gradient = getAvatarGradient(userId || name);
  const initial = name?.[0]?.toUpperCase() || '?';
  
  const sizeClasses = {
    xs: 'w-6 h-6 text-[10px]',
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
    xl: 'w-16 h-16 text-xl',
    '2xl': 'w-20 h-20 text-2xl',
  };

  const onlineDotSizes = {
    xs: 'w-2 h-2 -bottom-0 -right-0',
    sm: 'w-2.5 h-2.5 -bottom-0.5 -right-0.5',
    md: 'w-3 h-3 -bottom-0.5 -right-0.5',
    lg: 'w-3.5 h-3.5 -bottom-0.5 -right-0.5',
    xl: 'w-4 h-4 bottom-0 right-0',
    '2xl': 'w-4 h-4 bottom-1 right-1',
  };

  const Component = onClick ? 'button' : 'div';
  
  return (
    <div className={`relative inline-flex ${className}`}>
      <Component
        onClick={onClick}
        className={`
          ${sizeClasses[size]} 
          rounded-full 
          flex items-center justify-center 
          font-semibold text-white 
          bg-gradient-to-br ${gradient} 
          shadow-lg
          ${onClick ? 'transition-transform hover:scale-110 cursor-pointer' : ''}
          ${showOnlineRing && isOnline ? 'ring-2 ring-emerald-500 ring-offset-2 ring-offset-slate-900' : ''}
        `}
      >
        {initial}
      </Component>
      {isOnline && (
        <span className={`absolute ${onlineDotSizes[size]} bg-emerald-500 rounded-full border-2 border-slate-900`} />
      )}
    </div>
  );
}