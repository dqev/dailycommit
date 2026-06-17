// Scheduler management - stores accounts in a JSON file in a dedicated scheduler repo
// This allows the Vercel cron to read accounts and push commits

const SCHEDULER_REPO = process.env.SCHEDULER_REPO || 'auto-github-scheduler';
const SCHEDULER_OWNER = process.env.SCHEDULER_OWNER;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const ACCOUNTS_FILE = 'accounts.json';

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

async function getFileContent(path) {
  if (!GITHUB_TOKEN || !SCHEDULER_OWNER) {
    throw new Error('Scheduler not configured: Missing GITHUB_TOKEN or SCHEDULER_OWNER');
  }
  
  const apiUrl = `https://api.github.com/repos/${SCHEDULER_OWNER}/${SCHEDULER_REPO}/contents/${path}`;
  const res = await fetch(apiUrl, {
    headers: {
      'Authorization': `token ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
    }
  });
  
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to get file: ${res.status}`);
  
  const data = await res.json();
  const content = atob(data.content.replace(/\s/g, ''));
  return { content, sha: data.sha };
}

async function saveFileContent(path, content, message, sha) {
  if (!GITHUB_TOKEN || !SCHEDULER_OWNER) {
    throw new Error('Scheduler not configured');
  }
  
  const apiUrl = `https://api.github.com/repos/${SCHEDULER_OWNER}/${SCHEDULER_REPO}/contents/${path}`;
  const res = await fetch(apiUrl, {
    method: 'PUT',
    headers: {
      'Authorization': `token ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message,
      content: btoa(content),
      sha
    }),
  });
  
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || `Failed to save: ${res.status}`);
  }
  return res.json();
}

async function pushCommit(token, owner, repo, message, authorName, authorEmail) {
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/activity_log.txt`;
  
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
      currentContent = atob(data.content.replace(/\s/g, ''));
    }
  } else if (getRes.status !== 404) {
    throw new Error(`Failed to read: HTTP ${getRes.status}`);
  }
  
  // Append new content
  const dateStr = new Date().toISOString();
  const newContent = currentContent.trimEnd() + `\nScheduler: ${dateStr} - ${message}\n`;
  
  const putRes = await fetch(apiUrl, {
    method: 'PUT',
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message,
      content: btoa(unescape(encodeURIComponent(newContent))),
      sha,
      author: { name: authorName, email: authorEmail },
      committer: { name: authorName, email: authorEmail }
    }),
  });
  
  if (!putRes.ok) {
    const errData = await putRes.json().catch(() => ({ message: `HTTP ${putRes.status}` }));
    throw new Error(errData.message);
  }
  
  return putRes.json();
}

// Main scheduler handler
export default async function handler(req, res) {
  // Check if this is the cron job (GET request)
  if (req.method === 'GET' || req.method === 'POST') {
    // Check for cron secret
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.authorization;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}` && req.method === 'GET') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // If no scheduler repo configured, return error
    if (!GITHUB_TOKEN || !SCHEDULER_OWNER) {
      return res.status(200).json({ 
        message: 'Scheduler not configured. Set SCHEDULER_REPO, SCHEDULER_OWNER, and GITHUB_TOKEN in Vercel env vars.',
        configured: false 
      });
    }
    
    try {
      // Get accounts from scheduler repo
      const { content: existingContent, sha: existingSha } = await getFileContent(ACCOUNTS_FILE) || { content: '[]', sha: null };
      let accounts = [];
      try {
        accounts = JSON.parse(existingContent);
      } catch (e) {
        accounts = [];
      }
      
      const activeAccounts = accounts.filter(a => a.active);
      console.log(`[Scheduler] Running for ${activeAccounts.length} accounts`);
      
      const results = [];
      
      for (const account of activeAccounts) {
        try {
          const token = decodeToken(account.token);
          if (!token) {
            results.push({ account: account.id, status: 'skipped', reason: 'no token' });
            continue;
          }
          
          const authorName = account.user?.name || account.user?.login || 'Booster';
          const authorEmail = account.config?.email || `${account.user?.login}@users.noreply.github.com`;
          const message = account.config?.message || 'chore: scheduler boost [skip ci]';
          
          await pushCommit(token, account.owner, account.repo, message, authorName, authorEmail);
          
          results.push({ account: account.id, status: 'success' });
        } catch (err) {
          results.push({ account: account.id, status: 'failed', error: err.message });
        }
      }
      
      return res.status(200).json({
        message: `Completed: ${results.filter(r => r.status === 'success').length} success, ${results.filter(r => r.status === 'failed').length} failed`,
        results,
        configured: true
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
  
  // POST - Add/remove accounts (for frontend)
  if (req.method === 'POST') {
    const { action, account, token: userToken } = req.body;
    
    // Use the provided token or fallback to env token
    const token = userToken || GITHUB_TOKEN;
    
    if (!token || !SCHEDULER_OWNER) {
      return res.status(400).json({ error: 'Scheduler not configured' });
    }
    
    try {
      const { content: existingContent, sha: existingSha } = await getFileContent(ACCOUNTS_FILE) || { content: '[]', sha: null };
      let accounts = [];
      try {
        accounts = JSON.parse(existingContent);
      } catch (e) {
        accounts = [];
      }
      
      if (action === 'add' && account) {
        const existingIndex = accounts.findIndex(a => a.id === account.id);
        const newAccount = { ...account, active: true };
        if (existingIndex >= 0) {
          accounts[existingIndex] = newAccount;
        } else {
          accounts.push(newAccount);
        }
      } else if (action === 'remove' && account?.id) {
        accounts = accounts.filter(a => a.id !== account.id);
      } else if (action === 'toggle' && account?.id) {
        const acc = accounts.find(a => a.id === account.id);
        if (acc) acc.active = !acc.active;
      } else if (action === 'list') {
        const safeAccounts = accounts.map(a => ({
          id: a.id,
          owner: a.owner,
          repo: a.repo,
          user: a.user,
          config: a.config,
          active: a.active,
          lastRun: a.lastRun
        }));
        return res.status(200).json({ accounts: safeAccounts });
      }
      
      await saveFileContent(
        ACCOUNTS_FILE,
        JSON.stringify(accounts, null, 2),
        `Update scheduler accounts: ${action}`,
        existingSha
      );
      
      return res.status(200).json({ success: true, action, accountCount: accounts.length });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
  
  return res.status(405).json({ error: 'Method not allowed' });
}