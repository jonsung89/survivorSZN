import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Trophy, User, ArrowRight, Check, Loader2, Zap, Shield, Users, Mail } from 'lucide-react';

export default function Onboarding() {
  const { user, updateDisplayName, updateEmail, completeOnboarding } = useAuth();
  const [step, setStep] = useState(1);
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [email, setEmail] = useState(user?.email || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSaveDisplayName = async () => {
    if (!displayName.trim() || displayName.trim().length < 2) {
      setError('Display name must be at least 2 characters');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const result = await updateDisplayName(displayName.trim());
      if (result.success || result.displayName) {
        setStep(2);
      } else {
        setError(result.error || 'Failed to save display name');
      }
    } catch (err) {
      setError('Something went wrong');
    }

    setSaving(false);
  };

  const handleSaveEmail = async () => {
    // Email is optional, but validate if provided
    if (email.trim() && !email.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }

    setSaving(true);
    setError('');

    try {
      if (email.trim()) {
        await updateEmail(email.trim());
      }
      setStep(3);
    } catch (err) {
      setError('Something went wrong');
    }

    setSaving(false);
  };

  const handleComplete = () => {
    completeOnboarding();
  };

  return (
    <div className="fixed inset-0 bg-nfl-dark z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Progress indicator */}
        <div className="flex justify-center gap-2 mb-8">
          <div className={`w-2 h-2 rounded-full transition-all ${step >= 1 ? 'bg-nfl-blue w-8' : 'bg-white/20'}`} />
          <div className={`w-2 h-2 rounded-full transition-all ${step >= 2 ? 'bg-nfl-blue w-8' : 'bg-white/20'}`} />
          <div className={`w-2 h-2 rounded-full transition-all ${step >= 3 ? 'bg-nfl-blue w-8' : 'bg-white/20'}`} />
        </div>

        {step === 1 && (
          <div className="animate-in text-center">
            {/* Welcome Header */}
            <div className="w-20 h-20 bg-gradient-to-br from-nfl-blue to-nfl-purple rounded-2xl flex items-center justify-center mx-auto mb-6">
              <Trophy className="w-10 h-10 text-white" />
            </div>
            
            <h1 className="text-3xl font-display font-bold text-white mb-2">
              Welcome to Survivor SZN!
            </h1>
            <p className="text-white/60 mb-8">
              Let's set up your profile to get started
            </p>

            {/* Display Name Input */}
            <div className="glass-card rounded-2xl p-6 text-left mb-6">
              <label className="block text-white/80 text-sm font-medium mb-2">
                <User className="w-4 h-4 inline mr-2" />
                What should we call you?
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => {
                  setDisplayName(e.target.value);
                  setError('');
                }}
                placeholder="Enter your display name"
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-nfl-blue text-lg"
                maxLength={30}
                autoFocus
              />
              <p className="text-white/40 text-xs mt-2">
                This is how other players will see you in leagues
              </p>
              {error && (
                <p className="text-red-400 text-sm mt-2">{error}</p>
              )}
            </div>

            <button
              onClick={handleSaveDisplayName}
              disabled={saving || !displayName.trim()}
              className="w-full btn-primary flex items-center justify-center gap-2 text-lg py-4"
            >
              {saving ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  Continue
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="animate-in text-center">
            {/* Email Header */}
            <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <Mail className="w-10 h-10 text-white" />
            </div>
            
            <h1 className="text-3xl font-display font-bold text-white mb-2">
              Add Your Email
            </h1>
            <p className="text-white/60 mb-8">
              Help commissioners identify you and receive updates
            </p>

            {/* Email Input */}
            <div className="glass-card rounded-2xl p-6 text-left mb-6">
              <label className="block text-white/80 text-sm font-medium mb-2">
                <Mail className="w-4 h-4 inline mr-2" />
                Email address (optional)
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError('');
                }}
                placeholder="your@email.com"
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-nfl-blue text-lg"
                autoFocus
              />
              {error && (
                <p className="text-red-400 text-sm mt-2">{error}</p>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep(3)}
                className="flex-1 py-4 px-4 rounded-xl bg-white/5 text-white/70 hover:bg-white/10 transition-colors"
              >
                Skip
              </button>
              <button
                onClick={handleSaveEmail}
                disabled={saving}
                className="flex-1 btn-primary flex items-center justify-center gap-2 text-lg py-4"
              >
                {saving ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    Continue
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="animate-in text-center">
            {/* Success Header */}
            <div className="w-20 h-20 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <Check className="w-10 h-10 text-white" />
            </div>
            
            <h1 className="text-3xl font-display font-bold text-white mb-2">
              You're all set, {displayName}!
            </h1>
            <p className="text-white/60 mb-8">
              Here's how Survivor SZN works
            </p>

            {/* Quick Guide */}
            <div className="space-y-4 mb-8">
              <div className="glass-card rounded-xl p-4 flex items-start gap-4 text-left">
                <div className="w-10 h-10 bg-nfl-blue/20 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Zap className="w-5 h-5 text-nfl-blue" />
                </div>
                <div>
                  <h3 className="text-white font-semibold">Pick a Winner Each Week</h3>
                  <p className="text-white/50 text-sm">Choose one NFL team to win. If they win, you survive!</p>
                </div>
              </div>

              <div className="glass-card rounded-xl p-4 flex items-start gap-4 text-left">
                <div className="w-10 h-10 bg-orange-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Shield className="w-5 h-5 text-orange-400" />
                </div>
                <div>
                  <h3 className="text-white font-semibold">Use Each Team Only Once</h3>
                  <p className="text-white/50 text-sm">You can't pick the same team twice all season</p>
                </div>
              </div>

              <div className="glass-card rounded-xl p-4 flex items-start gap-4 text-left">
                <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Users className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <h3 className="text-white font-semibold">Be the Last One Standing</h3>
                  <p className="text-white/50 text-sm">Lose and you get a strike. Too many strikes = eliminated!</p>
                </div>
              </div>
            </div>

            <button
              onClick={handleComplete}
              className="w-full btn-primary flex items-center justify-center gap-2 text-lg py-4"
            >
              Let's Go!
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}