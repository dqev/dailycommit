# Daily Commit

> Keep your GitHub contribution streak alive — automatically.

**Daily Commit** is a browser-based dashboard that automates daily GitHub commits using GitHub Actions, so your contribution heatmap stays green even when you're away. No backend. No database. Everything runs serverlessly, directly from your browser.

---

## ✨ Features

| Feature | Description |
|---|---|
| 🔒 **Obfuscated Token Storage** | Your GitHub PAT is Base64-obfuscated in `localStorage` to prevent browser extension scrapers |
| ⚡ **Mass Boost Engine** | Push 1–100,000 commits in rapid succession to fill your heatmap instantly |
| 📅 **Auto Scheduler** | GitHub Actions runs daily commits on a cron schedule you configure |
| 🛡️ **Streak Bulletproof Mode** | Runs twice-daily or every 6 hours to survive GitHub Actions queue delays |
| 🌡️ **Real Contribution Heatmap** | Live GitHub GraphQL API feed of your actual contribution calendar |
| 🔁 **One-click Repo Initialization** | Automatically pushes the workflow file, config files, and activity log to any repo |
| 🚫 **Zero-Backend** | No server, no database. Requests go directly from your browser to `api.github.com` |
| 🧹 **No Token Leakage** | `try...finally` block in local bulk commit engine always restores git remote URL |

---

## 🚀 Getting Started

### Prerequisites

- A GitHub account
- A dedicated **tracking repository** (e.g. `username/activity`) — can be empty
- A GitHub **Personal Access Token (PAT)** with `repo` and `workflow` scopes

### Create a PAT

1. Go to [GitHub Settings → Developer Settings → Personal Access Tokens (classic)](https://github.com/settings/tokens)
2. Generate a new token with:
   - ✅ `repo` scope (full repository access)
   - ✅ `workflow` scope (to create and manage GitHub Actions)
3. Copy the token — you'll only see it once

### Connect

1. Visit the app at your deployment URL (or `http://localhost:5173` locally)
2. Click **Login** or **Get Started**
3. Enter your tracking repository path: `username/repo`
4. Paste your PAT token
5. Click **Connect Repository**

If your repository doesn't have the auto-commit workflow yet, the dashboard will detect this and offer a one-click **Initialize Auto-Committer Workflow** button.

---

## 🛠️ Local Development

```bash
# Clone the repository
git clone https://github.com/dqev/dailycommit.git
cd dailycommit

# Install dependencies
npm install

# Start the development server
npm run dev
```

The dev server runs at `http://localhost:5173`. The local environment also enables a fast **bulk commit engine** — instead of pushing individual commits via the API (which is slower), the local server generates all commits using git directly and pushes them in a single batch.

### Build for Production

```bash
npm run build
```

---

## 🔐 Security Architecture

Daily Commit is designed with privacy-first principles:

- **No external servers** — all API calls go directly to `api.github.com` and `api.github.com/graphql`
- **Obfuscated token storage** — the PAT is stored using Base64 reversal encoding in `localStorage`, not in plaintext
- **No token in workflow files** — GitHub Actions uses its built-in temporary `GITHUB_TOKEN` permissions, not your PAT
- **Clean git remote URLs** — the local bulk engine always restores the original remote URL in a `finally` block, even on failures

---

## ⚙️ Configuration

Once connected, you can configure the auto-committer from the **Configuration** panel:

| Setting | Description |
|---|---|
| **GitHub Commit Email** | Must match your primary GitHub email for contributions to count |
| **Commit Message** | Custom message used by the daily auto-commit |
| **Schedule** | Choose from presets or enter a custom cron expression |

### Schedule Presets

| Preset | Cron | Description |
|---|---|---|
| Morning | `30 8 * * *` | 08:30 UTC (14:00 IST) |
| Midday | `0 12 * * *` | 12:00 UTC (17:30 IST) |
| Evening | `0 18 * * *` | 18:00 UTC (23:30 IST) |
| Night | `0 22 * * *` | 22:00 UTC (03:30 IST) |
| **Streak Safe** | `0 8,20 * * *` | Twice daily — guards against single run delays |
| **Streak Bulletproof** | `0 */6 * * *` | Every 6 hours — maximum streak protection |

> **Note:** GitHub Actions cron jobs run in UTC and may be delayed by up to 15–60 minutes during high queue traffic. Using a high-frequency schedule ensures commits still land within the calendar day.

---

## 🧪 How Auto-Commits Work

1. **GitHub Actions Scheduler** — when enabled, a cron job triggers daily on the configured schedule
2. **Workflow runs** — the workflow appends a timestamped line to `activity_log.txt` and pushes a commit
3. **Heatmap registers** — GitHub counts the commit against your contribution profile calendar
4. **You never need to open your laptop** — the commit happens in the cloud

---

## 🧰 Tech Stack

- **Frontend** — React + TypeScript (Vite)
- **Styling** — Vanilla CSS, Cooper font, Outfit font
- **Icons** — `reicon-react`
- **Heatmap** — `cal-heatmap`
- **Confetti** — `canvas-confetti`
- **CI/CD** — GitHub Actions
- **APIs** — GitHub REST v3 + GraphQL v4

---

## 📄 License

MIT — feel free to fork, self-host, and adapt.

---

<p align="center">
  Made with ☕ and 🟩 by <a href="https://github.com/dqev">dqev</a>
</p>
