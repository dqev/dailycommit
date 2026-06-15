import React, { useState, useEffect } from 'react';
import { Envelope, MessageSquare2, Clock, Save22, Loader, Check, Calendar, Flash2, TerminalCircle, Shuffle } from 'reicon-react';
import type { BoosterConfig as ConfigType } from '../types';

interface BoosterConfigProps {
  config: ConfigType;
  onSave: (newConfig: ConfigType) => Promise<void>;
  loading: boolean;
}

type ScheduleMode = 'preset' | 'timepicker' | 'frequency' | 'custom' | 'random';

const CRON_PRESETS = [
  { label: 'Hourly — Every hour (00 mins)', value: '0 * * * *' },
  { label: 'Streak Safe — Twice daily (08:00 & 20:00 UTC)', value: '0 8,20 * * *' },
  { label: 'Streak Bulletproof — Every 6 hours', value: '0 */6 * * *' },
  { label: 'Morning (08:30 UTC / 14:00 IST)', value: '30 8 * * *' },
  { label: 'Midday (12:00 UTC / 17:30 IST)', value: '0 12 * * *' },
  { label: 'Evening (18:00 UTC / 23:30 IST)', value: '0 18 * * *' },
  { label: 'Night (22:00 UTC / 03:30 IST)', value: '0 22 * * *' },
];

// Convert cron to time picker values (only for simple "M H * * *" patterns)
function cronToTimePicker(cron: string): { hour: number; minute: number } | null {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [min, hr, dom, mon, dow] = parts;
  if (dom !== '*' || mon !== '*' || dow !== '*') return null;
  const h = parseInt(hr, 10);
  const m = parseInt(min, 10);
  if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  return { hour: h, minute: m };
}

function timePickerToCron(hour: number, minute: number): string {
  return `${minute} ${hour} * * *`;
}

// Convert cron to frequency values
function cronToFrequency(cron: string): { unit: 'hour' | 'minute'; value: number } | null {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [min, hr, dom, mon, dow] = parts;
  if (dom !== '*' || mon !== '*' || dow !== '*') return null;

  // Case 1: Every N hours: "0 */N * * *" or "0 * * * *" (N=1)
  if (min === '0') {
    if (hr === '*') {
      return { unit: 'hour', value: 1 };
    }
    const hrMatch = hr.match(/^\*\/(\d+)$/);
    if (hrMatch) {
      const val = parseInt(hrMatch[1], 10);
      if (!isNaN(val) && val >= 1 && val <= 23) {
        return { unit: 'hour', value: val };
      }
    }
  }

  // Case 2: Every M minutes: "*/M * * * *" or "* * * * *" (M=1)
  if (hr === '*') {
    if (min === '*') {
      return { unit: 'minute', value: 1 };
    }
    const minMatch = min.match(/^\*\/(\d+)$/);
    if (minMatch) {
      const val = parseInt(minMatch[1], 10);
      if (!isNaN(val) && val >= 1 && val <= 59) {
        return { unit: 'minute', value: val };
      }
    }
  }

  return null;
}

function frequencyToCron(unit: 'hour' | 'minute', value: number): string {
  if (unit === 'hour') {
    return value === 1 ? '0 * * * *' : `0 */${value} * * *`;
  } else {
    return value === 1 ? '* * * * *' : `*/${value} * * * *`;
  }
}

// Format UTC hour to IST for display
function utcToIstLabel(hourUtc: number, minuteUtc: number): string {
  const totalMinutes = hourUtc * 60 + minuteUtc + 330; // IST = UTC+5:30
  const istH = Math.floor((totalMinutes % 1440) / 60);
  const istM = totalMinutes % 60;
  const period = istH >= 12 ? 'PM' : 'AM';
  const displayH = istH % 12 === 0 ? 12 : istH % 12;
  const displayM = String(istM).padStart(2, '0');
  return `${displayH}:${displayM} ${period} IST`;
}

