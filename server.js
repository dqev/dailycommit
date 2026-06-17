import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Serve static files from dist folder (the built frontend)
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  
  // SPA fallback - serve index.html for all non-API routes
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(distPath, 'index.html'));
    }
  });
}

// In-memory storage for accounts (for the scheduler)
let accounts = [];

// Helper: decode token (same as frontend)
function decodeToken(encoded) {
  if (!encoded) return null;
  try {
    if (encoded.startsWith('ghp_') || encoded.startsWith('github_pat_')) {
      return encoded;
    }
    return atob(encoded).split('').reverse().join('');
  } catch (e) {
    return encoded;
  }
}

// Helper: push commit via GitHub API
async function pushCommitViaGitHubApi(token, owner, repo, commitMessage, authorName, authorEmail) {
  const filePath = 'activity_log.txt';
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;
  
  // Get current file
  const getRes = await fetch(apiUrl, {
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
    }
  });
  
  let sha;
  let currentContent = '# GitHub Activity Booster - Activity Log\n';
  
  if (getRes.status === 200) {
    const data = await getRes.json();
    sha = data.sha;
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
  } else if (getRes.status !== 404) {
    throw new Error(`Failed to read file: HTTP ${getRes.status}`);
  }
  
  // Append new content
  const dateStr = new Date().toISOString();
  const newContent = currentContent.trimEnd() + `\nAuto-commit for ${owner}/${repo}: ${dateStr} - ${commitMessage}\n`;
  const encodedContent = btoa(unescape(encodeURIComponent(newContent)));
  
  // Push the commit
  const putRes = await fetch(apiUrl, {
    method: 'PUT',
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: commitMessage,
      content: encodedContent,
      sha: sha,
      author: { name: authorName, email: authorEmail },
      committer: { name: authorName, email: authorEmail }
    }),
  });
  
  if (!putRes.ok) {
    const errData = await putRes.json().catch(() => ({ message: `HTTP ${putRes.status}` }));
    throw new Error(errData.message || `HTTP ${putRes.status}`);
  }
  
  return putRes.json();
}

// ============ API ROUTES ============

// Get all accounts
app.get('/api/multi-account-list', (req, res) => {
  res.json({ accounts });
});

// Add or update an account
app.post('/api/multi-account-add', (req, res) => {
  const account = req.body;
  const existingIndex = accounts.findIndex(a => a.id === account.id);
  
  if (existingIndex >= 0) {
    accounts[existingIndex] = account;
  } else {
    accounts.push(account);
  }
  
  res.json({ success: true, account });
});

// Remove an account
app.post('/api/multi-account-remove', (req, res) => {
  const { id } = req.body;
  accounts = accounts.filter(a => a.id !== id);
  res.json({ success: true });
});

// Push to all accounts
app.post('/api/multi-account-push-all', async (req, res) => {
  const activeAccounts = accounts.filter(a => a.active);
  
  res.setHeader('Content-Type', 'application/x-ndjson');
  
  for (const account of activeAccounts) {
    res.write(JSON.stringify({ status: 'processing', accountId: account.id }) + '\n');
    
    try {
      if (!account.token) {
        throw new Error('No token stored for this account');
      }
      
      const token = decodeToken(account.token);
      if (!token) {
        throw new Error('Failed to decode token');
      }
      
      const authorName = account.user?.name || account.user?.login || 'Booster';
      const authorEmail = account.config?.email || `${account.user?.login}@users.noreply.github.com`;
      const message = account.config?.message || 'chore: auto boost activity [skip ci]';
      const commitMsg = `${message} [manual boost]`;
      
      await pushCommitViaGitHubApi(token, account.owner, account.repo, commitMsg, authorName, authorEmail);
      
      // Update last run
      account.lastRun = Date.now();
      
      res.write(JSON.stringify({ status: 'success', accountId: account.id }) + '\n');
    } catch (err) {
      console.error(`[push-all] Failed for ${account.id}:`, err.message);
      res.write(JSON.stringify({ status: 'failed', accountId: account.id, error: err.message }) + '\n');
    }
  }
  
  res.end();
});

