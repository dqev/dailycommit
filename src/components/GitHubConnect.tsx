import React, { useState } from 'react';
import { Loader } from 'lucide-react';
import { githubService } from '../services/github';
import type { GitHubUser } from '../types';

interface GitHubConnectProps {
  onConnect: (token: string, user: GitHubUser) => void;
}

export const GitHubConnect: React.FC<GitHubConnectProps> = ({ onConnect }) => {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const user = await githubService.verifyPAT(token.trim());
      onConnect(token.trim(), user);
    } catch (err: any) {
      setError(err.message || 'Verification failed. Please check your token.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="connect-container">
      <h2 style={{ fontSize: '1.5rem', marginBottom: '0.25rem', fontWeight: 800 }}>Connect</h2>
      <p className="subtitle" style={{ marginBottom: '1.5rem' }}>Enter your GitHub Personal Access Token to log in.</p>

      {error && (
        <div className="alert-banner warning">
          <div>{error}</div>
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <input
          type="password"
          className="form-input"
          placeholder="PAT"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          disabled={loading}
          required
        />

        <button
          type="submit"
          className="btn btn-primary"
          style={{ width: '100%', gap: '0.5rem', height: '2.75rem' }}
          disabled={loading || !token.trim()}
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
