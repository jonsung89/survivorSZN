import { useState, useEffect, useCallback } from 'react';
import { Search, X, MessageSquare, Shield, Ban, AlertTriangle, ChevronLeft, ChevronRight, Check, Clock, Trash2 } from 'lucide-react';
import { adminAPI } from '../../api';
import { useToast } from '../../components/Toast';
import Loading from '../../components/Loading';

const TABS = [
  { id: 'messages', label: 'Messages', icon: MessageSquare },
  { id: 'reports', label: 'Reports', icon: AlertTriangle },
  { id: 'bans', label: 'Bans', icon: Ban },
];

export default function AdminChatModeration() {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState('messages');
  const [leagues, setLeagues] = useState([]);
  const [selectedLeagueId, setSelectedLeagueId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [reports, setReports] = useState([]);
  const [bans, setBans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messageSearch, setMessageSearch] = useState('');
  const [messagesPage, setMessagesPage] = useState(1);
  const [messagesTotalPages, setMessagesTotalPages] = useState(1);
  const [showBanModal, setShowBanModal] = useState(null);
  const [banForm, setBanForm] = useState({ reason: '', duration: '24h', leagueId: '' });

  // Load leagues with message counts
  useEffect(() => {
    const loadLeagues = async () => {
      try {
        const data = await adminAPI.getChatLeagues();
        setLeagues(data.leagues || []);
        if (data.leagues?.length > 0 && !selectedLeagueId) {
          setSelectedLeagueId(data.leagues[0].id);
        }
      } catch (err) {
        console.error('Failed to load chat leagues:', err);
      } finally {
        setLoading(false);
      }
    };
    loadLeagues();
  }, []);

  // Load messages for selected league
  const loadMessages = useCallback(async () => {
    if (!selectedLeagueId) return;
    setMessagesLoading(true);
    try {
      const data = await adminAPI.getChatMessages(selectedLeagueId, {
        search: messageSearch,
        page: messagesPage,
        limit: 50,
      });
      setMessages(data.messages || []);
      setMessagesTotalPages(data.totalPages || 1);
    } catch (err) {
      console.error('Failed to load messages:', err);
    } finally {
      setMessagesLoading(false);
    }
  }, [selectedLeagueId, messageSearch, messagesPage]);

  useEffect(() => {
    if (activeTab === 'messages') loadMessages();
  }, [loadMessages, activeTab]);

  // Load reports
  const loadReports = useCallback(async () => {
    try {
      const data = await adminAPI.getChatReports();
      setReports(data.reports || []);
    } catch (err) {
      console.error('Failed to load reports:', err);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'reports') loadReports();
  }, [loadReports, activeTab]);

  // Load bans
  const loadBans = useCallback(async () => {
    try {
      const data = await adminAPI.getChatBans();
      setBans(data.bans || []);
    } catch (err) {
      console.error('Failed to load bans:', err);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'bans') loadBans();
  }, [loadBans, activeTab]);

  const handleDeleteMessage = async (messageId) => {
    try {
      await adminAPI.deleteChatMessage(messageId);
      showToast('Message deleted', 'success');
      loadMessages();
    } catch (err) {
      showToast('Failed to delete message', 'error');
    }
  };

  const handleResolveReport = async (reportId, action) => {
    try {
      await adminAPI.resolveChatReport(reportId, action);
      showToast(`Report ${action}`, 'success');
      loadReports();
    } catch (err) {
      showToast('Failed to resolve report', 'error');
    }
  };

  const handleCreateBan = async () => {
    if (!showBanModal) return;
    try {
      const durationMap = { '1h': 1, '24h': 24, '7d': 168, '30d': 720, 'permanent': null };
      const hours = durationMap[banForm.duration];
      const expiresAt = hours ? new Date(Date.now() + hours * 3600000).toISOString() : null;

      await adminAPI.createChatBan({
        userId: showBanModal,
        leagueId: banForm.leagueId || null,
        reason: banForm.reason,
        expiresAt,
      });
      showToast('User banned from chat', 'success');
      setShowBanModal(null);
      setBanForm({ reason: '', duration: '24h', leagueId: '' });
      loadBans();
    } catch (err) {
      showToast('Failed to create ban', 'error');
    }
  };

  const handleRemoveBan = async (banId) => {
    try {
      await adminAPI.removeChatBan(banId);
      showToast('Ban removed', 'success');
      loadBans();
    } catch (err) {
      showToast('Failed to remove ban', 'error');
    }
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
      ' ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  };

  if (loading) return <Loading />;

  return (
    <div>
      <h1 className="text-2xl font-display font-bold text-fg mb-6">Chat Moderation</h1>

      {/* Tabs */}
      <div className="flex gap-1 mb-6">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === id
                ? 'bg-fg/10 text-fg'
                : 'text-fg/40 hover:text-fg hover:bg-fg/5'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
            {id === 'reports' && reports.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-sm font-bold rounded bg-red-500/20 text-red-400">
                {reports.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Messages Tab */}
      {activeTab === 'messages' && (
        <div className="flex gap-4">
          {/* League list */}
          <div className="w-56 flex-shrink-0 hidden lg:block">
            <div className="bg-surface rounded-xl border border-fg/5 overflow-hidden">
              <div className="px-3 py-2 border-b border-fg/10">
                <span className="text-sm font-medium text-fg/50">Leagues</span>
              </div>
              <div className="max-h-[600px] overflow-y-auto">
                {leagues.map((league) => (
                  <button
                    key={league.id}
                    onClick={() => { setSelectedLeagueId(league.id); setMessagesPage(1); }}
                    className={`w-full text-left px-3 py-2.5 border-b border-fg/5 last:border-0 transition-colors ${
                      selectedLeagueId === league.id ? 'bg-fg/10 text-fg' : 'text-fg/60 hover:bg-fg/5'
                    }`}
                  >
                    <div className="text-sm font-medium truncate">{league.name}</div>
                    <div className="text-sm text-fg/30 mt-0.5">{league.messageCount} messages</div>
                  </button>
                ))}
                {leagues.length === 0 && (
                  <div className="px-3 py-4 text-sm text-fg/40 text-center">No leagues</div>
                )}
              </div>
            </div>
          </div>

          {/* Messages feed */}
          <div className="flex-1 min-w-0">
            {/* League selector for mobile */}
            <div className="lg:hidden mb-3">
              <select
                value={selectedLeagueId || ''}
                onChange={(e) => { setSelectedLeagueId(e.target.value); setMessagesPage(1); }}
                className="w-full bg-surface border border-fg/10 rounded-lg px-3 py-2 text-sm text-fg"
              >
                {leagues.map(l => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>

            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg/30" />
              <input
                type="text"
                placeholder="Search messages..."
                value={messageSearch}
                onChange={(e) => { setMessageSearch(e.target.value); setMessagesPage(1); }}
                className="w-full pl-10 pr-4 py-2 bg-surface border border-fg/10 rounded-lg text-fg text-sm placeholder:text-fg/30 focus:outline-none focus:border-fg/20"
              />
            </div>

            {messagesLoading ? <Loading /> : (
              <div className="bg-surface rounded-xl border border-fg/5 overflow-hidden">
                <div className="divide-y divide-fg/5">
                  {messages.map((msg) => (
                    <div key={msg.id} className={`px-4 py-3 ${msg.deletedAt ? 'opacity-40' : ''}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-fg">{msg.displayName}</span>
                            <span className="text-sm text-fg/30">{formatTime(msg.createdAt)}</span>
                          </div>
                          <p className="text-sm text-fg/70 mt-0.5 break-words">
                            {msg.deletedAt ? (
                              <span className="italic text-fg/30">[Message deleted by {msg.deletedBy}]</span>
                            ) : (
                              msg.message || (msg.gif ? '[GIF]' : '[Empty]')
                            )}
                          </p>
                        </div>
                        {!msg.deletedAt && (
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              onClick={() => setShowBanModal(msg.userId)}
                              className="p-1.5 text-fg/30 hover:text-amber-400 transition-colors"
                              title="Ban user"
                            >
                              <Ban className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteMessage(msg.id)}
                              className="p-1.5 text-fg/30 hover:text-red-400 transition-colors"
                              title="Delete message"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {messages.length === 0 && (
                    <div className="px-4 py-8 text-center text-fg/40 text-sm">
                      {selectedLeagueId ? 'No messages found' : 'Select a league'}
                    </div>
                  )}
                </div>
              </div>
            )}

            {messagesTotalPages > 1 && (
              <div className="flex items-center justify-center gap-4 mt-4">
                <button
                  onClick={() => setMessagesPage(p => Math.max(1, p - 1))}
                  disabled={messagesPage === 1}
                  className="p-2 rounded-lg bg-fg/5 text-fg/50 disabled:opacity-20"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm text-fg/50">{messagesPage} of {messagesTotalPages}</span>
                <button
                  onClick={() => setMessagesPage(p => Math.min(messagesTotalPages, p + 1))}
                  disabled={messagesPage === messagesTotalPages}
                  className="p-2 rounded-lg bg-fg/5 text-fg/50 disabled:opacity-20"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Reports Tab */}
      {activeTab === 'reports' && (
        <div className="bg-surface rounded-xl border border-fg/5 overflow-hidden">
          {reports.length === 0 ? (
            <div className="px-4 py-8 text-center text-fg/40 text-sm">No pending reports</div>
          ) : (
            <div className="divide-y divide-fg/5">
              {reports.map((report) => (
                <div key={report.id} className="px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-fg">{report.leagueName}</span>
                        <span className="text-sm text-fg/30">{formatTime(report.createdAt)}</span>
                      </div>
                      <p className="text-sm text-fg/70 break-words mb-1">"{report.messageContent}"</p>
                      <div className="flex items-center gap-2 text-sm text-fg/40">
                        <span>By: {report.senderName}</span>
                        <span>Reported by: {report.reporterName}</span>
                        {report.reason && <span>Reason: {report.reason}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => handleResolveReport(report.id, 'resolved')}
                        className="px-3 py-1.5 text-sm font-medium text-emerald-400 bg-emerald-400/10 rounded-lg hover:bg-emerald-400/20 transition-colors"
                      >
                        Resolve
                      </button>
                      <button
                        onClick={() => handleResolveReport(report.id, 'dismissed')}
                        className="px-3 py-1.5 text-sm text-fg/40 hover:text-fg transition-colors"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Bans Tab */}
      {activeTab === 'bans' && (
        <div>
          <div className="bg-surface rounded-xl border border-fg/5 overflow-hidden">
            {bans.length === 0 ? (
              <div className="px-4 py-8 text-center text-fg/40 text-sm">No active bans</div>
            ) : (
              <div className="divide-y divide-fg/5">
                {bans.map((ban) => (
                  <div key={ban.id} className="px-4 py-3 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-fg">{ban.displayName}</span>
                        {ban.leagueName ? (
                          <span className="text-sm text-fg/40">in {ban.leagueName}</span>
                        ) : (
                          <span className="text-sm text-red-400 font-medium">Global</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-sm text-fg/40">
                        {ban.reason && <span>{ban.reason}</span>}
                        <span>{ban.expiresAt ? `Expires: ${formatTime(ban.expiresAt)}` : 'Permanent'}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveBan(ban.id)}
                      className="px-3 py-1.5 text-sm text-red-400 hover:text-red-300 transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Ban Modal */}
      {showBanModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setShowBanModal(null)}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="relative bg-surface rounded-xl border border-fg/10 p-6 w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-display font-bold text-fg mb-4">Ban User from Chat</h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-fg/50 block mb-1">Reason</label>
                <input
                  type="text"
                  value={banForm.reason}
                  onChange={(e) => setBanForm(f => ({ ...f, reason: e.target.value }))}
                  placeholder="Optional reason..."
                  className="w-full px-3 py-2 bg-canvas border border-fg/10 rounded-lg text-fg text-sm placeholder:text-fg/30 focus:outline-none focus:border-fg/20"
                />
              </div>
              <div>
                <label className="text-sm text-fg/50 block mb-1">Duration</label>
                <select
                  value={banForm.duration}
                  onChange={(e) => setBanForm(f => ({ ...f, duration: e.target.value }))}
                  className="w-full bg-canvas border border-fg/10 rounded-lg px-3 py-2 text-sm text-fg"
                >
                  <option value="1h">1 hour</option>
                  <option value="24h">24 hours</option>
                  <option value="7d">7 days</option>
                  <option value="30d">30 days</option>
                  <option value="permanent">Permanent</option>
                </select>
              </div>
              <div>
                <label className="text-sm text-fg/50 block mb-1">Scope</label>
                <select
                  value={banForm.leagueId}
                  onChange={(e) => setBanForm(f => ({ ...f, leagueId: e.target.value }))}
                  className="w-full bg-canvas border border-fg/10 rounded-lg px-3 py-2 text-sm text-fg"
                >
                  <option value="">Global (all leagues)</option>
                  {leagues.map(l => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setShowBanModal(null)}
                className="px-4 py-2 text-sm text-fg/50 hover:text-fg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateBan}
                className="px-4 py-2 text-sm font-medium bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
              >
                Ban User
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
