import { useState, useEffect } from 'react';
import { LogOut, Loader, AlertCircle } from 'lucide-react';
import { GitHubConnect } from './components/GitHubConnect';
import { Dashboard } from './components/Dashboard';
import { ContributionGraph } from './components/ContributionGraph';
import { githubService, GITHUB_OWNER, GITHUB_REPO } from './services/github';
import type { GitHubUser, GitCommit, ContributionCalendar } from './types';

function App() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<GitHubUser | null>(null);
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [contributions, setContributions] = useState<ContributionCalendar | null>(null);
  const [isActive, setIsActive] = useState(false);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initialize and check saved token
  useEffect(() => {
    const savedToken = localStorage.getItem('github_booster_token');
    if (savedToken) {
      setToken(savedToken);
      bootstrapApp(savedToken);
    } else {
      setLoading(false);
    }
  }, []);

  const bootstrapApp = async (authToken: string) => {
    setLoading(true);
    setError(null);
    try {
      // 1. Verify token & get user details
      const userProfile = await githubService.verifyPAT(authToken);
      setUser(userProfile);

      // 2. Fetch booster files & config
      await fetchBoosterData(authToken);
    } catch (err: any) {
      console.error(err);
      setError(
        err.message?.includes('404')
          ? `Could not find repository '${GITHUB_OWNER}/${GITHUB_REPO}'. Make sure the repository exists and your token has correct access.`
          : err.message || 'Authentication failed. Please check your Personal Access Token.'
      );
      if (!err.message?.includes('404')) {
        handleDisconnect();
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchBoosterData = async (authToken: string = token || '') => {
    if (!authToken) return;
    try {
      const [commitsData, workflowStatus, contributionsData] = await Promise.all([
        githubService.getRepoCommits(authToken),
        githubService.getWorkflowStatus(authToken),
        githubService.getRealContributions(authToken),
      ]);

      setCommits(commitsData);
      setIsActive(workflowStatus);
      setContributions(contributionsData);
    } catch (err: any) {
      console.error('Failed to load dashboard data:', err);
      // Fallback
      setCommits([]);
      setIsActive(false);
      setContributions(null);
    }
  };

  const handleConnect = (newToken: string, githubUser: GitHubUser) => {
    localStorage.setItem('github_booster_token', newToken);
    setToken(newToken);
    setUser(githubUser);
    bootstrapApp(newToken);
  };

  const handleDisconnect = () => {
    localStorage.removeItem('github_booster_token');
    setToken(null);
    setUser(null);
    setCommits([]);
    setContributions(null);
    setIsActive(false);
    setError(null);
  };

  const handleToggleStatus = async (active: boolean) => {
    if (!token) return;
    await githubService.toggleWorkflow(token, active);
    setIsActive(active);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', width: '100vw', gap: '1rem', backgroundColor: '#181818', color: '#f5f5f5' }}>
        <Loader className="animate-spin" size={32} style={{ color: '#f5f5f5', animation: 'spin 1.2s linear infinite' }} />
        <p style={{ color: '#a1a1aa', fontSize: '0.85rem' }}>Loading Dashboard Environment...</p>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', width: '100vw', gap: '1.25rem', backgroundColor: '#181818', color: '#f5f5f5', padding: '1rem', textAlign: 'center' }}>
        <AlertCircle size={48} style={{ color: 'var(--accent-red)' }} />
        <h2 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Configuration Error</h2>
        <p style={{ color: 'var(--text-secondary)', lineHeight: '1.6', maxWidth: '400px', fontSize: '0.9rem' }}>{error}</p>
        <button onClick={handleDisconnect} className="btn btn-primary">
          Try Another Token
        </button>
      </div>
    );
  }

  if (!token || !user) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', width: '100vw', backgroundColor: '#181818', color: '#f5f5f5', padding: '1.5rem' }}>
        <GitHubConnect onConnect={handleConnect} />
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Header Bar */}
      <header>
        <div className="logo-container">
          <img src="/github.png" alt="Booster Logo" style={{ width: '24px', height: '24px' }} />
          <span className="logo-text">Activity</span>
        </div>
        <div className="header-actions">
          <button
            onClick={handleDisconnect}
            className="btn btn-secondary"
            style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', gap: '0.35rem', height: '2rem' }}
          >
            <LogOut size={12} />
            Disconnect
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main style={{ flex: 1 }}>
        <div className="dashboard-grid">
          <Dashboard
            token={token}
            user={user}
            commits={commits}
            onRefresh={() => fetchBoosterData(token)}
            onToggleStatus={handleToggleStatus}
            isActive={isActive}
          />
          {contributions && <ContributionGraph contributions={contributions} />}
        </div>
      </main>

      {/* Footer */}
      <footer>
        <p>
          Created for{' '}
          <a
            href={`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`}
            target="_blank"
            rel="noopener noreferrer"
            className="footer-link"
            style={{ fontWeight: '600' }}
          >
            {GITHUB_OWNER}/{GITHUB_REPO}
          </a>.
        </p>
      </footer>
    </div>
  );
}

export default App;
