# AWS Deployment Guide

**Project:** Wiko Defect Analyzer
**Last Updated:** December 27, 2025
**Status:** Production-Ready

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [Deployment Steps](#deployment-steps)
4. [Component Details](#component-details)
5. [Verification & Testing](#verification--testing)
6. [Monitoring & Maintenance](#monitoring--maintenance)

---

## Architecture Overview

### Current Production Architecture

The Wiko Defect Analyzer is deployed on AWS using a serverless architecture with the following components:

```
┌─────────────────────────────────────────────────────────────┐
│                        AWS Cloud                             │
│                                                               │
│  ┌──────────────┐                                            │
│  │   Amplify    │  Frontend (React + Vite)                  │
│  │ main.d16gtun │  https://main.d16gtun6rcncmo.amplifyapp.com│
│  └──────────────┘                                            │
│         │                                                     │
│         │ HTTPS                                               │
│         ▼                                                     │
│  ┌──────────────────────────────────────────────────────┐   │
│  │          API Gateway (REST API)                       │   │
│  │   https://6j6rqn6rug.execute-api.us-east-1...        │   │
│  │   - /health, /api/v1/analyze, /api/v1/stats          │   │
│  │   - CORS configured                                    │   │
│  └──────┬───────────────────────────────────────────────┘   │
│         │                                                     │
│  ┌──────▼──────────────────────────────────────────────┐    │
│  │           AWS Lambda Functions                        │    │
│  │  ┌────────────────────────────────────────────────┐  │    │
│  │  │ analyze (Python 3.12, 90s timeout)             │  │    │
│  │  │ - Bedrock Claude Opus 4 integration            │  │    │
│  │  │ - S3 image storage                              │  │    │
│  │  │ - DynamoDB results storage                      │  │    │
│  │  └────────────────────────────────────────────────┘  │    │
│  │  ┌────────────────────────────────────────────────┐  │    │
│  │  │ get-defects (Query defect history)             │  │    │
│  │  └────────────────────────────────────────────────┘  │    │
│  │  ┌────────────────────────────────────────────────┐  │    │
│  │  │ stats (Aggregated statistics)                  │  │    │
│  │  └────────────────────────────────────────────────┘  │    │
│  └───────────────────────────────────────────────────────┘    │
│         │                    │                    │            │
│  ┌──────▼──────┐      ┌─────▼─────┐      ┌──────▼──────┐    │
│  │     S3      │      │ DynamoDB  │      │  Bedrock    │    │
│  │   Images    │      │  Defects  │      │  Claude 4   │    │
│  │ (versioned) │      │  (results)│      │ (inference) │    │
│  └─────────────┘      └───────────┘      └─────────────┘    │
└─────────────────────────────────────────────────────────────┘
                          │
                          │ API Calls (fallback)
                          ▼
              ┌─────────────────────────┐
              │   Azure OpenAI GPT-5.2  │
              │   (Local development)    │
              └─────────────────────────┘
```

### Key AWS Resources

| Resource | ID/Name | Purpose |
|----------|---------|---------|
| **Amplify App** | d16gtun6rcncmo | Frontend hosting (React SPA) |
| **API Gateway** | 6j6rqn6rug | REST API endpoint |
| **Lambda Functions** | wiko-defect-analyzer-* | Serverless compute |
| **S3 Bucket** | wiko-defect-analyzer-images-891612561074 | Image storage |
| **DynamoDB Table** | wiko-defect-analyzer-defects | Analysis results |
| **CloudFormation Stack** | wiko-defect-analyzer | Infrastructure as Code |
| **Bedrock Model** | Claude Opus 4 (us.anthropic.claude-opus-4-20250514-v1:0) | AI inference |

---

## Prerequisites

### Required Tools

```bash
# AWS CLI
brew install awscli
aws --version  # Should be 2.x

# Node.js & npm (for frontend)
brew install node
node --version  # Should be 18+

# Python 3.12 (for backend)
brew install python@3.12
python3 --version

# Git
git --version
```

### AWS Account Setup

1. **AWS Activate Account** (recommended for credits):
   - Apply at: https://aws.amazon.com/activate
   - Provides $1,000-$100,000 in credits

2. **Configure AWS CLI**:
   ```bash
   aws configure
   # AWS Access Key ID: [your key]
   # AWS Secret Access Key: [your secret]
   # Default region: us-east-1
   # Default output format: json
   ```

3. **Verify Authentication**:
   ```bash
   aws sts get-caller-identity
   ```

### Required AWS Permissions

Your IAM user/role needs these permissions:
- Lambda: Full access
- API Gateway: Full access
- S3: Full access
- DynamoDB: Full access
- IAM: Role creation and policy attachment
- CloudFormation: Full access
- Bedrock: Model access (requires separate request)
- Amplify: Full access

---

## Deployment Steps

### Step 1: Clone and Setup Repository

```bash
# Clone repository
git clone https://github.com/tonesgainz/wiko-defect-analyzer.git
cd wiko-defect-analyzer

# Create Python virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Install frontend dependencies
cd frontend
npm install
cd ..
```

### Step 2: Configure Environment Variables

**Backend (.env):**
```bash
cp .env.template .env
nano .env

# Required variables:
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_DEFAULT_REGION=us-east-1

# Optional (for local development):
AZURE_AI_API_KEY=your-azure-key
AZURE_AI_ENDPOINT=your-azure-endpoint
```

**Frontend (frontend/.env):**
```bash
cd frontend
echo "VITE_API_URL=https://6j6rqn6rug.execute-api.us-east-1.amazonaws.com/prod" > .env
```

### Step 3: Request Bedrock Model Access (CRITICAL)

**This must be done before deploying Lambda:**

1. **Via AWS Console:**
   - Go to: https://console.aws.amazon.com/bedrock/home?region=us-east-1#/modelaccess
   - Click "Manage model access"
   - Select Anthropic models:
     - ✓ Claude Opus 4
     - ✓ Claude Sonnet 4
     - ✓ Claude Haiku 4.5
   - Click "Request model access"
   - Fill out use case form:
     - **Industry**: Manufacturing
     - **Use case**: Quality inspection and defect detection
   - Submit request (usually approved instantly)

2. **Verify Access:**
   ```bash
   aws bedrock list-foundation-models \
     --region us-east-1 \
     --query 'modelSummaries[?contains(modelId, `anthropic`)].{ID:modelId, Name:modelName}' \
     --output table
   ```

3. **Check AWS Marketplace Subscription:**
   - Go to: https://console.aws.amazon.com/marketplace/home
   - Check "Manage subscriptions"
   - Look for "Claude Opus 4" subscription
   - Should show "Active" status

**Expected Output:**
```
---------------------------------------------------------------------
|                  ListFoundationModels                             |
+-------------------------------------------------------------------+
|  ID                                          |  Name              |
+----------------------------------------------+--------------------+
|  us.anthropic.claude-opus-4-20250514-v1:0   |  Claude Opus 4     |
|  us.anthropic.claude-sonnet-4-20250514-v1:0 |  Claude Sonnet 4   |
+----------------------------------------------+--------------------+
```

### Step 4: Deploy Backend Infrastructure

**Using CloudFormation (Recommended):**

```bash
# From project root
cd infrastructure

# Deploy stack
aws cloudformation deploy \
  --template-file infrastructure.yaml \
  --stack-name wiko-defect-analyzer \
  --capabilities CAPABILITY_IAM \
  --region us-east-1

# Monitor deployment (takes 2-3 minutes)
aws cloudformation describe-stacks \
  --stack-name wiko-defect-analyzer \
  --query 'Stacks[0].StackStatus' \
  --output text
```

**Using Deployment Script (Alternative):**

```bash
# From project root
cd scripts
./deploy.sh
```

**Get Stack Outputs:**
```bash
aws cloudformation describe-stacks \
  --stack-name wiko-defect-analyzer \
  --query 'Stacks[0].Outputs' \
  --output table
```

**Expected Outputs:**
- `ApiEndpoint`: https://6j6rqn6rug.execute-api.us-east-1.amazonaws.com/prod
- `ImageBucket`: wiko-defect-analyzer-images-891612561074
- `DefectsTable`: wiko-defect-analyzer-defects

### Step 5: Deploy Lambda Function Code

**The Lambda function with comprehensive prompt is ready:**

```bash
# From project root
cd lambda

# Package function
zip function.zip analyze_function.py

# Deploy
aws lambda update-function-code \
  --function-name wiko-defect-analyzer-analyze \
  --zip-file fileb://function.zip

# Update handler
aws lambda update-function-configuration \
  --function-name wiko-defect-analyzer-analyze \
  --handler analyze_function.lambda_handler

# Clean up
rm function.zip
```

### Step 6: Deploy Frontend to Amplify

**Option A: Automatic Deployment (Current Setup)**

The frontend is already connected to Amplify. Any push to `main` branch triggers automatic deployment:

```bash
# Make changes to frontend
cd frontend/src
# Edit your files...

# Commit and push
git add .
git commit -m "Update frontend"
git push origin main

# Amplify automatically builds and deploys (1-2 minutes)
# Watch progress at:
open "https://us-east-1.console.aws.amazon.com/amplify/home?region=us-east-1#/d16gtun6rcncmo"
```

**Option B: Manual Build (Testing)**

```bash
cd frontend
npm run build

# Verify build
ls -lh dist/

# Build should create:
# - index.html
# - assets/*.js
# - assets/*.css
```

### Step 7: Configure Amplify Environment Variables

**Via AWS CLI:**
```bash
aws amplify update-branch \
  --app-id d16gtun6rcncmo \
  --branch-name main \
  --environment-variables VITE_API_URL=https://6j6rqn6rug.execute-api.us-east-1.amazonaws.com/prod

# Trigger rebuild
aws amplify start-job \
  --app-id d16gtun6rcncmo \
  --branch-name main \
  --job-type RELEASE
```

**Via AWS Console:**
1. Go to Amplify Console
2. Select app `wiko-defect-analyzer`
3. Click "Environment variables"
4. Add: `VITE_API_URL` = `https://6j6rqn6rug.execute-api.us-east-1.amazonaws.com/prod`
5. Redeploy from main branch

---

## Component Details

### Lambda Functions

#### analyze-function
- **Runtime**: Python 3.12
- **Timeout**: 90 seconds
- **Memory**: 512 MB
- **Handler**: `analyze_function.lambda_handler`
- **Model**: Claude Opus 4 (us.anthropic.claude-opus-4-20250514-v1:0)
- **Features**:
  - Structured JSON output with defect taxonomy
  - 12-stage manufacturing process context
  - Root cause analysis
  - Corrective action recommendations
  - Bounding box defect localization
  - Confidence scoring (0.90-0.99 for no-defect cases)

#### get-defects
- **Runtime**: Python 3.12
- **Timeout**: 30 seconds
- **Memory**: 256 MB
- **Purpose**: Query defect history from DynamoDB
- **Parameters**: `?facility=yangjiang&limit=50`

#### stats
- **Runtime**: Python 3.12
- **Timeout**: 30 seconds
- **Memory**: 256 MB
- **Purpose**: Aggregate statistics (total inspections, defect rate, by type/severity)

### S3 Bucket

**Configuration:**
- **Versioning**: Enabled
- **Encryption**: AES-256 (server-side)
- **Lifecycle policy**: 90-day retention for images
- **CORS**: Configured for frontend access
- **Folder structure**:
  ```
  inspections/
    ├── {facility}/
    │   ├── {product_sku}/
    │   │   ├── {defect_id}.jpg
    ```

### DynamoDB Table

**Schema:**
- **Primary Key**: `defect_id` (String)
- **Sort Key**: `timestamp` (Number)
- **Attributes**:
  - `facility` (String) - Manufacturing location
  - `product_sku` (String) - Product identifier
  - `image_url` (String) - S3 path
  - `analysis` (Map) - Full JSON analysis
  - `created_at` (String) - ISO timestamp

**Indexes:**
- **GSI**: `facility-timestamp-index` for facility-based queries

**Capacity:**
- **Read**: On-demand
- **Write**: On-demand

---

## Verification & Testing

### Test Backend API

```bash
# Health check
curl https://6j6rqn6rug.execute-api.us-east-1.amazonaws.com/prod/health

# Get stats
curl https://6j6rqn6rug.execute-api.us-east-1.amazonaws.com/prod/api/v1/stats | jq .

# Get defects
curl 'https://6j6rqn6rug.execute-api.us-east-1.amazonaws.com/prod/api/v1/defects?limit=5' | jq .

# Test analysis (requires base64 image)
cd scripts
python test_api.py --image test_knife.jpg
```

### Test Frontend

```bash
# Open in browser
open https://main.d16gtun6rcncmo.amplifyapp.com

# Or use curl to check if served
curl -I https://main.d16gtun6rcncmo.amplifyapp.com
```

### Verify Lambda Logs

```bash
# Tail logs in real-time
aws logs tail /aws/lambda/wiko-defect-analyzer-analyze --follow

# Get recent errors
aws logs tail /aws/lambda/wiko-defect-analyzer-analyze --since 1h | grep ERROR
```

### Check DynamoDB Data

```bash
# Scan recent items
aws dynamodb scan \
  --table-name wiko-defect-analyzer-defects \
  --max-items 5 \
  --output json | jq '.Items[].analysis.S | fromjson'
```

---

## Monitoring & Maintenance

### CloudWatch Dashboards

Create a dashboard to monitor:
- Lambda invocations, errors, duration
- API Gateway 4xx/5xx errors, latency
- DynamoDB read/write capacity
- S3 bucket size

```bash
# Create dashboard via AWS Console
open "https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:"
```

### Alarms

**Recommended alarms:**
1. **Lambda Errors** > 5 in 5 minutes
2. **API Gateway 5xx** > 10 in 5 minutes
3. **Lambda Duration** > 85 seconds (approaching timeout)
4. **DynamoDB Throttles** > 0

### Cost Monitoring

**Expected monthly costs:**
- Lambda: $10-30 (based on invocations)
- API Gateway: $3-10 (per 1M requests)
- DynamoDB: $5-15 (on-demand)
- S3: $1-5 (storage + requests)
- Bedrock: $5-50 (per 1M tokens)
- Amplify: $0-5 (build minutes)

**Total: ~$25-115/month** (low-medium traffic)

### Scaling Considerations

**Current limits:**
- Lambda: 1000 concurrent executions (AWS account limit)
- API Gateway: 10,000 requests/second (AWS account limit)
- DynamoDB: Unlimited (on-demand mode)
- Bedrock: 10,000 tokens/minute (model limit)

**To scale beyond:**
1. Request limit increases via AWS Support
2. Add CloudFront CDN for API caching
3. Implement SQS queue for async processing
4. Add ElastiCache for result caching

---

## Troubleshooting

### Common Issues

**Issue: "Missing Authentication Token"**
- **Cause**: Hitting wrong URL or frontend not configured
- **Fix**: Check `frontend/.env` has correct `VITE_API_URL`
- **Fix**: Restart frontend dev server after changing `.env`

**Issue: "AccessDeniedException" from Bedrock**
- **Cause**: Model access not granted or AWS Marketplace subscription needed
- **Fix**: Complete Step 3 (Request Bedrock Model Access)
- **Fix**: Check AWS Marketplace subscriptions

**Issue: Lambda timeout (90s)**
- **Cause**: Bedrock inference taking too long or image too large
- **Fix**: Reduce image size before upload (< 5MB)
- **Fix**: Increase Lambda timeout to 120s if needed

**Issue: CORS errors**
- **Cause**: API Gateway CORS not configured properly
- **Fix**: Redeploy CloudFormation stack
- **Fix**: Verify `Access-Control-Allow-Origin: *` in Lambda response headers

**Issue: "Cannot parse JSON" from Claude**
- **Cause**: Model returning non-JSON text
- **Fix**: Prompt is designed to handle this (extracts JSON from markdown)
- **Fix**: Check Lambda logs for raw response

### Rollback Procedure

**CloudFormation:**
```bash
# List stack events to find issue
aws cloudformation describe-stack-events \
  --stack-name wiko-defect-analyzer \
  --max-items 20

# Rollback to previous version
aws cloudformation cancel-update-stack \
  --stack-name wiko-defect-analyzer
```

**Lambda Function:**
```bash
# List versions
aws lambda list-versions-by-function \
  --function-name wiko-defect-analyzer-analyze

# Rollback to previous version
aws lambda update-alias \
  --function-name wiko-defect-analyzer-analyze \
  --name PROD \
  --function-version [previous-version]
```

**Amplify:**
```bash
# List jobs
aws amplify list-jobs \
  --app-id d16gtun6rcncmo \
  --branch-name main \
  --max-results 10

# Revert to previous commit and push
git revert HEAD
git push origin main
```

---

## Next Steps

1. **Custom Domain**: Configure Route 53 and CloudFront for custom domain
2. **CI/CD**: Set up GitHub Actions for automated testing and deployment
3. **Load Testing**: Use Apache JMeter or Locust to test at scale
4. **Monitoring**: Set up comprehensive CloudWatch dashboards and alarms
5. **Backup**: Configure DynamoDB point-in-time recovery
6. **Multi-Region**: Deploy to additional regions for global availability

---

## Additional Resources

- [AWS Lambda Python](https://docs.aws.amazon.com/lambda/latest/dg/lambda-python.html)
- [AWS Bedrock Claude](https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-claude.html)
- [Amplify Hosting](https://docs.amplify.aws/react/start/getting-started/introduction/)
- [API Gateway REST API](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-rest-api.html)
- [DynamoDB Best Practices](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/best-practices.html)

---

**Document maintained by:** Claude Code
**Repository:** https://github.com/tonesgainz/wiko-defect-analyzer
**Support:** Create an issue on GitHub
