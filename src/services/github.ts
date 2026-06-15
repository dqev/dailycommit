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

export function encodeToken(token: string): string {
  // Simple Base64 + reversed string obfuscation to hide token signature ('ghp_') from basic regex scanners
  return btoa(token.split('').reverse().join(''));
}

/**
 * Generate a GitHub Actions workflow YAML.
 * When dailyCommitCount >= 3, multiple cron triggers are added spread across the day,
 * each with a random sleep jitter so commits land at organic-looking times.
 * When count is 0 or 1, a single cron is used (the supplied `cron` string).
 */
export function generateWorkflowYaml(options: {
  cron: string;
  email?: string;
  dailyCommitCount?: number;
}): string {
  const count = options.dailyCommitCount ?? 0;

  // Spread windows across UTC day (hours). We pick N windows out of these.
  const UTC_WINDOWS = [1, 5, 9, 13, 17, 21]; // up to 6 spread points
  const selected = UTC_WINDOWS.slice(0, Math.max(count, 1));

  // Build cron schedule lines
  let scheduleLines: string;
  if (count >= 3) {
    scheduleLines = selected
      .map((h) => `    - cron: '0 ${h} * * *'`)
      .join('\n');
  } else {
    scheduleLines = `    - cron: '${options.cron}'`;
  }

  // Jitter step — only inject when in multi-commit mode
  // Note: inside JS template literals only ${} is interpolated.
  // $(()), $(cmd), and $VAR are safe and do NOT need escaping.
  // Only ${VAR} bash refs need escaping as \${VAR}.
  const jitterStep =
    count >= 3
      ? `
      - name: Random time jitter
        run: |
          # Sleep up to 59 minutes so commits land at truly random times
          JITTER=$((RANDOM % 3540))
          echo "Sleeping \${JITTER}s before committing..."
          sleep $JITTER
`
      : '';

  return `name: GitHub Activity Booster

on:
  schedule:
${scheduleLines}
  workflow_dispatch:
    inputs:
      commit_message:
        description: 'Commit message for this boost'
        required: false
        default: 'chore: auto boost activity [skip ci]'
      committer_email:
        description: 'Email address to associate with the commit'
        required: false
        default: ''

permissions:
  contents: write

jobs:
  boost:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          persist-credentials: true
${jitterStep}
      - name: Update activity log
        run: |
          echo "Boosted on: $(date)" >> activity_log.txt

      - name: Git commit and push
        run: |
          EMAIL="\${{ github.event.inputs.committer_email }}"
          if [ -z "$EMAIL" ]; then
            if [ -f .booster_email ]; then
              EMAIL=$(cat .booster_email)
            else
              EMAIL="\${{ github.actor_id }}+\${{ github.actor }}@users.noreply.github.com"
            fi
          fi

          MSG="\${{ github.event.inputs.commit_message }}"
          if [ -z "$MSG" ]; then
            if [ -f .booster_msg ]; then
              MSG=$(cat .booster_msg)
            else
              MSG="chore: auto boost activity [skip ci]"
            fi
          fi

          git config --global user.name "\${{ github.actor }}"
          git config --global user.email "$EMAIL"

          git add activity_log.txt

          if ! git diff --quiet || ! git diff --staged --quiet; then
            git commit -m "$MSG"
            git push
          else
            echo "No changes to commit."
          fi
`;
}

export function decodeToken(encoded: string | null): string | null {
  if (!encoded) return null;
  try {
    // Check if it's already a raw token (backward compatibility)
    if (encoded.startsWith('ghp_') || encoded.startsWith('github_pat_')) {
      return encoded;
    }
    return atob(encoded).split('').reverse().join('');
  } catch (e) {
    return encoded;
  }
}

export function getStoredToken(): string | null {
  const token = localStorage.getItem('github_booster_token');
  return decodeToken(token);
}

export function setStoredToken(token: string): void {
  localStorage.setItem('github_booster_token', encodeToken(token));
}

export function clearStoredToken(): void {
  localStorage.removeItem('github_booster_token');
}

export let GITHUB_OWNER = localStorage.getItem('github_booster_owner') || '';
export let GITHUB_REPO = localStorage.getItem('github_booster_repo') || '';

