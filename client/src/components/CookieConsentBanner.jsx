import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Shield } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { isEUUser, getAnalyticsConsent, setAnalyticsConsent } from '../utils/consent';

export default function CookieConsentBanner() {
  const { isDark } = useTheme();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Only show for EU users who haven't made a choice yet
    if (isEUUser() && !getAnalyticsConsent()) {
      setVisible(true);
    }
  }, []);

  const handleAccept = () => {
    setAnalyticsConsent('accepted');
    setVisible(false);
  };

  const handleDecline = () => {
    setAnalyticsConsent('declined');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4">
      <div className={`max-w-2xl mx-auto rounded-xl border shadow-lg px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-4 ${
        isDark
          ? 'bg-gray-900 border-fg/10 text-fg'
          : 'bg-white border-gray-200 text-gray-900'
      }`}>
        <Shield className={`w-5 h-5 shrink-0 mt-0.5 sm:mt-0 ${isDark ? 'text-violet-400' : 'text-violet-600'}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm">
            We use analytics to understand how you use SurvivorSZN and improve your experience.{' '}
            <Link to="/privacy" className={`underline ${isDark ? 'text-violet-400' : 'text-violet-600'}`}>
              Privacy Policy
            </Link>
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleDecline}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              isDark
                ? 'text-fg/60 hover:text-fg hover:bg-fg/10'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
            }`}
          >
            Decline
          </button>
          <button
            onClick={handleAccept}
            className="px-4 py-1.5 text-sm font-medium rounded-lg bg-violet-600 text-white hover:bg-violet-500 transition-colors"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
