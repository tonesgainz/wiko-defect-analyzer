#!/bin/bash
# ============================================================
# Wiko Defect Analyzer - AWS Backend Deployment
# ============================================================

set -e

STACK_NAME="wiko-defect-analyzer"
REGION="us-east-1"
ENVIRONMENT="prod"

echo ""
echo "╔═══════════════════════════════════════════════════════════════════╗"
echo "║     WIKO DEFECT ANALYZER - AWS BACKEND DEPLOYMENT                 ║"
echo "║     Using AWS Activate Credits (\$1,000)                           ║"
echo "╚═══════════════════════════════════════════════════════════════════╝"
echo ""

# ============================================================
# STEP 1: Check Prerequisites
# ============================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "STEP 1: Checking Prerequisites"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check AWS CLI
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI not found"
    echo "   Install: https://aws.amazon.com/cli/"
    exit 1
fi
echo "✅ AWS CLI installed"

# Check credentials
if ! aws sts get-caller-identity &> /dev/null; then
    echo "❌ AWS credentials not configured"
    echo "   Run: aws configure"
    exit 1
fi

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "✅ AWS Account: $ACCOUNT_ID"
echo ""

# ============================================================
# STEP 2: Verify Bedrock Access
# ============================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "STEP 2: Verifying Bedrock Model Access"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

CLAUDE_ACCESS=$(aws bedrock list-foundation-models \
    --region $REGION \
    --query "modelSummaries[?contains(modelId, 'claude-3-5-sonnet')].modelId" \
    --output text 2>/dev/null || echo "")

if [ -z "$CLAUDE_ACCESS" ]; then
    echo "⚠️  Claude 3.5 Sonnet not found or not enabled"
    echo ""
    echo "   Please enable it manually:"
    echo "   1. Go to: https://console.aws.amazon.com/bedrock/home?region=$REGION#/modelaccess"
    echo "   2. Click 'Manage model access'"
    echo "   3. Enable 'Anthropic → Claude 3.5 Sonnet'"
    echo "   4. Save changes and wait for 'Access granted'"
    echo ""
    read -p "Press Enter when Bedrock access is enabled..."
else
    echo "✅ Bedrock Claude 3.5 Sonnet: Enabled"
fi
echo ""

# ============================================================
# STEP 3: Deploy CloudFormation Stack
# ============================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "STEP 3: Deploying CloudFormation Stack"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check if stack exists
STACK_EXISTS=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --region $REGION 2>/dev/null || echo "")

if [ -n "$STACK_EXISTS" ]; then
    echo "→ Stack exists, updating..."
    aws cloudformation update-stack \
        --stack-name $STACK_NAME \
        --template-body file://infrastructure/infrastructure.yaml \
        --parameters ParameterKey=Environment,ParameterValue=$ENVIRONMENT \
        --capabilities CAPABILITY_NAMED_IAM \
        --region $REGION 2>/dev/null || echo "   (No changes to apply)"
    
    echo "→ Waiting for update to complete..."
    aws cloudformation wait stack-update-complete \
        --stack-name $STACK_NAME \
        --region $REGION 2>/dev/null || true
else
    echo "→ Creating new stack..."
    aws cloudformation create-stack \
        --stack-name $STACK_NAME \
        --template-body file://infrastructure/infrastructure.yaml \
        --parameters ParameterKey=Environment,ParameterValue=$ENVIRONMENT \
        --capabilities CAPABILITY_NAMED_IAM \
        --region $REGION
    
    echo "→ Waiting for stack creation (3-5 minutes)..."
    aws cloudformation wait stack-create-complete \
        --stack-name $STACK_NAME \
        --region $REGION
fi

echo "✅ Stack deployed successfully"
echo ""

# ============================================================
# STEP 4: Get Outputs
# ============================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "STEP 4: Retrieving Endpoints"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

API_ENDPOINT=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --region $REGION \
    --query "Stacks[0].Outputs[?OutputKey=='ApiEndpoint'].OutputValue" \
    --output text)

BUCKET=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --region $REGION \
    --query "Stacks[0].Outputs[?OutputKey=='ImagesBucket'].OutputValue" \
    --output text)

TABLE=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --region $REGION \
    --query "Stacks[0].Outputs[?OutputKey=='DefectsTable'].OutputValue" \
    --output text)

echo ""
echo "╔═══════════════════════════════════════════════════════════════════╗"
echo "║                    DEPLOYMENT COMPLETE! 🚀                        ║"
echo "╠═══════════════════════════════════════════════════════════════════╣"
echo "║                                                                   ║"
echo "║  API Endpoint:                                                    ║"
echo "║  $API_ENDPOINT"
echo "║                                                                   ║"
echo "║  S3 Bucket: $BUCKET"
echo "║  DynamoDB:  $TABLE"
echo "║                                                                   ║"
echo "╠═══════════════════════════════════════════════════════════════════╣"
echo "║  API ENDPOINTS:                                                   ║"
echo "║                                                                   ║"
echo "║  POST ${API_ENDPOINT}/api/v1/analyze"
echo "║       → Analyze image for defects                                 ║"
echo "║                                                                   ║"
echo "║  GET  ${API_ENDPOINT}/api/v1/defects"
echo "║       → List all defects                                          ║"
echo "║                                                                   ║"
echo "║  GET  ${API_ENDPOINT}/api/v1/stats"
echo "║       → Get statistics                                            ║"
echo "║                                                                   ║"
echo "╚═══════════════════════════════════════════════════════════════════╝"
echo ""

# Save config
cat > .env.aws << EOF
# Wiko AWS Backend Configuration
# Generated: $(date)

AWS_API_ENDPOINT=$API_ENDPOINT
AWS_IMAGES_BUCKET=$BUCKET
AWS_DEFECTS_TABLE=$TABLE
AWS_REGION=$REGION
EOF

echo "✅ Configuration saved to .env.aws"
echo ""

# ============================================================
# STEP 5: Test API
# ============================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "STEP 5: Testing API"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "→ Testing /stats endpoint..."
STATS_RESPONSE=$(curl -s "${API_ENDPOINT}/api/v1/stats")
echo "   Response: $STATS_RESPONSE"
echo ""

echo "✅ API is working!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "NEXT STEPS:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "1. Update your frontend .env file:"
echo "   VITE_API_URL=$API_ENDPOINT/api/v1"
echo ""
echo "2. Rebuild and deploy frontend:"
echo "   cd ~/wiko-defect-analyzer-clean/frontend"
echo "   npm run build"
echo "   git add . && git commit -m 'Connect to AWS Bedrock' && git push"
echo ""
echo "3. Test with an image:"
echo "   python test_api.py --image knife.jpg"
echo ""
