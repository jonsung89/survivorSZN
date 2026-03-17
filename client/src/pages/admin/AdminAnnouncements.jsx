import { useState, useEffect, useCallback } from 'react';
import { Megaphone, Plus, X, Trash2, Check, Edit2, Eye } from 'lucide-react';
import { adminAPI } from '../../api';
import { useToast } from '../../components/Toast';
import Loading from '../../components/Loading';

const TARGET_TYPES = [
  { value: 'all', label: 'All Users' },
  { value: 'sport', label: 'By Sport' },
  { value: 'league', label: 'Specific League' },
  { value: 'admin_only', label: 'Admin Only (Test)' },
];

export default function AdminAnnouncements() {
  const { showToast } = useToast();
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    title: '',
    message: '',
    targetType: 'all',
    targetId: '',
    expiresIn: '7d',
  });
  const [leagues, setLeagues] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const loadAnnouncements = useCallback(async () => {
    try {
      const data = await adminAPI.getAnnouncements();
      setAnnouncements(data.announcements || []);
    } catch (err) {
      console.error('Failed to load announcements:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAnnouncements(); }, [loadAnnouncements]);

  // Load leagues for targeting
  useEffect(() => {
    if (form.targetType === 'league') {
      adminAPI.getLeagues({ limit: 100 }).then(data => {
        setLeagues(data.leagues || []);
      }).catch(() => {});
    }
  }, [form.targetType]);

  const resetForm = () => {
    setForm({ title: '', message: '', targetType: 'all', targetId: '', expiresIn: '7d' });
    setShowForm(false);
    setEditing(null);
  };

  const handleSubmit = async () => {
    if (!form.title.trim() || !form.message.trim()) {
      showToast('Title and message are required', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const expiresMap = { '1d': 1, '3d': 3, '7d': 7, '14d': 14, '30d': 30, 'never': null };
      const days = expiresMap[form.expiresIn];
      const expiresAt = days ? new Date(Date.now() + days * 86400000).toISOString() : null;

      const payload = {
        title: form.title.trim(),
        message: form.message.trim(),
        targetType: form.targetType,
        targetId: form.targetType !== 'all' ? form.targetId : null,
        expiresAt,
      };

      if (editing) {
        await adminAPI.updateAnnouncement(editing, payload);
        showToast('Announcement updated', 'success');
      } else {
        await adminAPI.createAnnouncement(payload);
        showToast('Announcement created', 'success');
      }
      resetForm();
      loadAnnouncements();
    } catch (err) {
      showToast('Failed to save announcement', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (id, isActive) => {
    try {
      await adminAPI.updateAnnouncement(id, { isActive: !isActive });
      showToast(isActive ? 'Announcement deactivated' : 'Announcement activated', 'success');
      loadAnnouncements();
    } catch (err) {
      showToast('Failed to update announcement', 'error');
    }
  };

  const handleDelete = async (id) => {
    try {
      await adminAPI.deleteAnnouncement(id);
      showToast('Announcement deleted', 'success');
      loadAnnouncements();
    } catch (err) {
      showToast('Failed to delete announcement', 'error');
    }
  };

  const handleEdit = (ann) => {
    setForm({
      title: ann.title,
      message: ann.message,
      targetType: ann.targetType,
      targetId: ann.targetId || '',
      expiresIn: '7d',
    });
    setEditing(ann.id);
    setShowForm(true);
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (loading) return <Loading />;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-display font-bold text-fg">Announcements</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              resetForm();
              setForm(f => ({ ...f, targetType: 'admin_only', title: 'Test Announcement', message: '', expiresIn: '1d' }));
              setShowForm(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-fg/5 text-fg/60 rounded-lg text-sm font-medium hover:bg-fg/10 transition-colors"
          >
            <Eye className="w-4 h-4" />
            Send Test
          </button>
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-fg/10 text-fg rounded-lg text-sm font-medium hover:bg-fg/15 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New
          </button>
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-surface rounded-xl border border-fg/5 p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-fg">
              {editing ? 'Edit Announcement' : 'New Announcement'}
            </h3>
            <button onClick={resetForm} className="p-1 text-fg/40 hover:text-fg">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Title"
              value={form.title}
              onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
              className="w-full px-3 py-2 bg-canvas border border-fg/10 rounded-lg text-fg text-sm placeholder:text-fg/30 focus:outline-none focus:border-fg/20"
            />
            <textarea
              placeholder="Message..."
              value={form.message}
              onChange={(e) => setForm(f => ({ ...f, message: e.target.value }))}
              rows={3}
              className="w-full px-3 py-2 bg-canvas border border-fg/10 rounded-lg text-fg text-sm placeholder:text-fg/30 focus:outline-none focus:border-fg/20 resize-none"
            />
            <div className="flex flex-wrap gap-3">
              <div>
                <label className="text-sm text-fg/50 block mb-1">Target</label>
                <select
                  value={form.targetType}
                  onChange={(e) => setForm(f => ({ ...f, targetType: e.target.value, targetId: '' }))}
                  className="bg-canvas border border-fg/10 rounded-lg px-3 py-2 text-sm text-fg"
                >
                  {TARGET_TYPES.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              {form.targetType === 'sport' && (
                <div>
                  <label className="text-sm text-fg/50 block mb-1">Sport</label>
                  <select
                    value={form.targetId}
                    onChange={(e) => setForm(f => ({ ...f, targetId: e.target.value }))}
                    className="bg-canvas border border-fg/10 rounded-lg px-3 py-2 text-sm text-fg"
                  >
                    <option value="">Select sport</option>
                    <option value="nfl">NFL</option>
                    <option value="ncaab">NCAAB</option>
                    <option value="nba">NBA</option>
                    <option value="mlb">MLB</option>
                    <option value="nhl">NHL</option>
                  </select>
                </div>
              )}
              {form.targetType === 'league' && (
                <div>
                  <label className="text-sm text-fg/50 block mb-1">League</label>
                  <select
                    value={form.targetId}
                    onChange={(e) => setForm(f => ({ ...f, targetId: e.target.value }))}
                    className="bg-canvas border border-fg/10 rounded-lg px-3 py-2 text-sm text-fg"
                  >
                    <option value="">Select league</option>
                    {leagues.map(l => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="text-sm text-fg/50 block mb-1">Expires</label>
                <select
                  value={form.expiresIn}
                  onChange={(e) => setForm(f => ({ ...f, expiresIn: e.target.value }))}
                  className="bg-canvas border border-fg/10 rounded-lg px-3 py-2 text-sm text-fg"
                >
                  <option value="1d">1 day</option>
                  <option value="3d">3 days</option>
                  <option value="7d">7 days</option>
                  <option value="14d">14 days</option>
                  <option value="30d">30 days</option>
                  <option value="never">Never</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end">
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="px-4 py-2 bg-fg/10 text-fg rounded-lg text-sm font-medium hover:bg-fg/15 transition-colors disabled:opacity-50"
              >
                {submitting ? 'Saving...' : editing ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* List */}
      <div className="bg-surface rounded-xl border border-fg/5 overflow-hidden">
        {announcements.length === 0 ? (
          <div className="px-4 py-8 text-center text-fg/40 text-sm">
            No announcements yet. Create one to broadcast to your users.
          </div>
        ) : (
          <div className="divide-y divide-fg/5">
            {announcements.map((ann) => (
              <div key={ann.id} className={`px-4 py-4 ${!ann.isActive ? 'opacity-50' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Megaphone className="w-4 h-4 text-fg/30" />
                      <span className="text-sm font-medium text-fg">{ann.title}</span>
                      <span className={`text-sm font-medium px-2 py-0.5 rounded ${
                        ann.isActive ? 'text-emerald-400 bg-emerald-400/10' : 'text-fg/40 bg-fg/5'
                      }`}>
                        {ann.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <p className="text-sm text-fg/60 mb-1">{ann.message}</p>
                    <div className="flex items-center gap-3 text-sm text-fg/30">
                      <span>Target: {ann.targetType === 'all' ? 'All' : ann.targetType === 'admin_only' ? 'Admin Only' : `${ann.targetType}: ${ann.targetId || '—'}`}</span>
                      <span>Expires: {formatTime(ann.expiresAt)}</span>
                      <span>Created: {formatTime(ann.createdAt)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleToggle(ann.id, ann.isActive)}
                      className="p-1.5 text-fg/30 hover:text-fg transition-colors"
                      title={ann.isActive ? 'Deactivate' : 'Activate'}
                    >
                      {ann.isActive ? <X className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => handleEdit(ann)}
                      className="p-1.5 text-fg/30 hover:text-fg transition-colors"
                      title="Edit"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(ann.id)}
                      className="p-1.5 text-fg/30 hover:text-red-400 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
