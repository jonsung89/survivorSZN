import { useState } from 'react';
import { Share2, Copy, Check, RefreshCw, Link, QrCode, X, Loader2, AlertCircle } from 'lucide-react';
import { leagueAPI } from '../api';

// Just the button - modal is rendered separately in parent
export function ShareLeagueButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-4 py-2 bg-nfl-blue hover:bg-nfl-blue/80 text-white rounded-xl font-medium transition-all"
    >
      <Share2 className="w-4 h-4" />
      <span className="hidden sm:inline">Invite</span>
    </button>
  );
}

// The modal - rendered at root level of parent component
export function ShareLeagueModal({ league, isCommissioner, onClose, onInviteCodeUpdate }) {
  const [copied, setCopied] = useState(null);
  const [regenerating, setRegenerating] = useState(false);
  const [showQR, setShowQR] = useState(false);

  const inviteCode = league?.inviteCode;
  const inviteLink = inviteCode ? `${window.location.origin}/join/${inviteCode}` : null;

  const handleCopy = async (type) => {
    const text = type === 'code' ? inviteCode : inviteLink;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Join ${league.name} on Survivor SZN`,
          text: `Join my NFL Survivor pool "${league.name}"! Use invite code: ${inviteCode}`,
          url: inviteLink
        });
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('Share failed:', err);
        }
      }
    } else {
      handleCopy('link');
    }
  };

  const handleRegenerate = async () => {
    if (!confirm('Are you sure you want to regenerate the invite code? The old code will stop working.')) {
      return;
    }
    
    setRegenerating(true);
    try {
      const result = await leagueAPI.regenerateInviteCode(league.id);
      if (result.success && result.inviteCode) {
        onInviteCodeUpdate?.(result.inviteCode);
      }
    } catch (err) {
      console.error('Failed to regenerate:', err);
    }
    setRegenerating(false);
  };

  const qrCodeUrl = inviteLink 
    ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(inviteLink)}`
    : null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content animate-in max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Share2 className="w-5 h-5" />
            Invite to {league.name}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-white/60" />
          </button>
        </div>

        <div className="space-y-4">
          {!inviteCode ? (
            <div className="text-center py-6">
              <AlertCircle className="w-12 h-12 text-yellow-400 mx-auto mb-4" />
              <h3 className="text-white font-semibold mb-2">Invite Code Not Available</h3>
              <p className="text-white/60 text-sm">
                The database needs to be updated. Please run the migration to enable invite codes.
              </p>
            </div>
          ) : (
            <>
              {/* Invite Code */}
              <div className="bg-white/5 rounded-xl p-4">
                <label className="block text-white/50 text-xs uppercase tracking-wider mb-2">
                  Invite Code
                </label>
                <div className="flex items-center gap-3">
                  <span className="text-3xl font-mono font-bold text-white tracking-widest flex-1">
                    {inviteCode}
                  </span>
                  <button
                    onClick={() => handleCopy('code')}
                    className={`p-3 rounded-xl transition-all ${
                      copied === 'code' 
                        ? 'bg-green-500 text-white' 
                        : 'bg-white/10 hover:bg-white/20 text-white'
                    }`}
                  >
                    {copied === 'code' ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {/* Invite Link */}
              <div className="bg-white/5 rounded-xl p-4">
                <label className="block text-white/50 text-xs uppercase tracking-wider mb-2">
                  Invite Link
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-white/5 rounded-lg px-3 py-2 overflow-hidden">
                    <span className="text-white/70 text-sm truncate block">
                      {inviteLink}
                    </span>
                  </div>
                  <button
                    onClick={() => handleCopy('link')}
                    className={`p-2 rounded-lg transition-all flex-shrink-0 ${
                      copied === 'link' 
                        ? 'bg-green-500 text-white' 
                        : 'bg-white/10 hover:bg-white/20 text-white'
                    }`}
                  >
                    {copied === 'link' ? <Check className="w-4 h-4" /> : <Link className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={handleShare}
                  className="flex-1 btn-primary flex items-center justify-center gap-2"
                >
                  <Share2 className="w-4 h-4" />
                  {navigator.share ? 'Share' : 'Copy Link'}
                </button>
                <button
                  onClick={() => setShowQR(!showQR)}
                  className={`p-3 rounded-xl transition-all ${
                    showQR ? 'bg-nfl-blue text-white' : 'bg-white/10 hover:bg-white/20 text-white'
                  }`}
                  title="Show QR Code"
                >
                  <QrCode className="w-5 h-5" />
                </button>
              </div>

              {/* QR Code */}
              {showQR && qrCodeUrl && (
                <div className="bg-white rounded-xl p-4 flex items-center justify-center">
                  <img 
                    src={qrCodeUrl} 
                    alt="QR Code" 
                    className="w-48 h-48"
                  />
                </div>
              )}

              {/* Regenerate (Commissioner only) */}
              {isCommissioner && (
                <div className="pt-4 border-t border-white/10">
                  <button
                    onClick={handleRegenerate}
                    disabled={regenerating}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white rounded-xl transition-all text-sm"
                  >
                    {regenerating ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                    Regenerate Invite Code
                  </button>
                  <p className="text-white/30 text-xs text-center mt-2">
                    This will invalidate the current invite code
                  </p>
                </div>
              )}

              {/* Instructions */}
              <div className="text-center text-white/40 text-sm pt-2">
                {league.hasPassword !== false && (
                  <p>Members will need the league password to join</p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Default export for backward compatibility
export default function ShareLeague({ league, isCommissioner, onInviteCodeUpdate }) {
  const [showModal, setShowModal] = useState(false);
  
  return (
    <>
      <ShareLeagueButton onClick={() => setShowModal(true)} />
      {showModal && (
        <ShareLeagueModal 
          league={league}
          isCommissioner={isCommissioner}
          onClose={() => setShowModal(false)}
          onInviteCodeUpdate={onInviteCodeUpdate}
        />
      )}
    </>
  );
}