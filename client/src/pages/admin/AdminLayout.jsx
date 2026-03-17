import { NavLink, Outlet, Link } from 'react-router-dom';
import { LayoutDashboard, Users, Trophy, FileText, ArrowLeft, Shield, Sun, Moon, FlaskConical, Swords } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

const NAV_ITEMS = [
  { to: '/admin', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/admin/users', icon: Users, label: 'Users' },
  { to: '/admin/leagues', icon: Trophy, label: 'Leagues' },
  { to: '/admin/reports', icon: FileText, label: 'Reports' },
  { to: '/admin/matchups', icon: Swords, label: 'Matchups' },
  { to: '/admin/bracket-test', icon: FlaskConical, label: 'Bracket Test' },
];

export default function AdminLayout() {
  const { isDark, toggleTheme } = useTheme();

  return (
    <div className="min-h-screen bg-base flex">
      {/* Sidebar — hidden on mobile, shown on md+ */}
      <aside className="hidden md:flex flex-col w-56 bg-surface border-r border-fg/10 fixed inset-y-0 left-0 z-20">
        {/* Header */}
        <div className="px-4 py-5 border-b border-fg/10">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-amber-400" />
            <span className="font-display font-bold text-fg text-lg">Admin</span>
          </div>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-fg/10 text-fg'
                    : 'text-fg/50 hover:text-fg hover:bg-fg/5'
                }`
              }
            >
              <Icon className="w-4.5 h-4.5" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-3 py-4 border-t border-fg/10 space-y-2">
          <button
            onClick={toggleTheme}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-fg/50 hover:text-fg hover:bg-fg/5 transition-colors w-full"
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            {isDark ? 'Light Mode' : 'Dark Mode'}
          </button>
          <Link
            to="/dashboard"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-fg/50 hover:text-fg hover:bg-fg/5 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to App
          </Link>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-20 bg-surface border-b border-fg/10 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-amber-400" />
            <span className="font-display font-bold text-fg">Admin</span>
          </div>
          <Link to="/dashboard" className="text-fg/50 hover:text-fg">
            <ArrowLeft className="w-5 h-5" />
          </Link>
        </div>
        {/* Mobile nav tabs */}
        <div className="flex gap-1 mt-3 -mb-3 overflow-x-auto">
          {NAV_ITEMS.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `px-3 py-2 text-xs font-medium rounded-t-lg whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-fg/10 text-fg'
                    : 'text-fg/40 hover:text-fg/60'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </div>
      </div>

      {/* Main content */}
      <main className="flex-1 md:ml-56 pt-24 md:pt-0">
        <div className="p-4 md:p-8 max-w-6xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
