import { useMemo } from 'react';
import { useTheme } from '../../../context/ThemeContext';

export default function useChartTheme() {
  const { isDark } = useTheme();

  return useMemo(() => ({
    grid: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
    axis: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)',
    axisLabel: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)',
    tooltip: {
      bg: isDark ? '#1c1c24' : '#ffffff',
      border: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
      text: isDark ? '#f0f0f3' : '#111115',
    },
    colors: {
      primary: '#3b82f6',     // blue-500
      secondary: '#10b981',   // emerald-500
      tertiary: '#f59e0b',    // amber-500
      quaternary: '#8b5cf6',  // violet-500
    },
    isDark,
  }), [isDark]);
}
