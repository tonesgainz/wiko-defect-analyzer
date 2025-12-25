#!/bin/bash

# Pre-Deployment Verification Script
# Run this BEFORE deploying to AWS to catch issues early

set -e

echo "╔════════════════════════════════════════════════════════════╗"
echo "║   AWS DEPLOYMENT PRE-FLIGHT CHECK                          ║"
echo "║   Verify everything before deploying                       ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

ERRORS=0
WARNINGS=0

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

function check_pass() {
    echo -e "${GREEN}✓${NC} $1"
}

function check_fail() {
    echo -e "${RED}✗${NC} $1"
    ((ERRORS++))
}

function check_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
    ((WARNINGS++))
}

# Check 1: AWS CLI
echo "1. Checking AWS CLI..."
if command -v aws &> /dev/null; then
    VERSION=$(aws --version)
    check_pass "AWS CLI installed: $VERSION"
else
    check_fail "AWS CLI not installed. Run: brew install awscli"
fi

# Check 2: AWS Credentials
echo ""
echo "2. Checking AWS credentials..."
if aws sts get-caller-identity &> /dev/null; then
    ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
    REGION=$(aws configure get region || echo "not set")
    check_pass "AWS credentials configured"
    echo "   Account ID: $ACCOUNT"
    echo "   Region: $REGION"
    
    if [ "$REGION" != "us-east-1" ]; then
        check_warn "Region is $REGION, recommended: us-east-1 (for Bedrock)"
    fi
else
    check_fail "AWS credentials not configured. Run: aws configure"
fi

# Check 3: Git
echo ""
echo "3. Checking Git..."
if command -v git &> /dev/null; then
    check_pass "Git installed"
    
    # Check if in a git repo
    if git rev-parse --git-dir &> /dev/null; then
        check_pass "In Git repository"
        
        # Check for remote
        if git remote -v | grep -q origin; then
            REMOTE=$(git remote get-url origin)
            check_pass "Git remote configured: $REMOTE"
        else
            check_fail "No Git remote configured. Run: git remote add origin <url>"
        fi
        
        # Check for uncommitted changes
        if git diff-index --quiet HEAD --; then
            check_pass "No uncommitted changes"
        else
            check_warn "Uncommitted changes detected. Commit before deploying."
        fi
    else
        check_fail "Not in a Git repository. Run: git init"
    fi
else
    check_fail "Git not installed"
fi

# Check 4: Python
echo ""
echo "4. Checking Python environment..."
if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version)
    check_pass "Python installed: $PYTHON_VERSION"
else
    check_fail "Python3 not installed"
fi

# Check 5: Node.js and npm
echo ""
echo "5. Checking Node.js environment..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    check_pass "Node.js installed: $NODE_VERSION"
else
    check_fail "Node.js not installed"
fi

if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    check_pass "npm installed: $NPM_VERSION"
else
    check_fail "npm not installed"
fi

# Check 6: Project structure
echo ""
echo "6. Checking project structure..."

if [ -d "backend" ] || [ -f "app.py" ]; then
    check_pass "Backend code found"
else
    check_fail "Backend code not found (looking for backend/ or app.py)"
fi

if [ -d "frontend" ]; then
    check_pass "Frontend directory found"
    
    if [ -f "frontend/package.json" ]; then
        check_pass "package.json found"
    else
        check_fail "frontend/package.json not found"
    fi
    
    if [ -f "frontend/vite.config.ts" ] || [ -f "frontend/vite.config.js" ]; then
        check_pass "Vite config found"
    else
        check_warn "Vite config not found (frontend/vite.config.ts)"
    fi
else
    check_fail "Frontend directory not found"
fi

# Check 7: Required files
echo ""
echo "7. Checking required files..."

if [ -f "requirements.txt" ] || [ -f "backend/requirements.txt" ]; then
    check_pass "requirements.txt found"
else
    check_warn "requirements.txt not found"
fi

if [ -f ".gitignore" ]; then
    check_pass ".gitignore found"
else
    check_warn ".gitignore not found (recommended)"
fi

if [ -f "README.md" ]; then
    check_pass "README.md found"
else
    check_warn "README.md not found (recommended)"
fi

# Check 8: AWS Activate Credits
echo ""
echo "8. Checking AWS Activate status..."
echo "   ⚠️  Manual verification required:"
echo "   - Go to: https://console.aws.amazon.com/billing/home#/credits"
echo "   - Verify you have active AWS Activate credits"
read -p "   Do you have active AWS Activate credits? (y/n): " HAS_CREDITS

if [ "$HAS_CREDITS" = "y" ]; then
    check_pass "AWS Activate credits confirmed"
else
    check_warn "Apply for AWS Activate credits before deploying"
fi

# Check 9: Deployment scripts
echo ""
echo "9. Checking deployment scripts..."

if [ -f "aws_backend_deploy.sh" ]; then
    check_pass "Backend deployment script found"
    
    if [ -x "aws_backend_deploy.sh" ]; then
        check_pass "Backend script is executable"
    else
        check_warn "Backend script not executable. Run: chmod +x aws_backend_deploy.sh"
    fi
else
    check_fail "aws_backend_deploy.sh not found"
fi

if [ -f "aws_frontend_deploy.sh" ]; then
    check_pass "Frontend deployment script found"
    
    if [ -x "aws_frontend_deploy.sh" ]; then
        check_pass "Frontend script is executable"
    else
        check_warn "Frontend script not executable. Run: chmod +x aws_frontend_deploy.sh"
    fi
else
    check_fail "aws_frontend_deploy.sh not found"
fi

# Check 10: GitHub Token
echo ""
echo "10. Checking GitHub access..."
read -p "    Do you have a GitHub Personal Access Token for Amplify? (y/n): " HAS_TOKEN

if [ "$HAS_TOKEN" = "y" ]; then
    check_pass "GitHub token ready"
else
    check_warn "Create GitHub token: https://github.com/settings/tokens/new"
    echo "       Required scopes: repo, admin:repo_hook"
fi

# Summary
echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║   PRE-FLIGHT CHECK COMPLETE                                ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✓ All checks passed!${NC} You're ready to deploy."
    echo ""
    echo "Next steps:"
    echo "  1. chmod +x aws_backend_deploy.sh"
    echo "  2. ./aws_backend_deploy.sh"
    echo "  3. chmod +x aws_frontend_deploy.sh"
    echo "  4. ./aws_frontend_deploy.sh"
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}⚠ $WARNINGS warning(s) found${NC}"
    echo "   You can proceed, but review warnings above"
    echo ""
    echo "Proceed with deployment when ready:"
    echo "  ./aws_backend_deploy.sh"
else
    echo -e "${RED}✗ $ERRORS error(s) found${NC}"
    if [ $WARNINGS -gt 0 ]; then
        echo -e "${YELLOW}⚠ $WARNINGS warning(s) found${NC}"
    fi
    echo ""
    echo "Fix errors above before deploying"
    exit 1
fi

echo ""
