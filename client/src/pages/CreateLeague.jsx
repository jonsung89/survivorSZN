import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Trophy,
  Lock,
  Calendar,
  AlertTriangle,
  ArrowLeft,
  Loader2,
  Info,
  Shield
} from 'lucide-react';
import { leagueAPI, nflAPI, bracketAPI } from '../api';
import { useToast } from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { getAllSports, getSportModule } from '../sports';
import BrandLogo from '../components/BrandLogo';
import BracketSetup from '../components/bracket/BracketSetup';
import nflSport from '../sports/nfl';

export default function CreateLeague() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [currentWeek, setCurrentWeek] = useState(1);
  const [seasonOverride, setSeasonOverride] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    password: '',
    confirmPassword: '',
    maxStrikes: 1,
    startWeek: 1,
    sportId: 'nfl'
  });

  const [bracketConfig, setBracketConfig] = useState({
    maxBracketsPerUser: 1,
    scoringPreset: 'standard',
    customScoring: null,
    tiebreakerType: 'total_score',
    entryDeadline: '',
    entryFee: 0,
  });

  const selectedSport = getSportModule(formData.sportId);
  const isBracketMode = selectedSport?.gameType === 'bracket';

  useEffect(() => {
    const fetchCurrentWeek = async () => {
      try {
        const data = await nflAPI.getSeason();
        const week = nflSport.espnToAppWeek(data.week, data.seasonType);
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
        maxStrikes: isBracketMode ? 1 : formData.maxStrikes,
        startWeek: isBracketMode ? 1 : formData.startWeek,
        sportId: formData.sportId,
        ...(seasonOverride && { seasonOverride }),
      });

      if (result.success) {
        // If bracket mode, create the bracket challenge
        if (isBracketMode) {
          try {
            await bracketAPI.createChallenge({
              leagueId: result.league.id,
              maxBracketsPerUser: bracketConfig.maxBracketsPerUser,
              scoringPreset: bracketConfig.scoringPreset,
              customScoring: bracketConfig.customScoring,
              tiebreakerType: bracketConfig.tiebreakerType,
              entryDeadline: bracketConfig.entryDeadline || null,
              entryFee: parseFloat(bracketConfig.entryFee) || 0,
            });
          } catch (bracketErr) {
            console.error('Failed to create bracket challenge:', bracketErr);
            // League was created but bracket challenge failed — still navigate
            showToast('League created, but bracket challenge setup had an issue. You can configure it in settings.', 'error');
          }
        }

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
        className="inline-flex items-center gap-1.5 text-fg/70 hover:text-fg text-base font-medium transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Leagues
      </Link>

      {/* Header */}
      <div className="text-center mb-8">
        <div className="mx-auto mb-4 w-fit">
          <BrandLogo size="lg" />
        </div>
        <h1 className="text-3xl font-display font-bold text-fg">Create a League</h1>
        <p className="text-fg/60 mt-2">
          {isBracketMode ? 'Set up your March Madness bracket challenge' : 'Set up your survivor pool and invite friends'}
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="glass-card rounded-2xl p-8 space-y-6">
        {/* Sport Selector */}
        <div>
          <label className="block text-fg/80 text-sm font-medium mb-2">
            Sport
          </label>
          <div className="flex flex-wrap gap-2">
            {getAllSports().map(sport => {
              const isAvailable = sport.gameType === 'survivor' || sport.gameType === 'bracket';
              const isSelected = formData.sportId === sport.id;
              return (
                <button
                  key={sport.id}
                  type="button"
                  disabled={!isAvailable}
                  onClick={() => isAvailable && setFormData(prev => ({ ...prev, sportId: sport.id }))}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isSelected
                      ? 'bg-violet-600/20 text-violet-500 border border-violet-500/40'
                      : isAvailable
                      ? 'bg-fg/5 text-fg/60 border border-transparent hover:text-fg/80 hover:bg-fg/10'
                      : 'bg-fg/[0.03] text-fg/20 border border-transparent cursor-not-allowed'
                  }`}
                >
                  {sport.name}
                  {!isAvailable && <span className="ml-1.5 text-[10px] uppercase tracking-wide">Soon</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Admin: Test Season Override */}
        {user?.isAdmin && isBracketMode && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
            <label className="block text-amber-400 text-sm font-medium mb-2">
              <Shield className="w-4 h-4 inline mr-1.5" />
              Admin: Test Season (uses previous year's bracket data)
            </label>
            <select
              value={seasonOverride}
              onChange={(e) => setSeasonOverride(e.target.value)}
              className="input-field"
            >
              <option value="">Current Season</option>
              <option value="2025">2025 (Last Year)</option>
              <option value="2024">2024</option>
            </select>
          </div>
        )}

        {/* League Name */}
        <div>
          <label className="block text-fg/80 text-sm font-medium mb-2">
            League Name
          </label>
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            placeholder={isBracketMode ? "e.g., Office Bracket Challenge 2026" : "e.g., Office Survivor Pool 2024"}
            className="input-field"
            maxLength={30}
          />
        </div>

        {/* Password */}
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-fg/80 text-sm font-medium mb-2">
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
            <label className="block text-fg/80 text-sm font-medium mb-2">
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
        <p className="text-fg/40 text-xs -mt-4">
          Share this password with people you want to join your league
        </p>

        {/* Bracket-specific settings */}
        {isBracketMode ? (
          <BracketSetup config={bracketConfig} onChange={setBracketConfig} />
        ) : (
          <>
            {/* Survivor Settings */}
            <div className="grid gap-4 md:grid-cols-2">
              {/* Max Strikes */}
              <div>
                <label className="block text-fg/80 text-sm font-medium mb-2">
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
                <label className="block text-fg/80 text-sm font-medium mb-2">
                  <Calendar className="w-4 h-4 inline mr-2" />
                  Starting Week
                </label>
                <select
                  name="startWeek"
                  value={formData.startWeek}
                  onChange={handleChange}
                  className="input-field"
                >
                  {nflSport.getCreationPeriods(currentWeek).map(({ value, label }) => (
                    <option key={value} value={value}>
                      {value === currentWeek ? `${label} (Current Week)` : label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Info Box */}
            <div className="bg-violet-500/10 border border-violet-500/20 rounded-xl p-4">
              <div className="flex gap-3">
                <Info className="w-5 h-5 text-violet-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-fg/80 mb-1">How Survivor Pools Work</p>
                  <ul className="space-y-1 list-disc list-inside text-fg/50">
                    <li>Each week, pick one team to win their game</li>
                    <li>You can only use each team once per season</li>
                    <li>If your team loses, you get a strike</li>
                    <li>Too many strikes and you're eliminated!</li>
                  </ul>
                </div>
              </div>
            </div>
          </>
        )}

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
