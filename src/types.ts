export interface GitHubUser {
  login: string;
  name: string;
  avatar_url: string;
  html_url: string;
  email: string | null;
}

export interface BoosterConfig {
  cron: string;
  email: string;
  message: string;
}

export interface WorkflowRun {
  id: number;
  status: string;
  conclusion: string | null;
  created_at: string;
  html_url: string;
}

export interface LogEntry {
  id: string;
  time: string;
  status: 'success' | 'pending' | 'failure';
  message: string;
}

export interface ContributionDay {
  contributionCount: number;
  date: string;
  color: string;
}

export interface ContributionCalendar {
  totalContributions: number;
  weeks: {
    contributionDays: ContributionDay[];
  }[];
}

export interface GitCommit {
  sha: string;
  message: string;
  date: string;
  url: string;
  author: string;
}
