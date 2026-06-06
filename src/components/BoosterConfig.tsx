import React, { useState, useEffect } from 'react';
import { Mail, MessageSquare, Clock, Save, Loader, Check } from 'lucide-react';
import type { BoosterConfig as ConfigType } from '../types';

interface BoosterConfigProps {
  config: ConfigType;
  onSave: (newConfig: ConfigType) => Promise<void>;
  loading: boolean;
}

const CRON_PRESETS = [
  { label: 'Morning (08:30 UTC / 14:00 IST)', value: '30 8 * * *' },
  { label: 'Midday (12:00 UTC / 17:30 IST)', value: '0 12 * * *' },
  { label: 'Evening (18:00 UTC / 23:30 IST)', value: '0 18 * * *' },
  { label: 'Night (22:00 UTC / 03:30 IST)', value: '0 22 * * *' },
  { label: 'Custom Cron Expression...', value: 'custom' },
];

export const BoosterConfig: React.FC<BoosterConfigProps> = ({ config, onSave, loading }) => {
  const [email, setEmail] = useState(config.email);
  const [message, setMessage] = useState(config.message);
  const [cron, setCron] = useState(config.cron);
  const [preset, setPreset] = useState('custom');
  const [saved, setSaved] = useState(false);

  // Match initial config to preset
  useEffect(() => {
    setEmail(config.email);
    setMessage(config.message);
    setCron(config.cron);

    const matchedPreset = CRON_PRESETS.find((p) => p.value === config.cron);
    if (matchedPreset) {
      setPreset(matchedPreset.value);
    } else {
      setPreset('custom');
    }
  }, [config]);

  const handlePresetChange = (val: string) => {
    setPreset(val);
    if (val !== 'custom') {
      setCron(val);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(false);
    await onSave({
      email: email.trim(),
      message: message.trim(),
      cron: cron.trim(),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000); // Reset saved indicator
  };

  return (
    <div className="glass-panel">
      <h3>Configuration</h3>
      <p className="subtitle">Tune your auto-commit engine settings. Commits are pushed directly using these details.</p>

      <form onSubmit={handleSubmit} className="config-section">
        {/* Committer Email */}
        <div className="form-group">
          <label className="form-label" htmlFor="email-input">
            GitHub Commit Email
          </label>
          <div style={{ position: 'relative' }}>
            <Mail size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              id="email-input"
              type="email"
              className="form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              placeholder="e.g. dev@example.com"
              style={{ paddingLeft: '2.5rem' }}
              required
            />
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'block' }}>
            Must match your primary GitHub email for commits to count on your contribution map.
          </span>
        </div>

        {/* Commit Message */}
        <div className="form-group">
          <label className="form-label" htmlFor="msg-input">
            Commit Message
          </label>
          <div style={{ position: 'relative' }}>
            <MessageSquare size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              id="msg-input"
              type="text"
              className="form-input"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={loading}
              placeholder="chore: update booster activity"
              style={{ paddingLeft: '2.5rem' }}
              required
            />
          </div>
        </div>

        {/* Schedule */}
        <div className="form-group">
          <label className="form-label" htmlFor="preset-select">
            Daily Trigger Schedule
          </label>
          <div style={{ position: 'relative', marginBottom: preset === 'custom' ? '0.75rem' : '0' }}>
            <Clock size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <select
              id="preset-select"
              className="form-input"
              value={preset}
              onChange={(e) => handlePresetChange(e.target.value)}
              disabled={loading}
              style={{ paddingLeft: '2.5rem', appearance: 'none', background: 'rgba(0,0,0,0.3) url("data:image/svg+xml;utf8,<svg fill=\'%2394a3b8\' height=\'24\' viewBox=\'0 0 24 24\' width=\'24\' xmlns=\'http://www.w3.org/2000/svg\'><path d=\'M7 10l5 5 5-5z\'/></svg>") no-repeat right 12px center' }}
            >
              {CRON_PRESETS.map((p) => (
                <option key={p.value} value={p.value} style={{ background: '#18181b' }}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {preset === 'custom' && (
            <input
              type="text"
              className="form-input"
              value={cron}
              onChange={(e) => setCron(e.target.value)}
              disabled={loading}
              placeholder="e.g. 30 8 * * *"
              required
            />
          )}
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'block' }}>
            GitHub Actions cron jobs use UTC time. Auto-commits may trigger within a 15-minute window.
          </span>
        </div>

        {/* Save button */}
        <button
          type="submit"
          className="btn btn-primary"
          style={{ width: '100%', gap: '0.5rem', background: saved ? 'var(--accent-green)' : 'linear-gradient(135deg, var(--primary), #6d28d9)' }}
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader size={16} className="animate-spin" />
              Saving Configuration...
            </>
          ) : saved ? (
            <>
              <Check size={16} />
              Config Saved to GitHub!
            </>
          ) : (
            <>
              <Save size={16} />
              Save Settings
            </>
          )}
        </button>
      </form>
    </div>
  );
};
