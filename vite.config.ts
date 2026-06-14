import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

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

          execSync('git add activity_log.txt');
          execSync(`git commit -m "${commitMsg}" --no-gpg-sign`, { env });
          console.log(`[local-scheduler] Successfully created local commit for scheduled run ${nextRun.toLocaleString()}.`);
        } catch (err: any) {
          console.error('[local-scheduler] Commit execution failed:', err.message);
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

// https://vite.dev/config/
export default defineConfig({
  server: {
    watch: {
      ignored: [
        '**/activity_log.txt',
        '**/.git/**',
        '**/dist/**',
        '**/node_modules/**'
      ]
    }
  },
  plugins: [
    react(),
    {
      name: 'bulk-commit-api',
      configureServer(server) {
        // Run scheduler on startup
        runLocalScheduler();

        server.middlewares.use((req, res, next) => {
          if (req.url?.startsWith('/api/save-config') && req.method === 'POST') {
            let body = '';
            req.on('data', (chunk) => {
              body += chunk;
            });
            req.on('end', () => {
              try {
                const { email, message, cron } = JSON.parse(body);

                // Update local .booster_email
                const emailFile = path.join(process.cwd(), '.booster_email');
                fs.writeFileSync(emailFile, email);

                // Update local .booster_msg
                const msgFile = path.join(process.cwd(), '.booster_msg');
                fs.writeFileSync(msgFile, message);

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
          } else {
            next();
          }
        });
      }
    }
  ],
})
