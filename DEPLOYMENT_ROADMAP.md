# Wiko Defect Analyzer - Complete Deployment Roadmap

**Status:** ✅ Production-Ready
**Last Updated:** December 25, 2025

---

## 🎯 Overview

This document provides a step-by-step roadmap to deploy the Wiko Defect Analyzer to AWS production environment. Everything is ready - you just need to execute the steps below.

---

## 📊 Current Status

### ✅ Completed (100%)

- [x] **Codebase Cleanup** - Removed all duplicate files
- [x] **Security Hardening** - All critical vulnerabilities fixed
- [x] **Frontend Cleanup** - Removed all fake/mock data
- [x] **API Authentication** - Applied to all endpoints
- [x] **Event Loop Management** - Graceful shutdown implemented
- [x] **Documentation** - Complete AWS deployment guide
- [x] **Deployment Scripts** - Automated deployment tools
- [x] **Infrastructure Scripts** - AWS resource creation automation

### ⚠️ Pending (Critical)

- [ ] **Rotate Azure API Key** - Exposed key needs immediate rotation
- [ ] **Initial AWS Deployment** - Run deployment for first time
- [ ] **DNS Configuration** - Point domain to CloudFront/ALB
- [ ] **Load Testing** - Verify system handles expected traffic
- [ ] **Monitoring Setup** - Configure CloudWatch alarms

---

## 🚀 Deployment Steps

### **Step 1: Security - Rotate Exposed API Key (15 minutes)**

**Priority:** 🔴 CRITICAL - Do this first!

The Azure API key in `.env` was visible during development and must be rotated:

1. **Go to Azure Portal:**
   ```
   https://ai.azure.com
   ```

2. **Navigate to your project:**
   - Click on "wiko-defect-analyzer" project
   - Go to "Keys and Endpoint"

3. **Regenerate the key:**
   - Click "Regenerate Key 1" or create new key
   - Copy the new key

4. **Update local `.env` file:**
   ```bash
   nano .env
   # Update AZURE_AI_API_KEY with new value
   # Save and exit (Ctrl+X, Y, Enter)
   ```

5. **Revoke old key in Azure Portal:**
   - This prevents unauthorized use of the exposed key

6. **Verify new key works:**
   ```bash
   # Start local server
   python3 app.py

   # Test in another terminal
   curl http://localhost:5001/health
   ```

**Status:** ⚠️ **DO THIS NOW BEFORE DEPLOYMENT**

---

### **Step 2: AWS Account Setup (30 minutes)**

**Prerequisites:**
- AWS account with admin access
- Credit card for billing
- Domain name (optional but recommended)

**Actions:**

1. **Install AWS CLI:**
   ```bash
   # macOS
   brew install awscli

   # Verify
   aws --version
   ```

2. **Configure AWS credentials:**
   ```bash
   aws configure
   ```
   Enter:
   - AWS Access Key ID: `<from IAM console>`
   - AWS Secret Access Key: `<from IAM console>`
   - Default region: `us-east-1`
   - Default output format: `json`

3. **Verify access:**
   ```bash
   aws sts get-caller-identity
   # Should show your account ID
   ```

4. **Install Docker:**
   ```bash
   # macOS
   brew install --cask docker

   # Start Docker Desktop
   open -a Docker
   ```

**Status:** Ready when `aws sts get-caller-identity` works

---

### **Step 3: Infrastructure Setup (1-2 hours)**

**Option A: Automated (Recommended)**

Use the provided infrastructure setup script:

```bash
# Run infrastructure script
./scripts/setup-infrastructure.sh
```

This will create:
- VPC with public/private subnets
- Security groups (ALB, ECS, RDS, Redis)
- RDS PostgreSQL database
- Networking configuration

**Option B: Manual**

Follow the detailed guide in [AWS_DEPLOYMENT_ARCHITECTURE.md](AWS_DEPLOYMENT_ARCHITECTURE.md) sections:
- Phase 2.1: Create RDS Database
- Phase 2.2: Create ElastiCache Redis
- Phase 2.3: Create S3 Buckets

**Deliverables:**
- `infrastructure-config.env` file with resource IDs
- RDS endpoint URL
- VPC and subnet IDs

