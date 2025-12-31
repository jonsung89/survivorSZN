import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone, ArrowRight, Loader2, Shield } from 'lucide-react';
import { sendVerificationCode, verifyCode, signInWithGoogle } from '../firebase';
import { useToast } from '../components/Toast';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const [mode, setMode] = useState('select'); // 'select' | 'phone' | 'code'
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { user } = useAuth();

  // Redirect when user is authenticated (handles the case where AuthContext updates)
  useEffect(() => {
    if (user) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, navigate]);

  const formatPhone = (value) => {
    const digits = value.replace(/\D/g, '');
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
  };

  const handlePhoneChange = (e) => {
    const formatted = formatPhone(e.target.value);
    setPhone(formatted);
  };

  const handleSendCode = async (e) => {
    e.preventDefault();
    const digits = phone.replace(/\D/g, '');
    if (digits.length !== 10) {
      showToast('Please enter a valid 10-digit phone number', 'error');
      return;
    }

    setLoading(true);
    try {
      await sendVerificationCode(`+1${digits}`);
      setMode('code');
      showToast('Verification code sent!', 'success');
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Failed to send code', 'error');
      // Reset recaptcha on error
      if (window.recaptchaVerifier) {
        window.recaptchaVerifier.clear();
        window.recaptchaVerifier = null;
      }
    }
    setLoading(false);
  };

  const handleVerifyCode = async (e) => {
    e.preventDefault();
    if (code.length !== 6) {
      showToast('Please enter the 6-digit code', 'error');
      return;
    }

    setLoading(true);
    try {
      await verifyCode(code);
      showToast('Welcome to SurvivorSZN!', 'success');
      // Navigation will happen via the useEffect when user state updates
    } catch (err) {
      console.error(err);
      showToast('Invalid code. Please try again.', 'error');
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      await signInWithGoogle();
      showToast('Welcome to SurvivorSZN!', 'success');
      // Navigation will happen via the useEffect when user state updates
      // Add a fallback navigation in case AuthContext doesn't update fast enough
      setTimeout(() => {
        navigate('/dashboard', { replace: true });
      }, 1000);
    } catch (err) {
      console.error('Google sign-in error:', err);
      showToast(err.message || 'Failed to sign in with Google', 'error');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      {/* Background */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-field-green via-gray-900 to-nfl-blue" />
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 50px, rgba(255,255,255,0.1) 50px, rgba(255,255,255,0.1) 52px)`
        }} />
      </div>

      <div className="w-full max-w-sm sm:max-w-md">
        {/* Logo */}
        <div className="text-center mb-6 sm:mb-8">
          <h1 className="text-4xl sm:text-5xl font-display font-black text-white tracking-tight">
            SURVIVOR<span className="text-nfl-red">SZN</span>
          </h1>
          <p className="text-white/60 mt-2 text-sm sm:text-base">NFL Survivor Pool</p>
        </div>

        <div className="glass-card rounded-xl sm:rounded-2xl p-6 sm:p-8">
          {mode === 'select' && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-white text-center mb-6">Sign in to continue</h2>
              
              {/* Google Sign In */}
              <button
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 bg-white text-gray-800 font-medium py-3 px-4 rounded-xl hover:bg-gray-100 transition-all disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    Continue with Google
                  </>
                )}
              </button>

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/10"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-4 bg-transparent text-white/40">or</span>
                </div>
              </div>

              {/* Phone Sign In */}
              <button
                onClick={() => setMode('phone')}
                className="w-full flex items-center justify-center gap-3 bg-white/10 text-white font-medium py-3 px-4 rounded-xl hover:bg-white/20 transition-all border border-white/10"
              >
                <Phone className="w-5 h-5" />
                Continue with Phone
              </button>
            </div>
          )}

          {mode === 'phone' && (
            <form onSubmit={handleSendCode} className="space-y-6">
              <div>
                <button
                  type="button"
                  onClick={() => setMode('select')}
                  className="text-white/50 hover:text-white text-sm mb-4"
                >
                  ← Back
                </button>
                <h2 className="text-xl font-semibold text-white mb-2">Enter your phone</h2>
                <p className="text-white/50 text-sm">We'll send you a verification code</p>
              </div>

              <div>
                <label className="block text-white/70 text-sm mb-2">Phone Number</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/50">+1</span>
                  <input
                    type="tel"
                    value={phone}
                    onChange={handlePhoneChange}
                    placeholder="(555) 555-5555"
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white placeholder-white/30 focus:outline-none focus:border-white/30 transition-colors"
                    autoFocus
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || phone.replace(/\D/g, '').length !== 10}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    Send Code
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {mode === 'code' && (
            <form onSubmit={handleVerifyCode} className="space-y-6">
              <div>
                <button
                  type="button"
                  onClick={() => setMode('phone')}
                  className="text-white/50 hover:text-white text-sm mb-4"
                >
                  ← Back
                </button>
                <h2 className="text-xl font-semibold text-white mb-2">Enter code</h2>
                <p className="text-white/50 text-sm">Sent to +1 {phone}</p>
              </div>

              <div>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-4 px-4 text-white text-center text-2xl tracking-[0.5em] placeholder-white/30 focus:outline-none focus:border-white/30 transition-colors"
                  autoFocus
                />
              </div>

              <button
                type="submit"
                disabled={loading || code.length !== 6}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    Verify & Sign In
                    <Shield className="w-4 h-4" />
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleSendCode}
                className="w-full text-white/50 hover:text-white text-sm"
              >
                Didn't receive a code? Resend
              </button>
            </form>
          )}
        </div>

        {/* Recaptcha container */}
        <div id="recaptcha-container"></div>

        <p className="text-center text-white/30 text-xs mt-6">
          By signing in, you agree to our Terms of Service
        </p>
      </div>
    </div>
  );
}