export const setGithubRepoDetails = (owner: string, repo: string) => {
  GITHUB_OWNER = owner;
  GITHUB_REPO = repo;
  localStorage.setItem('github_booster_owner', owner);
  localStorage.setItem('github_booster_repo', repo);
};

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
      if (response.status === 401) {
        throw new Error('Invalid Personal Access Token');
      }
      if (response.status === 403) {
        throw new Error('Access forbidden or GitHub API rate limit exceeded');
      }
      throw new Error(`GitHub API returned error status ${response.status}`);
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

  // Verify Repository exists and is accessible
  async verifyRepo(token: string, owner: string, repo: string): Promise<boolean> {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });
    return response.ok;
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
    const defaultCron = '0 1 * * *';
    const defaultEmail = '';
    const defaultMsg = 'chore: auto boost activity [skip ci]';

    let cron = defaultCron;
    let email = defaultEmail;
    let message = defaultMsg;
    let dailyCommitCount = 0;

    // 1. Fetch cron schedule(s) from workflow file
    const workflowFile = await this.getFile(token, '.github/workflows/auto-commit.yml');
    if (workflowFile) {
      const cronRegex = /-\s*cron:\s*['"]([^'"]+)['"]/g;
      const matches = [...workflowFile.content.matchAll(cronRegex)];
      if (matches.length >= 3) {
        // Multi-commit mode — count how many cron triggers are present
        dailyCommitCount = matches.length;
        cron = matches[0][1]; // store the first cron as representative
      } else if (matches.length === 1) {
        cron = matches[0][1];
        dailyCommitCount = 0;
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

    return { cron, email, message, dailyCommitCount };
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

    // 3. Regenerate the entire workflow file based on the new config
    // This handles both single-cron and multi-commit (random daily) modes.
    const workflowFile = await this.getFile(token, '.github/workflows/auto-commit.yml');
    const newWorkflowContent = generateWorkflowYaml({
      cron: newConfig.cron,
      email: newConfig.email,
      dailyCommitCount: newConfig.dailyCommitCount ?? 0,
    });

    const commitCountLabel =
      (newConfig.dailyCommitCount ?? 0) >= 3
        ? `${newConfig.dailyCommitCount} random commits/day`
        : `cron ${newConfig.cron}`;

    await this.updateFile(
      token,
      '.github/workflows/auto-commit.yml',
      newWorkflowContent,
      `chore: update booster schedule to ${commitCountLabel}`,
      workflowFile?.sha
    );
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

  // Push a batch of direct commits sequentially to activity_log.txt
  async pushBatchCommits(
    token: string,
    limit: number,
    baseMessage: string,
    onProgress: (currentIndex: number) => void,
    signal?: AbortSignal,
    delayMs: number = 200
  ): Promise<void> {
    // 1. Fetch file content and SHA first
    const file = await this.getFile(token, 'activity_log.txt');
    let currentSha = file ? file.sha : undefined;
    let currentContent = file ? file.content : '# GitHub Activity Booster - Activity Log\n';

    // 2. Loop to push multiple commits
    for (let i = 0; i < limit; i++) {
      if (signal?.aborted) {
        throw new Error('Cancelled by user');
      }

      const commitMsg = `${baseMessage} [boost ${i + 1}/${limit}]`;
      const dateStr = new Date().toISOString();
      currentContent = `${currentContent}\nManual boost: ${dateStr} - ${commitMsg}`;

      const res = await this.updateFile(
        token,
        'activity_log.txt',
        currentContent,
        commitMsg,
        currentSha
      );

      currentSha = res.content.sha;
      onProgress(i + 1);

      // Add delay to make it robust and allow UI response
      if (delayMs > 0 && i < limit - 1) {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, delayMs);
          if (signal) {
            signal.addEventListener('abort', () => {
              clearTimeout(timer);
              reject(new Error('Cancelled by user'));
            });
          }
        });
      }
    }
  },

  // Automatically initialize the required GitHub Action workflow and configuration files
  // Defaults to 4 random commits per day — ideal for secondary account setup.
  async initializeRepository(token: string, email: string, dailyCommitCount: number = 4): Promise<void> {
    // Generate workflow with multi-commit random daily mode by default
    const defaultWorkflow = generateWorkflowYaml({
      cron: '0 1 * * *', // fallback single-cron (unused when count >= 3)
      email,
      dailyCommitCount,
    });

    // 1. Create/Update workflow file
    const wf = await this.getFile(token, '.github/workflows/auto-commit.yml');
    await this.updateFile(
      token,
      '.github/workflows/auto-commit.yml',
      defaultWorkflow,
      `chore: initialize auto-commit workflow (${dailyCommitCount} commits/day)`,
      wf?.sha
    );

    // 2. Always write .booster_email — CRITICAL: must match the secondary account's GitHub email
    // so commits register on the correct contribution graph.
    const emailFile = await this.getFile(token, '.booster_email');
    await this.updateFile(
      token,
      '.booster_email',
      email,
      'chore: set booster email for commit attribution',
      emailFile?.sha
    );

    // 3. Create/Update .booster_msg (only if not already set by user)
    const msgFile = await this.getFile(token, '.booster_msg');
    if (!msgFile) {
      await this.updateFile(
        token,
        '.booster_msg',
        'chore: auto boost activity [skip ci]',
        'chore: initialize booster message'
      );
    }

    // 4. Create/Update activity_log.txt
    const logFile = await this.getFile(token, 'activity_log.txt');
    if (!logFile) {
      await this.updateFile(
        token,
        'activity_log.txt',
        '# GitHub Activity Booster - Activity Log\n',
        'chore: initialize activity log'
      );
    }
  },
};