**Status:** Complete when you have `infrastructure-config.env`

---

### **Step 4: Store Secrets in AWS Secrets Manager (15 minutes)**

**Why:** Keep sensitive credentials secure and never commit to git

```bash
# 1. Store Azure API Key (use NEW rotated key)
aws secretsmanager create-secret \
  --name wiko/azure-api-key \
  --description "Azure OpenAI API Key" \
  --secret-string "YOUR_NEW_ROTATED_KEY_HERE" \
  --region us-east-1

# 2. Generate and store API key for frontend authentication
API_KEY=$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')
echo "Generated API Key: $API_KEY"

aws secretsmanager create-secret \
  --name wiko/api-key \
  --secret-string "$API_KEY" \
  --region us-east-1

# 3. Generate and store Flask secret key
SECRET_KEY=$(python3 -c 'import secrets; print(secrets.token_hex(32))')

aws secretsmanager create-secret \
  --name wiko/secret-key \
  --secret-string "$SECRET_KEY" \
  --region us-east-1

# 4. Store database URL (get endpoint from infrastructure-config.env)
source scripts/infrastructure-config.env
DB_URL="postgresql://wikoAdmin:YOUR_DB_PASSWORD@${RDS_ENDPOINT}:5432/wiko_defect_db"

aws secretsmanager create-secret \
  --name wiko/database-url \
  --secret-string "$DB_URL" \
  --region us-east-1

# 5. Store Redis URL (if you created ElastiCache)
aws secretsmanager create-secret \
  --name wiko/redis-url \
  --secret-string "redis://YOUR_REDIS_ENDPOINT:6379/0" \
  --region us-east-1
```

**Important:** Save the generated `API_KEY` - you'll need it to call the API from frontend!

**Status:** Complete when all 5 secrets are in Secrets Manager

---

### **Step 5: Deploy Backend to ECS (30-45 minutes)**

**Using automated script:**

```bash
# Deploy backend only
./scripts/deploy-to-aws.sh --backend-only
```

This will:
1. Build Docker image
2. Push to ECR
3. Create/update ECS service
4. Wait for deployment to stabilize

**Manual steps if needed:**

Follow [AWS_DEPLOYMENT_ARCHITECTURE.md](AWS_DEPLOYMENT_ARCHITECTURE.md) Phase 2.4-2.5:
- Create ECR repository
- Build and push Docker image
- Create ECS cluster and service
- Configure auto-scaling

**Verification:**

```bash
# Check ECS service status
aws ecs describe-services \
  --cluster wiko-defect-analyzer-production \
  --services wiko-defect-analyzer-api-service \
  --region us-east-1 \
  --query 'services[0].{Status:status,Running:runningCount,Desired:desiredCount}'

# Get ALB endpoint
aws elbv2 describe-load-balancers \
  --names wiko-defect-analyzer-alb \
  --region us-east-1 \
  --query 'LoadBalancers[0].DNSName' \
  --output text

# Test health endpoint
curl https://<alb-endpoint>/health
```

**Status:** Complete when health check returns `{"status": "healthy"}`

---

### **Step 6: Deploy Frontend to S3 + CloudFront (30 minutes)**

**Update frontend environment:**

```bash
cd frontend

# Create production environment file
cat > .env.production <<EOF
VITE_API_URL=https://<your-alb-endpoint>
EOF

# Or use custom domain if configured
# VITE_API_URL=https://api.wiko-defect-analyzer.com
```

**Deploy using script:**

```bash
# From project root
./scripts/deploy-to-aws.sh --frontend-only
```

This will:
1. Build React application
2. Upload to S3
3. Invalidate CloudFront cache

**Manual steps if needed:**

Follow [AWS_DEPLOYMENT_ARCHITECTURE.md](AWS_DEPLOYMENT_ARCHITECTURE.md) Phase 3.

**Verification:**

```bash
# Check S3 bucket
aws s3 ls s3://wiko-defect-analyzer-frontend-production/

# Test frontend
curl https://<cloudfront-url>
```

**Status:** Complete when frontend loads in browser

---

### **Step 7: Configure Custom Domain (30 minutes) - Optional**

**If you have a domain (e.g., wiko.com):**

