import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Trophy,
  Calendar,
  LogOut,
  Menu,
  X,
  User,
  Home,
  ChevronDown,
  Edit3,
  Sun,
  Moon,
  Shield
} from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';
import Avatar from './Avatar';
import NotificationPanel from './NotificationPanel';
import BrandLogo from './BrandLogo';
import EditProfileModal from './EditProfileModal';

export default function Navbar() {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { isDark, toggleTheme } = useTheme();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  
  const dropdownRef = useRef(null);
  const navRef = useRef(null);

  // Expose navbar height as CSS variable for sticky elements below
  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const update = () => {
      document.documentElement.style.setProperty('--navbar-height', `${el.offsetHeight}px`);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    signOut();
    navigate('/login');
  };

  const openEditModal = () => {
    setEditModalOpen(true);
    setDropdownOpen(false);
    setMobileMenuOpen(false);
  };

  const navLinks = user
    ? [
        { path: '/dashboard', label: 'Dashboard', icon: Home },
        { path: '/leagues', label: 'My Leagues', icon: Trophy },
        { path: '/schedule', label: 'Schedule', icon: Calendar },
      ]
    : [
        { path: '/schedule', label: 'Schedule', icon: Calendar },
        { path: '/leagues/join', label: 'Leagues', icon: Trophy },
      ];

  return (
    <>
      <nav ref={navRef} className="bg-surface sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link to={user ? "/dashboard" : "/schedule"} className="flex items-center gap-3">
              <BrandLogo size="md" />
              <div className="block">
                <h1 className="font-display font-bold text-xl text-fg tracking-wide">
                  SurvivorSZN
                </h1>
                <p className="text-[10px] text-fg/50 -mt-1 tracking-widest flex gap-[3px]">
                  <span className="tagline-word">Outlast.</span>
                  <span className="tagline-word">Survive.</span>
                  <span className="tagline-word font-semibold text-fg/70">Win.</span>
                </p>
              </div>
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-1">
              {navLinks.map(({ path, label, icon: Icon }) => (
                <Link
                  key={path}
                  to={path}
                  className={`nav-link flex items-center gap-2 ${
                    location.pathname === path ? 'nav-link-active' : ''
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </Link>
              ))}
            </div>

            {/* User Menu - Desktop */}
            {user ? (
              <div className="hidden md:flex items-center gap-2" ref={dropdownRef}>
                {/* Theme toggle */}
                <button
                  onClick={toggleTheme}
                  className="p-2 rounded-lg bg-fg/5 hover:bg-fg/10 transition-colors"
                  title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                >
                  {isDark ? <Sun className="w-4 h-4 text-fg/70" /> : <Moon className="w-4 h-4 text-fg/70" />}
                </button>

                {/* Notifications */}
                <NotificationPanel />

                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-fg/5 hover:bg-fg/10 transition-colors"
                >
                  <Avatar
                    userId={user?.id}
                    name={user?.displayName || 'Player'}
                    imageUrl={user?.profileImageUrl}
                    size="sm"
                  />
                  <span className="hidden lg:inline text-sm text-fg/80">
                    {user?.displayName || 'Player'}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-fg/50 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* Dropdown Menu */}
                {dropdownOpen && (
                  <div className="absolute top-14 right-4 w-48 bg-elevated border border-fg/10 rounded-xl shadow-xl overflow-hidden animate-in z-50">
                    <div className="p-2">
                      <button
                        onClick={openEditModal}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-fg/80 hover:bg-fg/10 transition-colors text-left"
                      >
                        <Edit3 className="w-4 h-4" />
                        Edit Profile
                      </button>
                      {user?.isAdmin && (
                        <Link
                          to="/admin"
                          onClick={() => setDropdownOpen(false)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-fg/80 hover:bg-fg/10 transition-colors"
                        >
                          <Shield className="w-4 h-4" />
                          Admin Panel
                        </Link>
                      )}
                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors text-left"
                      >
                        <LogOut className="w-4 h-4" />
                        Logout
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="hidden md:flex items-center gap-2">
                <button
                  onClick={toggleTheme}
                  className="p-2 rounded-lg bg-fg/5 hover:bg-fg/10 transition-colors"
                  title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                >
                  {isDark ? <Sun className="w-4 h-4 text-fg/70" /> : <Moon className="w-4 h-4 text-fg/70" />}
                </button>
                <Link
                  to="/login"
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-violet-500 to-indigo-600 hover:from-violet-400 hover:to-indigo-500 text-white font-medium text-sm transition-all shadow-lg shadow-violet-500/20"
                >
                  <User className="w-4 h-4" />
                  Sign In
                </Link>
              </div>
            )}

            {/* Mobile: Notifications + Menu Button */}
            <div className="md:hidden flex items-center gap-1">
              {user && <NotificationPanel />}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 rounded-lg hover:bg-fg/10 transition-colors"
              >
                {mobileMenuOpen ? (
                  <X className="w-6 h-6 text-fg" />
                ) : (
                  <Menu className="w-6 h-6 text-fg" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-fg/10 animate-slide-down">
            <div className="px-4 py-4 space-y-2">
              {navLinks.map(({ path, label, icon: Icon }) => (
                <Link
                  key={path}
                  to={path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    location.pathname === path 
                      ? 'bg-fg/10 text-fg' 
                      : 'text-fg/70 hover:bg-fg/5'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {label}
                </Link>
              ))}
              
              {/* Theme toggle — mobile */}
              <button
                onClick={() => { toggleTheme(); setMobileMenuOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-fg/70 hover:bg-fg/5 transition-colors"
              >
                {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                {isDark ? 'Light Mode' : 'Dark Mode'}
              </button>

              <div className="border-t border-fg/10 pt-4 mt-4">
                {user ? (
                  <>
                    <div className="flex items-center gap-3 px-4 py-2">
                      <Avatar
                        userId={user?.id}
                        name={user?.displayName || 'Player'}
                        imageUrl={user?.profileImageUrl}
                        size="md"
                      />
                      <div>
                        <p className="text-fg font-medium">
                          {user?.displayName || 'Player'}
                        </p>
                        <p className="text-fg/50 text-sm">{user?.email || user?.phone}</p>
                      </div>
                    </div>

                    <button
                      onClick={openEditModal}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-fg/70 hover:bg-fg/5 transition-colors mt-2"
                    >
                      <Edit3 className="w-5 h-5" />
                      Edit Profile
                    </button>

                    {user?.isAdmin && (
                      <Link
                        to="/admin"
                        onClick={() => setMobileMenuOpen(false)}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-fg/70 hover:bg-fg/5 transition-colors"
                      >
                        <Shield className="w-5 h-5" />
                        Admin Panel
                      </Link>
                    )}

                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      <LogOut className="w-5 h-5" />
                      Logout
                    </button>
                  </>
                ) : (
                  <Link
                    to="/login"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center justify-center gap-2 mx-4 px-4 py-3 rounded-lg bg-gradient-to-r from-violet-500 to-indigo-600 hover:from-violet-400 hover:to-indigo-500 text-white font-medium transition-all"
                  >
                    <User className="w-5 h-5" />
                    Sign In to Play
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* Edit Profile Modal */}
      {editModalOpen && (
        <EditProfileModal onClose={() => setEditModalOpen(false)} />
      )}
    </>
  );
}