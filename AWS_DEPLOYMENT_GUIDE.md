# AWS Environment Configuration Guide

## 🎯 Quick Start Deployment

### Prerequisites Checklist
- ✅ AWS Activate account created
- ✅ AWS CLI installed (`aws --version`)
- ✅ GitHub repository with your code
- ✅ AWS credentials configured (`aws configure`)

---

## 📋 Step-by-Step Deployment Process

### Part 1: Backend Deployment (20 minutes)

**1. Make deployment script executable:**
```bash
chmod +x aws_backend_deploy.sh
```

**2. Run backend deployment:**
```bash
./aws_backend_deploy.sh
```

**What this script does:**
- ✓ Creates IAM roles with Bedrock permissions
- ✓ Packages Flask app for Lambda
- ✓ Creates Lambda function with Python 3.11 runtime
- ✓ Sets up API Gateway as REST API endpoint
- ✓ Configures CORS for frontend access
- ✓ Tests the deployment

**Expected output:**
```
API Endpoint: https://abc123xyz.execute-api.us-east-1.amazonaws.com/prod
Lambda Function: wiko-defect-analyzer
Region: us-east-1
```

**Save this API URL!** You'll need it for frontend deployment.

---

### Part 2: Request Bedrock Access (5 minutes)

**CRITICAL STEP - Do this during backend deployment:**

1. **Go to AWS Console:**
   - https://console.aws.amazon.com/bedrock/home?region=us-east-1#/modelaccess

2. **Click "Request model access"**

3. **Select these models:**
   - ✓ Anthropic Claude Opus 4
   - ✓ Anthropic Claude Sonnet 4  
   - ✓ Anthropic Claude Haiku 4.5

4. **Submit request**
   - Usually instant approval
   - Check email for confirmation

5. **Verify access:**
```bash
aws bedrock list-foundation-models \
  --region us-east-1 \
  --query 'modelSummaries[?contains(modelId, `anthropic`)].{ID:modelId, Name:modelName}' \
  --output table
```

---

### Part 3: Frontend Deployment (15 minutes)

**1. Prepare GitHub repository:**

```bash
cd /path/to/your/project

# Ensure you have .gitignore
cat > .gitignore << 'EOF'
node_modules/
dist/
.env
.env.local
venv/
__pycache__/
*.pyc
.DS_Store
EOF

# Commit and push
git add .
git commit -m "Prepare for AWS deployment"
git push origin main
```

**2. Make frontend deployment script executable:**
```bash
chmod +x aws_frontend_deploy.sh
```

**3. Create GitHub Personal Access Token:**
- Go to: https://github.com/settings/tokens/new
- Note: "AWS Amplify Access"
- Select scopes:
  - ✓ repo (all checkboxes)
  - ✓ admin:repo_hook (read and write)
