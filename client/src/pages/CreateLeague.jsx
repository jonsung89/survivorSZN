import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  Trophy, 
  Lock, 
  Calendar, 
  AlertTriangle,
  ArrowLeft,
  Loader2,
  Info
} from 'lucide-react';
import { leagueAPI, nflAPI } from '../api';
import { useToast } from '../components/Toast';

export default function CreateLeague() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [currentWeek, setCurrentWeek] = useState(1);
  
  const [formData, setFormData] = useState({
    name: '',
    password: '',
    confirmPassword: '',
    maxStrikes: 1,
    startWeek: 1
  });

  useEffect(() => {
    const fetchCurrentWeek = async () => {
      try {
        const data = await nflAPI.getSeason();
        // Convert playoff weeks: ESPN returns week 1-4 with seasonType=3
        // Frontend uses week 19-22 for playoffs
        let week = data.week;
        if (data.seasonType === 3) {
          week = data.week + 18; // WC=19, DIV=20, CONF=21, SB=22
        }
        setCurrentWeek(week);
        setFormData(prev => ({ ...prev, startWeek: week }));
      } catch (err) {
        console.error('Failed to fetch current week:', err);
      }
    };
    fetchCurrentWeek();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'maxStrikes' || name === 'startWeek' ? parseInt(value) : value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (formData.name.trim().length < 3) {
      showToast('League name must be at least 3 characters', 'error');
      return;
    }

    if (formData.password.length < 4) {
      showToast('Password must be at least 4 characters', 'error');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      showToast('Passwords do not match', 'error');
      return;
    }

    setLoading(true);
    try {
      const result = await leagueAPI.create({
        name: formData.name.trim(),
        password: formData.password,
        maxStrikes: formData.maxStrikes,
        startWeek: formData.startWeek
      });

      if (result.success) {
        showToast('League created successfully!', 'success');
        navigate(`/league/${result.league.id}`);
      } else {
        showToast(result.error || 'Failed to create league', 'error');
      }
    } catch (error) {
      showToast('Something went wrong', 'error');
    }
    setLoading(false);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Back Link */}
      <Link
        to="/leagues"
        className="inline-flex items-center gap-2 text-white/60 hover:text-white transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Leagues
      </Link>

      {/* Header */}
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-green-500/30">
          <Trophy className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-3xl font-display font-bold text-white">Create a League</h1>
        <p className="text-white/60 mt-2">Set up your survivor pool and invite friends</p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="glass-card rounded-2xl p-8 space-y-6">
        {/* League Name */}
        <div>
          <label className="block text-white/80 text-sm font-medium mb-2">
            League Name
          </label>
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            placeholder="e.g., Office Survivor Pool 2024"
            className="input-field"
            maxLength={50}
          />
        </div>

        {/* Password */}
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-white/80 text-sm font-medium mb-2">
              <Lock className="w-4 h-4 inline mr-2" />
              League Password
            </label>
            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              placeholder="••••••••"
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-white/80 text-sm font-medium mb-2">
              Confirm Password
            </label>
            <input
              type="password"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              placeholder="••••••••"
              className="input-field"
            />
          </div>
        </div>
        <p className="text-white/40 text-xs -mt-4">
          Share this password with people you want to join your league
        </p>

        {/* Settings */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Max Strikes */}
          <div>
            <label className="block text-white/80 text-sm font-medium mb-2">
              <AlertTriangle className="w-4 h-4 inline mr-2" />
              Strikes Before Elimination
            </label>
            <select
              name="maxStrikes"
              value={formData.maxStrikes}
              onChange={handleChange}
              className="input-field"
            >
              {[1, 2, 3, 4, 5].map(n => (
                <option key={n} value={n}>
                  {n} strike{n > 1 ? 's' : ''} {n === 1 ? '(Classic)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Start Week */}
          <div>
            <label className="block text-white/80 text-sm font-medium mb-2">
              <Calendar className="w-4 h-4 inline mr-2" />
              Starting Week
            </label>
            <select
              name="startWeek"
              value={formData.startWeek}
              onChange={handleChange}
              className="input-field"
            >
              {Array.from({ length: 22 }, (_, i) => i + 1)
                .filter(week => week >= currentWeek)
                .map(week => {
                  // Get week label
                  let label;
                  if (week <= 18) {
                    label = `Week ${week}`;
                  } else if (week === 19) {
                    label = 'Wild Card';
                  } else if (week === 20) {
                    label = 'Divisional';
                  } else if (week === 21) {
                    label = 'Conference';
                  } else if (week === 22) {
                    label = 'Super Bowl';
                  }
                  
                  return (
                    <option key={week} value={week}>
                      {week === currentWeek ? `${label} (Current Week)` : label}
                    </option>
                  );
                })}
            </select>
          </div>
        </div>

        {/* Info Box */}
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
          <div className="flex gap-3">
            <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-200/80">
              <p className="font-medium text-blue-300 mb-1">How Survivor Pools Work</p>
              <ul className="space-y-1 list-disc list-inside text-blue-200/70">
                <li>Each week, pick one team to win their game</li>
                <li>You can only use each team once per season</li>
                <li>If your team loses, you get a strike</li>
                <li>Too many strikes and you're eliminated!</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="btn-primary w-full flex items-center justify-center gap-2"
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              <Trophy className="w-5 h-5" />
              Create League
            </>
          )}
        </button>
      </form>
    </div>
  );
}