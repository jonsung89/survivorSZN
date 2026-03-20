import { useState } from 'react';
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, Trophy, FileText, ArrowLeft, Shield, Sun, Moon,
  FlaskConical, Swords, ChevronDown, ChevronRight, MessageSquare, BarChart3,
  Megaphone, Eye, Target, Database, Globe
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

const CORE_NAV = [
  { to: '/admin', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/admin/users', icon: Users, label: 'Users' },
  { to: '/admin/leagues', icon: Trophy, label: 'Leagues' },
];

const SPORT_SECTIONS = [
  {
    label: 'March Madness',
    sportId: 'ncaab',
    items: [
      { to: '/admin/ncaab/reports', label: 'Scouting Reports', icon: FileText },
      { to: '/admin/ncaab/matchups', label: 'Matchup Reports', icon: Swords },
      { to: '/admin/ncaab/tournaments', label: 'Tournament Data', icon: Database },
      { to: '/admin/ncaab/bracket-test', label: 'Bracket Testing', icon: FlaskConical },
      { to: '/admin/ncaab/prospects', label: 'NBA Prospects', icon: Target },
    ],
  },
  {
    label: 'NFL Survivor',
    sportId: 'nfl',
    items: [],
  },
];

const TOOL_NAV = [
  { to: '/admin/chat', icon: MessageSquare, label: 'Chat Moderation' },
  {
    icon: BarChart3, label: 'Analytics',
    items: [
      { to: '/admin/analytics', label: 'Overview', icon: BarChart3 },
      { to: '/admin/analytics/user-visits', label: 'User Visits', icon: Eye },
    ],
  },
  { to: '/admin/announcements', icon: Megaphone, label: 'Announcements' },
  { to: '/admin/api-reference', icon: Globe, label: 'API Reference' },
];

export default function AdminLayout() {
  const { isDark, toggleTheme } = useTheme();
  const location = useLocation();

  // Auto-expand sport sections and tool sections that have an active child route
  const getDefaultExpanded = () => {
    const expanded = {};
    SPORT_SECTIONS.forEach(section => {
      if (section.items.some(item => location.pathname.startsWith(item.to))) {
        expanded[section.sportId] = true;
      }
    });
    TOOL_NAV.forEach(item => {
      if (item.items?.some(sub => location.pathname === sub.to || location.pathname.startsWith(sub.to + '/'))) {
        expanded[`tool_${item.label}`] = true;
      }
    });
    return expanded;
  };

  const [expandedSports, setExpandedSports] = useState(getDefaultExpanded);

  const toggleSection = (key) => {
    setExpandedSports(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleSport = (sportId) => toggleSection(sportId);

  // Check if any sport section item is active (for mobile)
  const isSportItemActive = (section) => {
    return section.items.some(item => location.pathname.startsWith(item.to));
  };

  // All flat items for mobile nav
  const allMobileItems = [
    ...CORE_NAV,
    ...SPORT_SECTIONS.flatMap(s => s.items),
    ...TOOL_NAV.flatMap(item => item.items ? item.items : [item]),
  ];

  return (
    <div className="min-h-screen bg-canvas flex">
      {/* Sidebar — hidden on mobile, shown on md+ */}
      <aside className="hidden md:flex flex-col w-60 bg-surface border-r border-fg/10 fixed inset-y-0 left-0 z-20">
        {/* Header */}
        <div className="px-4 py-5 border-b border-fg/10">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-amber-400" />
            <span className="font-display font-bold text-fg text-lg">Admin</span>
          </div>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {/* Core nav */}
          {CORE_NAV.map(({ to, icon: Icon, label, end }) => (
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

          {/* Sports & Challenges section */}
          <div className="pt-3 mt-3 border-t border-fg/10">
            <span className="px-3 text-sm font-medium text-fg/30 uppercase tracking-wider">
              Sports & Challenges
            </span>
            <div className="mt-2 space-y-0.5">
              {SPORT_SECTIONS.map((section) => {
                const isExpanded = expandedSports[section.sportId];
                const hasActiveChild = isSportItemActive(section);

                return (
                  <div key={section.sportId}>
                    <button
                      onClick={() => toggleSport(section.sportId)}
                      className={`flex items-center justify-between w-full px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        hasActiveChild
                          ? 'text-fg bg-fg/5'
                          : 'text-fg/50 hover:text-fg hover:bg-fg/5'
                      }`}
                    >
                      <span>{section.label}</span>
                      {section.items.length > 0 ? (
                        isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-fg/30" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-fg/30" />
                        )
                      ) : (
                        <span className="text-sm text-fg/20">Soon</span>
                      )}
                    </button>
                    {isExpanded && section.items.length > 0 && (
                      <div className="ml-3 pl-3 border-l border-fg/10 space-y-0.5 mt-0.5">
                        {section.items.map(({ to, label, icon: Icon }) => (
                          <NavLink
                            key={to}
                            to={to}
                            className={({ isActive }) =>
                              `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                                isActive
                                  ? 'bg-fg/10 text-fg font-medium'
                                  : 'text-fg/40 hover:text-fg hover:bg-fg/5'
                              }`
                            }
                          >
                            <Icon className="w-4 h-4" />
                            {label}
                          </NavLink>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Tools section */}
          <div className="pt-3 mt-3 border-t border-fg/10">
            <span className="px-3 text-sm font-medium text-fg/30 uppercase tracking-wider">
              Tools
            </span>
            <div className="mt-2 space-y-0.5">
              {TOOL_NAV.map((item) => {
                const Icon = item.icon;
                if (item.items) {
                  const sectionKey = `tool_${item.label}`;
                  const isExpanded = expandedSports[sectionKey];
                  const hasActiveChild = item.items.some(sub => location.pathname === sub.to || location.pathname.startsWith(sub.to + '/'));
                  return (
                    <div key={item.label}>
                      <button
                        onClick={() => toggleSection(sectionKey)}
                        className={`flex items-center justify-between w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                          hasActiveChild ? 'text-fg bg-fg/5' : 'text-fg/50 hover:text-fg hover:bg-fg/5'
                        }`}
                      >
                        <span className="flex items-center gap-3">
                          <Icon className="w-4.5 h-4.5" />
                          {item.label}
                        </span>
                        {isExpanded ? <ChevronDown className="w-4 h-4 text-fg/30" /> : <ChevronRight className="w-4 h-4 text-fg/30" />}
                      </button>
                      {isExpanded && (
                        <div className="ml-3 pl-3 border-l border-fg/10 space-y-0.5 mt-0.5">
                          {item.items.map(({ to, label, icon: SubIcon }) => (
                            <NavLink
                              key={to}
                              to={to}
                              end
                              className={({ isActive }) =>
                                `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                                  isActive ? 'bg-fg/10 text-fg font-medium' : 'text-fg/40 hover:text-fg hover:bg-fg/5'
                                }`
                              }
                            >
                              <SubIcon className="w-4 h-4" />
                              {label}
                            </NavLink>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                }
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                        isActive ? 'bg-fg/10 text-fg' : 'text-fg/50 hover:text-fg hover:bg-fg/5'
                      }`
                    }
                  >
                    <Icon className="w-4.5 h-4.5" />
                    {item.label}
                  </NavLink>
                );
              })}
            </div>
          </div>
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
          {allMobileItems.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `px-3 py-2 text-sm font-medium rounded-t-lg whitespace-nowrap transition-colors ${
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
      <main className="flex-1 md:ml-60 pt-24 md:pt-0">
        <div className="p-4 md:p-8 max-w-6xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
