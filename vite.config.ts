import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import https from 'https'

// Cron parser for local scheduler
function getNextCronRunDate(cron: string, baseDate: Date = new Date()): Date | null {
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

let activeTimeout: NodeJS.Timeout | null = null;

function runLocalScheduler() {
  if (activeTimeout) {
    clearTimeout(activeTimeout);
    activeTimeout = null;
  }

  const checkScheduler = () => {
    try {
      const activeFile = path.join(process.cwd(), '.booster_active');
      const isActive = fs.existsSync(activeFile) ? fs.readFileSync(activeFile, 'utf8').trim() === 'true' : false;
      if (!isActive) {
        activeTimeout = setTimeout(checkScheduler, 10000);
        return;
      }

      const workflowFile = path.join(process.cwd(), '.github/workflows/auto-commit.yml');
      if (!fs.existsSync(workflowFile)) {
        activeTimeout = setTimeout(checkScheduler, 10000);
        return;
      }

      const content = fs.readFileSync(workflowFile, 'utf8');
      const cronRegex = /-\s*cron:\s*['"]([^'"]+)['"]/;
      const match = content.match(cronRegex);
      if (!match) {
        activeTimeout = setTimeout(checkScheduler, 10000);
        return;
      }
      const cron = match[1];

      // Read last executed run time from disk
      const lastRunFile = path.join(process.cwd(), '.booster_last_run');
      let lastRunTime = 0;
      if (fs.existsSync(lastRunFile)) {
        lastRunTime = parseInt(fs.readFileSync(lastRunFile, 'utf8').trim() || '0', 10);
      }
      
      // If last run is not initialized, set it to now to start tracking from this point onward
      if (lastRunTime === 0) {
        lastRunTime = Date.now();
        fs.writeFileSync(lastRunFile, String(lastRunTime));
      }

      // Calculate the scheduled execution time after lastRunTime
      const nextRun = getNextCronRunDate(cron, new Date(lastRunTime));
      if (nextRun && Date.now() >= nextRun.getTime()) {
        console.log(`[local-scheduler] Missed or scheduled run detected at ${nextRun.toLocaleString()}. Executing commit...`);
        
        // Update last run immediately to prevent double execution if git commit takes time
        fs.writeFileSync(lastRunFile, String(nextRun.getTime()));

        const emailFile = path.join(process.cwd(), '.booster_email');
        let email = fs.existsSync(emailFile) ? fs.readFileSync(emailFile, 'utf8').trim() : '';
        if (!email) {
          try {
            email = execSync('git config user.email', { encoding: 'utf8' }).trim();
          } catch (err) {
            email = 'booster@users.noreply.github.com';
          }
        }

        let name = email.split('@')[0] || 'Booster';
        try {
          const gitName = execSync('git config user.name', { encoding: 'utf8' }).trim();
          if (gitName) name = gitName;
        } catch (err) {}

        const msgFile = path.join(process.cwd(), '.booster_msg');
        const message = fs.existsSync(msgFile) ? fs.readFileSync(msgFile, 'utf8').trim() : 'chore: auto boost activity [skip ci]';

        let originalRemote = '';
        try {
          const logFile = path.join(process.cwd(), 'activity_log.txt');
          if (!fs.existsSync(logFile)) {
            fs.writeFileSync(logFile, '# GitHub Activity Booster - Activity Log\n');
          }

          const dateStr = new Date(nextRun.getTime()).toISOString();
          const commitMsg = `${message} [local scheduler run]`;
          fs.appendFileSync(logFile, `\nLocal auto-commit: ${dateStr} - ${commitMsg}`);

          const env = {
            ...process.env,
            GIT_AUTHOR_NAME: name,
            GIT_AUTHOR_EMAIL: email,
            GIT_COMMITTER_NAME: name,
            GIT_COMMITTER_EMAIL: email,
          };

          // Try to setup authenticated remote for push
          const tokenFile = path.join(process.cwd(), '.booster_token');
          if (fs.existsSync(tokenFile)) {
            const token = fs.readFileSync(tokenFile, 'utf8').trim();
            if (token) {
              try {
                originalRemote = execSync('git remote get-url origin', { encoding: 'utf8' }).trim();
                const cleanUrl = originalRemote.replace(/\.git$/, '');
                const match = cleanUrl.match(/github\.com[/:]([^/]+)\/([^/]+)$/);
                if (match) {
                  const owner = match[1];
                  const repo = match[2];
                  const authenticatedRemote = `https://x-access-token:${token}@github.com/${owner}/${repo}.git`;
                  execSync(`git remote set-url origin "${authenticatedRemote}"`);

                  // Fetch and rebase to prevent out-of-sync failures
                  try {
                    execSync('git fetch origin');
                    const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
                    execSync(`git rebase origin/${currentBranch} --autostash -X theirs`);
                  } catch (rebaseErr: any) {
                    console.warn('[local-scheduler] Rebase failed, aborting rebase:', rebaseErr.message);
                    try {
                      execSync('git rebase --abort');
                    } catch (abortErr) {}
                  }
                }
              } catch (remoteErr: any) {
                console.warn('[local-scheduler] Setup of authenticated remote failed:', remoteErr.message);
              }
            }
          }

          execSync('git add activity_log.txt');
          execSync(`git commit -m "${commitMsg}" --no-gpg-sign`, { env });
          console.log(`[local-scheduler] Successfully created local commit for scheduled run ${nextRun.toLocaleString()}.`);

          // Push the commit if we have remote credentials configured
          if (originalRemote) {
            try {
              const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
              execSync(`git push -u origin "${currentBranch}"`);
              console.log('[local-scheduler] Successfully pushed commit to origin.');
            } catch (pushErr: any) {
              console.warn('[local-scheduler] Push failed:', pushErr.message);
            }
          }
        } catch (err: any) {
          console.error('[local-scheduler] Commit execution failed:', err.message);
        } finally {
          if (originalRemote) {
            try {
              execSync(`git remote set-url origin "${originalRemote}"`);
            } catch (restoreErr: any) {
              console.warn('[local-scheduler] Failed to restore remote URL:', restoreErr.message);
            }
          }
        }

        // Run scheduler check again immediately to check if there are other catch-up runs
        activeTimeout = setTimeout(checkScheduler, 1000);
        return;
      }
    } catch (err) {
      console.error('[local-scheduler] Error checking scheduler:', err);
    }
    
    // Check again in 10 seconds
    activeTimeout = setTimeout(checkScheduler, 10000);
  };

  checkScheduler();
}

// ─── GitHub API helper for multi-account commits ────────────────────────────

/** Decode token stored as base64(reverse(token)) */
function decodeAccountToken(encoded: string): string {
  const reversed = Buffer.from(encoded, 'base64').toString('utf8');
  return reversed.split('').reverse().join('');
}

/** Make an HTTPS request to the GitHub API and return parsed JSON */
function githubApiRequest(
  method: string,
  apiPath: string,
  token: string,
  body?: object
): Promise<any> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const options: https.RequestOptions = {
      hostname: 'api.github.com',
      path: apiPath,
      method,
      headers: {
        'Authorization': `token ${token}`,
        'User-Agent': 'github-activity-booster/1.0',
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: data ? JSON.parse(data) : {} });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/**
 * Push a commit to an account's own GitHub repo via the GitHub Contents API.
 * This creates/updates a file directly in the remote repo without touching
 * the local git repository at all.
 */
async function pushCommitViaApi(
  token: string,
  owner: string,
  repo: string,
  commitMessage: string,
  authorName: string,
  authorEmail: string
): Promise<void> {
  const filePath = 'activity_log.txt';
  const apiFilePath = `/repos/${owner}/${repo}/contents/${filePath}`;

  // 1. GET current file to obtain SHA (needed for updates)
  const getResult = await githubApiRequest('GET', apiFilePath, token);
  let currentSha: string | undefined;
  let currentContent = '# GitHub Activity Booster - Activity Log\n';

  if (getResult.status === 200 && getResult.body?.sha) {
    currentSha = getResult.body.sha;
    // Decode base64 content from GitHub
    try {
      currentContent = Buffer.from(getResult.body.content.replace(/\n/g, ''), 'base64').toString('utf8');
    } catch (e) {
      currentContent = '# GitHub Activity Booster - Activity Log\n';
    }
  } else if (getResult.status === 404) {
    // File doesn't exist yet — we'll create it
    currentSha = undefined;
  } else if (getResult.status === 401 || getResult.status === 403) {
    throw new Error(`Auth failed for ${owner}/${repo}: HTTP ${getResult.status}`);
  }

  // 2. Append new log entry
  const dateStr = new Date().toISOString();
  const newContent = currentContent.trimEnd() + `\nAuto-commit for ${owner}/${repo}: ${dateStr} - ${commitMessage}\n`;
  const encodedContent = Buffer.from(newContent).toString('base64');

  // 3. PUT the updated file
  const putBody: any = {
    message: commitMessage,
    content: encodedContent,
    author: { name: authorName, email: authorEmail },
    committer: { name: authorName, email: authorEmail },
  };
  if (currentSha) putBody.sha = currentSha;

  const putResult = await githubApiRequest('PUT', apiFilePath, token, putBody);
  if (putResult.status !== 200 && putResult.status !== 201) {
    throw new Error(`GitHub API PUT failed: HTTP ${putResult.status} - ${JSON.stringify(putResult.body?.message || putResult.body)}`);
  }
}

// Multi-account scheduler for running commits every hour on all active accounts
let multiAccountTimeout: NodeJS.Timeout | null = null;

function runMultiAccountScheduler() {
  if (multiAccountTimeout) {
    clearTimeout(multiAccountTimeout);
    multiAccountTimeout = null;
  }

  const checkMultiAccounts = async () => {
    try {
      const accountsFile = path.join(process.cwd(), '.booster_accounts.json');
      if (!fs.existsSync(accountsFile)) {
        multiAccountTimeout = setTimeout(checkMultiAccounts, 3600000);
        return;
      }

      const accountsData = JSON.parse(fs.readFileSync(accountsFile, 'utf8'));
      const accounts = accountsData.accounts || [];
      const now = Date.now();
      let anyUpdated = false;

      for (const account of accounts) {
        if (!account.active) continue;
        if (!account.token) {
          console.warn(`[multi-account-scheduler] Skipping ${account.id}: no token stored.`);
          continue;
        }

        const lastRun = account.lastRun || 0;
        // Read cron from account config if available, else default to hourly
        const cron = account.config?.cron || '0 * * * *';
        const nextRun = getNextCronRunDate(cron, new Date(lastRun === 0 ? Date.now() - 3700000 : lastRun));

        if (!nextRun || now < nextRun.getTime()) continue;

        console.log(`[multi-account-scheduler] Running API commit for ${account.id}...`);

        try {
          const decodedToken = decodeAccountToken(account.token);
          const authorName = account.user?.name || account.user?.login || 'Booster';
          const authorEmail = account.config?.email || `${account.user?.login}@users.noreply.github.com`;
          const message = account.config?.message || 'chore: auto boost activity [skip ci]';
          const commitMsg = `${message} [scheduled]`;

          await pushCommitViaApi(decodedToken, account.owner, account.repo, commitMsg, authorName, authorEmail);
          console.log(`[multi-account-scheduler] ✅ Commit pushed to ${account.owner}/${account.repo}`);

          account.lastRun = nextRun.getTime();
          anyUpdated = true;
        } catch (err: any) {
          console.warn(`[multi-account-scheduler] ❌ Failed for ${account.id}:`, err.message);
        }
      }

      if (anyUpdated) {
        fs.writeFileSync(accountsFile, JSON.stringify(accountsData, null, 2));
      }
    } catch (err) {
      console.error('[multi-account-scheduler] Error:', err);
    }

    multiAccountTimeout = setTimeout(checkMultiAccounts, 60000); // Check every minute
  };

  checkMultiAccounts();
}

// https://vite.dev/config/
export default defineConfig({
  server: {
    watch: {
      ignored: [
        '**/activity_log.txt',
        '**/.git/**',
        '**/dist/**',
        '**/node_modules/**',
        '**/.booster_repos/**'
      ]
    }
  },
  plugins: [
    react(),
    {
      name: 'bulk-commit-api',
      configureServer(server) {
        // Run schedulers on startup
        runLocalScheduler();
        runMultiAccountScheduler();

        server.middlewares.use((req, res, next) => {
          if (req.url?.startsWith('/api/save-config') && req.method === 'POST') {
            let body = '';
            req.on('data', (chunk) => {
              body += chunk;
            });
            req.on('end', () => {
              try {
                const { email, message, cron, token } = JSON.parse(body);

                // Update local .booster_email
                const emailFile = path.join(process.cwd(), '.booster_email');
                fs.writeFileSync(emailFile, email);

                // Update local .booster_msg
                const msgFile = path.join(process.cwd(), '.booster_msg');
                fs.writeFileSync(msgFile, message);

                // Update local .booster_token if provided
                if (token) {
                  const tokenFile = path.join(process.cwd(), '.booster_token');
                  fs.writeFileSync(tokenFile, token);
                }

                // Update local auto-commit.yml
                const workflowFile = path.join(process.cwd(), '.github/workflows/auto-commit.yml');
                if (fs.existsSync(workflowFile)) {
                  let content = fs.readFileSync(workflowFile, 'utf8');
                  const cronRegex = /(-\s*cron:\s*['"])([^'"]+)(['"])/;
                  if (cronRegex.test(content)) {
                    content = content.replace(cronRegex, `$1${cron}$3`);
                  } else {
                    const scheduleIndex = content.indexOf('schedule:');
                    if (scheduleIndex !== -1) {
                      const before = content.substring(0, scheduleIndex + 9);
                      const after = content.substring(scheduleIndex + 9);
                      content = `${before}\n    - cron: '${cron}'${after}`;
                    }
                  }
                  fs.writeFileSync(workflowFile, content);
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));

                // Reset last run to current time to prevent catch-up loop on config change
                const lastRunFile = path.join(process.cwd(), '.booster_last_run');
                fs.writeFileSync(lastRunFile, String(Date.now()));

                // Restart local scheduler with new cron/details
                runLocalScheduler();
              } catch (error: any) {
                console.error('[save-config-api] Error:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error.message }));
              }
            });
          } else if (req.url?.startsWith('/api/save-status') && req.method === 'POST') {
            let body = '';
            req.on('data', (chunk) => {
              body += chunk;
            });
            req.on('end', () => {
              try {
                const { active } = JSON.parse(body);

                // Update local active status
                const activeFile = path.join(process.cwd(), '.booster_active');
                fs.writeFileSync(activeFile, String(active));

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));

                // Reset last run to current time if turning ON to start scheduling from now
                if (active) {
                  const lastRunFile = path.join(process.cwd(), '.booster_last_run');
                  fs.writeFileSync(lastRunFile, String(Date.now()));
                }

                // Restart or stop scheduler
                runLocalScheduler();
              } catch (error: any) {
                console.error('[save-status-api] Error:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error.message }));
              }
            });
          } else if (req.url?.startsWith('/api/activity-log') && req.method === 'GET') {
            try {
              const logFile = path.join(process.cwd(), 'activity_log.txt');
              let logLines: any[] = [];
              if (fs.existsSync(logFile)) {
                const content = fs.readFileSync(logFile, 'utf8');
                const lines = content.split('\n').filter(line => line.trim().length > 0);
                for (const line of lines) {
                  const colonIndex = line.indexOf(':');
                  if (colonIndex !== -1) {
                    const type = line.substring(0, colonIndex).trim();
                    const rest = line.substring(colonIndex + 1).trim();
                    const dashIndex = rest.indexOf(' - ');
                    if (dashIndex !== -1) {
                      const timeStr = rest.substring(0, dashIndex).trim();
                      const message = rest.substring(dashIndex + 3).trim();
                      logLines.push({
                        type,
                        time: timeStr,
                        message
                      });
                    } else {
                      logLines.push({
                        type: 'Log',
                        time: new Date().toISOString(),
                        message: line
                      });
                    }
                  }
                }
              }
              logLines.reverse(); // Latest runs first
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ logs: logLines }));
            } catch (error: any) {
              console.error('[activity-log-api] Error:', error);
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: error.message }));
            }
          } else if (req.url?.startsWith('/api/bulk-commit') && req.method === 'POST') {
            let body = '';
            req.on('data', (chunk) => {
              body += chunk;
            });
            req.on('end', () => {
              try {
                const { count, email, message, owner, repo, token } = JSON.parse(body);
                
                const logFile = path.join(process.cwd(), 'activity_log.txt');
                if (!fs.existsSync(logFile)) {
                  fs.writeFileSync(logFile, '# GitHub Activity Booster - Activity Log\n');
                }

                // Set headers for streaming Ndjson
                res.writeHead(200, {
                  'Content-Type': 'application/x-ndjson',
                  'Cache-Control': 'no-cache',
                  'Connection': 'keep-alive',
                });

                // Temporary configure authenticated remote url if we have details
                let originalRemote = '';
                try {
                  try {
                    originalRemote = execSync('git remote get-url origin', { encoding: 'utf8' }).trim();
                    if (token && owner && repo) {
                      const authenticatedRemote = `https://x-access-token:${token}@github.com/${owner}/${repo}.git`;
                      execSync(`git remote set-url origin "${authenticatedRemote}"`);
                    }
                  } catch (err) {
                    // Ignore remote URL configuration error
                  }

                  // Fetch and rebase before committing to prevent out-of-sync branch issues
                  try {
                    res.write(JSON.stringify({ status: 'syncing', message: 'Syncing local repo with remote origin...' }) + '\n');
                    execSync('git fetch origin');
                    const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
                    execSync(`git rebase origin/${currentBranch} --autostash -X theirs`);
                  } catch (syncErr) {
                    console.warn('[bulk-commit-api] Sync failed, aborting rebase:', syncErr);
                    try {
                      execSync('git rebase --abort');
                    } catch (abortErr) {}
                  }

                  const name = email.split('@')[0] || 'Booster';
                  const env = {
                    ...process.env,
                    GIT_AUTHOR_NAME: name,
                    GIT_AUTHOR_EMAIL: email,
                    GIT_COMMITTER_NAME: name,
                    GIT_COMMITTER_EMAIL: email,
                  };

                  // Perform commits locally
                  for (let i = 0; i < count; i++) {
                    const dateStr = new Date().toISOString();
                    const commitMsg = `${message} [boost ${i + 1}/${count}]`;
                    fs.appendFileSync(logFile, `\nBulk commit ${i + 1}/${count}: ${dateStr} - ${commitMsg}`);
                    execSync('git add activity_log.txt');
                    execSync(`git commit -m "${commitMsg}" --no-gpg-sign`, { env });
                    
                    // Stream current progress to the browser
                    res.write(JSON.stringify({ status: 'committing', progress: i + 1 }) + '\n');
                  }

                  // Push
                  res.write(JSON.stringify({ status: 'pushing', message: 'Pushing all commits to GitHub...' }) + '\n');
                  try {
                    const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
                    execSync(`git push -u origin "${currentBranch}"`);
                  } catch (pushErr) {
                    console.warn('[bulk-commit-api] Push failed, attempting force push:', pushErr);
                    try {
                      const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
                      execSync(`git push -f origin "${currentBranch}"`);
                    } catch (forceErr: any) {
                      throw new Error(`Push failed: ${forceErr.message}`);
                    }
                  }
                } finally {
                  // Restore original remote URL
                  if (originalRemote) {
                    try {
                      execSync(`git remote set-url origin "${originalRemote}"`);
                    } catch (restoreErr) {
                      console.warn('[bulk-commit-api] Failed to restore remote URL:', restoreErr);
                    }
                  }
                }

                res.write(JSON.stringify({ status: 'done', success: true }) + '\n');
                res.end();
              } catch (error: any) {
                console.error('[bulk-commit-api] Error:', error);
                res.write(JSON.stringify({ error: error.message }) + '\n');
                res.end();
              }
            });
          } else if (req.url?.startsWith('/api/multi-account-add') && req.method === 'POST') {
            let body = '';
            req.on('data', (chunk) => {
              body += chunk;
            });
            req.on('end', () => {
              try {
                const { id, token, user, owner, repo, config, active } = JSON.parse(body);

                // Load or create accounts file
                const accountsFile = path.join(process.cwd(), '.booster_accounts.json');
                let accountsData: any = { accounts: [] };
                if (fs.existsSync(accountsFile)) {
                  accountsData = JSON.parse(fs.readFileSync(accountsFile, 'utf8'));
                }

                // Add or update account
                const existingIndex = accountsData.accounts.findIndex((a: any) => a.id === id);
                const existingAccount = existingIndex >= 0 ? accountsData.accounts[existingIndex] : null;

                const accountRecord = {
                  id,
                  token: token !== undefined ? token : (existingAccount ? existingAccount.token : ''),
                  user,
                  owner,
                  repo,
                  config,
                  active,
                  lastRun: existingAccount ? (existingAccount.lastRun || 0) : 0,
                };

                if (existingIndex >= 0) {
                  accountsData.accounts[existingIndex] = accountRecord;
                } else {
                  accountsData.accounts.push(accountRecord);
                }

                fs.writeFileSync(accountsFile, JSON.stringify(accountsData, null, 2));

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));

                // Restart scheduler to pick up new account
                runMultiAccountScheduler();
              } catch (error: any) {
                console.error('[multi-account-add-api] Error:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error.message }));
              }
            });
          } else if (req.url?.startsWith('/api/multi-account-list') && req.method === 'GET') {
            try {
              const accountsFile = path.join(process.cwd(), '.booster_accounts.json');
              let accountsData: any = { accounts: [] };
              if (fs.existsSync(accountsFile)) {
                accountsData = JSON.parse(fs.readFileSync(accountsFile, 'utf8'));
              }

              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(accountsData));
            } catch (error: any) {
              console.error('[multi-account-list-api] Error:', error);
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: error.message }));
            }
          } else if (req.url?.startsWith('/api/multi-account-remove') && req.method === 'POST') {
            let body = '';
            req.on('data', (chunk) => {
              body += chunk;
            });
            req.on('end', () => {
              try {
                const { id } = JSON.parse(body);

                const accountsFile = path.join(process.cwd(), '.booster_accounts.json');
                if (fs.existsSync(accountsFile)) {
                  const accountsData = JSON.parse(fs.readFileSync(accountsFile, 'utf8'));
                  accountsData.accounts = accountsData.accounts.filter((a: any) => a.id !== id);
                  fs.writeFileSync(accountsFile, JSON.stringify(accountsData, null, 2));
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));

                runMultiAccountScheduler();
              } catch (error: any) {
                console.error('[multi-account-remove-api] Error:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error.message }));
              }
            });
          } else if (req.url?.startsWith('/api/multi-account-push-all') && req.method === 'POST') {
            res.writeHead(200, {
              'Content-Type': 'application/x-ndjson',
              'Cache-Control': 'no-cache',
              'Connection': 'keep-alive',
            });

            (async () => {
              try {
                const accountsFile = path.join(process.cwd(), '.booster_accounts.json');
                if (!fs.existsSync(accountsFile)) {
                  res.write(JSON.stringify({ status: 'error', message: 'No accounts configured.' }) + '\n');
                  res.end();
                  return;
                }

                const accountsData = JSON.parse(fs.readFileSync(accountsFile, 'utf8'));
                const accounts = accountsData.accounts || [];
                const activeAccounts = accounts.filter((a: any) => a.active);

                if (activeAccounts.length === 0) {
                  res.write(JSON.stringify({ status: 'error', message: 'No active accounts found.' }) + '\n');
                  res.end();
                  return;
                }

                res.write(JSON.stringify({ status: 'start', total: activeAccounts.length }) + '\n');

                for (let i = 0; i < activeAccounts.length; i++) {
                  const account = activeAccounts[i];
                  res.write(JSON.stringify({ status: 'processing', index: i, accountId: account.id, message: `Committing via GitHub API for ${account.id}...` }) + '\n');

                  try {
                    if (!account.token) {
                      throw new Error('No token stored for this account. Re-add the account to save the token.');
                    }

                    const decodedToken = decodeAccountToken(account.token);
                    const authorName = account.user?.name || account.user?.login || 'Booster';
                    const authorEmail = account.config?.email || `${account.user?.login}@users.noreply.github.com`;
                    const message = account.config?.message || 'chore: auto boost activity [skip ci]';
                    const commitMsg = `${message} [manual boost]`;

                    await pushCommitViaApi(decodedToken, account.owner, account.repo, commitMsg, authorName, authorEmail);

                    // Update last run time in accountsData
                    const idx = accountsData.accounts.findIndex((a: any) => a.id === account.id);
                    if (idx >= 0) accountsData.accounts[idx].lastRun = Date.now();

                    res.write(JSON.stringify({ status: 'success', index: i, accountId: account.id }) + '\n');
                  } catch (err: any) {
                    console.error(`[multi-account-push-all] Failed for ${account.id}:`, err.message);
                    res.write(JSON.stringify({ status: 'failed', index: i, accountId: account.id, error: err.message }) + '\n');
                  }
                }

                // Save updated accounts (lastRun timestamps)
                fs.writeFileSync(accountsFile, JSON.stringify(accountsData, null, 2));
                res.write(JSON.stringify({ status: 'done' }) + '\n');
                res.end();
              } catch (error: any) {
                console.error('[multi-account-push-all] Error:', error);
                res.write(JSON.stringify({ status: 'error', message: error.message }) + '\n');
                res.end();
              }
            })()
          } else {
            next();
          }
        });
      }
    }
  ],
})
