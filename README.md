# Auto GitHub Activity Tracker & Heatmap

A sleek, mobile-friendly, flat-style dashboard designed to manage and monitor GitHub activity for a specific repository. It queries the user's real GitHub contribution graph (heatmap) and commit history, provides an instant manual "Push to Repo" tool to trigger commits, and includes a toggle to activate/deactivate a scheduled daily background auto-commit workflow powered by GitHub Actions.

---

## ✨ Features

- **Real-Time Heatmap Integration**: Displays a continuous rolling 365-day contribution calendar powered by [`cal-heatmap` (v4)](https://cal-heatmap.com/).
- **Instant Manual Commit**: Trigger a manual commit directly to a tracked log file (`activity_log.txt`) using the GitHub REST API, instantly boosting activity.
- **Automated Workflow Toggle**: Enable or disable a pre-configured scheduled GitHub Actions workflow (`auto-commit.yml`) to automatically push daily commits.
- **Premium Flat Aesthetic**: Built with a gorgeous, dark-themed, minimalist UI:
  - Global font: **Inter**
  - Background: `#181818` (flat, no gradients, no borders)
  - Cards & Panels: `#222222` (flat with `12px` rounded corners)
  - Typography: `#f5f5f5` flat light grey
- **Secure Authentication**: Connect safely using a Personal Access Token (PAT).

---

## 🚀 Getting Started

### 1. Prerequisites
You need a **GitHub Personal Access Token (PAT)** to interact with your repository.

#### How to Create a GitHub Classic PAT:
1. Go to your GitHub account settings: **Settings > Developer settings > Personal access tokens > Tokens (classic)**.
2. Click **Generate new token** -> **Generate new token (classic)**.
3. Set a descriptive name (e.g., `auto-github-dashboard`) and choose an expiration duration.
4. Select the following scopes:
   - **`repo`** (Full control of private repositories)
   - **`workflow`** (Update GitHub Action workflows)
5. Click **Generate token** and copy the generated token immediately (you won't be able to see it again!).

---

### 2. Local Installation

Follow these steps to run the application locally on your machine:

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/devchauhann/activity.git
   cd activity
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Start the Development Server**:
   ```bash
   npm run dev
   ```

4. Open `http://localhost:5173` in your browser.

---

### 3. Deploying to Vercel

This is a Single Page Application (SPA) built with Vite, React, and TypeScript. You can deploy it to Vercel for free:

1. **Install Vercel CLI** (Optional, or connect via Vercel Dashboard):
   ```bash
   npm install -g vercel
   ```

2. **Deploy**:
   ```bash
   vercel
   ```

3. **SPA Routing Configuration**:
   The project includes a `vercel.json` file in the root directory to handle clean SPA routing redirects, ensuring client-side routes are resolved correctly:
   ```json
   {
     "rewrites": [
       {
         "source": "/(.*)",
         "destination": "/index.html"
       }
     ]
   }
   ```

---

## 🛠️ Project Structure

- **`index.html`**: Root template referencing the global Google Fonts (Inter).
- **`src/index.css`**: Global design system, colors, utilities, and reset rules.
- **`src/services/github.ts`**: GitHub REST & GraphQL API client handling PAT validation, files, workflows, commits, and user metadata.
- **`src/components/GitHubConnect.tsx`**: A mathematically centered PAT authorization login component.
- **`src/components/Dashboard.tsx`**: Primary workflow, tracking panel, and manual commit triggers.
- **`src/components/ContributionGraph.tsx`**: Lightweight contribution graph container wrapping `cal-heatmap` implementation.
- **`.github/workflows/auto-commit.yml`**: Scheduled daily CRON job auto-pushing commits to `activity_log.txt`.
