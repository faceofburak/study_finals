# PlanFlow — Intelligent Study Planner

A polished, production-quality planner app. Works offline, runs statically, deploys to GitHub Pages.

---

## Features

- ✨ Natural language schedule generation (no API key needed)
- 📅 Interactive day cards with collapse/expand
- ✅ Checkbox task completion
- 🔀 Drag & drop task reordering
- 📊 Analytics: streak, completion %, study hours, subject progress
- 🔄 Optional GitHub sync for cross-device persistence
- 📤 Export / Import JSON backup
- 📱 Mobile-first, thumb-friendly design

---

## Deploy to GitHub Pages

### 1. Create a new GitHub repository
e.g. `my-planflow`

### 2. Upload files
Upload `index.html`, `style.css`, `script.js` to the repo root.

### 3. Enable GitHub Pages
- Go to Settings → Pages
- Source: Deploy from branch → `main` → `/root`
- Save

Your app is live at: `https://YOUR_USERNAME.github.io/my-planflow`

---

## Optional: Enable GitHub Sync (Cross-Device Persistence)

Without this, data is saved to your browser's localStorage only.

To sync across devices:

### 1. Create a Personal Access Token
- GitHub → Settings → Developer Settings → Personal Access Tokens → Fine-grained tokens
- Grant **Contents: Read & Write** to your planner repo

### 2. Create a data file
In your repo, create an empty file named `planner-data.json` with content `{}`

### 3. Configure in the app
- Open the app → sidebar → Settings
- Enter your GitHub Token, username, and repo name
- Click "Save & Test Connection"

Or hardcode in `script.js`:
```js
const GITHUB_TOKEN = "ghp_yourtoken";
const REPO_OWNER   = "your-username";
const REPO_NAME    = "my-planflow";
```

> ⚠️ Note: Hardcoding a token makes it visible in your repo. Only do this for private repos, or use the Settings UI instead.

---

## Schedule Generator — Prompt Examples

```
Mech306 final June 5 chapters 0-24 CNC coding.
Heat Transfer June 9 chapters 3 5 6 7 8 9 11.
Control June 10 chapters 5-8.
No studying May 30-June 1.
Morning run every day.
Leave lots of free time.
```

```
Control systems final June 10 chapters 5-8.
Study mostly afternoons.
Gym every morning.
No studying after 9pm.
Light weekends.
```

```
Prepare for software engineering interview June 15.
DSA practice every weekday.
System design twice a week.
Keep Sundays mostly free.
Heavy workload.
```

---

## Tech Stack

- Vanilla JavaScript (no frameworks)
- CSS custom properties + glassmorphism
- Syne + DM Sans from Google Fonts
- GitHub REST API for optional persistence
- localStorage for offline persistence

---

## File Structure

```
index.html    — App shell & all views
style.css     — Full styling
script.js     — App logic, parser, scheduler engine
README.md     — This file
```
