#!/bin/bash
# Quick Netlify deployment setup

set -e

echo "🚀 Netlify Deployment Setup"
echo "============================"
echo ""

# Check if git is initialized
if [ ! -d .git ]; then
    echo "📦 Initializing git repository..."
    git init
    echo ""
fi

# Check if .env file exists and has secrets
if [ -f "frontend/.env" ]; then
    echo "⚠️  IMPORTANT: Remove sensitive data from frontend/.env before committing!"
    echo "   Keep only these in frontend/.env for Netlify:"
    echo "   - VITE_APPWRITE_PROJECT_ID"
    echo "   - VITE_APPWRITE_ENDPOINT"
    echo ""
    read -p "Press Enter to continue..."
fi

# Add files to git
echo "📝 Adding files to git..."
git add .
git commit -m "Initial commit: Multi-game platform with Netlify config" 2>/dev/null || echo "   (Already committed or nothing to commit)"

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Push to GitHub:"
echo "   git remote add origin <your-github-repo-url>"
echo "   git push -u origin main"
echo ""
echo "2. Deploy to Netlify:"
echo "   Option A: Go to netlify.com → Add new site → Import from GitHub"
echo "   Option B: npm install -g netlify-cli && netlify deploy --prod"
echo ""
echo "3. Set environment variables on Netlify dashboard:"
echo "   Site settings → Build & deploy → Environment variables"
echo "   Add:"
echo "     VITE_APPWRITE_PROJECT_ID = 694d5a26002e778071ed"
echo "     VITE_APPWRITE_ENDPOINT = https://fra.cloud.appwrite.io/v1"
echo ""
echo "4. Allow your Netlify domain in Appwrite:"
echo "   Appwrite console → Settings → Domains → Add https://your-site.netlify.app"
echo ""
echo "See DEPLOYMENT.md for full instructions."