1. **Request SSL certificate in ACM:**
   ```bash
   aws acm request-certificate \
     --domain-name defect-analyzer.wiko.com \
     --subject-alternative-names api.wiko.com \
     --validation-method DNS \
     --region us-east-1
   ```

2. **Add DNS validation records to Route 53 or your DNS provider**

3. **Wait for certificate validation:**
   ```bash
   aws acm wait certificate-validated \
     --certificate-arn <cert-arn> \
     --region us-east-1
   ```

4. **Update CloudFront and ALB to use certificate**

5. **Create Route 53 records:**
   ```bash
   # Frontend: defect-analyzer.wiko.com → CloudFront
   # API: api.wiko.com → ALB
   ```

**Status:** Complete when `https://defect-analyzer.wiko.com` works

---

### **Step 8: Database Schema Setup (15 minutes)**

**Connect to RDS and create tables:**

```bash
# Option 1: From EC2 bastion (recommended for production)
# ssh into bastion → psql -h <rds-endpoint> -U wikoAdmin

# Option 2: Enable temporary public access (development only)
# aws rds modify-db-instance \
#   --db-instance-identifier wiko-defect-analyzer-db-production \
#   --publicly-accessible

# Connect to database
psql -h <rds-endpoint> -U wikoAdmin -d postgres

# Create database
CREATE DATABASE wiko_defect_db;
\c wiko_defect_db

-- Run schema from AWS_DEPLOYMENT_ARCHITECTURE.md Section 3
-- Copy and paste the SQL schema here

-- Example:
CREATE TABLE analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    defect_id VARCHAR(50) UNIQUE NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    facility VARCHAR(50) NOT NULL,
    product_sku VARCHAR(50) NOT NULL,
    defect_detected BOOLEAN NOT NULL,
    -- ... rest of schema
);

CREATE TABLE api_keys ( ... );
CREATE TABLE audit_log ( ... );
```

**Status:** Complete when tables are created

---

### **Step 9: Configure Monitoring & Alarms (30 minutes)**

**Create CloudWatch alarms:**

```bash
# High error rate alarm
aws cloudwatch put-metric-alarm \
  --alarm-name wiko-api-high-error-rate \
  --metric-name 5XXError \
  --namespace AWS/ApplicationELB \
  --statistic Sum \
  --period 300 \
  --evaluation-periods 2 \
  --threshold 5 \
  --comparison-operator GreaterThanThreshold \
  --alarm-actions arn:aws:sns:us-east-1:<account-id>:wiko-alerts

# High latency alarm
aws cloudwatch put-metric-alarm \
  --alarm-name wiko-api-high-latency \
  --metric-name TargetResponseTime \
  --namespace AWS/ApplicationELB \
  --statistic Average \
  --period 300 \
  --threshold 3 \
  --comparison-operator GreaterThanThreshold

# RDS CPU alarm
aws cloudwatch put-metric-alarm \
  --alarm-name wiko-db-high-cpu \
  --metric-name CPUUtilization \
  --namespace AWS/RDS \
  --dimensions Name=DBInstanceIdentifier,Value=wiko-defect-analyzer-db-production \
  --statistic Average \
  --period 300 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold
```

**Create SNS topic for alerts:**

```bash
aws sns create-topic --name wiko-alerts
aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-1:<account-id>:wiko-alerts \
  --protocol email \
  --notification-endpoint your-email@wiko.com
```

**Status:** Complete when you receive SNS confirmation email

---

### **Step 10: End-to-End Testing (30 minutes)**

**Test all functionality:**

1. **Frontend loads:**
   ```bash
   curl https://defect-analyzer.wiko.com
   # Should return HTML
   ```

2. **API health check:**
   ```bash
   curl https://api.wiko.com/health
   # Should return: {"status": "healthy"}
   ```

3. **Upload test image:**
   ```bash
   curl -X POST https://api.wiko.com/api/v1/analyze \
     -H "X-API-Key: <your-api-key>" \
     -F "image=@test-images/knife.jpg" \
     -F "product_sku=WK-KN-200" \
     -F "facility=yangjiang"
   ```

4. **Check database:**
   ```sql
   psql -h <rds-endpoint> -U wikoAdmin -d wiko_defect_db
   SELECT COUNT(*) FROM analyses;
   -- Should show 1 record
   ```

