import { useState, useEffect } from 'react';
import { Trash2, Power, Refresh } from 'reicon-react';
import { multiAccountService } from '../services/multi-account';
import type { MultiAccountConfig, GitHubUser, BoosterConfig } from '../types';

interface MultiAccountManagerProps {
    currentUser?: GitHubUser | null;
    currentRepo?: { owner: string; repo: string } | null;
    currentConfig?: BoosterConfig | null;
    onAccountAdded?: () => void;
}

export function MultiAccountManager({
    currentUser,
    currentRepo,
    currentConfig,
    onAccountAdded,
}: MultiAccountManagerProps) {
    const [accounts, setAccounts] = useState<MultiAccountConfig[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadAccounts();
    }, []);

    const loadAccounts = () => {
        setLoading(true);
        const allAccounts = multiAccountService.getAllAccounts();
        setAccounts(allAccounts);
        setLoading(false);
    };

    const handleToggleStatus = (accountId: string, active: boolean) => {
        multiAccountService.updateAccountStatus(accountId, !active);
        loadAccounts();
    };

    const handleRemoveAccount = (accountId: string) => {
        if (window.confirm(`Remove account ${accountId}?`)) {
            multiAccountService.removeAccount(accountId);
            loadAccounts();
        }
    };

    const handleRefresh = () => {
        loadAccounts();
    };

    const handleAddCurrentAccount = async () => {
        if (!currentUser || !currentRepo || !currentConfig) {
            alert('Please connect an account first');
            return;
        }

        if (window.confirm(`Add ${currentUser.name} (${currentRepo.owner}/${currentRepo.repo}) to scheduler?`)) {
            try {
                const accountId = `${currentRepo.owner}/${currentRepo.repo}`;
                const newAccount: MultiAccountConfig = {
                    id: accountId,
                    token: '', // Note: Token not stored here, managed separately
                    user: currentUser,
                    owner: currentRepo.owner,
                    repo: currentRepo.repo,
                    config: currentConfig,
                    active: true,
                    lastRun: 0,
                };

                // Call API to add account
                const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
                if (isLocalhost) {
                    const response = await fetch('/api/multi-account-add', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(newAccount),
                    });

                    if (response.ok) {
                        alert('✅ Account added to scheduler! Hourly commits will start soon.');
                        loadAccounts();
                        if (onAccountAdded) onAccountAdded();
                    } else {
                        alert('Failed to add account');
                    }
                } else {
                    // For deployed version, use localStorage
                    multiAccountService.addAccount(
                        '',
                        currentUser,
                        currentRepo.owner,
                        currentRepo.repo,
                        currentConfig
                    );
                    alert('✅ Account added! (Note: Local scheduler only runs in dev mode)');
                    loadAccounts();
                    if (onAccountAdded) onAccountAdded();
                }
            } catch (err: any) {
                alert('Error: ' + err.message);
            }
        }
    };

    if (loading) {
        return <div className="glass-panel">Loading accounts...</div>;
    }

    return (
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>Multi-Account Scheduler</h2>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {currentUser && currentRepo && (
                        <button
                            onClick={handleAddCurrentAccount}
                            style={{
                                background: 'var(--accent-green)',
                                border: 'none',
                                color: 'white',
                                padding: '0.5rem 1rem',
                                borderRadius: '0.5rem',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                fontWeight: 500,
                            }}
                            title="Add current account to scheduler"
                        >
                            ➕ Add Current Account
                        </button>
                    )}
                    <button
                        onClick={handleRefresh}
                        style={{
                            background: 'var(--accent-cyan)',
                            border: 'none',
                            color: 'var(--bg-color)',
                            padding: '0.5rem 1rem',
                            borderRadius: '0.5rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                        }}
                    >
                        <Refresh size={16} />
                        Refresh
                    </button>
                </div>
            </div>

            {accounts.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '1rem' }}>
                    <p>No accounts configured yet.</p>
                    <p style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>
                        Connect accounts from the main dashboard to schedule hourly commits.
                    </p>
                </div>
            ) : (
                <div style={{ display: 'grid', gap: '1rem' }}>
                    {accounts.map((account) => (
                        <div
                            key={account.id}
                            style={{
                                background: 'rgba(255, 255, 255, 0.05)',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                borderRadius: '0.75rem',
                                padding: '1rem',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                            }}
                        >
                            <div>
                                <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1rem', fontWeight: 600 }}>
                                    {account.user.name} ({account.owner}/{account.repo})
                                </h3>
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                    <p style={{ margin: '0.25rem 0' }}>
                                        Email: <code>{account.config.email}</code>
                                    </p>
                                    <p style={{ margin: '0.25rem 0' }}>
                                        Schedule: <code>{account.config.cron}</code>
                                    </p>
                                    <p style={{ margin: '0.25rem 0' }}>
                                        Last run: {account.lastRun ? new Date(account.lastRun).toLocaleString() : 'Never'}
                                    </p>
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button
                                    onClick={() => handleToggleStatus(account.id, account.active)}
                                    style={{
                                        background: account.active ? 'var(--accent-green)' : 'var(--accent-red)',
                                        border: 'none',
                                        color: 'white',
                                        padding: '0.5rem 1rem',
                                        borderRadius: '0.5rem',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                    }}
                                    title={account.active ? 'Disable' : 'Enable'}
                                >
                                    <Power size={16} />
                                    {account.active ? 'Active' : 'Inactive'}
                                </button>
                                <button
                                    onClick={() => handleRemoveAccount(account.id)}
                                    style={{
                                        background: 'var(--accent-red)',
                                        border: 'none',
                                        color: 'white',
                                        padding: '0.5rem 1rem',
                                        borderRadius: '0.5rem',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                    }}
                                >
                                    <Trash2 size={16} />
                                    Remove
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
