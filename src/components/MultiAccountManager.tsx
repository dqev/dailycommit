import { useState, useEffect, useRef } from 'react';
import { Trash2, Power, Refresh, Rocket, Refresh23 } from 'reicon-react';
import { multiAccountService } from '../services/multi-account';
import { encodeToken, decodeToken } from '../services/github';
import type { MultiAccountConfig, GitHubUser, BoosterConfig } from '../types';

interface MultiAccountManagerProps {
    currentUser?: GitHubUser | null;
    currentRepo?: { owner: string; repo: string } | null;
    currentConfig?: BoosterConfig | null;
    token?: string | null;
    onAccountAdded?: () => void;
    onAccountSwitch?: (token: string, owner: string, repo: string, user: GitHubUser) => void;
}

interface Toast {
    id: string;
    message: string;
    type: 'success' | 'error' | 'info';
}

export function MultiAccountManager({
    currentUser,
    currentRepo,
    currentConfig,
    token,
    onAccountAdded,
    onAccountSwitch,
}: MultiAccountManagerProps) {
    const [accounts, setAccounts] = useState<MultiAccountConfig[]>([]);
    const [loading, setLoading] = useState(true);
    const [toasts, setToasts] = useState<Toast[]>([]);
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        onConfirm: () => void;
    } | null>(null);
    const [pushingAll, setPushingAll] = useState(false);
    // Draft values for commit-count inputs so the field can be emptied while typing
    const [commitCountDrafts, setCommitCountDrafts] = useState<{ [accountId: string]: string }>({});
    const [pushStatus, setPushStatus] = useState<{
        [accountId: string]: { status: 'pending' | 'syncing' | 'success' | 'failed'; error?: string; completed?: number; total?: number }
    }>({});

    // PAT input overlay for re-adding token to a specific account
    const [tokenInputFor, setTokenInputFor] = useState<string | null>(null);
    const [patInputValue, setPatInputValue] = useState('');
    const [savingToken, setSavingToken] = useState(false);
    const patInputRef = useRef<HTMLInputElement>(null);

    const showToast = (message: string, type: Toast['type'] = 'success') => {
        const id = Math.random().toString(36).substring(2, 9);
        setToasts((prev) => [...prev, { id, message, type }]);
        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 4500);
    };

    const requestConfirm = (title: string, message: string, onConfirm: () => void) => {
        setConfirmModal({ isOpen: true, title, message, onConfirm });
    };

    useEffect(() => {
        loadAccounts();
    }, []);

    useEffect(() => {
        if (tokenInputFor && patInputRef.current) {
            patInputRef.current.focus();
        }
    }, [tokenInputFor]);

    const loadAccounts = async () => {
        setLoading(true);
        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        if (isLocalhost) {
            try {
                const response = await fetch('/api/multi-account-list');
                if (response.ok) {
                    const data = await response.json();
                    setAccounts(data.accounts || []);
                    setLoading(false);
                    return;
                }
            } catch (err) {
                console.error('Failed to load accounts from API:', err);
            }
        }
        const allAccounts = multiAccountService.getAllAccounts();
        setAccounts(allAccounts);
        setLoading(false);
    };

    const handleToggleStatus = async (account: MultiAccountConfig) => {
        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const updatedAccount = { ...account, active: !account.active };

        if (isLocalhost) {
            try {
                const response = await fetch('/api/multi-account-add', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updatedAccount),
                });
                if (response.ok) {
                    showToast(`${updatedAccount.active ? '✅ Enabled' : '⏸ Disabled'} ${account.id}`, 'success');
                    await loadAccounts();
                } else {
                    showToast('Failed to update account status', 'error');
                }
            } catch (err: any) {
                showToast('Error: ' + err.message, 'error');
            }
        } else {
            multiAccountService.updateAccountStatus(account.id, !account.active);
            showToast(`${updatedAccount.active ? '✅ Enabled' : '⏸ Disabled'} ${account.id}`, 'success');
            await loadAccounts();
        }
    };

    const handleRemoveAccount = (accountId: string) => {
        requestConfirm(
            'Remove Account',
            `Are you sure you want to remove "${accountId}" from the scheduler?`,
            async () => {
                const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
                if (isLocalhost) {
                    try {
                        const response = await fetch('/api/multi-account-remove', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ id: accountId }),
                        });
                        if (response.ok) {
                            showToast('🗑 Account removed from scheduler', 'success');
                            await loadAccounts();
                        } else {
                            showToast('Failed to remove account', 'error');
                        }
                    } catch (err: any) {
                        showToast('Error: ' + err.message, 'error');
                    }
                } else {
                    multiAccountService.removeAccount(accountId);
                    showToast('🗑 Account removed from scheduler', 'success');
                    await loadAccounts();
                }
            }
        );
    };

    const handleCommitCountChange = async (account: MultiAccountConfig, count: number) => {
        const safeCount = Math.max(1, Math.min(50, Math.floor(count) || 1));
        const updatedAccount = { ...account, commitCount: safeCount };
        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

        // Sync draft to the clamped value
        setCommitCountDrafts(prev => ({ ...prev, [account.id]: String(safeCount) }));

        // Optimistic UI update
        setAccounts(prev => prev.map(a => (a.id === account.id ? updatedAccount : a)));

        if (isLocalhost) {
            try {
                const response = await fetch('/api/multi-account-add', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updatedAccount),
                });
                if (!response.ok) {
                    showToast('Failed to save commit count', 'error');
                }
            } catch (err: any) {
                showToast('Error: ' + err.message, 'error');
            }
        } else {
            multiAccountService.updateCommitCount(account.id, safeCount);
        }
    };

    const handleSwitchAccount = async (account: MultiAccountConfig) => {
        if (!account.token) {
            showToast('Cannot switch: No token stored for this account.', 'error');
            return;
        }
        const tokenVal = decodeToken(account.token);
        if (!tokenVal) {
            showToast('Cannot switch: Failed to decode token.', 'error');
            return;
        }
        if (onAccountSwitch) {
            showToast(`🔌 Switching session to ${account.id}...`, 'info');
            onAccountSwitch(tokenVal, account.owner, account.repo, account.user);
        }
    };

    /** Save a token for any account, using current token or a manually entered PAT */
    const saveTokenForAccount = async (account: MultiAccountConfig, rawToken: string) => {
        if (!rawToken.trim()) {
            showToast('Token cannot be empty', 'error');
            return;
        }
        setSavingToken(true);
        try {
            const updatedAccount = { ...account, token: encodeToken(rawToken.trim()) };
            const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
            if (isLocalhost) {
                const response = await fetch('/api/multi-account-add', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updatedAccount),
                });
                if (response.ok) {
                    showToast(`🔑 Token saved for ${account.id}`, 'success');
                    await loadAccounts();
                } else {
                    showToast('Failed to save token', 'error');
                }
            } else {
                multiAccountService.addAccount(rawToken.trim(), account.user, account.owner, account.repo, account.config);
                showToast(`🔑 Token saved for ${account.id}`, 'success');
                await loadAccounts();
            }
            setTokenInputFor(null);
            setPatInputValue('');
        } catch (err: any) {
            showToast('Error saving token: ' + err.message, 'error');
        } finally {
            setSavingToken(false);
        }
    };

    const handleReAddToken = async (account: MultiAccountConfig) => {
        const currentAccountId = currentRepo ? `${currentRepo.owner}/${currentRepo.repo}` : null;
        // If this is the currently connected account and we have a token, use it directly
        if (currentAccountId === account.id && token) {
            await saveTokenForAccount(account, token);
        } else {
            // Open PAT input overlay for this account
            setTokenInputFor(account.id);
            setPatInputValue('');
        }
    };

    const handleAddCurrentAccount = () => {
        if (!currentUser || !currentRepo || !currentConfig) {
            showToast('Please connect an account first', 'error');
            return;
        }

        const accountId = `${currentRepo.owner}/${currentRepo.repo}`;
        const existingAccount = accounts.find(a => a.id === accountId);
        const confirmMsg = existingAccount
            ? `Update "${accountId}" in the scheduler with your current settings and token?`
            : `Add "${accountId}" to the scheduler? Hourly activity commits will run automatically.`;

        requestConfirm('Add Account to Scheduler', confirmMsg, async () => {
            try {
                const newAccount: MultiAccountConfig = {
                    id: accountId,
                    token: token ? encodeToken(token) : '',
                    user: currentUser,
                    owner: currentRepo.owner,
                    repo: currentRepo.repo,
                    config: currentConfig,
                    active: true,
                    lastRun: existingAccount?.lastRun || 0,
                    commitCount: existingAccount?.commitCount ?? 1,
                };

                const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
                if (isLocalhost) {
                    const response = await fetch('/api/multi-account-add', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(newAccount),
                    });
                    if (response.ok) {
                        showToast(`✅ ${existingAccount ? 'Updated' : 'Added'} ${accountId} to scheduler!`, 'success');
                        await loadAccounts();
                        if (onAccountAdded) onAccountAdded();
                    } else {
                        showToast('Failed to save account', 'error');
                    }
                } else {
                    multiAccountService.addAccount(token || '', currentUser, currentRepo.owner, currentRepo.repo, currentConfig);
                    showToast(`✅ Account added! (Scheduler runs in dev mode only)`, 'success');
                    await loadAccounts();
                    if (onAccountAdded) onAccountAdded();
                }
            } catch (err: any) {
                showToast('Error: ' + err.message, 'error');
            }
        });
    };

    const pushCommitViaClientApi = async (
        token: string,
        owner: string,
        repo: string,
        commitMessage: string,
        authorName: string,
        authorEmail: string
    ) => {
        const filePath = 'activity_log.txt';
        const apiFilePath = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;
        const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

        const MAX_ATTEMPTS = 5;

        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            // 1. GET current file to obtain a FRESH SHA on every attempt
            const getRes = await fetch(`${apiFilePath}?t=${Date.now()}`, {
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Cache-Control': 'no-cache',
                }
            });

            let currentSha: string | undefined;
            let currentContent = '# GitHub Activity Booster - Activity Log\n';

            if (getRes.status === 200) {
                const data = await getRes.json();
                currentSha = data.sha;
                try {
                    const base64Clean = data.content.replace(/\s/g, '');
                    currentContent = decodeURIComponent(escape(atob(base64Clean)));
                } catch (e) {
                    try {
                        currentContent = atob(data.content.replace(/\s/g, ''));
                    } catch (err) {
                        currentContent = '# GitHub Activity Booster - Activity Log\n';
                    }
                }
            } else if (getRes.status === 404) {
                currentSha = undefined;
            } else if (getRes.status === 401) {
                throw new Error(`Auth failed: HTTP 401 (invalid token)`);
            } else if (getRes.status === 403 || getRes.status === 429) {
                // Rate limited on read — back off and retry
                if (attempt < MAX_ATTEMPTS) {
                    await sleep(getRetryDelay(getRes, attempt));
                    continue;
                }
                throw new Error(`Rate limited: HTTP ${getRes.status}`);
            } else {
                throw new Error(`Failed to read file: HTTP ${getRes.status}`);
            }

            // 2. Append new log entry (unique each time to avoid identical content)
            const dateStr = new Date().toISOString();
            const newContent = currentContent.trimEnd() +
                `\nAuto-commit for ${owner}/${repo}: ${dateStr} - ${commitMessage}\n`;
            const encodedContent = btoa(unescape(encodeURIComponent(newContent)));

            // 3. PUT the updated file
            const putBody = {
                message: commitMessage,
                content: encodedContent,
                sha: currentSha,
                author: { name: authorName, email: authorEmail },
                committer: { name: authorName, email: authorEmail }
            };

            const putRes = await fetch(apiFilePath, {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(putBody),
            });

            if (putRes.ok) {
                return; // success
            }

            // 409 = stale SHA (someone/we just wrote). Retry with a fresh GET.
            // 403/429 = secondary/abuse rate limit. Back off and retry.
            if ((putRes.status === 409 || putRes.status === 403 || putRes.status === 429) && attempt < MAX_ATTEMPTS) {
                await sleep(getRetryDelay(putRes, attempt));
                continue;
            }

            const errData = await putRes.json().catch(() => ({ message: `HTTP ${putRes.status}` }));
            throw new Error(errData.message || `HTTP ${putRes.status}`);
        }

        throw new Error('Failed after multiple retries (rate limited or conflict).');
    };

    /** Compute backoff delay honoring GitHub's Retry-After / rate-limit reset headers. */
    const getRetryDelay = (res: Response, attempt: number): number => {
        const retryAfter = res.headers.get('Retry-After');
        if (retryAfter) {
            const secs = parseInt(retryAfter, 10);
            if (!isNaN(secs)) return Math.min(secs * 1000, 15000);
        }
        const reset = res.headers.get('X-RateLimit-Reset');
        const remaining = res.headers.get('X-RateLimit-Remaining');
        if (remaining === '0' && reset) {
            const resetMs = parseInt(reset, 10) * 1000 - Date.now();
            if (resetMs > 0) return Math.min(resetMs, 15000);
        }
        // Exponential backoff with jitter: ~0.8s, 1.6s, 3.2s, ...
        return Math.min(800 * Math.pow(2, attempt - 1), 8000) + Math.random() * 300;
    };

    const handlePushOneToAll = () => {
        const activeAccounts = accounts.filter(a => a.active);
        if (activeAccounts.length === 0) {
            showToast('No active accounts to boost', 'error');
            return;
        }
        const noToken = activeAccounts.filter(a => !a.token);
        if (noToken.length > 0) {
            showToast(`⚠️ ${noToken.length} account(s) have no token and will fail. Re-add their token first.`, 'info');
        }

        requestConfirm(
            'Push to All Repositories',
            `Push a manual activity boost to all ${activeAccounts.length} active accounts via GitHub API?`,
            async () => {
                setPushingAll(true);
                const initialProgress: any = {};
                activeAccounts.forEach(acc => {
                    initialProgress[acc.id] = { status: 'pending', completed: 0, total: Math.max(1, acc.commitCount || 1) };
                });
                setPushStatus(initialProgress);

                // Always push directly via the GitHub API client-side so that the
                // exact per-account commitCount is honored with live progress.
                try {
                    for (let i = 0; i < activeAccounts.length; i++) {
                        const account = activeAccounts[i];
                        const totalCommits = Math.max(1, account.commitCount || 1);
                        setPushStatus(prev => ({ ...prev, [account.id]: { status: 'syncing', completed: 0, total: totalCommits } }));

                        try {
                            if (!account.token) {
                                throw new Error('No token stored for this account.');
                            }

                            const tokenVal = decodeToken(account.token);
                            if (!tokenVal) {
                                throw new Error('Failed to decode token.');
                            }

                            const authorName = account.user?.name || account.user?.login || 'Booster';
                            const authorEmail = account.config?.email || `${account.user?.login}@users.noreply.github.com`;
                            const message = account.config?.message || 'chore: auto boost activity [skip ci]';

                            for (let c = 0; c < totalCommits; c++) {
                                const commitMsg = totalCommits > 1
                                    ? `${message} [manual boost ${c + 1}/${totalCommits}]`
                                    : `${message} [manual boost]`;
                                await pushCommitViaClientApi(tokenVal, account.owner, account.repo, commitMsg, authorName, authorEmail);
                                // Live-update completed count after each successful commit
                                setPushStatus(prev => ({
                                    ...prev,
                                    [account.id]: { status: 'syncing', completed: c + 1, total: totalCommits },
                                }));
                                // Throttle between commits to avoid GitHub secondary rate limits
                                if (c < totalCommits - 1) {
                                    await new Promise(resolve => setTimeout(resolve, 1200));
                                }
                            }

                            // Update last run time client-side
                            multiAccountService.updateLastRun(account.id, Date.now());
                            setPushStatus(prev => ({ ...prev, [account.id]: { status: 'success', completed: totalCommits, total: totalCommits } }));
                        } catch (err: any) {
                            console.error(`[client-push] Failed for ${account.id}:`, err.message);
                            setPushStatus(prev => ({
                                ...prev,
                                [account.id]: { status: 'failed', error: err.message, completed: prev[account.id]?.completed || 0, total: totalCommits },
                            }));
                        }
                    }

                    showToast('✅ Push completed for all accounts!', 'success');
                    await loadAccounts();
                    setTimeout(() => setPushingAll(false), 2500);
                } catch (err: any) {
                    showToast('❌ Error: ' + err.message, 'error');
                    setPushingAll(false);
                }
            }
        );
    };

    const currentAccountId = currentRepo ? `${currentRepo.owner}/${currentRepo.repo}` : null;

    // ── Render ────────────────────────────────────────────────────────────────
    if (loading) {
        return (
            <div className="glass-panel" style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                <span style={{ display: 'inline-block', animation: 'pulse 1.2s ease infinite' }}>⏳</span> Loading accounts...
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

            {/* ── Header card ── */}
            <div className="glass-panel mam-header-card">
                <div className="mam-title-row">
                    <div>
                        <h2 className="mam-title">🔗 Multi-Account Scheduler</h2>
                        <p className="mam-subtitle">
                            {accounts.length === 0
                                ? 'No accounts added yet. Connect accounts below to automate commits.'
                                : `${accounts.filter(a => a.active).length} active · ${accounts.length} total accounts`}
                        </p>
                    </div>
                    <div className="mam-header-actions">
                        {currentUser && currentRepo && (
                            <button onClick={handleAddCurrentAccount} className="btn btn-primary mam-btn" title="Add currently connected account to scheduler">
                                ➕ Add Current
                            </button>
                        )}
                        {accounts.length > 0 && (
                            <button onClick={handlePushOneToAll} className="btn mam-btn mam-btn-push" title="Push to all active repos via GitHub API">
                                <Rocket size={13} /> Push All
                            </button>
                        )}
                        <button onClick={() => loadAccounts()} className="btn btn-secondary mam-btn" title="Refresh account list">
                            <Refresh size={13} /> Refresh
                        </button>
                    </div>
                </div>

                {/* Currently connected account banner */}
                {currentUser && currentRepo && (
                    <div className="mam-connected-banner">
                        <img
                            src={currentUser.avatar_url}
                            alt={currentUser.login}
                            className="mam-avatar"
                        />
                        <div className="mam-connected-info">
                            <span className="mam-connected-name">{currentUser.name || currentUser.login}</span>
                            <span className="mam-connected-repo">
                                <span className="mam-dot-active" /> Currently connected · {currentRepo.owner}/{currentRepo.repo}
                            </span>
                        </div>
                        {token ? (
                            <span className="mam-badge mam-badge-green">🔑 Token Ready</span>
                        ) : (
                            <span className="mam-badge mam-badge-yellow">⚠️ No Token</span>
                        )}
                    </div>
                )}
            </div>

            {/* ── Account list ── */}
            {accounts.length === 0 ? (
                <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center' }}>
                    <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>👥</p>
                    <p style={{ color: 'var(--text-primary)', fontWeight: 600 }}>No accounts configured</p>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginTop: '0.35rem' }}>
                        Click <strong>Add Current</strong> above to add the connected account to the scheduler.
                    </p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {accounts.map((account) => {
                        const isCurrentAccount = account.id === currentAccountId;
                        const hasToken = !!account.token;
                        const canAutoFix = isCurrentAccount && !!token;

                        return (
                            <div key={account.id} className={`glass-panel mam-account-card ${!hasToken ? 'mam-card-warn' : ''}`}>

                                {/* Card top row */}
                                <div className="mam-card-top">
                                    <div className="mam-card-left">
                                        <img
                                            src={account.user?.avatar_url || `https://github.com/${account.owner}.png`}
                                            alt={account.user?.login || account.owner}
                                            className="mam-avatar"
                                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                        />
                                        <div className="mam-card-identity">
                                            <div className="mam-card-name-row">
                                                <span className="mam-card-name">
                                                    {account.user?.name || account.user?.login || account.owner}
                                                </span>
                                                {isCurrentAccount && (
                                                    <span className="mam-badge mam-badge-cyan">● Connected</span>
                                                )}
                                                {!hasToken && (
                                                    <span className="mam-badge mam-badge-yellow">⚠ No Token</span>
                                                )}
                                            </div>
                                            <span className="mam-card-repo">
                                                <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" style={{ opacity: 0.5, flexShrink: 0 }}>
                                                    <path d="M2 2.5A2.5 2.5 0 014.5 0h8.75a.75.75 0 01.75.75v12.5a.75.75 0 01-.75.75h-2.5a.75.75 0 010-1.5h1.75v-2h-8a1 1 0 00-.714 1.7.75.75 0 01-1.072 1.05A2.495 2.495 0 012 11.5v-9zm10.5-1V9h-8c-.356 0-.694.074-1 .208V2.5a1 1 0 011-1h8zM5 12.25v3.25a.25.25 0 00.4.2l1.45-1.087a.25.25 0 01.3 0L8.6 15.7a.25.25 0 00.4-.2v-3.25a.25.25 0 00-.25-.25h-3.5a.25.25 0 00-.25.25z" />
                                                </svg>
                                                {account.owner}/{account.repo}
                                            </span>
                                            <span className="mam-card-meta">
                                                <span>📅 {account.config?.cron || 'N/A'}</span>
                                                <span>·</span>
                                                <span>🕐 {account.lastRun ? new Date(account.lastRun).toLocaleString() : 'Never run'}</span>
                                            </span>
                                            <div className="mam-commit-count-row">
                                                <label htmlFor={`cc-${account.id}`} className="mam-commit-count-label">
                                                    🔁 Commits per push:
                                                </label>
                                                <input
                                                    id={`cc-${account.id}`}
                                                    type="number"
                                                    min={1}
                                                    max={50}
                                                    value={commitCountDrafts[account.id] ?? String(account.commitCount ?? 1)}
                                                    onChange={(e) => setCommitCountDrafts(prev => ({ ...prev, [account.id]: e.target.value }))}
                                                    onBlur={(e) => handleCommitCountChange(account, parseInt(e.target.value, 10))}
                                                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                                    className="mam-commit-count-input"
                                                    title="Number of commits to push for this account on each boost (1-50)"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="mam-card-actions">
                                        <button
                                            onClick={() => handleToggleStatus(account)}
                                            className={`mam-action-btn ${account.active ? 'mam-action-active' : 'mam-action-inactive'}`}
                                            title={account.active ? 'Click to disable' : 'Click to enable'}
                                        >
                                            <Power size={12} />
                                            {account.active ? 'Active' : 'Inactive'}
                                        </button>
                                        {!isCurrentAccount && hasToken && (
                                            <button
                                                onClick={() => handleSwitchAccount(account)}
                                                className="mam-action-btn mam-action-switch"
                                                title="Switch active session to this account"
                                            >
                                                <Refresh23 size={12} />Switch
                                            </button>
                                        )}
                                        <button
                                            onClick={() => handleRemoveAccount(account.id)}
                                            className="mam-action-btn mam-action-remove"
                                            title="Remove account"
                                        >
                                            <Trash2 size={12} />
                                            Remove
                                        </button>
                                    </div>
                                </div>

                                {/* No-token warning row */}
                                {!hasToken && (
                                    <div className="mam-token-warn">
                                        <span>
                                            🔒 <strong>Token missing</strong> — this account cannot commit without a Personal Access Token.
                                            {canAutoFix
                                                ? ' Your current token will be used.'
                                                : ' Enter your GitHub PAT below.'}
                                        </span>
                                        {tokenInputFor === account.id ? (
                                            <div className="mam-token-input-row">
                                                <input
                                                    ref={patInputRef}
                                                    type="password"
                                                    value={patInputValue}
                                                    onChange={e => setPatInputValue(e.target.value)}
                                                    onKeyDown={e => {
                                                        if (e.key === 'Enter') saveTokenForAccount(account, patInputValue);
                                                        if (e.key === 'Escape') { setTokenInputFor(null); setPatInputValue(''); }
                                                    }}
                                                    placeholder="ghp_xxxxxxxxxxxx"
                                                    className="mam-pat-input"
                                                    disabled={savingToken}
                                                />
                                                <button
                                                    onClick={() => saveTokenForAccount(account, patInputValue)}
                                                    className="mam-action-btn mam-action-save"
                                                    disabled={savingToken || !patInputValue.trim()}
                                                >
                                                    {savingToken ? '...' : '💾 Save'}
                                                </button>
                                                <button
                                                    onClick={() => { setTokenInputFor(null); setPatInputValue(''); }}
                                                    className="mam-action-btn mam-action-cancel"
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => handleReAddToken(account)}
                                                className="mam-fix-btn"
                                            >
                                                {canAutoFix ? '⚡ Fix with Current Token' : '🔑 Enter Token'}
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ── Confirm Modal ── */}
            {confirmModal?.isOpen && (
                <div className="mam-overlay" onClick={() => setConfirmModal(null)}>
                    <div className="glass-panel mam-modal" onClick={e => e.stopPropagation()}>
                        <h3 className="mam-modal-title">{confirmModal.title}</h3>
                        <p className="mam-modal-msg">{confirmModal.message}</p>
                        <div className="mam-modal-actions">
                            <button className="mam-modal-cancel" onClick={() => setConfirmModal(null)}>Cancel</button>
                            <button
                                className="mam-modal-confirm"
                                onClick={() => { confirmModal.onConfirm(); setConfirmModal(null); }}
                            >
                                Confirm
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Push Progress Modal ── */}
            {pushingAll && (
                <div className="mam-overlay">
                    <div className="glass-panel mam-push-modal">
                        <h3 className="mam-modal-title">
                            <span>🚀</span> Pushing to All Repositories
                        </h3>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
                            Commits are sent directly via GitHub API — no local git changes.
                        </p>
                        <div className="mam-push-list">
                            {Object.entries(pushStatus).map(([id, info]) => {
                                const acc = accounts.find(a => a.id === id);
                                return (
                                    <div key={id} className="mam-push-item">
                                        <div className="mam-push-item-info">
                                            <span className="mam-push-name">{acc?.user?.name || id.split('/')[0]}</span>
                                            <span className="mam-push-repo">{id}</span>
                                        </div>
                                        <div className="mam-push-status">
                                            {info.status === 'pending' && <span className="mam-status-pending">⚪ Pending {info.total ? `(0/${info.total})` : ''}</span>}
                                            {info.status === 'syncing' && (
                                                <span className="mam-status-syncing">
                                                    <span className="mam-pulse-dot" />
                                                    Pushing {info.completed ?? 0}/{info.total ?? 1}...
                                                </span>
                                            )}
                                            {info.status === 'success' && <span className="mam-status-success">🟢 {info.completed ?? info.total ?? 1}/{info.total ?? 1} Done</span>}
                                            {info.status === 'failed' && (
                                                <span className="mam-status-failed" title={info.error}>🔴 Failed ({info.completed ?? 0}/{info.total ?? 1})</span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.75rem' }}>
                            <button
                                className="mam-modal-confirm"
                                disabled={Object.values(pushStatus).some(s => s.status === 'pending' || s.status === 'syncing')}
                                onClick={() => setPushingAll(false)}
                                style={{
                                    opacity: Object.values(pushStatus).some(s => ['pending', 'syncing'].includes(s.status)) ? 0.4 : 1,
                                    cursor: Object.values(pushStatus).some(s => ['pending', 'syncing'].includes(s.status)) ? 'not-allowed' : 'pointer',
                                }}
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Toasts ── */}
            <div className="mam-toast-container">
                {toasts.map((t) => (
                    <div key={t.id} className={`mam-toast mam-toast-${t.type}`}>
                        <span>{t.type === 'success' ? '✅' : t.type === 'error' ? '❌' : 'ℹ️'}</span>
                        <span>{t.message}</span>
                    </div>
                ))}
            </div>

            {/* ── Styles ── */}
            <style>{`
                /* Layout */
                .mam-header-card { padding: 1.25rem 1.5rem; }
                .mam-title-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    gap: 1rem;
                    flex-wrap: wrap;
                }
                .mam-title {
                    font-size: 1.15rem;
                    font-weight: 700;
                    color: var(--text-primary);
                    margin-bottom: 0.2rem;
                }
                .mam-subtitle {
                    font-size: 0.82rem;
                    color: var(--text-secondary);
                }
                .mam-header-actions {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    flex-wrap: wrap;
                }
                .mam-btn {
                    display: inline-flex;
                    align-items: center;
                    gap: 0.35rem;
                    height: 2rem;
                    padding: 0 0.85rem;
                    border-radius: 8px;
                    font-size: 0.78rem;
                    font-weight: 600;
                    cursor: pointer;
                    border: 1px solid transparent;
                    transition: all 0.18s ease;
                    white-space: nowrap;
                }
                .mam-btn-push {
                    background: rgba(6, 182, 212, 0.12);
                    border-color: rgba(6, 182, 212, 0.3);
                    color: var(--accent-cyan);
                }
                .mam-btn-push:hover {
                    background: rgba(6, 182, 212, 0.22);
                }

                /* Connected banner */
                .mam-connected-banner {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    margin-top: 1rem;
                    padding: 0.75rem 1rem;
                    background: rgba(6, 182, 212, 0.06);
                    border: 1px solid rgba(6, 182, 212, 0.15);
                    border-radius: 10px;
                    flex-wrap: wrap;
                }
                .mam-connected-info {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    gap: 0.15rem;
                    min-width: 140px;
                }
                .mam-connected-name {
                    font-size: 0.9rem;
                    font-weight: 600;
                    color: var(--text-primary);
                }
                .mam-connected-repo {
                    font-size: 0.78rem;
                    color: var(--text-secondary);
                    display: flex;
                    align-items: center;
                    gap: 0.35rem;
                }
                .mam-dot-active {
                    display: inline-block;
                    width: 6px;
                    height: 6px;
                    border-radius: 50%;
                    background: var(--accent-green);
                    animation: pulse 2s ease infinite;
                }
                .mam-avatar {
                    width: 36px;
                    height: 36px;
                    border-radius: 50%;
                    border: 1px solid rgba(255,255,255,0.1);
                    flex-shrink: 0;
                }

                /* Badges */
                .mam-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 0.2rem;
                    padding: 0.15rem 0.55rem;
                    border-radius: 99px;
                    font-size: 0.68rem;
                    font-weight: 700;
                    letter-spacing: 0.02em;
                    white-space: nowrap;
                }
                .mam-badge-green {
                    background: rgba(16, 185, 129, 0.12);
                    border: 1px solid rgba(16, 185, 129, 0.3);
                    color: var(--accent-green);
                }
                .mam-badge-yellow {
                    background: rgba(251, 191, 36, 0.12);
                    border: 1px solid rgba(251, 191, 36, 0.3);
                    color: #fbbf24;
                }
                .mam-badge-cyan {
                    background: rgba(6, 182, 212, 0.1);
                    border: 1px solid rgba(6, 182, 212, 0.25);
                    color: var(--accent-cyan);
                }

                /* Account Card */
                .mam-account-card {
                    padding: 1rem 1.25rem;
                    transition: border-color 0.2s ease, box-shadow 0.2s ease;
                }
                .mam-account-card:hover {
                    border-color: rgba(255,255,255,0.1);
                    box-shadow: 0 2px 16px rgba(0,0,0,0.18);
                }
                .mam-card-warn {
                    border-color: rgba(251, 191, 36, 0.2) !important;
                }
                .mam-card-top {
                    display: flex;
                    align-items: flex-start;
                    justify-content: space-between;
                    gap: 1rem;
                    flex-wrap: wrap;
                }
                .mam-card-left {
                    display: flex;
                    align-items: flex-start;
                    gap: 0.75rem;
                    flex: 1;
                    min-width: 0;
                }
                .mam-card-identity {
                    display: flex;
                    flex-direction: column;
                    gap: 0.2rem;
                    min-width: 0;
                }
                .mam-card-name-row {
                    display: flex;
                    align-items: center;
                    gap: 0.45rem;
                    flex-wrap: wrap;
                }
                .mam-card-name {
                    font-size: 0.95rem;
                    font-weight: 600;
                    color: var(--text-primary);
                }
                .mam-card-repo {
                    display: flex;
                    align-items: center;
                    gap: 0.3rem;
                    font-size: 0.8rem;
                    color: var(--text-secondary);
                    font-family: 'JetBrains Mono', monospace;
                }
                .mam-card-meta {
                    display: flex;
                    align-items: center;
                    gap: 0.4rem;
                    font-size: 0.75rem;
                    color: var(--text-muted);
                    flex-wrap: wrap;
                }
                .mam-commit-count-row {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    margin-top: 0.4rem;
                }
                .mam-commit-count-label {
                    font-size: 0.75rem;
                    color: var(--text-secondary);
                    font-weight: 600;
                }
                .mam-commit-count-input {
                    width: 64px;
                    padding: 0.25rem 0.5rem;
                    background: rgba(0,0,0,0.3);
                    border: 1px solid rgba(6, 182, 212, 0.3);
                    border-radius: 6px;
                    color: var(--text-primary);
                    font-size: 0.8rem;
                    font-family: 'JetBrains Mono', monospace;
                    outline: none;
                }
                .mam-commit-count-input:focus { border-color: rgba(6, 182, 212, 0.6); }

                /* Card actions */
                .mam-card-actions {
                    display: flex;
                    align-items: center;
                    gap: 0.4rem;
                    flex-wrap: wrap;
                    flex-shrink: 0;
                }
                .mam-action-btn {
                    display: inline-flex;
                    align-items: center;
                    gap: 0.3rem;
                    padding: 0.3rem 0.7rem;
                    border-radius: 7px;
                    font-size: 0.75rem;
                    font-weight: 600;
                    cursor: pointer;
                    border: 1px solid transparent;
                    transition: all 0.15s ease;
                    white-space: nowrap;
                }
                .mam-action-active {
                    background: rgba(16, 185, 129, 0.1);
                    border-color: rgba(16, 185, 129, 0.25);
                    color: var(--accent-green);
                }
                .mam-action-active:hover { background: rgba(16, 185, 129, 0.18); }
                .mam-action-inactive {
                    background: rgba(239, 68, 68, 0.1);
                    border-color: rgba(239, 68, 68, 0.25);
                    color: var(--accent-red);
                }
                .mam-action-inactive:hover { background: rgba(239, 68, 68, 0.18); }
                .mam-action-remove {
                    background: rgba(239, 68, 68, 0.08);
                    border-color: rgba(239, 68, 68, 0.2);
                    color: #ff7070;
                }
                .mam-action-remove:hover { background: rgba(239, 68, 68, 0.15); }
                .mam-action-switch {
                    background: rgba(6, 182, 212, 0.12);
                    border-color: rgba(6, 182, 212, 0.3);
                    color: var(--accent-cyan);
                }
                .mam-action-switch:hover { background: rgba(6, 182, 212, 0.22); }
                .mam-action-save {
                    background: rgba(16, 185, 129, 0.15);
                    border-color: rgba(16, 185, 129, 0.3);
                    color: var(--accent-green);
                }
                .mam-action-save:disabled { opacity: 0.4; cursor: not-allowed; }
                .mam-action-cancel {
                    background: rgba(255,255,255,0.06);
                    border-color: rgba(255,255,255,0.1);
                    color: var(--text-secondary);
                }

                /* Token warning row */
                .mam-token-warn {
                    margin-top: 0.75rem;
                    padding: 0.75rem 1rem;
                    background: rgba(251, 191, 36, 0.06);
                    border: 1px solid rgba(251, 191, 36, 0.18);
                    border-radius: 8px;
                    font-size: 0.82rem;
                    color: #fbbf24;
                    display: flex;
                    flex-direction: column;
                    gap: 0.6rem;
                }
                .mam-fix-btn {
                    align-self: flex-start;
                    padding: 0.35rem 0.9rem;
                    border-radius: 7px;
                    font-size: 0.78rem;
                    font-weight: 700;
                    cursor: pointer;
                    border: 1px solid rgba(251, 191, 36, 0.4);
                    background: rgba(251, 191, 36, 0.12);
                    color: #fbbf24;
                    transition: background 0.15s;
                }
                .mam-fix-btn:hover { background: rgba(251, 191, 36, 0.2); }
                .mam-token-input-row {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    flex-wrap: wrap;
                }
                .mam-pat-input {
                    flex: 1;
                    min-width: 180px;
                    padding: 0.4rem 0.75rem;
                    background: rgba(0,0,0,0.3);
                    border: 1px solid rgba(251, 191, 36, 0.3);
                    border-radius: 7px;
                    color: var(--text-primary);
                    font-size: 0.82rem;
                    font-family: 'JetBrains Mono', monospace;
                    outline: none;
                }
                .mam-pat-input:focus { border-color: rgba(251, 191, 36, 0.6); }
                .mam-pat-input::placeholder { color: var(--text-muted); }

                /* Modal */
                .mam-overlay {
                    position: fixed;
                    inset: 0;
                    background: rgba(0,0,0,0.65);
                    backdrop-filter: blur(10px);
                    z-index: 9000;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 1rem;
                }
                .mam-modal {
                    width: 100%;
                    max-width: 420px;
                    padding: 1.5rem;
                    display: flex;
                    flex-direction: column;
                    gap: 1rem;
                }
                .mam-push-modal {
                    width: 100%;
                    max-width: 460px;
                    padding: 1.5rem;
                    display: flex;
                    flex-direction: column;
                    gap: 1rem;
                }
                .mam-modal-title {
                    font-size: 1.1rem;
                    font-weight: 700;
                    color: var(--text-primary);
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    margin: 0;
                }
                .mam-modal-msg {
                    font-size: 0.9rem;
                    color: var(--text-secondary);
                    line-height: 1.55;
                    margin: 0;
                }
                .mam-modal-actions {
                    display: flex;
                    justify-content: flex-end;
                    gap: 0.5rem;
                    margin-top: 0.25rem;
                }
                .mam-modal-cancel {
                    padding: 0.5rem 1.1rem;
                    border-radius: 8px;
                    border: 1px solid rgba(255,255,255,0.1);
                    background: rgba(255,255,255,0.06);
                    color: var(--text-secondary);
                    font-size: 0.88rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: background 0.15s;
                }
                .mam-modal-cancel:hover { background: rgba(255,255,255,0.1); }
                .mam-modal-confirm {
                    padding: 0.5rem 1.1rem;
                    border-radius: 8px;
                    border: none;
                    background: var(--accent-cyan);
                    color: #0a0a0a;
                    font-size: 0.88rem;
                    font-weight: 700;
                    cursor: pointer;
                    transition: opacity 0.15s;
                }
                .mam-modal-confirm:hover:not(:disabled) { opacity: 0.88; }

                /* Push list */
                .mam-push-list {
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                    max-height: 240px;
                    overflow-y: auto;
                }
                .mam-push-item {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 0.75rem;
                    padding: 0.6rem 0.85rem;
                    background: rgba(255,255,255,0.03);
                    border: 1px solid rgba(255,255,255,0.05);
                    border-radius: 8px;
                }
                .mam-push-item-info { display: flex; flex-direction: column; gap: 0.1rem; }
                .mam-push-name { font-size: 0.88rem; font-weight: 600; color: var(--text-primary); }
                .mam-push-repo { font-size: 0.72rem; color: var(--text-muted); font-family: 'JetBrains Mono', monospace; }
                .mam-push-status { font-size: 0.82rem; font-weight: 500; }
                .mam-status-pending { color: var(--text-muted); }
                .mam-status-syncing { color: var(--accent-cyan); display: flex; align-items: center; gap: 0.35rem; }
                .mam-status-success { color: var(--accent-green); }
                .mam-status-failed { color: var(--accent-red); cursor: help; }
                .mam-pulse-dot {
                    display: inline-block;
                    width: 7px;
                    height: 7px;
                    border-radius: 50%;
                    background: var(--accent-cyan);
                    animation: pulse 1s ease infinite;
                }

                /* Toasts */
                .mam-toast-container {
                    position: fixed;
                    top: 1.25rem;
                    right: 1.25rem;
                    z-index: 9999;
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                    pointer-events: none;
                    max-width: 360px;
                }
                .mam-toast {
                    pointer-events: auto;
                    display: flex;
                    align-items: center;
                    gap: 0.6rem;
                    padding: 0.7rem 1.1rem;
                    border-radius: 10px;
                    font-size: 0.88rem;
                    font-weight: 500;
                    color: white;
                    border: 1px solid rgba(255,255,255,0.1);
                    box-shadow: 0 4px 20px rgba(0,0,0,0.35);
                    backdrop-filter: blur(10px);
                    animation: toastIn 0.28s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
                }
                .mam-toast-success { background: rgba(16, 185, 129, 0.92); }
                .mam-toast-error { background: rgba(239, 68, 68, 0.92); }
                .mam-toast-info { background: rgba(30, 30, 45, 0.95); border-color: rgba(6,182,212,0.3); }

                /* Animations */
                @keyframes toastIn {
                    from { transform: translateX(110%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                @keyframes pulse {
                    0%, 100% { opacity: 0.5; transform: scale(0.9); }
                    50% { opacity: 1; transform: scale(1.1); }
                }

                /* Mobile */
                @media (max-width: 600px) {
                    .mam-header-card { padding: 1rem; }
                    .mam-title-row { flex-direction: column; align-items: stretch; }
                    .mam-header-actions {
                        display: grid;
                        grid-template-columns: 1fr 1fr;
                        gap: 0.5rem;
                    }
                    .mam-header-actions .btn-primary { grid-column: 1 / -1; }
                    .mam-btn { width: 100%; justify-content: center; height: 2.4rem; font-size: 0.82rem; }
                    .mam-card-top { flex-direction: column; }
                    .mam-card-actions { width: 100%; justify-content: stretch; }
                    .mam-card-actions .mam-action-btn { flex: 1; justify-content: center; }
                    .mam-connected-banner { flex-wrap: wrap; }
                    .mam-toast-container { left: 1rem; right: 1rem; max-width: 100%; }
                }
            `}</style>
        </div>
    );
}