- Click "Generate token"
- **Copy the token immediately** (you won't see it again)

**4. Run frontend deployment:**
```bash
./aws_frontend_deploy.sh
```

**You'll be prompted for:**
- GitHub repository URL: `https://github.com/YOUR_USERNAME/wiko-defect-analyzer`
- Backend API URL: `https://abc123xyz.execute-api.us-east-1.amazonaws.com/prod`
- GitHub token: `ghp_xxxxxxxxxxxxxxxxxxxx`

**Expected output:**
```
Frontend URL: https://main.d1234567890abc.amplifyapp.com
Amplify App ID: d1234567890abc
Auto-deploy: Enabled
```

---

## 🔧 Configuration Files

### Backend Configuration (Lambda)

Your Lambda function automatically gets:

**Environment Variables:**
```
AWS_REGION=us-east-1
```

**IAM Permissions:**
- ✓ AWSLambdaBasicExecutionRole (logging)
- ✓ AmazonBedrockFullAccess (Claude API)

### Frontend Configuration (Amplify)

**Environment Variables (automatically set by script):**
```
VITE_API_URL=https://[your-api-gateway-url]/prod
```

**Build Settings:**
```yaml
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - cd frontend
        - npm ci
    build:
      commands:
        - npm run build
  artifacts:
    baseDirectory: frontend/dist
    files:
      - '**/*'
```

---

## 🧪 Testing Your Deployment

### Test Backend API

**1. Test defect types endpoint:**
```bash
curl https://[YOUR-API-URL]/api/v1/defect-types
```

**Expected response:**
```json
{
  "surface_defects": ["scratches", "dents", "discoloration", "pitting"],
  "edge_defects": ["chipping", "burrs", "irregular_geometry"],
  "structural": ["warping", "cracks", "porosity"],
  "contamination": ["particles", "stains", "residue"]
}
```

**2. Test image analysis (with base64 image):**
```bash
# Convert image to base64
IMAGE_BASE64=$(base64 -i test_knife.jpg)

# Send analysis request
curl -X POST https://[YOUR-API-URL]/api/v1/analyze \
  -H "Content-Type: application/json" \
  -d "{
    \"image\": \"$IMAGE_BASE64\",
    \"product_sku\": \"WK-KN-200\",
    \"facility\": \"yangjiang\"
  }"
```

### Test Frontend

**1. Open browser to your Amplify URL:**
```
https://main.[your-app-id].amplifyapp.com
```

**2. Test the upload flow:**
- Click "Upload Image"
- Select a knife photo
- Choose product SKU
- Click "Analyze for Defects"
- Verify results display

---

## 📊 Monitoring & Logs

### Backend Logs (Lambda)

**View real-time logs:**
```bash
aws logs tail /aws/lambda/wiko-defect-analyzer --follow
```

**View specific time range:**
```bash
aws logs filter-log-events \
  --log-group-name /aws/lambda/wiko-defect-analyzer \
  --start-time $(date -u -d '1 hour ago' +%s)000
```

### Frontend Logs (Amplify)

**View build logs:**
```bash
aws amplify list-jobs \
  --app-id [YOUR-APP-ID] \
  --branch-name main \
  --max-results 5
```

**View specific build:**
```bash
aws amplify get-job \
  --app-id [YOUR-APP-ID] \
  --branch-name main \
  --job-id [JOB-ID]
```

---

## 💰 Cost Monitoring

### Check AWS Credits Usage

```bash
# View current month costs
aws ce get-cost-and-usage \
  --time-period Start=$(date +%Y-%m-01),End=$(date +%Y-%m-%d) \
  --granularity DAILY \
  --metrics BlendedCost \
  --group-by Type=SERVICE
```

### Set Up Budget Alert

```bash
aws budgets create-budget \
  --account-id $(aws sts get-caller-identity --query Account --output text) \
  --budget file://budget.json
```

**budget.json:**
```json
{
  "BudgetName": "AWS-Activate-Credits",
  "BudgetLimit": {
    "Amount": "100000",
    "Unit": "USD"
  },
  "TimeUnit": "MONTHLY",
  "BudgetType": "COST"
}
```

---

## 🔄 Continuous Deployment

Once deployed, your app has **automatic CI/CD**:

**To deploy updates:**
```bash
# 1. Make changes to your code
vim frontend/src/App.tsx

# 2. Commit and push
git add .
git commit -m "Update defect classification UI"
git push origin main

# 3. Amplify automatically rebuilds (3-5 minutes)
# Watch progress at: https://console.aws.amazon.com/amplify
```

---

## 🚨 Troubleshooting

### Backend Issues

**Problem: "Access Denied" when calling Bedrock**
```bash
# Solution: Verify Bedrock model access
aws bedrock get-foundation-model --model-identifier anthropic.claude-opus-4-20250514-v1:0
```

**Problem: Lambda timeout**
```bash
# Solution: Increase timeout to 60 seconds
aws lambda update-function-configuration \
  --function-name wiko-defect-analyzer \
  --timeout 60
```

### Frontend Issues

**Problem: CORS errors in browser console**
```bash
# Solution: Verify API Gateway CORS settings
aws apigateway update-integration-response \
  --rest-api-id [API-ID] \
  --resource-id [RESOURCE-ID] \
  --http-method ANY \
  --status-code 200 \
  --response-parameters '{"method.response.header.Access-Control-Allow-Origin": "*"}'
```

**Problem: Build fails on Amplify**
```bash
# Solution: Check build logs
aws amplify get-job --app-id [APP-ID] --branch-name main --job-id [JOB-ID]

# Common fix: Update build spec
aws amplify update-app --app-id [APP-ID] --build-spec file://amplify.yml
```

---

## 📞 Support Resources

**AWS Support:**
- Console: https://console.aws.amazon.com/support
- Documentation: https://docs.aws.amazon.com

**Bedrock Documentation:**
- https://docs.aws.amazon.com/bedrock/latest/userguide/

**Your AWS Contact:**
- Matthew Stanton: mjstan@amazon.com
- AWS Activate Team: Connect via your startup dashboard

---

## ✅ Deployment Checklist

- [ ] AWS CLI installed and configured
- [ ] GitHub repository created and pushed
- [ ] Backend deployed (`aws_backend_deploy.sh`)
- [ ] Bedrock model access requested and approved
- [ ] Backend API tested with curl
- [ ] GitHub personal access token created
- [ ] Frontend deployed (`aws_frontend_deploy.sh`)
- [ ] Frontend tested in browser
- [ ] Budget alerts configured
- [ ] Team members added to AWS account

**Next Steps:**
1. Configure custom domain (optional)
2. Set up CloudWatch alarms for errors
3. Enable AWS WAF for API security
4. Schedule meeting with Matthew Stanton for architecture review
