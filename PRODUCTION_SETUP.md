# Production Deployment Guide

## The Problem

Your app works in localhost but not in production because:

1. **No Backend Server**: The app uses API endpoints (`/api/*`) that only exist in development mode. Vercel deploys the frontend as a static SPA - there's no server to handle these requests.

2. **GitHub Actions Runs Separately**: The auto-commit workflow runs on GitHub's servers, not in your browser. Each repository needs its own workflow configured.

3. **Tokens Not Shared**: GitHub Actions workflows need their own tokens - they can't access tokens stored in browser localStorage.

---

## Solution: Deploy with Backend Server

### Option 1: Deploy to Railway/Render/DigitalOcean (Recommended)

This backend serves both the frontend AND provides the API endpoints.

```bash
# Build the frontend first
npm run build

# Deploy the server.js to Railway/Render/DigitalOcean
# Set environment variables:
# - PORT=3001
# - SCHEDULER_ENABLED=true
```

### Option 2: Deploy Backend Separately on Vercel

You can deploy the server as a Vercel Serverless Function:

1. Install Vercel CLI: `npm i -g vercel`
2. Create `api/index.js` with the server logic
3. Deploy with `vercel`

---

## How Multi-Account Auto-Commits Actually Work

For **each account/repository** you want to auto-commit to:

1. **Connect the account** in the app (enter GitHub PAT + owner/repo)
2. **Initialize the workflow** - this pushes `.github/workflows/auto-commit.yml` to that repository
3. **GitHub Actions handles the rest** - it runs on a schedule and makes commits

The app stores accounts in localStorage so you can manage them, but each repository's workflow runs independently on GitHub.

---

## Key Points for Production

### Each Repository Needs:
- `.github/workflows/auto-commit.yml` - the workflow file
- `.booster_email` - email for commit attribution  
- `.booster_msg` - commit message

### To Initialize a Repository:
1. Connect account with a GitHub PAT that has repo access
2. Click "Initialize Auto-Committer Workflow" 
3. The app will push the required files via GitHub API

### For Multiple Accounts:
Each account = one GitHub repository with the workflow configured.

---

## Quick Fix for Current Deployment

If you just want the app working without rebuilding:

1. **Deploy to Railway** (free tier available): https://railway.app
2. Connect your GitHub repo
3. Set `SCHEDULER_ENABLED=true` in environment variables
4. Point your domain to the deployed server

The server will serve the frontend AND handle the API requests.

---

## Development vs Production

| Feature | Localhost | Production |
|---------|-----------|------------|
| API endpoints | ✅ Works (dev server) | ❌ Needs backend |
| localStorage | ✅ Works | ✅ Works (but limited) |
| Multi-account push | ✅ Via API | ✅ Via server API |
| Auto-scheduler | ⚠️ Not real | ✅ Runs on server |
| GitHub Actions | ✅ Per-repo | ✅ Per-repo |