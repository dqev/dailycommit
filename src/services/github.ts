import type { GitHubUser, BoosterConfig, WorkflowRun, LogEntry, ContributionCalendar, GitCommit } from '../types';

// Helper to decode Base64 safely dealing with UTF-8
function decodeBase64(str: string): string {
  try {
    return decodeURIComponent(escape(atob(str.replace(/\s/g, ''))));
  } catch (e) {
    return atob(str.replace(/\s/g, ''));
  }
}

// Helper to encode Base64 safely dealing with UTF-8
function encodeBase64(str: string): string {
  return btoa(unescape(encodeURIComponent(str)));
}

export const GITHUB_OWNER = 'devchauhann';
export const GITHUB_REPO = 'activity';

export const githubService = {
  // Verify Personal Access Token
  async verifyPAT(token: string): Promise<GitHubUser> {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) {
      throw new Error('Invalid Personal Access Token');
    }

    const data = await response.json();
    return {
      login: data.login,
      name: data.name || data.login,
      avatar_url: data.avatar_url,
      html_url: data.html_url,
      email: data.email || null,
    };
  },

  // Get a file's content and SHA
  async getFile(token: string, path: string): Promise<{ sha: string; content: string } | null> {
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`,
      {
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );

    if (!response.ok) return null;

    const data = await response.json();
    return {
      sha: data.sha,
      content: decodeBase64(data.content),
    };
  },

  // Create or update a file
  async updateFile(
    token: string,
    path: string,
    content: string,
    message: string,
    sha?: string
  ): Promise<any> {
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message,
          content: encodeBase64(content),
          sha,
        }),
      }
    );

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.message || `Failed to update ${path}`);
    }

    return response.json();
  },

  // Load configuration from the repository (YAML & tracker files)
  async getConfig(token: string): Promise<BoosterConfig> {
    const defaultCron = '30 8 * * *';
    const defaultEmail = 'devchauhan@users.noreply.github.com';
    const defaultMsg = 'chore: auto boost activity [skip ci]';

    let cron = defaultCron;
    let email = defaultEmail;
    let message = defaultMsg;

    // 1. Fetch cron from workflow file
    const workflowFile = await this.getFile(token, '.github/workflows/auto-commit.yml');
    if (workflowFile) {
      const cronRegex = /-\s*cron:\s*['"]([^'"]+)['"]/;
      const match = workflowFile.content.match(cronRegex);
      if (match) {
        cron = match[1];
      }
    }

    // 2. Fetch email from .booster_email
    const emailFile = await this.getFile(token, '.booster_email');
    if (emailFile) {
      email = emailFile.content.trim();
    }

    // 3. Fetch message from .booster_msg
    const msgFile = await this.getFile(token, '.booster_msg');
    if (msgFile) {
      message = msgFile.content.trim();
    }

    return { cron, email, message };
  },

  // Save the entire booster configuration
  async saveConfig(token: string, newConfig: BoosterConfig): Promise<void> {
    // 1. Update .booster_email
    const emailFile = await this.getFile(token, '.booster_email');
    await this.updateFile(
      token,
      '.booster_email',
      newConfig.email,
      'chore: update booster email config',
      emailFile?.sha
    );

    // 2. Update .booster_msg
    const msgFile = await this.getFile(token, '.booster_msg');
    await this.updateFile(
      token,
      '.booster_msg',
      newConfig.message,
      'chore: update booster message config',
      msgFile?.sha
    );

    // 3. Update Cron in workflow file
    const workflowFile = await this.getFile(token, '.github/workflows/auto-commit.yml');
    if (workflowFile) {
      const cronRegex = /(-\s*cron:\s*['"])([^'"]+)(['"])/;
      let updatedContent = workflowFile.content;
      if (cronRegex.test(workflowFile.content)) {
        updatedContent = workflowFile.content.replace(cronRegex, `$1${newConfig.cron}$3`);
      } else {
        // Fallback: search and inject schedule if missing
        const scheduleIndex = workflowFile.content.indexOf('schedule:');
        if (scheduleIndex !== -1) {
          // Add cron under schedule
          const before = workflowFile.content.substring(0, scheduleIndex + 9);
          const after = workflowFile.content.substring(scheduleIndex + 9);
          updatedContent = `${before}\n    - cron: '${newConfig.cron}'${after}`;
        }
      }

      await this.updateFile(
        token,
        '.github/workflows/auto-commit.yml',
        updatedContent,
        `chore: update booster cron schedule to ${newConfig.cron}`,
        workflowFile.sha
      );
    }
  },

  // Fetch recent GitHub Actions workflow runs
  async getWorkflowRuns(token: string): Promise<WorkflowRun[]> {
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/auto-commit.yml/runs?per_page=10`,
      {
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return (data.workflow_runs || []).map((run: any) => ({
      id: run.id,
      status: run.status,
      conclusion: run.conclusion,
      created_at: run.created_at,
      html_url: run.html_url,
    }));
  },

  // Convert workflow runs to developer-friendly logs
  async getLogs(token: string): Promise<LogEntry[]> {
    const runs = await this.getWorkflowRuns(token);
    
    if (runs.length === 0) {
      // Return a helper message if no runs exist
      return [
        {
          id: 'first-setup',
          time: new Date().toISOString(),
          status: 'pending',
          message: 'Booster repository detected. Ready for your first activity boost!',
        },
      ];
    }

    return runs.map((run) => {
      let status: 'success' | 'pending' | 'failure' = 'pending';
      let message = `Activity Booster run #${run.id} is ${run.status}`;

      if (run.status === 'completed') {
        if (run.conclusion === 'success') {
          status = 'success';
          message = `Successfully pushed activity commit. Heatmap updated!`;
        } else {
          status = 'failure';
          message = `Booster failed. Reason: ${run.conclusion || 'unknown error'}`;
        }
      } else if (run.status === 'queued' || run.status === 'in_progress') {
        status = 'pending';
        message = `Activity Booster is running in GitHub Actions...`;
      }

      return {
        id: run.id.toString(),
        time: run.created_at,
        status,
        message,
      };
    });
  },

  // Trigger manual booster run
  async triggerManualBoost(token: string): Promise<void> {
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/auto-commit.yml/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ref: 'main',
        }),
      }
    );

    if (!response.ok) {
      const errData = await response.json().catch(() => ({ message: 'Workflow not active' }));
      throw new Error(errData.message || 'Failed to dispatch workflow. Make sure actions are enabled on GitHub.');
    }
  },

  // Push a direct commit to activity_log.txt via GitHub contents API
  async pushDirectCommit(token: string, message: string): Promise<any> {
    const file = await this.getFile(token, 'activity_log.txt');
    const prevContent = file ? file.content : '';
    const newContent = `${prevContent}\nManual push: ${new Date().toISOString()} - ${message}`;
    return this.updateFile(token, 'activity_log.txt', newContent, message, file?.sha);
  },

  // Enable/Disable auto commits (actually enables or disables the workflow)
  async toggleWorkflow(token: string, active: boolean): Promise<void> {
    // We can enable/disable workflow on GitHub API
    // PUT /repos/{owner}/{repo}/actions/workflows/{workflow_id}/enable
    // PUT /repos/{owner}/{repo}/actions/workflows/{workflow_id}/disable
    const status = active ? 'enable' : 'disable';
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/auto-commit.yml/${status}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to ${status} workflow`);
    }
  },

  // Check if the workflow is currently enabled/active
  async getWorkflowStatus(token: string): Promise<boolean> {
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/auto-commit.yml`,
      {
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );

    if (!response.ok) {
      return false;
    }

    const data = await response.json();
    return data.state === 'active';
  },

  // Fetch the real user contribution calendar via GitHub's GraphQL API
  async getRealContributions(token: string): Promise<ContributionCalendar> {
    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setFullYear(toDate.getFullYear() - 1);
    fromDate.setDate(fromDate.getDate() + 1); // 365 days rolling window

    const query = `
      query($from: DateTime!, $to: DateTime!) {
        viewer {
          contributionsCollection(from: $from, to: $to) {
            contributionCalendar {
              totalContributions
              weeks {
                contributionDays {
                  contributionCount
                  date
                  color
                }
              }
            }
          }
        }
      }
    `;

    const response = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        Authorization: `bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: {
          from: fromDate.toISOString(),
          to: toDate.toISOString(),
        },
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch real contribution graph via GraphQL');
    }

    const result = await response.json();
    if (result.errors) {
      throw new Error(result.errors[0].message);
    }

    return result.data.viewer.contributionsCollection.contributionCalendar;
  },

  // Fetch actual Git commits pushed to the booster repo
  async getRepoCommits(token: string): Promise<GitCommit[]> {
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/commits?per_page=15`,
      {
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return (data || []).map((item: any) => ({
      sha: item.sha,
      message: item.commit.message,
      date: item.commit.author.date,
      url: item.html_url,
      author: item.commit.author.name,
    }));
  },
};