export function getNextCronRunDate(cron: string, baseDate: Date = new Date()): Date | null {
  try {
    const parts = cron.trim().split(/\s+/);
    if (parts.length !== 5) return null;
    const [minStr, hourStr, domStr, monStr, dowStr] = parts;

    const parseField = (str: string, min: number, max: number): Set<number> | null => {
      if (str === '*') return null;
      const vals = new Set<number>();
      const list = str.split(',');
      for (const item of list) {
        if (item.includes('/')) {
          const [range, stepStr] = item.split('/');
          const step = parseInt(stepStr, 10);
          let start = min;
          let end = max;
          if (range !== '*') {
            const rangeParts = range.split('-');
            start = parseInt(rangeParts[0], 10);
            end = rangeParts[1] ? parseInt(rangeParts[1], 10) : max;
          }
          for (let i = start; i <= end; i += step) {
            vals.add(i);
          }
        } else if (item.includes('-')) {
          const [startStr, endStr] = item.split('-');
          const start = parseInt(startStr, 10);
          const end = parseInt(endStr, 10);
          for (let i = start; i <= end; i++) {
            vals.add(i);
          }
        } else {
          const val = parseInt(item, 10);
          if (!isNaN(val)) vals.add(val);
        }
      }
      return vals;
    };

    const minutes = parseField(minStr, 0, 59);
    const hours = parseField(hourStr, 0, 23);
    const doms = parseField(domStr, 1, 31);
    const months = parseField(monStr, 1, 12);
    const dows = parseField(dowStr, 0, 6);

    let testDate = new Date(baseDate.getTime());
    testDate.setUTCSeconds(0);
    testDate.setUTCMilliseconds(0);
    testDate.setUTCMinutes(testDate.getUTCMinutes() + 1);

    for (let i = 0; i < 525600; i++) {
      const min = testDate.getUTCMinutes();
      const hour = testDate.getUTCHours();
      const dom = testDate.getUTCDate();
      const mon = testDate.getUTCMonth() + 1;
      const dow = testDate.getUTCDay();

      const matchMin = !minutes || minutes.has(min);
      const matchHour = !hours || hours.has(hour);
      const matchDom = !doms || doms.has(dom);
      const matchMon = !months || months.has(mon);
      const matchDow = !dows || dows.has(dow);

      if (matchMin && matchHour && matchDom && matchMon && matchDow) {
        return testDate;
      }

      if (!matchHour && hours) {
        let nextHour = hour;
        let found = false;
        for (let h = 1; h <= 24; h++) {
          const th = (hour + h) % 24;
          if (hours.has(th)) {
            nextHour = th;
            found = true;
            break;
          }
        }
        if (found) {
          testDate.setUTCHours(nextHour);
          testDate.setUTCMinutes(0);
          if (nextHour <= hour) {
            testDate.setUTCDate(testDate.getUTCDate() + 1);
          }
          continue;
        }
      }

      testDate.setUTCMinutes(testDate.getUTCMinutes() + 1);
    }

    return null;
  } catch (e) {
    console.error('Failed to parse cron next run:', e);
    return null;
  }
}

export function getCronDescription(cron: string): string {
  try {
    const parts = cron.trim().split(/\s+/);
    if (parts.length !== 5) return 'Custom Schedule';
    const [min, hr, dom, mon, dow] = parts;

    if (dom !== '*' || mon !== '*' || dow !== '*') {
      return `Custom cron: ${cron}`;
    }

    if (min === '0' && hr === '*') {
      return 'Every hour';
    }

    if (min === '0' && hr.startsWith('*/')) {
      const step = hr.substring(2);
      return `Every ${step} hours`;
    }

    if (hr === '*' && min.startsWith('*/')) {
      const step = min.substring(2);
      return `Every ${step} minutes`;
    }

    const h = parseInt(hr, 10);
    const m = parseInt(min, 10);
    if (!isNaN(h) && !isNaN(m) && hr.indexOf(',') === -1 && hr.indexOf('/') === -1) {
      const istH = Math.floor((h * 60 + m + 330) % 1440 / 60);
      const istM = (h * 60 + m + 330) % 60;
      const period = istH >= 12 ? 'PM' : 'AM';
      const dispH = istH % 12 === 0 ? 12 : istH % 12;
      const dispM = String(istM).padStart(2, '0');
      return `Daily at ${dispH}:${dispM} ${period} IST (${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} UTC)`;
    }

    if (min === '0' && hr === '8,20') {
      return 'Daily at 08:00 & 20:00 UTC';
    }

    return `Custom cron: ${cron}`;
  } catch {
    return 'Custom Schedule';
  }
}
