import React, { useState } from 'react';
import { Play, RefreshCw, ExternalLink, CheckCircle, AlertCircle, Loader } from 'lucide-react';
import type { GitHubUser, GitCommit } from '../types';
import { githubService, GITHUB_OWNER, GITHUB_REPO } from '../services/github';
import confetti from 'canvas-confetti';

interface DashboardProps {
  token: string;
  user: GitHubUser;
  commits: GitCommit[];
  onRefresh: () => Promise<void>;
  onToggleStatus: (active: boolean) => Promise<void>;
  isActive: boolean;
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
  onRefresh,
  onToggleStatus,
  isActive,
}) => {
  const [commitMessage, setCommitMessage] = useState(PREBUILT_MESSAGES[0]);
  const [pushing, setPushing] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* Profile summary bar */}
      <div className="glass-panel" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <img src={user.avatar_url} alt={user.name} className="avatar" style={{ width: '2.5rem', height: '2.5rem', borderRadius: '50%' }} />
          <div>
            <h2 style={{ fontSize: '1.1rem', margin: 0, fontWeight: '750' }}>{GITHUB_OWNER}/{GITHUB_REPO}</h2>
            <p className="subtitle" style={{ fontSize: '0.8rem', margin: 0 }}>
              Tracking Booster Repository
            </p>
          </div>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <a
            href={`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary"
            style={{ padding: '0.5rem 0.75rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
          >
            Repo
            <ExternalLink size={12} />
          </a>
          <button
            onClick={handleRefresh}
            className="btn btn-secondary"
            style={{ padding: '0.5rem', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
            disabled={refreshing}
            title="Refresh statistics"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {statusMessage && (
        <div className={`alert-banner ${statusMessage.toLowerCase().includes('failed') ? 'warning' : 'info'}`} style={{ margin: 0 }}>
          {pushing ? (
            <Loader size={16} className="animate-spin" style={{ flexShrink: 0 }} />
          ) : statusMessage.includes('successfully') || statusMessage.includes('updated') ? (
            <CheckCircle size={16} style={{ color: 'var(--accent-green)', flexShrink: 0 }} />
          ) : (
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
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
        <div className="status-row">
          <div>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block' }}>Daily Background Booster</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              Automatically commit daily at randomized hours when you are away.
            </span>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={isActive}
              onChange={handleToggle}
              disabled={toggling || pushing}
            />
            <span className="toggle-slider"></span>
          </label>
        </div>
      </div>

      {/* Real commits feed */}
      {commits.length > 0 && (
        <div className="glass-panel" style={{ paddingBottom: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h3 style={{ margin: 0 }}>Commits Made</h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Last 15 commits</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '200px', overflowY: 'auto' }}>
            {commits.map((item) => (
              <div key={item.sha} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: '#1e1e1e', borderRadius: '8px', fontSize: '0.8rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', overflow: 'hidden', marginRight: '0.5rem' }}>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.message}
                  </span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                    by {item.author} • <code style={{ color: 'var(--accent-cyan)' }}>{item.sha.substring(0, 7)}</code>
                  </span>
                </div>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--text-secondary)', display: 'inline-flex', flexShrink: 0 }}
                  title="View commit on GitHub"
                >
                  <ExternalLink size={14} />
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
};
