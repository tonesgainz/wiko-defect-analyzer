#!/bin/bash

# AWS Frontend Deployment Script
# Deploys React frontend to AWS Amplify

set -e

echo "╔════════════════════════════════════════════════════════════╗"
echo "║   WIKO AWS FRONTEND DEPLOYMENT                             ║"
echo "║   React → AWS Amplify (CDN + CI/CD)                        ║"
echo "╚════════════════════════════════════════════════════════════╝"

# Configuration
APP_NAME="wiko-defect-analyzer-frontend"
REGION="us-east-1"
GITHUB_REPO=""  # Will be set interactively

# Prompt for GitHub repository
echo ""
echo "📋 Step 1/6: GitHub Repository Configuration"
echo "───────────────────────────────────────────────"
read -p "Enter your GitHub repository URL (e.g., https://github.com/username/repo): " GITHUB_REPO

if [ -z "$GITHUB_REPO" ]; then
    echo "❌ Error: GitHub repository URL is required"
    exit 1
fi

# Extract repo name
REPO_NAME=$(basename $GITHUB_REPO .git)
echo "✓ Repository: $REPO_NAME"

# Prompt for API endpoint
echo ""
read -p "Enter your backend API URL (from backend deployment): " API_ENDPOINT

if [ -z "$API_ENDPOINT" ]; then
    echo "❌ Error: API endpoint is required"
    exit 1
fi

echo "✓ API Endpoint: $API_ENDPOINT"

# Step 2: Create GitHub Personal Access Token
echo ""
echo "🔑 Step 2/6: GitHub Authentication"
echo "───────────────────────────────────────────────"
echo ""
echo "⚠️  MANUAL STEP REQUIRED:"
echo "   1. Go to: https://github.com/settings/tokens/new"
echo "   2. Note: 'AWS Amplify Access'"
echo "   3. Select scopes: repo (all), admin:repo_hook"
echo "   4. Click 'Generate token'"
echo "   5. Copy the token"
echo ""
read -sp "Paste your GitHub Personal Access Token: " GITHUB_TOKEN
echo ""

if [ -z "$GITHUB_TOKEN" ]; then
    echo "❌ Error: GitHub token is required"
    exit 1
fi

echo "✓ GitHub token configured"

# Step 3: Create Amplify App
echo ""
echo "📱 Step 3/6: Creating Amplify App..."

# Create app
APP_ID=$(aws amplify create-app \
  --name $APP_NAME \
  --repository $GITHUB_REPO \
  --access-token $GITHUB_TOKEN \
  --build-spec '{
    "version": 1,
    "frontend": {
      "phases": {
        "preBuild": {
          "commands": [
            "cd frontend",
            "npm ci"
          ]
        },
        "build": {
          "commands": [
            "npm run build"
          ]
        }
      },
      "artifacts": {
        "baseDirectory": "frontend/dist",
        "files": [
          "**/*"
        ]
      },
      "cache": {
        "paths": [
          "frontend/node_modules/**/*"
        ]
      }
    }
  }' \
  --environment-variables "VITE_API_URL=$API_ENDPOINT" \
  --region $REGION \
  --query 'app.appId' \
  --output text 2>/dev/null || \
  aws amplify list-apps --query "apps[?name=='$APP_NAME'].appId" --output text)

echo "✓ Amplify App created: $APP_ID"

# Step 4: Create branch
echo ""
echo "🌿 Step 4/6: Connecting main branch..."

BRANCH_NAME="main"

aws amplify create-branch \
  --app-id $APP_ID \
  --branch-name $BRANCH_NAME \
  --enable-auto-build \
  --region $REGION 2>/dev/null || echo "Branch already exists"

echo "✓ Branch connected: $BRANCH_NAME"

# Step 5: Start deployment
echo ""
echo "🚀 Step 5/6: Starting deployment..."

JOB_ID=$(aws amplify start-job \
  --app-id $APP_ID \
  --branch-name $BRANCH_NAME \
  --job-type RELEASE \
  --region $REGION \
  --query 'jobSummary.jobId' \
  --output text)

echo "✓ Deployment started: $JOB_ID"

# Wait for deployment
echo ""
echo "⏳ Waiting for deployment to complete..."
echo "   This may take 3-5 minutes..."

while true; do
    STATUS=$(aws amplify get-job \
      --app-id $APP_ID \
      --branch-name $BRANCH_NAME \
      --job-id $JOB_ID \
      --region $REGION \
      --query 'job.summary.status' \
      --output text)
    
    if [ "$STATUS" == "SUCCEED" ]; then
        echo "✓ Deployment successful!"
        break
    elif [ "$STATUS" == "FAILED" ]; then
        echo "❌ Deployment failed"
        aws amplify get-job \
          --app-id $APP_ID \
          --branch-name $BRANCH_NAME \
          --job-id $JOB_ID \
          --region $REGION
        exit 1
    else
        echo "   Status: $STATUS"
        sleep 15
    fi
done

# Step 6: Get deployment URL
echo ""
echo "🌐 Step 6/6: Getting deployment URL..."

APP_URL=$(aws amplify get-app \
  --app-id $APP_ID \
  --region $REGION \
  --query 'app.defaultDomain' \
  --output text)

FULL_URL="https://$BRANCH_NAME.$APP_URL"

echo "✓ Frontend deployed: $FULL_URL"

# Final output
echo ""
echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║   ✅ FRONTEND DEPLOYMENT COMPLETE                          ║"
echo "╠════════════════════════════════════════════════════════════╣"
echo "║  Frontend URL: $FULL_URL"
echo "║  Amplify App ID: $APP_ID"
echo "║  Connected Branch: $BRANCH_NAME"
echo "║  Auto-deploy: Enabled"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "Your frontend is now live!"
echo ""
echo "To update your app:"
echo "  1. Make changes to your code"
echo "  2. git push origin main"
echo "  3. Amplify will automatically rebuild and deploy"
echo ""
echo "To view build logs:"
echo "  aws amplify list-jobs --app-id $APP_ID --branch-name $BRANCH_NAME"
echo ""
