# Production Setup Guide

## How Auto-Commits Work

### In Production (Vercel)

The app is deployed as a **static SPA** on Vercel. Auto-commits work via **GitHub Actions** - each repository's workflow runs independently on GitHub's servers.

| Feature | How It Works |
|---------|--------------|
| **Single Account** | GitHub Actions workflow runs on schedule in your repo |
| **Multi-Account** | Each target repo has its own workflow configured |
| **Push to All** | Client-side via GitHub API directly from browser |

### Flow

1. **Initialize** → App pushes `.github/workflows/auto-commit.yml` to your repo
2. **GitHub Actions** → Runs on schedule (set in workflow file)
3. **Commits** → Made automatically without any server

---

## Setting Up Auto-Commits

### Step 1: Deploy to Vercel

```bash
npm i -g vercel
vercel
```

### Step 2: Connect Account in App

1. Enter your GitHub PAT
2. Enter owner/repo you want to boost
3. Click **"Initialize Auto-Committer Workflow"**

This pushes the workflow file to your repository.

### Step 3: Enable Workflow

The app automatically enables the workflow. You can also manually enable it:
- Go to **GitHub → Your Repo → Actions → Enable**

---

## Multi-Account Setup

Each account = one GitHub repository with the workflow configured.

### For Each Account:

1. Connect the account in the app
2. Click **"Initialize Auto-Committer Workflow"**
3. The workflow will run independently on GitHub

### How Push to All Works

In production, "Push to All" uses your browser to directly call GitHub API for each account. It works but requires you to keep the browser open briefly.

---

## API Endpoints (for localhost compatibility)

These endpoints exist for API compatibility when running locally:

| Endpoint | Purpose |
|----------|---------|
| `/api/save-config` | Save config (proxies to GitHub) |
| `/api/save-status` | Save status |
| `/api/activity-log` | Activity log |
| `/api/multi-account-list` | List accounts |
| `/api/multi-account-add` | Add account |
| `/api/multi-account-remove` | Remove account |
| `/api/multi-account-push-all` | Push to all |
| `/api/bulk-commit` | Bulk commit |

In production, these return success but the actual work is done client-side via GitHub API.

---

## Troubleshooting

### Workflow not running?
- Go to GitHub → Repo → Actions
- Check if workflow is enabled
- Check the workflow run logs

### Commits not appearing on heatmap?
- Make sure the commit email matches your GitHub account email
- Check `.booster_email` file in your repo

### Multi-account push fails?
- Ensure each account's token has push access to their repo
- Check browser console for errors