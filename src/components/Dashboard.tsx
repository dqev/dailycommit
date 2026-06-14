import React, { useState, useRef, useEffect } from 'react';
import { Play, Refresh, Link2, CheckCircle, Danger2, Loader, Flash2, CloseCircle2, Clock } from 'reicon-react';
import type { GitHubUser, GitCommit, BoosterConfig as ConfigType } from '../types';
import { githubService, getNextCronRunDate, getCronDescription } from '../services/github';
import { BoosterConfig } from './BoosterConfig';
import confetti from 'canvas-confetti';

interface DashboardProps {
  token: string;
  user: GitHubUser;
  commits: GitCommit[];
  logs: any[]; // added logs
  localLogs: any[]; // added local logs
  onRefresh: () => Promise<void>;
  onToggleStatus: (active: boolean) => Promise<void>;
  isActive: boolean;
  repoOwner: string;
  repoName: string;
  hasWorkflow: boolean;
  onInitialize: () => Promise<void>;
  config: ConfigType;
  onSaveConfig: (c: ConfigType) => Promise<void>;
  configSaving: boolean;
}

const PREBUILT_MESSAGES = [
  'chore: update activity log index',
  'docs: improve repository notes',
  'refactor: optimize runtime bindings',
  'fix: syntax adjustments in module',
  'feat: append dashboard telemetry signal',
];

