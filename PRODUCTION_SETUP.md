# Production Setup Guide

## Quick Start (Vercel Deployment)

1. **Deploy to Vercel**
   ```bash
   npm i -g vercel
   vercel
   ```

2. **Configure Environment Variables** in Vercel Dashboard:

   | Variable | Description | Example |
   |----------|-------------|---------|
   | `SCHEDULER_OWNER` | Your GitHub username | `johndoe` |
   | `SCHEDULER_REPO` | Name of repo to store scheduler config | `my-scheduler` |
   | `GITHUB_TOKEN` | GitHub PAT with repo scope | `ghp_xxx` |
   | `CRON_SECRET` | Optional: secret for cron auth | `mysecret` |

3. **Create the Scheduler Repository**
   - Create a new private repo on GitHub (e.g., `my-scheduler`)
   - Add a file called `accounts.json` with content: `[]`
   - Give the GITHUB_TOKEN push access to this repo

4. **Enable Cron Jobs** in Vercel Dashboard
   - Go to Settings → Cron Jobs
   - The cron is already configured in `vercel.json`

---

## How the Real Scheduler Works

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Vercel (Serverless)                      │
│  ┌──────────────────┐    ┌────────────────────────────────┐ │
│  │   Frontend SPA   │    │   API Routes                   │ │
│  │   (React App)    │    │   - scheduler-config (cron)    │ │
│  └────────┬─────────┘    │   - other endpoints            │ │
│           │              └────────────────┬───────────────┘ │
└───────────┼───────────────────────────────┼─────────────────┘
            │                               │
            ▼                               ▼
    ┌────────────────┐            ┌─────────────────────┐
    │ GitHub Browser │            │  Scheduler Repo     │
    │ (Direct API)   │            │  (accounts.json)    │
    └────────────────┘            └──────────┬──────────┘
                                             │
                                             ▼
                                   ┌─────────────────────┐
                                   │  Target Repos       │
                                   │  (activity_log.txt) │
                                   └─────────────────────┘
```

### Flow

1. **Add Account** → Frontend calls `/api/scheduler-config` → Saves to `accounts.json` in scheduler repo
2. **Cron Runs** → Vercel calls `/api/scheduler-config` at scheduled times → Reads accounts → Pushes commits to each repo
3. **Each commit** → Uses GitHub Contents API to update `activity_log.txt`

### Cron Schedule

Currently set to run **4 times daily** at 6:00, 10:00, 14:00, and 18:00 UTC:

```json
"crons": [
  { "path": "/api/scheduler-config", "schedule": "0 6,10,14,18 * * *" }
]
```

---

## Setting Up Multiple Accounts

### Option 1: Via Frontend

1. Connect a GitHub account in the app
2. Go to Multi-Account Manager
3. Add the account to the scheduler

### Option 2: Manual Setup

Edit `accounts.json` directly in your scheduler repo:

```json
[
  {
    "id": "owner/repo1",
    "owner": "owner",
    "repo": "repo1",
    "token": "encoded_token_here",
    "user": { "login": "owner", "name": "Owner Name" },
    "config": {
      "email": "owner@email.com",
      "message": "chore: daily boost [skip ci]"
    },
    "active": true
  }
]
```

---

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `SCHEDULER_OWNER` | Yes | Your GitHub username |
| `SCHEDULER_REPO` | Yes | Repo to store scheduler config |
| `GITHUB_TOKEN` | Yes | GitHub PAT with `repo` scope |
| `CRON_SECRET` | No | Secret to protect cron endpoint |
| `NODE_ENV` | Auto | Set to `production` in Vercel |

### Creating a GitHub Token

1. Go to GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Click "Generate new token (classic)"
3. Select scopes: `repo` (full control)
4. Copy the token and add to Vercel

---

## Troubleshooting

### "Scheduler not configured"
- Check that `SCHEDULER_OWNER`, `SCHEDULER_REPO`, and `GITHUB_TOKEN` are set in Vercel env vars

### "Failed to get file: 404"
- Create the `accounts.json` file in your scheduler repo with content: `[]`

### Commits not appearing
- Check the Vercel function logs in Dashboard → Functions
- Verify the target repo has an `activity_log.txt` file
- Ensure the token has push access to the target repo

### Rate Limiting
- GitHub API allows 5000 requests/hour for authenticated requests
- The scheduler is designed to make minimal API calls (1-2 per account)

---

## Local Development

```bash
# Run the app
npm run dev

# Test the scheduler endpoint locally
curl -X POST http://localhost:5173/api/scheduler-config \
  -H "Content-Type: application/json" \
  -d '{"action": "list"}'
```