import { useTheme } from '../context/ThemeContext';

export function getThemedLogo(url, isDark) {
  if (!url || !isDark) return url;
  if (url.includes('/teamlogos/') && url.includes('/500/')) {
    return url.replace('/500/', '/500-dark/');
  }
  return url;
}

export function useThemedLogo() {
  const { isDark } = useTheme();
  return (url) => getThemedLogo(url, isDark);
}

export function getThemedColor(team, isDark) {
  const primary = team?.color || '#6B7280';
  const hex = primary.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  if (isDark && luminance < 0.25 && team?.alternateColor) return team.alternateColor;
  if (!isDark && luminance > 0.7 && team?.alternateColor) return team.alternateColor;
  return primary;
}

export function useThemedColor() {
  const { isDark } = useTheme();
  return (team) => getThemedColor(team, isDark);
}