export const Dashboard: React.FC<DashboardProps> = ({
  token,
  user,
  commits,
  logs, // added logs
  localLogs, // added local logs
  onRefresh,
  onToggleStatus,
  isActive,
  repoOwner,
  repoName,
  hasWorkflow,
  onInitialize,
  config,
  onSaveConfig,
  configSaving,
}) => {
  const [commitMessage, setCommitMessage] = useState(PREBUILT_MESSAGES[0]);
  const [pushing, setPushing] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(false);

  const handleInitialize = async () => {
    setInitializing(true);
    setStatusMessage('Initializing repository workflow and configurations...');
    try {
      await onInitialize();
      setStatusMessage('Auto-Committer successfully initialized in repository!');
    } catch (err: any) {
      setStatusMessage(`Initialization failed: ${err.message}`);
    } finally {
      setInitializing(false);
    }
  };

  // Mass commit states
  const [massLimit, setMassLimit] = useState(20);
  const [massMessage, setMassMessage] = useState('chore: high volume activity booster');
  const [massProgress, setMassProgress] = useState<number | null>(null);
  const [massRunning, setMassRunning] = useState(false);
  const [massError, setMassError] = useState<string | null>(null);
  const [turboMode, setTurboMode] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Active schedule next execution timer
  const [nextRunDate, setNextRunDate] = useState<Date | null>(null);
  const [timeRemainingStr, setTimeRemainingStr] = useState<string>('');
  const lastRefreshedTargetTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!isActive || !hasWorkflow || !config.cron) {
      setNextRunDate(null);
      setTimeRemainingStr('');
      return;
    }

    const updateTimer = () => {
      const currentNow = new Date();
      let targetDate = nextRunDate;
      
      // Calculate next run date if not set or if we passed it
      if (!targetDate || currentNow >= targetDate) {
        targetDate = getNextCronRunDate(config.cron, currentNow);
        setNextRunDate(targetDate);
      }

      if (targetDate) {
        const diffMs = targetDate.getTime() - currentNow.getTime();
        if (diffMs <= 0) {
          setTimeRemainingStr('Running...');
          // Trigger a refresh after a small delay to pick up the new commit
          if (lastRefreshedTargetTimeRef.current !== targetDate.getTime()) {
            lastRefreshedTargetTimeRef.current = targetDate.getTime();
            setTimeout(() => {
              onRefresh();
            }, 3000);
          }
        } else {
          const diffSecs = Math.floor(diffMs / 1000);
          const secs = diffSecs % 60;
          const diffMins = Math.floor(diffSecs / 60);
          const mins = diffMins % 60;
          const diffHours = Math.floor(diffMins / 60);
          const hours = diffHours % 24;
          const days = Math.floor(diffHours / 24);

          let str = '';
          if (days > 0) str += `${days}d `;
          if (hours > 0 || days > 0) str += `${hours}h `;
          if (mins > 0 || hours > 0 || days > 0) str += `${mins}m `;
          str += `${secs}s`;
          setTimeRemainingStr(str);
        }
      } else {
        setTimeRemainingStr('Not scheduled');
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [isActive, hasWorkflow, config.cron, nextRunDate, onRefresh]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } catch (e) {
      console.error(e);
    } finally {
      setRefreshing(false);
    }
  };

  const handleToggle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextState = e.target.checked;
    setToggling(true);
    setStatusMessage(null);
    try {
      await onToggleStatus(nextState);
      setStatusMessage(`Daily auto-committer ${nextState ? 'enabled' : 'disabled'} successfully.`);
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err: any) {
      setStatusMessage(`Failed to update settings: ${err.message}`);
    } finally {
      setToggling(false);
    }
  };

  const handleDirectPush = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commitMessage.trim() || pushing) return;

    setPushing(true);
    setStatusMessage('Committing to activity_log.txt...');

    try {
      await githubService.pushDirectCommit(token, commitMessage.trim());
      setStatusMessage('Commit pushed successfully! Heatmap updated.');
      
      confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.8 },
        colors: ['#f5f5f5', '#10b981', '#06b6d4'],
      });

      await onRefresh();
    } catch (err: any) {
      setStatusMessage(`Push failed: ${err.message}`);
    } finally {
      setPushing(false);
    }
  };

  const handleMassBoost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (massRunning || massLimit <= 0) return;

    setMassRunning(true);
    setMassProgress(0);
    setMassError(null);
    setStatusMessage(null);

    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    if (isLocalhost) {
      setStatusMessage(`Initiating super-fast local commit boost for ${massLimit} commits...`);
      try {
        const response = await fetch('/api/bulk-commit', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            count: massLimit,
            email: user.email || `${user.login}@users.noreply.github.com`,
            message: massMessage.trim() || 'chore: mass activity boost',
            owner: repoOwner,
            repo: repoName,
            token,
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to start local bulk commits');
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (reader) {
          let buffer = '';
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Keep partial line

            for (const line of lines) {
              if (line.trim()) {
                const data = JSON.parse(line);
                if (data.status === 'syncing') {
                  setStatusMessage('Syncing with remote GitHub repository...');
                } else if (data.status === 'committing') {
                  setMassProgress(data.progress);
                  setStatusMessage(`Locally generating commit ${data.progress} of ${massLimit}...`);
                } else if (data.status === 'pushing') {
                  setMassProgress(massLimit); // Ensure progress bar is full
                  setStatusMessage(`Pushing all ${massLimit} commits to GitHub...`);
                } else if (data.error) {
                  throw new Error(data.error);
                }
              }
            }
          }
        }

        setStatusMessage(`Successfully pushed all ${massLimit} commits to GitHub via local engine!`);
        
        confetti({
          particleCount: 150,
          spread: 80,
          origin: { y: 0.7 },
          colors: ['#39d353', '#26a641', '#006d32', '#f5f5f5'],
        });

        await onRefresh();
      } catch (err: any) {
        setMassError(err.message || 'Local bulk commit booster failed.');
        setStatusMessage(`Booster failed: ${err.message}`);
      } finally {
        setMassRunning(false);
        setMassProgress(null);
      }
    } else {
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        await githubService.pushBatchCommits(
          token,
          massLimit,
          massMessage.trim() || 'chore: mass activity boost',
          (progress) => {
            setMassProgress(progress);
          },
          controller.signal,
          turboMode ? 0 : 200
        );

        setStatusMessage(`Successfully pushed all ${massLimit} boost commits!`);
        
        confetti({
          particleCount: 150,
          spread: 80,
          origin: { y: 0.7 },
          colors: ['#39d353', '#26a641', '#006d32', '#f5f5f5'],
        });

        await onRefresh();
      } catch (err: any) {
        if (err.message === 'Cancelled by user') {
          setStatusMessage('Mass commit boost cancelled.');
        } else {
          setMassError(err.message || 'Mass commit boost failed.');
          setStatusMessage(`Mass commit boost failed: ${err.message}`);
        }
      } finally {
        setMassRunning(false);
        setMassProgress(null);
        abortControllerRef.current = null;
      }
    }
  };

  const handleCancelMassBoost = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* Profile summary bar */}
      <div className="glass-panel" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <img src={user.avatar_url} alt={user.name} className="avatar" style={{ width: '2.5rem', height: '2.5rem', borderRadius: '50%' }} />
          <div>
            <h2 style={{ fontSize: '1.1rem', margin: 0, fontWeight: 500 }}>{repoOwner}/{repoName}</h2>
            <p className="subtitle" style={{ fontSize: '0.8rem', margin: 0 }}>
              Tracking Booster Repository
            </p>
          </div>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <a
            href={`https://github.com/${repoOwner}/${repoName}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary"
            style={{ padding: '0.5rem 0.75rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
          >
            Repo
            <Link2 size={12} />
          </a>
          <button
            onClick={handleRefresh}
            className="btn btn-secondary"
            style={{ padding: '0.5rem', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
            disabled={refreshing}
            title="Refresh statistics"
          >
            <Refresh size={14} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {!hasWorkflow && (
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.875rem' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: '#181818',
              border: '1px solid rgba(255,255,255,0.05)',
              flexShrink: 0,
            }}>
              <Danger2 size={16} style={{ color: 'var(--text-secondary)' }} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 500, marginBottom: '0.3rem' }}>
                Auto-Committer Not Configured
              </h3>
              <p className="subtitle" style={{ fontSize: '0.8rem', margin: 0, lineHeight: '1.5' }}>
                This repository is missing the GitHub Actions workflow file{' '}
                <code style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', background: '#181818', padding: '1px 5px', borderRadius: '4px' }}>
                  .github/workflows/auto-commit.yml
                </code>
                . Without it, daily background commits cannot run automatically when your device is offline.
              </p>
            </div>
          </div>
          <button
            onClick={handleInitialize}
            className="btn btn-primary"
            style={{ width: '100%', gap: '0.5rem', height: '2.75rem', fontSize: '0.85rem' }}
            disabled={initializing}
          >
            {initializing ? (
              <>
                <Loader size={15} className="animate-spin" />
                Configuring workflow and files...
              </>
            ) : (
              'Initialize Auto-Committer Workflow'
            )}
          </button>
        </div>
      )}

      {statusMessage && (
        <div className={`alert-banner ${statusMessage.toLowerCase().includes('failed') ? 'warning' : 'info'}`} style={{ margin: 0 }}>
          {pushing ? (
            <Loader size={16} className="animate-spin" style={{ flexShrink: 0 }} />
          ) : statusMessage.includes('successfully') || statusMessage.includes('updated') ? (
            <CheckCircle size={16} style={{ color: 'var(--accent-green)', flexShrink: 0 }} />
          ) : (
            <Danger2 size={16} style={{ flexShrink: 0 }} />
          )}
          <div>{statusMessage}</div>
        </div>
      )}

      {/* Direct Commit Pusher */}
      <div className="glass-panel">
        <h3>Push Direct Commit</h3>
        <p className="subtitle">
          Instantly push a manual commit to your tracking file on GitHub to register heatmap activity.
        </p>

        <form onSubmit={handleDirectPush}>
          <div className="form-group">
            <label className="form-label" htmlFor="commit-msg">
              Commit Message / Description
            </label>
            <input
              id="commit-msg"
              type="text"
              className="form-input"
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              placeholder="e.g. chore: manual heatmap trigger"
              disabled={pushing}
              required
            />
          </div>

          {/* Preset Pills */}
          <div style={{ marginBottom: '0.5rem' }}>
            <span className="form-label" style={{ marginBottom: '0.35rem' }}>Quick Selection:</span>
            <div className="presets-container">
              {PREBUILT_MESSAGES.map((msg, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setCommitMessage(msg)}
                  className={`preset-pill ${commitMessage === msg ? 'active' : ''}`}
                  disabled={pushing}
                >
                  {msg}
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', height: '2.75rem', gap: '0.5rem', marginTop: '0.5rem' }}
            disabled={pushing || !commitMessage.trim()}
          >
            {pushing ? (
              <>
                <Loader size={16} className="animate-spin" />
                Committing to GitHub...
              </>
            ) : (
              <>
                <Play size={16} />
                Push to Repo
              </>
            )}
          </button>
        </form>

        {/* Daily Auto Committer Settings Toggle */}
        <div className="status-row" style={{ opacity: hasWorkflow ? 1 : 0.6, marginBottom: isActive && hasWorkflow ? '0' : 'unset' }}>
          <div>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block' }}>Daily Background Booster</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              {hasWorkflow 
                ? 'Automatically commit daily at randomized hours when you are away.'
                : 'Please click "Initialize Auto-Committer Workflow" above to enable background boosting.'}
            </span>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={isActive && hasWorkflow}
              onChange={handleToggle}
              disabled={toggling || pushing || massRunning || !hasWorkflow}
            />
            <span className="toggle-slider"></span>
          </label>
        </div>

        {isActive && hasWorkflow && (
          <div style={{
            marginTop: '0.75rem',
            padding: '0.75rem 1rem',
            background: 'rgba(6, 182, 212, 0.04)',
            border: '1px solid rgba(6, 182, 212, 0.1)',
            borderRadius: '12px',
            fontSize: '0.8rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.4rem',
            animation: 'fadeInUp 0.3s ease'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Active Schedule:</span>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{getCronDescription(config.cron)}</span>
            </div>
            {nextRunDate && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Next Commit In:</span>
                <span style={{ fontWeight: 600, color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Clock size={12} style={{ color: 'var(--accent-cyan)' }} />
                  {timeRemainingStr}
                </span>
              </div>
            )}
            {nextRunDate && (
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'right', marginTop: '0.15rem' }}>
                Estimated target: {nextRunDate.toLocaleString()}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Schedule Configuration */}
      <BoosterConfig
        config={config}
        onSave={onSaveConfig}
        loading={configSaving}
      />

      {/* Mass Commit Booster Panel */}
      <div className="glass-panel">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
          <Flash2 size={18} style={{ color: 'var(--accent-cyan)' }} />
          <h3 style={{ margin: 0 }}>Mass Commit Booster</h3>
        </div>
        <p className="subtitle" style={{ margin: 0, marginBottom: '1rem' }}>
          Generate a high volume of activity commits. Each commit appends a small entry to your log to build a dense heat map.
        </p>

        <form onSubmit={handleMassBoost}>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <div className="form-group" style={{ flex: '1 1 120px', margin: 0 }}>
              <label className="form-label" htmlFor="mass-limit">
                Commit Limit (Count)
              </label>
              <input
                id="mass-limit"
                type="number"
                min="1"
                max="100000"
                className="form-input"
                value={massLimit}
                onChange={(e) => setMassLimit(Math.max(1, parseInt(e.target.value) || 1))}
                disabled={massRunning}
                required
              />
            </div>
            <div className="form-group" style={{ flex: '2 1 200px', margin: 0 }}>
              <label className="form-label" htmlFor="mass-msg">
                Commit Message Prefix
              </label>
              <input
                id="mass-msg"
                type="text"
                className="form-input"
                value={massMessage}
                onChange={(e) => setMassMessage(e.target.value)}
                placeholder="chore: mass boost"
                disabled={massRunning}
                required
              />
            </div>
          </div>

          {/* Turbo Mode Checkbox */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.75rem', background: '#181818', border: '1px solid rgba(255, 255, 255, 0.04)', borderRadius: '8px', marginBottom: '1rem' }}>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={turboMode}
                onChange={(e) => setTurboMode(e.target.checked)}
                disabled={massRunning}
              />
              <span className="toggle-slider"></span>
            </label>
            <div>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block' }}>Turbo Mode</span>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                Removes the 200ms delay between commits. Pushes at maximum speed allowed by your network.
              </span>
            </div>
          </div>

          {massRunning && (
            <div style={{ marginBottom: '1.25rem' }}>
              {massProgress !== null && massProgress > 0 ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                    <span>Pushed {massProgress} of {massLimit} commits</span>
                    <span>{Math.round((massProgress / massLimit) * 100)}%</span>
                  </div>
                  <div className="progress-bar-container" style={{ width: '100%', height: '8px', background: 'rgba(0,0,0,0.3)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div 
                      className="progress-bar-fill" 
                      style={{ 
                        width: `${(massProgress / massLimit) * 100}%`, 
                        height: '100%', 
                        background: 'var(--accent-green)',
                        transition: 'width 0.15s ease' 
                      }} 
                    />
                  </div>
                </>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.5rem 0.75rem', background: '#181818', border: '1px solid rgba(255, 255, 255, 0.04)', borderRadius: '8px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  <Loader size={14} className="animate-spin" style={{ color: 'var(--accent-cyan)' }} />
                  <span>Generating commits locally and pushing in a single batch (this will take only a few seconds)...</span>
                </div>
              )}
            </div>
          )}

          {massError && (
            <div className="alert-banner warning" style={{ marginBottom: '1rem', marginTop: '0.5rem' }}>
              <Danger2 size={16} style={{ flexShrink: 0 }} />
              <div>{massError}</div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button
              type="submit"
              className="btn btn-primary"
              style={{ flex: 1, height: '2.75rem', gap: '0.5rem' }}
              disabled={massRunning || pushing}
            >
              {massRunning ? (
                <>
                  <Loader size={16} className="animate-spin" />
                  Boosting ({massProgress}/{massLimit})...
                </>
              ) : (
                <>
                  <Play size={16} />
                  Start Mass Boost
                </>
              )}
            </button>
            {massRunning && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleCancelMassBoost}
                style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5', width: '3.5rem', padding: 0 }}
                title="Cancel booster process"
              >
                <CloseCircle2 size={18} />
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Booster Run History / Logs */}
      {logs.length > 0 && (
        <div className="glass-panel" style={{ paddingBottom: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h3 style={{ margin: 0 }}>Booster Run History</h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>GitHub Actions runs</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '200px', overflowY: 'auto' }}>
            {logs.map((item) => (
              <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: '#161616', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '8px', fontSize: '0.8rem' }}>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', overflow: 'hidden' }}>
                  <span style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: item.status === 'success'
                      ? 'var(--accent-green)'
                      : item.status === 'failure'
                      ? 'var(--accent-red)'
                      : 'var(--accent-cyan)',
                    boxShadow: item.status === 'success'
                      ? '0 0 8px rgba(16,185,129,0.4)'
                      : item.status === 'failure'
                      ? '0 0 8px rgba(239,68,68,0.4)'
                      : '0 0 8px rgba(6,182,212,0.4)',
                    flexShrink: 0
                  }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', overflow: 'hidden' }}>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.message}
                    </span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                      {new Date(item.time).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Local Activity Log (activity_log.txt) */}
      {localLogs.length > 0 && (
        <div className="glass-panel" style={{ paddingBottom: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Clock size={16} style={{ color: 'var(--accent-cyan)' }} />
              <h3 style={{ margin: 0 }}>Local Activity Log</h3>
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>activity_log.txt</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '200px', overflowY: 'auto' }}>
            {localLogs.map((item, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: '#161616', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '8px', fontSize: '0.8rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', overflow: 'hidden', marginRight: '0.5rem' }}>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.message}
                  </span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '0.1rem 0.35rem',
                      borderRadius: '4px',
                      background: 'rgba(6, 182, 212, 0.1)',
                      color: 'var(--accent-cyan)',
                      marginRight: '0.5rem',
                      fontWeight: 600,
                      fontSize: '0.65rem'
                    }}>
                      {item.type}
                    </span>
                    • {new Date(item.time).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Real commits feed */}
      {commits.length > 0 && (
        <div className="glass-panel" style={{ paddingBottom: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h3 style={{ margin: 0 }}>Commits Made</h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Last 15 commits</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '200px', overflowY: 'auto' }}>
            {commits.map((item) => (
              <div key={item.sha} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: '#161616', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '8px', fontSize: '0.8rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', overflow: 'hidden', marginRight: '0.5rem' }}>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.message}
                  </span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                    by {item.author} • <code style={{ color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono, monospace)' }}>{item.sha.substring(0, 7)}</code>
                  </span>
                </div>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--text-secondary)', display: 'inline-flex', flexShrink: 0 }}
                  title="View commit on GitHub"
                >
                  <Link2 size={14} />
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
};
