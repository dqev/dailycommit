import React, { useState } from 'react';
import { Loader, HelpCircle, ChevronDown, ChevronUp, Key, TerminalCircle, Lock } from 'reicon-react';
import { githubService } from '../services/github';
import type { GitHubUser } from '../types';

interface GitHubConnectProps {
  onConnect: (token: string, owner: string, repo: string, user: GitHubUser) => void;
}

export const GitHubConnect: React.FC<GitHubConnectProps> = ({ onConnect }) => {
  const [token, setToken] = useState('');
  const [repoStr, setRepoStr] = useState(() => {
    const savedOwner = localStorage.getItem('github_booster_owner');
    const savedRepo = localStorage.getItem('github_booster_repo');
    if (savedOwner && savedRepo) {
      return `${savedOwner}/${savedRepo}`;
    }
    return '';
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim() || !repoStr.trim()) return;

    const parts = repoStr.trim().split('/');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      setError('Please enter the repository in the format: owner/repo');
      return;
    }
    const [owner, repo] = parts;

    setLoading(true);
    setError(null);

    try {
      // 1. Verify PAT
      const user = await githubService.verifyPAT(token.trim());
      
      // 2. Verify Repository
      const repoExists = await githubService.verifyRepo(token.trim(), owner, repo);
      if (!repoExists) {
        throw new Error(`Repository '${owner}/${repo}' could not be found or is not accessible. Please check your token scopes and repository name.`);
      }

      onConnect(token.trim(), owner, repo, user);
    } catch (err: any) {
      setError(err.message || 'Verification failed. Please check your token and repository details.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="connect-transparent-form" style={{ width: '100%' }}>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 500, textAlign: 'center', marginBottom: '0.35rem' }}>
        Connect Repository
      </h2>
      <p className="description" style={{ textAlign: 'center', marginBottom: '1.75rem', fontSize: '0.85rem' }}>
        Provide your repository path and GitHub Personal Access Token (PAT) below to log in.
      </p>

      {error && (
        <div className="alert-banner warning" style={{ animation: 'fadeInUp 0.3s ease', marginBottom: '1.25rem' }}>
          <div>{error}</div>
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        {/* Repo Input Group */}
        <div style={{ position: 'relative' }}>
          <TerminalCircle size={15} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            className="form-input"
            placeholder="Repository (owner/repo)"
            value={repoStr}
            onChange={(e) => setRepoStr(e.target.value)}
            disabled={loading}
            style={{ paddingLeft: '2.65rem' }}
            required
          />
        </div>

        {/* Token Input Group */}
        <div style={{ position: 'relative' }}>
          <Key size={15} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="password"
            className="form-input"
            placeholder="Personal Access Token (PAT)"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            disabled={loading}
            style={{ paddingLeft: '2.65rem' }}
            required
          />
        </div>

        <button
          type="submit"
          className="btn btn-primary"
          style={{ width: '100%', gap: '0.5rem', height: '2.85rem', marginTop: '0.25rem' }}
          disabled={loading || !token.trim() || !repoStr.trim()}
        >
          {loading ? (
            <>
              <Loader size={16} className="animate-spin" />
              Synchronizing environment...
            </>
          ) : (
            'Connect Repository'
          )}
        </button>
      </form>

      {/* Collapsible Setup Help */}
      <div style={{ textAlign: 'center', marginTop: '0.5rem' }}>
        <button
          onClick={() => setShowHelp(!showHelp)}
          className="help-toggle-btn"
          type="button"
          style={{ margin: '1rem auto 0', display: 'flex' }}
        >
          <HelpCircle size={13} />
          {showHelp ? 'Hide setup documentation' : 'How do I create a GitHub PAT token?'}
          {showHelp ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>

        {showHelp && (
          <div className="help-box" style={{ marginTop: '0.75rem' }}>
            <strong>Setup Instructions:</strong>
            <ol>
              <li>
                Go to{' '}
                <a
                  href="https://github.com/settings/tokens"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  GitHub Settings &gt; Developer Settings &gt; Personal Access Tokens (classic)
                </a>.
              </li>
              <li>
                Generate a new token checking the <strong>repo</strong> and <strong>workflow</strong> scopes.
              </li>
              <li>
                Ensure you have a tracking repository (e.g. <code>username/activity</code>) created on GitHub.
              </li>
              <li>
                Input the repository identifier and the PAT token above.
              </li>
            </ol>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.5rem', color: 'var(--text-muted)', fontSize: '0.7rem' }}>
              <Lock size={11} style={{ flexShrink: 0 }} />
              <span>Saved inside your local browser. Communication happens direct with api.github.com.</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};


