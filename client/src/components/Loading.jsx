export default function Loading({ size = 'default', text = '' }) {
  const sizeClasses = {
    small: 'w-5 h-5 border-2',
    default: 'w-8 h-8 border-3',
    large: 'w-12 h-12 border-4'
  };

  return (
    <div className="flex flex-col items-center justify-center gap-3">
      <div 
        className={`${sizeClasses[size]} border-white/20 border-t-white rounded-full animate-spin`}
      />
      {text && <p className="text-white/60 text-sm">{text}</p>}
    </div>
  );
}

export function FullPageLoading({ text = 'Loading...' }) {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-white/10 rounded-full" />
          <div className="absolute inset-0 w-16 h-16 border-4 border-transparent border-t-nfl-red rounded-full animate-spin" />
        </div>
        <p className="text-white/60">{text}</p>
      </div>
    </div>
  );
}
