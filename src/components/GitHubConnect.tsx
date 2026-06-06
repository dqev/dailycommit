import React, { useState } from 'react';
import { Loader } from 'lucide-react';
import { githubService } from '../services/github';
import type { GitHubUser } from '../types';

interface GitHubConnectProps {
  onConnect: (token: string, owner: string, repo: string, user: GitHubUser) => void;
}

export const GitHubConnect: React.FC<GitHubConnectProps> = ({ onConnect }) => {
  const [token, setToken] = useState('');
  const [repoStr, setRepoStr] = useState(() => {
    const savedOwner = localStorage.getItem('github_booster_owner') || 'devchauhann';
    const savedRepo = localStorage.getItem('github_booster_repo') || 'activity';
    return `${savedOwner}/${savedRepo}`;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <div className="connect-container">
      <h2 style={{ fontSize: '1.5rem', marginBottom: '0.25rem', fontWeight: 800 }}>Connect</h2>
      <p className="subtitle" style={{ marginBottom: '1.5rem' }}>Enter your repository path and GitHub Personal Access Token to log in.</p>

      {error && (
        <div className="alert-banner warning">
          <div>{error}</div>
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <input
          type="text"
          className="form-input"
          placeholder="Repository (owner/repo)"
          value={repoStr}
          onChange={(e) => setRepoStr(e.target.value)}
          disabled={loading}
          required
        />

        <input
          type="password"
          className="form-input"
          placeholder="Personal Access Token (PAT)"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          disabled={loading}
          required
        />

        <button
          type="submit"
          className="btn btn-primary"
          style={{ width: '100%', gap: '0.5rem', height: '2.75rem' }}
          disabled={loading || !token.trim() || !repoStr.trim()}
        >
          {loading ? (
            <>
              <Loader size={16} className="animate-spin" />
              Verifying...
            </>
          ) : (
            'Login'
          )}
        </button>
      </form>
    </div>
  );
};
