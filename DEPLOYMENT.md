# Netlify Deployment Guide

## Prerequisites
1. GitHub account (for version control)
2. Netlify account (free at netlify.com)
3. Appwrite project already set up with credentials

## Step 1: Push to GitHub

```bash
cd /home/iredox/Desktop/games/tic-tac-toe

# Initialize git if not already done
git init

# Add files
git add .

# Commit
git commit -m "Initial commit: Multi-game platform"

# Create repo on GitHub (via github.com), then:
git remote add origin https://github.com/YOUR_USERNAME/tic-tac-toe.git
git branch -M main
git push -u origin main
```

## Step 2: Connect to Netlify

### Option A: Via Netlify UI (Recommended)
1. Go to [netlify.com](https://netlify.com)
2. Click "Add new site" → "Import an existing project"
3. Select GitHub and authorize
4. Choose your `tic-tac-toe` repository
5. Netlify will auto-detect the `netlify.toml` settings
6. Click "Deploy site"

### Option B: Via Netlify CLI
```bash
# Install Netlify CLI
npm install -g netlify-cli

# Login to Netlify
netlify login

# Deploy
cd /home/iredox/Desktop/games/tic-tac-toe
netlify deploy --prod
```

## Step 3: Set Environment Variables on Netlify

1. Go to your site on Netlify
2. Navigate to **Site settings** → **Build & deploy** → **Environment**
3. Click **Edit variables** and add:

```
VITE_APPWRITE_PROJECT_ID = 694d5a26002e778071ed
VITE_APPWRITE_ENDPOINT = https://fra.cloud.appwrite.io/v1
```

**Note:** The `APPWRITE_API_KEY` is sensitive - don't commit it. The frontend doesn't need it (only Appwrite functions need it server-side).

## Step 4: Configure Appwrite for Web

Your Appwrite instance needs to allow requests from your Netlify domain:

1. Go to your Appwrite console
2. Navigate to **Settings** → **Domains**
3. Add your Netlify domain: `https://your-site.netlify.app`

## Step 5: Deploy the Serverless Functions

The `makeMove` function needs to be deployed to Appwrite:

```bash
# From the functions/make-move directory
cd /home/iredox/Desktop/games/tic-tac-toe/functions/make-move

# Deploy using Appwrite CLI (if installed)
appwrite deploy function

# Or manually:
# 1. Go to Appwrite console
# 2. Navigate to Functions
# 3. Find "makeMove" function
# 4. Upload the src/main.js file
```

## Troubleshooting

### Build fails
- Check that `bun` is available on Netlify (it is by default)
- Verify all env variables are set in Netlify UI
- Check build logs in Netlify dashboard

### CORS errors
- Ensure your Netlify domain is whitelisted in Appwrite settings
- Check Appwrite API key in function environment variables

### Games don't load
- Verify Appwrite endpoint and project ID match
- Check browser console for errors
- Confirm Appwrite project has the `games` collection in `main` database

## Post-Deployment Checklist

- [ ] Frontend builds successfully
- [ ] Site loads at `your-site.netlify.app`
- [ ] Can create a game in the lobby
- [ ] Can join a game with Game ID
- [ ] Can make moves in games
- [ ] Real-time updates work
- [ ] No console errors

## Rollback

If something goes wrong:
```bash
# Revert to previous deployment
netlify deploy --prod --alias previous
```

Or use Netlify UI: Site settings → Deploys → Select previous deploy → Click "Publish"