5. **Check S3 image storage:**
   ```bash
   aws s3 ls s3://wiko-defect-images-prod/
   ```

6. **Monitor CloudWatch logs:**
   ```bash
   aws logs tail /ecs/wiko-defect-analyzer --follow
   ```

**Status:** Complete when all tests pass

---

### **Step 11: Load Testing (1 hour)**

**Install Artillery:**

```bash
npm install -g artillery
```

**Create load test config:**

```yaml
# load-test.yml
config:
  target: 'https://api.wiko.com'
  phases:
    - duration: 60
      arrivalRate: 10  # 10 requests per second
      name: "Warm up"
    - duration: 300
      arrivalRate: 50  # 50 requests per second
      name: "Sustained load"
scenarios:
  - name: "Health check"
    flow:
      - get:
          url: "/health"
          headers:
            X-API-Key: "{{ $processEnvironment.API_KEY }}"
```

**Run load test:**

```bash
export API_KEY="your-api-key"
artillery run load-test.yml
```

**Monitor during test:**
- ECS task count (should auto-scale)
- RDS CPU/connections
- API latency (p95 < 2s target)
- Error rate (< 1% target)

**Status:** Complete when system handles target load

---

### **Step 12: Disaster Recovery Testing (30 minutes)**

**Test backup restore:**

```bash
# Create RDS snapshot
aws rds create-db-snapshot \
  --db-instance-identifier wiko-defect-analyzer-db-production \
  --db-snapshot-identifier wiko-manual-snapshot-$(date +%Y%m%d)

# Restore to test instance
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier wiko-test-restore \
  --db-snapshot-identifier wiko-manual-snapshot-20251225

# Verify data integrity
psql -h <test-instance-endpoint> -U wikoAdmin -d wiko_defect_db
SELECT COUNT(*) FROM analyses;

# Delete test instance
aws rds delete-db-instance \
  --db-instance-identifier wiko-test-restore \
  --skip-final-snapshot
```

**Test ECS task failure:**

```bash
# Stop a task (should auto-restart)
TASK_ARN=$(aws ecs list-tasks \
  --cluster wiko-defect-analyzer-production \
  --service-name wiko-defect-analyzer-api-service \
  --query 'taskArns[0]' \
  --output text)

aws ecs stop-task \
  --cluster wiko-defect-analyzer-production \
  --task $TASK_ARN

# Verify new task starts automatically
aws ecs list-tasks \
  --cluster wiko-defect-analyzer-production \
  --service-name wiko-defect-analyzer-api-service
```

**Status:** Complete when all DR scenarios work

---

## 📊 Post-Deployment Checklist

### Security

- [ ] Azure API key rotated
- [ ] All secrets in Secrets Manager (not in code)
- [ ] API authentication enabled
- [ ] CORS configured for specific origins only
- [ ] Security groups restrict access (ALB → ECS → RDS)
- [ ] SSL/TLS enabled (HTTPS only)
- [ ] CloudWatch logging enabled
- [ ] IAM roles follow least-privilege

### Performance

- [ ] Auto-scaling configured (2-10 tasks)
- [ ] RDS Multi-AZ enabled
- [ ] Redis Multi-AZ enabled
- [ ] CloudFront caching enabled
- [ ] S3 lifecycle policies configured
- [ ] Load testing passed

### Reliability

- [ ] Automated backups enabled (7-day retention)
- [ ] CloudWatch alarms configured
- [ ] SNS notifications working
- [ ] Health checks passing
- [ ] Graceful shutdown tested
- [ ] Disaster recovery tested

### Monitoring

- [ ] CloudWatch dashboard created
- [ ] Error rate alarms set
- [ ] Latency alarms set
- [ ] CPU/memory alarms set
- [ ] Cost alerts configured
- [ ] Log retention set (30 days)

### Documentation

- [ ] API endpoints documented
- [ ] Runbook created for common issues
- [ ] On-call rotation defined
- [ ] Escalation process documented
- [ ] Architecture diagram updated

---

## 💰 Cost Management

### **Expected Monthly Costs:**

