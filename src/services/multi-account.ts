import type { MultiAccountConfig, GitHubUser, BoosterConfig } from '../types';
import { encodeToken } from './github';

const MULTI_ACCOUNT_STORAGE_KEY = 'github_booster_accounts';

export const multiAccountService = {
  // Get all stored accounts
  getAllAccounts(): MultiAccountConfig[] {
    const stored = localStorage.getItem(MULTI_ACCOUNT_STORAGE_KEY);
    try {
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  },

  // Add a new account
  addAccount(
    token: string,
    user: GitHubUser,
    owner: string,
    repo: string,
    config: BoosterConfig
  ): MultiAccountConfig {
    const accounts = this.getAllAccounts();
    const id = `${owner}/${repo}`;
    
    // Check if already exists
    const existing = accounts.findIndex(a => a.id === id);
    const account: MultiAccountConfig = {
      id,
      token: encodeToken(token),
      user,
      owner,
      repo,
      config,
      active: true,
      lastRun: 0,
    };

    if (existing >= 0) {
      accounts[existing] = account;
    } else {
      accounts.push(account);
    }

    localStorage.setItem(MULTI_ACCOUNT_STORAGE_KEY, JSON.stringify(accounts));
    return account;
  },

  // Remove an account
  removeAccount(accountId: string): void {
    const accounts = this.getAllAccounts().filter(a => a.id !== accountId);
    localStorage.setItem(MULTI_ACCOUNT_STORAGE_KEY, JSON.stringify(accounts));
  },

  // Update account active status
  updateAccountStatus(accountId: string, active: boolean): void {
    const accounts = this.getAllAccounts();
    const account = accounts.find(a => a.id === accountId);
    if (account) {
      account.active = active;
      localStorage.setItem(MULTI_ACCOUNT_STORAGE_KEY, JSON.stringify(accounts));
    }
  },

  // Update account config
  updateAccountConfig(accountId: string, config: BoosterConfig): void {
    const accounts = this.getAllAccounts();
    const account = accounts.find(a => a.id === accountId);
    if (account) {
      account.config = config;
      localStorage.setItem(MULTI_ACCOUNT_STORAGE_KEY, JSON.stringify(accounts));
    }
  },

  // Update last run time
  updateLastRun(accountId: string, timestamp: number): void {
    const accounts = this.getAllAccounts();
    const account = accounts.find(a => a.id === accountId);
    if (account) {
      account.lastRun = timestamp;
      localStorage.setItem(MULTI_ACCOUNT_STORAGE_KEY, JSON.stringify(accounts));
    }
  },

  // Update number of commits to push for this account
  updateCommitCount(accountId: string, commitCount: number): void {
    const accounts = this.getAllAccounts();
    const account = accounts.find(a => a.id === accountId);
    if (account) {
      account.commitCount = Math.max(1, commitCount);
      localStorage.setItem(MULTI_ACCOUNT_STORAGE_KEY, JSON.stringify(accounts));
    }
  },

  // Get account by ID
  getAccount(accountId: string): MultiAccountConfig | undefined {
    return this.getAllAccounts().find(a => a.id === accountId);
  },
};
