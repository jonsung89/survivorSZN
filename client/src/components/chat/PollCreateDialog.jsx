import { useState } from 'react';
import { X, Plus, Trash2, BarChart3 } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

export default function PollCreateDialog({ onClose, onSubmit }) {
  const { isDark } = useTheme();
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [allowAddOptions, setAllowAddOptions] = useState(false);

  const canSubmit = question.trim() && options.filter(o => o.trim()).length >= 2;

  const handleSubmit = () => {
    if (!canSubmit) return;
    const pollOptions = options
      .filter(o => o.trim())
      .map(text => ({
        id: 'opt_' + Math.random().toString(36).slice(2, 8),
        text: text.trim(),
        addedBy: null,
      }));
    onSubmit({
      question: question.trim(),
      options: pollOptions,
      votes: {},
      config: { allowMultiple, allowAddOptions },
      status: 'active',
      endedBy: null,
      endedAt: null,
    });
    onClose();
  };

  const addOption = () => {
    if (options.length < 10) setOptions([...options, '']);
  };

  const removeOption = (idx) => {
    if (options.length <= 2) return;
    setOptions(options.filter((_, i) => i !== idx));
  };

  const updateOption = (idx, value) => {
    setOptions(options.map((o, i) => i === idx ? value : o));
  };

  return (
    <div data-modal className="fixed inset-0 z-[9999] flex items-end lg:items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full lg:max-w-md bg-elevated rounded-t-2xl lg:rounded-2xl overflow-hidden animate-slide-up lg:animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Handle bar (mobile) */}
        <div className="flex justify-center pt-3 pb-1 lg:hidden">
          <div className="w-10 h-1 bg-fg/20 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-fg/10">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-violet-500" />
            <h3 className="text-lg font-semibold text-fg">Create Poll</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-fg/10 text-fg/50 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Question */}
          <div>
            <label className="text-sm font-medium text-fg/60 mb-1.5 block">Question</label>
            <input
              type="text"
              value={question}
              onChange={e => setQuestion(e.target.value)}
              placeholder="Ask something..."
              maxLength={200}
              className="w-full px-3 py-2.5 rounded-lg text-base text-fg bg-fg/5 border border-fg/10 outline-none focus:border-violet-500/50"
              autoFocus
            />
          </div>

          {/* Options */}
          <div>
            <label className="text-sm font-medium text-fg/60 mb-1.5 block">Options</label>
            <div className="space-y-2">
              {options.map((opt, idx) => (
                <div key={idx} className="flex gap-2">
                  <input
                    type="text"
                    value={opt}
                    onChange={e => updateOption(idx, e.target.value)}
                    placeholder={`Option ${idx + 1}`}
                    maxLength={100}
                    className="flex-1 px-3 py-2.5 rounded-lg text-base text-fg bg-fg/5 border border-fg/10 outline-none focus:border-violet-500/50"
                  />
                  {options.length > 2 && (
                    <button
                      onClick={() => removeOption(idx)}
                      className="p-2 text-fg/30 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {options.length < 10 && (
              <button
                onClick={addOption}
                className="mt-2 flex items-center gap-1.5 text-sm text-violet-500 hover:text-violet-400 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add option
              </button>
            )}
          </div>

          {/* Settings */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-fg/60 block">Settings</label>
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-sm text-fg">Allow multiple answers</span>
              <button
                type="button"
                onClick={() => setAllowMultiple(!allowMultiple)}
                className={`relative w-10 h-6 rounded-full transition-colors ${allowMultiple ? 'bg-violet-500' : (isDark ? 'bg-fg/20' : 'bg-fg/15')}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${allowMultiple ? 'translate-x-4' : ''}`} />
              </button>
            </label>
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-sm text-fg">Allow others to add options</span>
              <button
                type="button"
                onClick={() => setAllowAddOptions(!allowAddOptions)}
                className={`relative w-10 h-6 rounded-full transition-colors ${allowAddOptions ? 'bg-violet-500' : (isDark ? 'bg-fg/20' : 'bg-fg/15')}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${allowAddOptions ? 'translate-x-4' : ''}`} />
              </button>
            </label>
          </div>
        </div>

        {/* Submit */}
        <div className="p-4 border-t border-fg/10">
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={`w-full py-3 rounded-xl text-base font-semibold transition-colors ${
              canSubmit
                ? 'bg-violet-500 text-white hover:bg-violet-600'
                : 'bg-fg/10 text-fg/30 cursor-not-allowed'
            }`}
          >
            Create Poll
          </button>
        </div>
      </div>
    </div>
  );
}
