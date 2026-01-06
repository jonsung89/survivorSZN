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
  Loader2
} from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useToast } from './Toast';
import Avatar from './Avatar';

export default function Navbar() {
  const { user, signOut, updateDisplayName } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { showToast } = useToast();
  
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [saving, setSaving] = useState(false);
  
  const dropdownRef = useRef(null);

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
    setDisplayName(user?.displayName || '');
    setEditModalOpen(true);
    setDropdownOpen(false);
    setMobileMenuOpen(false);
  };

  const handleSaveDisplayName = async () => {
    if (!displayName.trim()) {
      showToast('Please enter a display name', 'error');
      return;
    }

    setSaving(true);
    try {
      await updateDisplayName(displayName.trim());
      showToast('Display name updated!', 'success');
      setEditModalOpen(false);
    } catch (error) {
      showToast('Failed to update display name', 'error');
    }
    setSaving(false);
  };

  const navLinks = [
    { path: '/dashboard', label: 'Dashboard', icon: Home },
    { path: '/leagues', label: 'My Leagues', icon: Trophy },
    { path: '/schedule', label: 'Schedule', icon: Calendar },
  ];

  if (!user) return null;

  return (
    <>
      <nav className="glass-card sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link to="/dashboard" className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-nfl-red to-red-700 flex items-center justify-center shadow-lg">
                <span className="text-white font-display font-bold text-lg">🏈</span>
              </div>
              <div className="hidden sm:block">
                <h1 className="font-display font-bold text-xl text-white tracking-wide">
                  SurvivorSZN
                </h1>
                <p className="text-[10px] text-white/50 -mt-1 tracking-widest">NFL Survivor Pool</p>
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
            <div className="hidden md:flex items-center gap-2" ref={dropdownRef}>
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
              >
                <Avatar 
                  userId={user?.id}
                  name={user?.displayName || 'Player'}
                  size="sm"
                />
                <span className="text-sm text-white/80">
                  {user?.displayName || 'Player'}
                </span>
                <ChevronDown className={`w-4 h-4 text-white/50 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              
              {/* Dropdown Menu */}
              {dropdownOpen && (
                <div className="absolute top-14 right-4 w-48 bg-gray-800 border border-white/10 rounded-xl shadow-xl overflow-hidden animate-in">
                  <div className="p-2">
                    <button
                      onClick={openEditModal}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-white/80 hover:bg-white/10 transition-colors text-left"
                    >
                      <Edit3 className="w-4 h-4" />
                      Edit Profile
                    </button>
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

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg hover:bg-white/10 transition-colors"
            >
              {mobileMenuOpen ? (
                <X className="w-6 h-6 text-white" />
              ) : (
                <Menu className="w-6 h-6 text-white" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-white/10 animate-slide-down">
            <div className="px-4 py-4 space-y-2">
              {navLinks.map(({ path, label, icon: Icon }) => (
                <Link
                  key={path}
                  to={path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    location.pathname === path 
                      ? 'bg-white/10 text-white' 
                      : 'text-white/70 hover:bg-white/5'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {label}
                </Link>
              ))}
              
              <div className="border-t border-white/10 pt-4 mt-4">
                <div className="flex items-center gap-3 px-4 py-2">
                  <Avatar 
                    userId={user?.id}
                    name={user?.displayName || 'Player'}
                    size="md"
                  />
                  <div>
                    <p className="text-white font-medium">
                      {user?.displayName || 'Player'}
                    </p>
                    <p className="text-white/50 text-sm">{user?.phone || user?.email}</p>
                  </div>
                </div>
                
                <button
                  onClick={openEditModal}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-white/70 hover:bg-white/5 transition-colors mt-2"
                >
                  <Edit3 className="w-5 h-5" />
                  Edit Profile
                </button>
                
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <LogOut className="w-5 h-5" />
                  Logout
                </button>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* Edit Profile Modal */}
      {editModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setEditModalOpen(false)}
          />
          <div className="relative bg-gray-800 border border-white/10 rounded-2xl w-full max-w-md p-6 animate-in">
            <h2 className="text-xl font-display font-bold text-white mb-4">Edit Profile</h2>
            
            <div className="mb-6">
              <label className="block text-white/60 text-sm mb-2">Display Name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Enter your display name"
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-nfl-blue"
                onKeyDown={(e) => e.key === 'Enter' && handleSaveDisplayName()}
                autoFocus
              />
              <p className="text-white/40 text-xs mt-2">This is how other players will see you</p>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => setEditModalOpen(false)}
                className="flex-1 px-4 py-3 rounded-lg bg-white/5 text-white/70 hover:bg-white/10 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveDisplayName}
                disabled={saving || !displayName.trim()}
                className="flex-1 bg-green-600 hover:bg-green-500 disabled:bg-green-600/50 text-white px-4 py-3 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
              >
                {saving ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  'Save'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}