| Service | Configuration | Monthly Cost |
|---------|---------------|--------------|
| ECS Fargate | 2-4 tasks average | $100-200 |
| RDS PostgreSQL | db.t4g.medium, Multi-AZ | $80-120 |
| ElastiCache Redis | cache.t4g.micro × 2 | $30-50 |
| S3 | 100GB storage | $10-30 |
| CloudFront | 100GB transfer | $10-20 |
| ALB | Standard | $20-25 |
| CloudWatch | Logs + metrics | $20-40 |
| **TOTAL** | | **$270-485/month** |

### **Cost Optimization Tips:**

1. **Use Reserved Instances for RDS** (save 30-50%)
2. **Enable S3 Intelligent-Tiering** for images
3. **Use Fargate Spot** for non-critical workloads (save 70%)
4. **Set CloudWatch log retention** to 30 days (not indefinite)
5. **Configure S3 lifecycle** to Glacier after 90 days
6. **Review unused resources** monthly

### **Set Up Cost Alerts:**

```bash
aws budgets create-budget \
  --account-id <account-id> \
  --budget '{
    "BudgetName": "wiko-monthly-budget",
    "BudgetLimit": {
      "Amount": "500",
      "Unit": "USD"
    },
    "TimeUnit": "MONTHLY",
    "BudgetType": "COST"
  }' \
  --notifications-with-subscribers '[{
    "Notification": {
      "NotificationType": "ACTUAL",
      "ComparisonOperator": "GREATER_THAN",
      "Threshold": 80,
      "ThresholdType": "PERCENTAGE"
    },
    "Subscribers": [{
      "SubscriptionType": "EMAIL",
      "Address": "your-email@wiko.com"
    }]
  }]'
```

---

## 🔄 CI/CD Setup (Optional)

### **GitHub Actions Workflow**

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to AWS

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1

      - name: Deploy
        run: |
          chmod +x scripts/deploy-to-aws.sh
          ./scripts/deploy-to-aws.sh --tag ${{ github.sha }}
```

**Status:** Optional but recommended for continuous deployment

---

## 📚 Quick Reference

### **Useful Commands**

```bash
# View ECS service status
aws ecs describe-services --cluster wiko-defect-analyzer-production --services wiko-defect-analyzer-api-service

# View CloudWatch logs
aws logs tail /ecs/wiko-defect-analyzer --follow

# Scale ECS tasks manually
aws ecs update-service --cluster wiko-defect-analyzer-production --service wiko-defect-analyzer-api-service --desired-count 5

# Rollback to previous image
./scripts/deploy-to-aws.sh --tag <previous-git-sha>

# Connect to RDS
psql -h <rds-endpoint> -U wikoAdmin -d wiko_defect_db

# Invalidate CloudFront cache
aws cloudfront create-invalidation --distribution-id <id> --paths "/*"
```

### **Emergency Contacts**

- **AWS Support:** https://console.aws.amazon.com/support
- **Azure Support:** https://portal.azure.com/#blade/Microsoft_Azure_Support/HelpAndSupportBlade
- **On-call Engineer:** [Your contact info]

### **Related Documentation**

- [AWS_DEPLOYMENT_ARCHITECTURE.md](AWS_DEPLOYMENT_ARCHITECTURE.md) - Detailed AWS guide
- [CODEBASE_CLEANUP_SUMMARY.md](CODEBASE_CLEANUP_SUMMARY.md) - Code organization
- [SECURITY_FIXES_SUMMARY.md](SECURITY_FIXES_SUMMARY.md) - Security improvements
- [scripts/README.md](scripts/README.md) - Deployment scripts usage

---

## ✅ Completion Criteria

Your deployment is complete when:

- ✅ All 12 steps above are marked complete
- ✅ Frontend accessible at your domain
- ✅ API responding to requests
- ✅ Database storing analysis results
- ✅ CloudWatch alarms configured and active
- ✅ Load testing passed
- ✅ Disaster recovery tested
- ✅ Team trained on operations

**Estimated Total Time:** 6-8 hours for first deployment
**Subsequent Deployments:** 5-10 minutes using automation

---

**Status:** Ready to deploy! Start with Step 1 (Rotate API Key) immediately.

**Next Action:** Rotate the exposed Azure API key, then proceed with AWS infrastructure setup.
