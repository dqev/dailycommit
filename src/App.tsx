import { useState, useEffect } from 'react';
import { Logout, Loader, Danger2, ArrowRight, Clock, Flash2, Shield, Calendar, ChevronLeft } from 'reicon-react';
import { GitHubConnect } from './components/GitHubConnect';
import { Dashboard } from './components/Dashboard';
import { ContributionGraph } from './components/ContributionGraph';
import { githubService, setGithubRepoDetails, getStoredToken, setStoredToken, clearStoredToken } from './services/github';
import type { GitHubUser, GitCommit, ContributionCalendar } from './types';

function App() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<GitHubUser | null>(null);
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [contributions, setContributions] = useState<ContributionCalendar | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [hasWorkflow, setHasWorkflow] = useState<boolean>(true);
  
  const [repoOwner, setRepoOwner] = useState(() => localStorage.getItem('github_booster_owner') || '');
  const [repoName, setRepoName] = useState(() => localStorage.getItem('github_booster_repo') || '');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Custom Routing State
  const [path, setPath] = useState(() => window.location.pathname);

  // Sync browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      setPath(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (newPath: string) => {
    window.history.pushState(null, '', newPath);
    setPath(newPath);
  };

  // Redirection guard logic
  useEffect(() => {
    if (loading) return;
    if (token && (path === '/' || path === '/login')) {
      navigate('/dashboard');
    } else if (!token && path === '/dashboard') {
      navigate('/login');
    }
  }, [token, path, loading]);

  // Initialize and check saved token
  useEffect(() => {
    const savedToken = getStoredToken();
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
          ? `Could not find repository '${repoOwner}/${repoName}'. Make sure the repository exists and your token has correct access.`
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
      const workflowFile = await githubService.getFile(authToken, '.github/workflows/auto-commit.yml');
      const hasWf = workflowFile !== null;
      setHasWorkflow(hasWf);

      const [commitsData, workflowStatus, contributionsData] = await Promise.all([
        githubService.getRepoCommits(authToken),
        hasWf ? githubService.getWorkflowStatus(authToken) : Promise.resolve(false),
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

  const handleConnect = (newToken: string, owner: string, repo: string, githubUser: GitHubUser) => {
    setStoredToken(newToken);
    setGithubRepoDetails(owner, repo);
    setRepoOwner(owner);
    setRepoName(repo);
    setToken(newToken);
    setUser(githubUser);
    bootstrapApp(newToken);
    navigate('/dashboard');
  };

  const handleDisconnect = () => {
    clearStoredToken();
    localStorage.removeItem('github_booster_owner');
    localStorage.removeItem('github_booster_repo');
    setToken(null);
    setUser(null);
    setCommits([]);
    setContributions(null);
    setIsActive(false);
    setError(null);
    navigate('/');
  };

  const handleToggleStatus = async (active: boolean) => {
    if (!token) return;
    await githubService.toggleWorkflow(token, active);
    setIsActive(active);
  };

  const handleInitializeRepository = async () => {
    if (!token || !user) return;
    const email = user.email || `${user.login}@users.noreply.github.com`;
    await githubService.initializeRepository(token, email);
    await fetchBoosterData(token);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', width: '100vw', gap: '1.25rem', backgroundColor: 'var(--bg-color)', color: 'var(--text-primary)', fontFamily: 'var(--font-sans)' }}>
        <Loader className="animate-spin" size={36} style={{ color: 'var(--accent-cyan)', animation: 'spin 1s cubic-bezier(0.4, 0, 0.2, 1) infinite' }} />
        <p className="pulse-loader" style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 500 }}>Initializing environment...</p>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', width: '100vw', backgroundColor: 'var(--bg-color)', padding: '1.5rem' }}>
        <div className="connect-card" style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.2)'
          }}>
            <Danger2 size={28} style={{ color: 'var(--accent-red)' }} />
          </div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 500, margin: 0 }}>Configuration Error</h2>
          <p style={{ color: 'var(--text-secondary)', lineHeight: '1.6', fontSize: '0.875rem', margin: 0 }}>{error}</p>
          <button onClick={handleDisconnect} className="btn btn-primary" style={{ width: '100%', marginTop: '0.5rem' }}>
            Try Another Token
          </button>
        </div>
      </div>
    );
  }

  if (path === '/login') {
    return (
      <div className="app-container fade-in-up" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', padding: '2rem 1rem 3rem' }}>
        <header style={{ backgroundColor: 'transparent', border: 'none' }}>
          <div className="logo-container" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
            <img src="/github.png" alt="Booster Logo" style={{ width: '22px', height: '22px' }} />
            <span className="logo-text" style={{ fontFamily: 'Cooper, serif', fontWeight: 500, letterSpacing: '-0.3px' }}>Daily Commit</span>
          </div>
          <div className="header-actions">
            <button
              onClick={() => navigate('/')}
              className="btn btn-primary"
              style={{ padding: '0 0.8rem', fontSize: '0.75rem', gap: '0.35rem', height: '2.1rem', borderRadius: '8px' }}
            >
              <ChevronLeft size={12} />
              Back
            </button>
          </div>
        </header>

        <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <GitHubConnect onConnect={handleConnect} />
        </main>

        <footer>
          <p>GitHub Activity Booster &copy; {new Date().getFullYear()}</p>
        </footer>
      </div>
    );
  }

  if (path === '/dashboard' && token && user) {
    return (
      <div className="app-container fade-in-up">
        {/* Header Bar */}
        <header style={{ backgroundColor: 'transparent', border: 'none' }}>
          <div className="logo-container">
            <img src="/github.png" alt="Booster Logo" style={{ width: '22px', height: '22px' }} />
            <span className="logo-text" style={{ fontFamily: 'Cooper, serif', fontWeight: 500, letterSpacing: '-0.3px' }}>Activity</span>
          </div>
          <div className="header-actions">
            <button
              onClick={handleDisconnect}
              className="btn btn-secondary"
              style={{ padding: '0 0.8rem', fontSize: '0.75rem', gap: '0.35rem', height: '2.1rem', borderRadius: '8px' }}
            >
              <Logout size={12} />
              Disconnect
            </button>
          </div>
        </header>

        {/* Main Content Area */}
        <main style={{ flex: 1, marginTop: '0.5rem' }}>
          <div className="dashboard-grid">
            <Dashboard
              token={token}
              user={user}
              commits={commits}
              onRefresh={() => fetchBoosterData(token)}
              onToggleStatus={handleToggleStatus}
              isActive={isActive}
              repoOwner={repoOwner}
              repoName={repoName}
              hasWorkflow={hasWorkflow}
              onInitialize={handleInitializeRepository}
            />
            {contributions && <ContributionGraph contributions={contributions} />}
          </div>
        </main>

        {/* Footer */}
        <footer>
          <p>
            Tracking repository{' '}
            <a
              href={`https://github.com/${repoOwner}/${repoName}`}
              target="_blank"
              rel="noopener noreferrer"
              className="footer-link"
              style={{ fontWeight: '600', color: 'var(--accent-cyan)' }}
            >
              {repoOwner}/{repoName}
            </a>
          </p>
        </footer>
      </div>
    );
  }

  // Default: Landing Page (/)
  return (
    <div className="app-container fade-in-up" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', padding: '2rem 1rem 3rem' }}>
      <header style={{ backgroundColor: 'transparent', border: 'none' }}>
        <div className="logo-container">
          <img src="/github.png" alt="Booster Logo" style={{ width: '22px', height: '22px' }} />
          <span className="logo-text" style={{ fontFamily: 'Cooper, serif', fontWeight: 500, letterSpacing: '-0.3px' }}>Daily Commit</span>
        </div>
        <div className="header-actions">
          <button
            onClick={() => navigate('/login')}
            className="btn btn-primary"
            style={{ padding: '0 1rem', fontSize: '0.75rem', height: '2.1rem', borderRadius: '8px' }}
          >
            Login
          </button>
        </div>
      </header>

      <main style={{ flex: 1 }}>
        {/* Landing Hero Section */}
        <section className="landing-hero" style={{ padding: '2.5rem 0.5rem 3rem' }}>
          <h1 style={{ fontFamily: 'Cooper, serif', fontWeight: 500 }}>Keep Your GitHub Streak Alive</h1>
          <p style={{ marginBottom: '1.75rem' }}>
            GitHub Activity Booster automates daily commits and enables high-performance activity boosts. Maintain your heatmap and streaks securely, direct from your device.
          </p>
          <button
            onClick={() => navigate('/login')}
            className="btn btn-primary"
            style={{ gap: '0.5rem', padding: '0 1.75rem', height: '3rem', fontSize: '0.95rem' }}
          >
            Get Started
            <ArrowRight size={16} />
          </button>
        </section>

        {/* Feature Grid */}
        <section className="landing-features">
          <div className="landing-feature-card">
            <h3 style={{ fontFamily: 'Cooper, serif', fontWeight: 500 }}>
              <Shield size={16} style={{ color: 'var(--accent-cyan)', marginRight: '0.5rem' }} />
              Obfuscated Local Secrets
            </h3>
            <p>Your Personal Access Token is encrypted and stored locally in your browser's localStorage. Obfuscated to prevent browser extension scrapers from reading it.</p>
          </div>

          <div className="landing-feature-card">
            <h3 style={{ fontFamily: 'Cooper, serif', fontWeight: 500 }}>
              <Shield size={16} style={{ color: 'var(--accent-green)', marginRight: '0.5rem' }} />
              Zero Git Remote Leakage
            </h3>
            <p>The local bulk commit engine uses strict cleanup guarantees. A robust <code>finally</code> block instantly restores default repo configurations, ensuring no token leakage.</p>
          </div>

          <div className="landing-feature-card">
            <h3 style={{ fontFamily: 'Cooper, serif', fontWeight: 500 }}>
              <Clock size={16} style={{ color: 'var(--accent-cyan)', marginRight: '0.5rem' }} />
              Streak Safeguards
            </h3>
            <p>GitHub Actions schedules can sometimes be delayed. We support high-frequency schedulers (Streak Safe / Bulletproof) to guarantee commits run daily.</p>
          </div>

          <div className="landing-feature-card">
            <h3 style={{ fontFamily: 'Cooper, serif', fontWeight: 500 }}>
              <Shield size={16} style={{ color: 'var(--accent-green)', marginRight: '0.5rem' }} />
              Serverless Zero-Backend
            </h3>
            <p>Runs serverlessly on GitHub Actions via temporary <code>GITHUB_TOKEN</code> permissions. No raw secrets are stored on databases or external servers.</p>
          </div>
        </section>

        {/* How It Works Section */}
        <section style={{ marginTop: '3.5rem', borderTop: '1px solid rgba(255, 255, 255, 0.04)', paddingTop: '2.5rem' }}>
          <h2 style={{ fontFamily: 'Cooper, serif', fontWeight: 500, fontSize: '1.4rem', marginBottom: '1.5rem', textAlign: 'center' }}>
            How It Works in 3 Steps
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
              <div style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 600,
                fontSize: '0.9rem',
                flexShrink: 0
              }}>1</div>
              <div>
                <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.15rem' }}>Generate Credentials</h4>
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                  Create a Personal Access Token (PAT) on GitHub with <code>repo</code> and <code>workflow</code> scopes.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
              <div style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 600,
                fontSize: '0.9rem',
                flexShrink: 0
              }}>2</div>
              <div>
                <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.15rem' }}>Synchronize Repository</h4>
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                  Enter your username/repository path (e.g., <code>username/activity-tracker</code>) and the PAT token to log in.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
              <div style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 600,
                fontSize: '0.9rem',
                flexShrink: 0
              }}>3</div>
              <div>
                <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.15rem' }}>Boost Heatmap</h4>
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                  Enable the randomized daily background committer or trigger instant bulk boosts to paint your calendar green.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Security details are integrated directly into the features grid above */}
      </main>

      <footer>
        <p>GitHub Activity Booster &copy; {new Date().getFullYear()}</p>
      </footer>
    </div>
  );
}

export default App;