// Bulk commit endpoint
app.post('/api/bulk-commit', express.json(), async (req, res) => {
  const { count, message, owner, repo, token } = req.body;
  
  res.setHeader('Content-Type', 'application/x-ndjson');
  
  try {
    res.write(JSON.stringify({ status: 'syncing' }) + '\n');
    
    let currentSha;
    let currentContent = '# GitHub Activity Booster - Activity Log\n';
    
    // Get initial file state
    const apiFilePath = `https://api.github.com/repos/${owner}/${repo}/contents/activity_log.txt`;
    const getRes = await fetch(apiFilePath, {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
      }
    });
    
    if (getRes.status === 200) {
      const data = await getRes.json();
      currentSha = data.sha;
      try {
        const base64Clean = data.content.replace(/\s/g, '');
        currentContent = decodeURIComponent(escape(atob(base64Clean)));
      } catch (e) {
        currentContent = atob(data.content.replace(/\s/g, ''));
      }
    } else if (getRes.status !== 404) {
      throw new Error(`Failed to read file: HTTP ${getRes.status}`);
    }
    
    res.write(JSON.stringify({ status: 'committing', progress: 0 }) + '\n');
    
    for (let i = 0; i < count; i++) {
      const dateStr = new Date().toISOString();
      const commitMsg = `${message} [boost ${i + 1}/${count}]`;
      currentContent = currentContent.trimEnd() + `\nManual boost: ${dateStr} - ${commitMsg}\n`;
      const encodedContent = btoa(unescape(encodeURIComponent(currentContent)));
      
      const putRes = await fetch(apiFilePath, {
        method: 'PUT',
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: commitMsg,
          content: encodedContent,
          sha: currentSha,
        }),
      });
      
      if (!putRes.ok) {
        const errData = await putRes.json().catch(() => ({ message: `HTTP ${putRes.status}` }));
        throw new Error(errData.message || `HTTP ${putRes.status}`);
      }
      
      const result = await putRes.json();
      currentSha = result.content.sha;
      
      res.write(JSON.stringify({ status: 'committing', progress: i + 1 }) + '\n');
      
      // Small delay to avoid rate limiting
      if (i < count - 1) {
        await new Promise(r => setTimeout(r, 100));
      }
    }
    
    res.write(JSON.stringify({ status: 'pushing' }) + '\n');
    res.write(JSON.stringify({ status: 'done' }) + '\n');
  } catch (err) {
    console.error('[bulk-commit] Error:', err);
    res.write(JSON.stringify({ status: 'error', error: err.message }) + '\n');
  }
  
  res.end();
});

// Auto-scheduler: Run commits for all active accounts at scheduled times
// This runs in the background and can be triggered by cron
let schedulerInterval = null;

function startScheduler() {
  // Simple scheduler: run every hour
  // In production, you'd use node-cron or similar
  console.log('[Scheduler] Auto-commit scheduler started');
  
  // Check every minute if we should run
  schedulerInterval = setInterval(async () => {
    const now = new Date();
    const minute = now.getUTCMinutes();
    
    // Run at minute 0 of each hour
    if (minute !== 0) return;
    
    const activeAccounts = accounts.filter(a => a.active);
    console.log(`[Scheduler] Running auto-commits for ${activeAccounts.length} accounts...`);
    
    for (const account of activeAccounts) {
      try {
        if (!account.token) {
          console.log(`[Scheduler] Skipping ${account.id}: no token`);
          continue;
        }
        
        const token = decodeToken(account.token);
        if (!token) {
          console.log(`[Scheduler] Skipping ${account.id}: failed to decode token`);
          continue;
        }
        
        const authorName = account.user?.name || account.user?.login || 'Booster';
        const authorEmail = account.config?.email || `${account.user?.login}@users.noreply.github.com`;
        const message = account.config?.message || 'chore: auto boost activity [skip ci]';
        
        await pushCommitViaGitHubApi(token, account.owner, account.repo, message, authorName, authorEmail);
        
        account.lastRun = Date.now();
        console.log(`[Scheduler] ✓ Pushed commit for ${account.id}`);
      } catch (err) {
        console.error(`[Scheduler] ✗ Failed for ${account.id}:`, err.message);
      }
    }
  }, 60000); // Check every minute
}

// Start scheduler (only if not in serverless mode)
if (process.env.SCHEDULER_ENABLED !== 'false') {
  startScheduler();
}

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📁 Serving frontend from: ${distPath}`);
});