export const BoosterConfig: React.FC<BoosterConfigProps> = ({ config, onSave, loading }) => {
  const [email, setEmail] = useState(config.email);
  const [message, setMessage] = useState(config.message);
  const [cron, setCron] = useState(config.cron);
  const [preset, setPreset] = useState('custom');
  const [saved, setSaved] = useState(false);
  const [mode, setMode] = useState<ScheduleMode>('preset');
  const [pickerHour, setPickerHour] = useState(8);
  const [pickerMinute, setPickerMinute] = useState(0);
  const [freqValue, setFreqValue] = useState(1);
  const [freqUnit, setFreqUnit] = useState<'hour' | 'minute'>('hour');
  const [dailyCommitCount, setDailyCommitCount] = useState<number>(
    config.dailyCommitCount && config.dailyCommitCount >= 3 ? config.dailyCommitCount : 4
  );

  // Match initial config to mode
  useEffect(() => {
    setEmail(config.email);
    setMessage(config.message);
    setCron(config.cron);
    setDailyCommitCount(config.dailyCommitCount && config.dailyCommitCount >= 3 ? config.dailyCommitCount : 4);

    // Auto-detect mode from config
    if (config.dailyCommitCount && config.dailyCommitCount >= 3) {
      setMode('random');
      return;
    }

    const matchedPreset = CRON_PRESETS.find((p) => p.value === config.cron);
    if (matchedPreset) {
      setPreset(matchedPreset.value);
      setMode('preset');
    } else {
      const parsedTime = cronToTimePicker(config.cron);
      if (parsedTime) {
        setPickerHour(parsedTime.hour);
        setPickerMinute(parsedTime.minute);
        setMode('timepicker');
      } else {
        const parsedFreq = cronToFrequency(config.cron);
        if (parsedFreq) {
          setFreqValue(parsedFreq.value);
          setFreqUnit(parsedFreq.unit);
          setMode('frequency');
        } else {
          setMode('custom');
        }
      }
      setPreset('custom');
    }
  }, [config]);

  // Keep cron in sync with time picker & frequency picker
  useEffect(() => {
    if (mode === 'timepicker') {
      setCron(timePickerToCron(pickerHour, pickerMinute));
    } else if (mode === 'frequency') {
      setCron(frequencyToCron(freqUnit, freqValue));
    }
  }, [mode, pickerHour, pickerMinute, freqUnit, freqValue]);

  const handlePresetChange = (val: string) => {
    setPreset(val);
    setCron(val);
  };

  const handleModeChange = (newMode: ScheduleMode) => {
    setMode(newMode);
    if (newMode === 'random') {
      // In random mode, cron is not directly used — dailyCommitCount drives the workflow
      // Nothing to do here; dailyCommitCount state already set
    } else if (newMode === 'preset') {
      const first = CRON_PRESETS[0];
      setPreset(first.value);
      setCron(first.value);
    } else if (newMode === 'timepicker') {
      setCron(timePickerToCron(pickerHour, pickerMinute));
    } else if (newMode === 'frequency') {
      setCron(frequencyToCron(freqUnit, freqValue));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(false);
    await onSave({
      email: email.trim(),
      message: message.trim(),
      cron: cron.trim(),
      dailyCommitCount: mode === 'random' ? dailyCommitCount : 0,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

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
            <Envelope size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              id="email-input"
              type="email"
              className="form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              placeholder="e.g. email@example.com"
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
            <MessageSquare2 size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
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
          <label className="form-label">Daily Trigger Schedule</label>

          {/* Mode Tabs */}
          <div style={{
            display: 'flex',
            gap: '0.375rem',
            marginBottom: '0.875rem',
            background: 'rgba(0,0,0,0.25)',
            borderRadius: '10px',
            padding: '4px',
            border: '1px solid rgba(255,255,255,0.06)',
          }}>
            {(['random', 'preset', 'timepicker', 'frequency', 'custom'] as ScheduleMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => handleModeChange(m)}
                disabled={loading}
                style={{
                  flex: 1,
                  padding: '0.4rem 0.5rem',
                  borderRadius: '7px',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  letterSpacing: '0.01em',
                  transition: 'all 0.2s ease',
                  background: mode === m
                    ? m === 'random' ? 'var(--accent-cyan)' : 'var(--accent-green)'
                    : 'transparent',
                  color: mode === m ? '#0d1117' : 'var(--text-muted)',
                  boxShadow: mode === m
                    ? m === 'random' ? '0 2px 8px rgba(6,182,212,0.3)' : '0 2px 8px rgba(16,185,129,0.25)'
                    : 'none',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}>
                  {m === 'random' ? <Shuffle size={13} /> : m === 'preset' ? <Flash2 size={13} /> : m === 'timepicker' ? <Clock size={13} /> : m === 'frequency' ? <Calendar size={13} /> : <TerminalCircle size={13} />}
                  {m === 'random' ? 'Random' : m === 'preset' ? 'Presets' : m === 'timepicker' ? 'Daily' : m === 'frequency' ? 'Freq' : 'Custom'}
                </span>
              </button>
            ))}
          </div>

          {/* Random Daily Mode */}
          {mode === 'random' && (() => {
            const UTC_WINDOWS = [1, 5, 9, 13, 17, 21];
            const selected = UTC_WINDOWS.slice(0, dailyCommitCount);
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                {/* Banner */}
                <div style={{
                  display: 'flex',
                  gap: '0.625rem',
                  padding: '0.75rem 0.875rem',
                  borderRadius: '10px',
                  background: 'rgba(6,182,212,0.07)',
                  border: '1px solid rgba(6,182,212,0.18)',
                  alignItems: 'flex-start',
                }}>
                  <Shuffle size={15} style={{ color: 'var(--accent-cyan)', flexShrink: 0, marginTop: '1px' }} />
                  <div>
                    <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent-cyan)', marginBottom: '0.2rem' }}>
                      Runs on GitHub's servers — no machine needed
                    </p>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                      Each trigger sleeps a random 0–59 min, so commits land at different times every day. Once saved and Active, this runs forever even after you log out.
                    </p>
                  </div>
                </div>

                {/* Count stepper */}
                <div>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: '0.5rem' }}>
                    Commits per day
                  </span>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {[3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setDailyCommitCount(n)}
                        disabled={loading}
                        style={{
                          flex: 1,
                          padding: '0.6rem',
                          borderRadius: '8px',
                          border: dailyCommitCount === n
                            ? '1.5px solid var(--accent-cyan)'
                            : '1px solid rgba(255,255,255,0.08)',
                          background: dailyCommitCount === n
                            ? 'rgba(6,182,212,0.12)'
                            : 'rgba(255,255,255,0.03)',
                          color: dailyCommitCount === n ? 'var(--accent-cyan)' : 'var(--text-muted)',
                          fontWeight: 700,
                          fontSize: '1rem',
                          cursor: 'pointer',
                          transition: 'all 0.18s ease',
                        }}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Schedule preview */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Trigger windows today
                  </span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                    {selected.map((h) => {
                      const istH = Math.floor(((h * 60 + 330) % 1440) / 60);
                      const istM = (h * 60 + 330) % 60;
                      const period = istH >= 12 ? 'PM' : 'AM';
                      const dh = istH % 12 === 0 ? 12 : istH % 12;
                      const dm = String(istM).padStart(2, '0');
                      return (
                        <span key={h} style={{
                          fontSize: '0.72rem',
                          padding: '0.3rem 0.6rem',
                          borderRadius: '6px',
                          background: 'rgba(6,182,212,0.08)',
                          border: '1px solid rgba(6,182,212,0.18)',
                          color: 'var(--accent-cyan)',
                          fontWeight: 600,
                          fontFamily: 'monospace',
                        }}>
                          ~{String(h).padStart(2,'0')}:XX UTC &nbsp;·&nbsp; ~{dh}:{dm} {period} IST
                        </span>
                      );
                    })}
                  </div>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                    Each window has up to ±59 min random jitter applied.
                  </span>
                </div>
              </div>
            );
          })()}

          {/* Preset Mode */}
          {mode === 'preset' && (
            <div style={{ position: 'relative' }}>
              <Clock size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', zIndex: 1 }} />
              <select
                id="preset-select"
                className="form-input"
                value={preset}
                onChange={(e) => handlePresetChange(e.target.value)}
                disabled={loading}
                style={{
                  paddingLeft: '2.5rem',
                  appearance: 'none',
                  background: 'rgba(0,0,0,0.3) url("data:image/svg+xml;utf8,<svg fill=\'%2394a3b8\' height=\'24\' viewBox=\'0 0 24 24\' width=\'24\' xmlns=\'http://www.w3.org/2000/svg\'><path d=\'M7 10l5 5 5-5z\'/></svg>") no-repeat right 12px center',
                }}
              >
                {CRON_PRESETS.map((p) => (
                  <option key={p.value} value={p.value} style={{ background: '#18181b' }}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Time Picker Mode */}
          {mode === 'timepicker' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                {/* Hour */}
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: '0.375rem' }}>
                    Hour (UTC)
                  </span>
                  <select
                    className="form-input"
                    value={pickerHour}
                    onChange={(e) => setPickerHour(Number(e.target.value))}
                    disabled={loading}
                    style={{
                      appearance: 'none',
                      background: 'rgba(0,0,0,0.3) url("data:image/svg+xml;utf8,<svg fill=\'%2394a3b8\' height=\'24\' viewBox=\'0 0 24 24\' width=\'24\' xmlns=\'http://www.w3.org/2000/svg\'><path d=\'M7 10l5 5 5-5z\'/></svg>") no-repeat right 10px center',
                      textAlign: 'center',
                    }}
                  >
                    {hours.map((h) => (
                      <option key={h} value={h} style={{ background: '#18181b' }}>
                        {String(h).padStart(2, '0')}:00
                      </option>
                    ))}
                  </select>
                </div>

                {/* Colon divider */}
                <span style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-muted)', marginTop: '1.25rem' }}>:</span>

                {/* Minute */}
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: '0.375rem' }}>
                    Minute (UTC)
                  </span>
                  <select
                    className="form-input"
                    value={pickerMinute}
                    onChange={(e) => setPickerMinute(Number(e.target.value))}
                    disabled={loading}
                    style={{
                      appearance: 'none',
                      background: 'rgba(0,0,0,0.3) url("data:image/svg+xml;utf8,<svg fill=\'%2394a3b8\' height=\'24\' viewBox=\'0 0 24 24\' width=\'24\' xmlns=\'http://www.w3.org/2000/svg\'><path d=\'M7 10l5 5 5-5z\'/></svg>") no-repeat right 10px center',
                      textAlign: 'center',
                    }}
                  >
                    {minutes.map((m) => (
                      <option key={m} value={m} style={{ background: '#18181b' }}>
                        :{String(m).padStart(2, '0')}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Preview */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.625rem',
                padding: '0.6rem 0.875rem',
                borderRadius: '8px',
                background: 'rgba(6,182,212,0.06)',
                border: '1px solid rgba(6,182,212,0.15)',
              }}>
                <Calendar size={14} style={{ color: 'var(--accent-cyan)', flexShrink: 0 }} />
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Commits daily at{' '}
                  <strong style={{ color: '#fff' }}>
                    {String(pickerHour).padStart(2, '0')}:{String(pickerMinute).padStart(2, '0')} UTC
                  </strong>
                  {' '}→{' '}
                  <strong style={{ color: 'var(--accent-cyan)' }}>
                    {utcToIstLabel(pickerHour, pickerMinute)}
                  </strong>
                </span>
                <code style={{
                  marginLeft: 'auto',
                  fontSize: '0.72rem',
                  fontFamily: 'monospace',
                  color: 'var(--accent-green)',
                  background: 'rgba(0,0,0,0.3)',
                  padding: '2px 7px',
                  borderRadius: '5px',
                  whiteSpace: 'nowrap',
                }}>
                  {cron}
                </code>
              </div>
            </div>
          )}

          {/* Frequency Mode */}
          {mode === 'frequency' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                {/* Interval Value */}
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: '0.375rem' }}>
                    Interval
                  </span>
                  <select
                    className="form-input"
                    value={freqValue}
                    onChange={(e) => setFreqValue(Number(e.target.value))}
                    disabled={loading}
                    style={{
                      appearance: 'none',
                      background: 'rgba(0,0,0,0.3) url("data:image/svg+xml;utf8,<svg fill=\'%2394a3b8\' height=\'24\' viewBox=\'0 0 24 24\' width=\'24\' xmlns=\'http://www.w3.org/2000/svg\'><path d=\'M7 10l5 5 5-5z\'/></svg>") no-repeat right 10px center',
                      textAlign: 'center',
                    }}
                  >
                    {freqUnit === 'hour'
                      ? [1, 2, 3, 4, 6, 8, 12].map((v) => (
                          <option key={v} value={v} style={{ background: '#18181b' }}>
                            Every {v} {v === 1 ? 'hour' : 'hours'}
                          </option>
                        ))
                      : [5, 10, 15, 20, 30, 45].map((v) => (
                          <option key={v} value={v} style={{ background: '#18181b' }}>
                            Every {v} mins
                          </option>
                        ))}
                  </select>
                </div>

                {/* Recurrence Unit */}
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: '0.375rem' }}>
                    Unit
                  </span>
                  <select
                    className="form-input"
                    value={freqUnit}
                    onChange={(e) => {
                      const unit = e.target.value as 'hour' | 'minute';
                      setFreqUnit(unit);
                      setFreqValue(unit === 'hour' ? 1 : 5);
                    }}
                    disabled={loading}
                    style={{
                      appearance: 'none',
                      background: 'rgba(0,0,0,0.3) url("data:image/svg+xml;utf8,<svg fill=\'%2394a3b8\' height=\'24\' viewBox=\'0 0 24 24\' width=\'24\' xmlns=\'http://www.w3.org/2000/svg\'><path d=\'M7 10l5 5 5-5z\'/></svg>") no-repeat right 10px center',
                      textAlign: 'center',
                    }}
                  >
                    <option value="hour" style={{ background: '#18181b' }}>Hours</option>
                    <option value="minute" style={{ background: '#18181b' }}>Minutes</option>
                  </select>
                </div>
              </div>

              {/* Preview */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.625rem',
                padding: '0.6rem 0.875rem',
                borderRadius: '8px',
                background: 'rgba(6,182,212,0.06)',
                border: '1px solid rgba(6,182,212,0.15)',
              }}>
                <Calendar size={14} style={{ color: 'var(--accent-cyan)', flexShrink: 0 }} />
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Commits recurring{' '}
                  <strong style={{ color: '#fff' }}>
                    every {freqValue} {freqUnit === 'hour' ? (freqValue === 1 ? 'hour' : 'hours') : 'minutes'}
                  </strong>
                </span>
                <code style={{
                  marginLeft: 'auto',
                  fontSize: '0.72rem',
                  fontFamily: 'monospace',
                  color: 'var(--accent-green)',
                  background: 'rgba(0,0,0,0.3)',
                  padding: '2px 7px',
                  borderRadius: '5px',
                  whiteSpace: 'nowrap',
                }}>
                  {cron}
                </code>
              </div>
            </div>
          )}

          {/* Custom Mode */}
          {mode === 'custom' && (
            <div style={{ position: 'relative' }}>
              <Clock size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                className="form-input"
                value={cron}
                onChange={(e) => setCron(e.target.value)}
                disabled={loading}
                placeholder="e.g. 30 8 * * * (min hour * * *)"
                style={{ paddingLeft: '2.5rem', fontFamily: 'monospace', letterSpacing: '0.05em' }}
                required
              />
            </div>
          )}

          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem', display: 'block' }}>
            All times are in <strong style={{ color: 'var(--text-secondary)' }}>UTC</strong>. GitHub Actions cron jobs may run within a ±15 min window.
          </span>
        </div>

        {/* Save button */}
        <button
          type="submit"
          className="btn btn-primary"
          style={{ width: '100%', gap: '0.5rem', background: saved ? 'var(--accent-green)' : 'var(--primary)', color: saved ? '#fff' : 'var(--primary-text)' }}
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
              <Save22 size={16} />
              Save Settings
            </>
          )}
        </button>
      </form>
    </div>
  );
};
