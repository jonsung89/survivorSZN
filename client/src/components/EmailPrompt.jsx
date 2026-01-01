import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Mail, X, Loader2 } from 'lucide-react';

export default function EmailPrompt() {
  const { updateEmail, dismissEmailPrompt } = useAuth();
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const result = await updateEmail(email.trim());
      if (!result.success) {
        setError(result.error || 'Failed to save email');
        setSaving(false);
      }
      // Success - dialog will auto-close via AuthContext
    } catch (err) {
      setError('Something went wrong');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="glass-card rounded-2xl p-6 w-full max-w-md relative animate-in">
        {/* Close button */}
        <button
          onClick={dismissEmailPrompt}
          className="absolute top-4 right-4 text-white/40 hover:text-white/70 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Icon */}
        <div className="w-14 h-14 bg-gradient-to-br from-nfl-blue to-blue-600 rounded-xl flex items-center justify-center mx-auto mb-4">
          <Mail className="w-7 h-7 text-white" />
        </div>

        {/* Header */}
        <h2 className="text-xl font-bold text-white text-center mb-2">
          Add Your Email
        </h2>
        <p className="text-white/60 text-sm text-center mb-6">
          Help your league commissioners identify you and receive important updates
        </p>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError('');
            }}
            placeholder="your@email.com"
            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-nfl-blue mb-3"
            autoFocus
          />
          
          {error && (
            <p className="text-red-400 text-sm mb-3">{error}</p>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={dismissEmailPrompt}
              className="flex-1 py-3 px-4 rounded-xl bg-white/5 text-white/70 hover:bg-white/10 transition-colors"
            >
              Skip
            </button>
            <button
              type="submit"
              disabled={saving || !email.trim()}
              className="flex-1 btn-primary py-3 flex items-center justify-center gap-2"
            >
              {saving ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                'Save'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}