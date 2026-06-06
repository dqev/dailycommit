import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

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
        server.middlewares.use((req, res, next) => {
          if (req.url?.startsWith('/api/bulk-commit') && req.method === 'POST') {
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

                // Temporary configure authenticated remote url if we have details
                let originalRemote = '';
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
                  console.log('[bulk-commit-api] Syncing local repo with remote origin...');
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
                console.log(`[bulk-commit-api] Creating ${count} commits locally for user email: ${email}...`);

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
                }

                // Push
                console.log('[bulk-commit-api] Pushing to GitHub...');
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

                // Restore original remote URL
                if (originalRemote) {
                  execSync(`git remote set-url origin "${originalRemote}"`);
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, count }));
              } catch (error: any) {
                console.error('[bulk-commit-api] Error:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error.message }));
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
