# AWS Deployment Architecture Guide

**Project:** Wiko Defect Analyzer
**Date:** December 25, 2025
**Status:** Production-Ready Deployment Plan

---

## 🎯 Architecture Overview

This guide provides a complete AWS deployment architecture for the Wiko Defect Analyzer, a Flask-based AI application with React frontend that performs manufacturing defect detection using Azure OpenAI GPT-5.2.

### **High-Level Architecture**

```
┌─────────────────────────────────────────────────────────────────┐
│                        AWS Cloud                                 │
│                                                                  │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐ │
│  │  CloudFront  │─────▶│   S3 Bucket  │      │  Route 53    │ │
│  │   (CDN)      │      │  (Frontend)  │      │    (DNS)     │ │
│  └──────────────┘      └──────────────┘      └──────────────┘ │
│         │                                                        │
│         │                                                        │
│  ┌──────▼───────────────────────────────────────────────────┐  │
│  │          Application Load Balancer (ALB)                  │  │
│  │              SSL/TLS Termination                          │  │
│  └──────┬───────────────────────────────────────────────────┘  │
│         │                                                        │
│  ┌──────▼──────────────────────────────────────────────────┐   │
│  │           ECS Fargate Cluster                            │   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐         │   │
│  │  │   Task 1   │  │   Task 2   │  │   Task 3   │         │   │
│  │  │  Flask API │  │  Flask API │  │  Flask API │         │   │
│  │  └────────────┘  └────────────┘  └────────────┘         │   │
│  │        Auto-scaling: 2-10 tasks                          │   │
│  └──────────────────────────────────────────────────────────┘   │
│         │                                                        │
│  ┌──────▼──────────────────────────────────────────────────┐   │
│  │         ElastiCache for Redis (Rate Limiting)            │   │
│  └──────────────────────────────────────────────────────────┘   │
│         │                                                        │
│  ┌──────▼──────────────────────────────────────────────────┐   │
│  │           RDS PostgreSQL (Analysis Results)              │   │
│  │              Multi-AZ, Automated Backups                 │   │
│  └──────────────────────────────────────────────────────────┘   │
│         │                                                        │
│  ┌──────▼──────────────────────────────────────────────────┐   │
│  │       S3 Bucket (Image Storage + Versioning)             │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                          │
                          │ API Calls
                          ▼
              ┌─────────────────────────┐
              │   Azure OpenAI GPT-5.2  │
              │   (External Service)     │
              └─────────────────────────┘
```

---

## 📋 Component Breakdown

### **1. Frontend: Amazon S3 + CloudFront**

**Service:** Static website hosting
**Why:** React SPA needs fast, global CDN delivery

**Components:**
- **S3 Bucket:** Hosts built React files (`npm run build`)
- **CloudFront:** CDN for global low-latency access
- **Route 53:** Custom domain DNS (e.g., `defect-analyzer.wiko.com`)

**Cost:** ~$5-15/month (low traffic)

---

### **2. Backend: Amazon ECS Fargate**

**Service:** Containerized Flask API
**Why:** Serverless containers, auto-scaling, no server management

**Components:**
- **ECS Cluster:** Runs Docker containers
- **Fargate Tasks:** 2-10 instances (auto-scale based on CPU/memory)
- **Application Load Balancer:** HTTPS traffic distribution
- **ECR (Elastic Container Registry):** Docker image storage

**Configuration:**
- **CPU:** 2 vCPU per task
- **Memory:** 4GB per task
- **Min Tasks:** 2 (high availability)
- **Max Tasks:** 10 (handles traffic spikes)

**Cost:** ~$100-200/month (2-4 tasks running)

---

### **3. Database: Amazon RDS PostgreSQL**

**Service:** Managed relational database
**Why:** Store analysis results, user data, audit logs

**Schema:**
```sql
-- Defect Analysis Results
CREATE TABLE analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    defect_id VARCHAR(50) UNIQUE NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    facility VARCHAR(50) NOT NULL,
    product_sku VARCHAR(50) NOT NULL,
    defect_detected BOOLEAN NOT NULL,
    defect_type VARCHAR(50),
    severity VARCHAR(20),
    confidence DECIMAL(5,4),
    description TEXT,
    affected_area VARCHAR(100),
    bounding_box JSONB,
    root_cause TEXT,
    five_why_chain JSONB,
    corrective_actions JSONB,
    image_s3_key VARCHAR(255),
    model_version VARCHAR(20),
    created_at TIMESTAMP DEFAULT NOW()
);

-- API Keys
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key_hash VARCHAR(128) UNIQUE NOT NULL,
    description VARCHAR(255),
    rate_limit INTEGER DEFAULT 300,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    last_used_at TIMESTAMP
);

-- Audit Log
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    api_key_id UUID REFERENCES api_keys(id),
    endpoint VARCHAR(100),
    method VARCHAR(10),
    ip_address INET,
    timestamp TIMESTAMP DEFAULT NOW(),
    response_code INTEGER
);
```

**Configuration:**
- **Instance:** db.t4g.medium (2 vCPU, 4GB RAM)
- **Storage:** 100GB GP3 SSD (auto-scaling enabled)
- **Multi-AZ:** Yes (high availability)
- **Backup:** Automated daily, 7-day retention

**Cost:** ~$80-120/month

---

### **4. Cache: Amazon ElastiCache for Redis**

**Service:** In-memory cache for rate limiting
**Why:** Distributed rate limiting across multiple API instances

**Configuration:**
- **Instance:** cache.t4g.micro (2 instances for HA)
- **Redis Version:** 7.0+
- **Multi-AZ:** Yes

**Cost:** ~$30-50/month

---

### **5. Storage: Amazon S3 (Images)**

**Service:** Object storage for uploaded images
**Why:** Scalable, durable storage with lifecycle policies

**Buckets:**
- `wiko-defect-images-prod` - Uploaded images
- `wiko-frontend-prod` - React build files

**Features:**
- **Versioning:** Enabled (recover deleted images)
- **Lifecycle:** Move to Glacier after 90 days
- **Encryption:** AES-256 (server-side)

**Cost:** ~$10-30/month (depends on image volume)

---

### **6. Monitoring: CloudWatch + X-Ray**

**Services:** Application monitoring and tracing

**Metrics to Monitor:**
- API response time
- Error rates (4xx, 5xx)
- ECS CPU/Memory utilization
- RDS connections
- Redis hit/miss ratio

**Alarms:**
- Error rate > 5% → Send SNS notification
- API latency > 3s → Auto-scale ECS tasks
- RDS CPU > 80% → Alert DevOps

**Cost:** ~$20-40/month

---

## 🚀 Step-by-Step Deployment Guide

### **Phase 1: Prerequisites (30 minutes)**

#### **1.1 Install AWS CLI**
```bash
# macOS
brew install awscli

# Verify installation
aws --version

# Configure credentials
aws configure
# AWS Access Key ID: [Your Key]
# AWS Secret Access Key: [Your Secret]
# Default region: us-east-1
# Default output format: json
```

#### **1.2 Install Docker**
```bash
# macOS
brew install --cask docker

# Verify
docker --version
docker-compose --version
```

#### **1.3 Install Terraform (Optional but Recommended)**
```bash
# macOS
brew install terraform

# Verify
terraform --version
```

---

### **Phase 2: Backend Setup (2-3 hours)**

#### **2.1 Create RDS PostgreSQL Database**

```bash
# Create database using AWS CLI
aws rds create-db-instance \
  --db-instance-identifier wiko-defect-db-prod \
  --db-instance-class db.t4g.medium \
  --engine postgres \
  --engine-version 15.4 \
  --master-username wikoAdmin \
  --master-user-password 'CHANGE_THIS_PASSWORD' \
  --allocated-storage 100 \
  --storage-type gp3 \
  --multi-az \
  --backup-retention-period 7 \
  --vpc-security-group-ids sg-xxxxxxxxx \
  --db-subnet-group-name wiko-db-subnet-group \
  --publicly-accessible false \
  --storage-encrypted \
  --tags Key=Environment,Value=production Key=Project,Value=wiko-defect-analyzer
```

**Wait for database to be available (~10 minutes):**
```bash
aws rds wait db-instance-available --db-instance-identifier wiko-defect-db-prod
```

**Get database endpoint:**
```bash
aws rds describe-db-instances \
  --db-instance-identifier wiko-defect-db-prod \
  --query 'DBInstances[0].Endpoint.Address' \
  --output text
```

#### **2.2 Create ElastiCache Redis Cluster**

```bash
aws elasticache create-replication-group \
  --replication-group-id wiko-redis-prod \
  --replication-group-description "Rate limiting for Wiko API" \
  --engine redis \
  --engine-version 7.0 \
  --cache-node-type cache.t4g.micro \
  --num-cache-clusters 2 \
  --automatic-failover-enabled \
  --multi-az-enabled \
  --cache-subnet-group-name wiko-cache-subnet-group \
  --security-group-ids sg-xxxxxxxxx \
  --tags Key=Environment,Value=production
```

**Get Redis endpoint:**
```bash
aws elasticache describe-replication-groups \
  --replication-group-id wiko-redis-prod \
  --query 'ReplicationGroups[0].NodeGroups[0].PrimaryEndpoint.Address' \
  --output text
```

#### **2.3 Create S3 Bucket for Images**

```bash
# Create bucket
aws s3 mb s3://wiko-defect-images-prod --region us-east-1

# Enable versioning
aws s3api put-bucket-versioning \
  --bucket wiko-defect-images-prod \
  --versioning-configuration Status=Enabled

# Enable encryption
aws s3api put-bucket-encryption \
  --bucket wiko-defect-images-prod \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "AES256"
      }
    }]
  }'

# Set lifecycle policy (move to Glacier after 90 days)
cat > lifecycle-policy.json <<EOF
{
  "Rules": [{
    "Id": "MoveToGlacier",
    "Status": "Enabled",
    "Transitions": [{
      "Days": 90,
      "StorageClass": "GLACIER"
    }]
  }]
}
EOF

aws s3api put-bucket-lifecycle-configuration \
  --bucket wiko-defect-images-prod \
  --lifecycle-configuration file://lifecycle-policy.json
```

#### **2.4 Build and Push Docker Image**

**Create Dockerfile:**
```dockerfile
# Create this file: Dockerfile
FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first (for caching)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create non-root user
RUN useradd -m -u 1000 wikouser && chown -R wikouser:wikouser /app
USER wikouser

# Expose port
EXPOSE 5001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:5001/health')"

# Run application
CMD ["gunicorn", "--bind", "0.0.0.0:5001", "--workers", "4", "--timeout", "120", "--access-logfile", "-", "--error-logfile", "-", "app:app"]
```

**Build and push:**
```bash
# Create ECR repository
aws ecr create-repository \
  --repository-name wiko-defect-analyzer \
  --region us-east-1

# Get ECR login token
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin <your-account-id>.dkr.ecr.us-east-1.amazonaws.com

# Build image
docker build -t wiko-defect-analyzer:latest .

# Tag image
docker tag wiko-defect-analyzer:latest \
  <your-account-id>.dkr.ecr.us-east-1.amazonaws.com/wiko-defect-analyzer:latest

# Push to ECR
docker push <your-account-id>.dkr.ecr.us-east-1.amazonaws.com/wiko-defect-analyzer:latest
```

#### **2.5 Create ECS Cluster and Service**

**Create task definition:**
```bash
cat > task-definition.json <<EOF
{
  "family": "wiko-defect-analyzer",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "2048",
  "memory": "4096",
  "executionRoleArn": "arn:aws:iam::<account-id>:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::<account-id>:role/ecsTaskRole",
  "containerDefinitions": [
    {
      "name": "wiko-api",
      "image": "<account-id>.dkr.ecr.us-east-1.amazonaws.com/wiko-defect-analyzer:latest",
      "portMappings": [
        {
          "containerPort": 5001,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {"name": "ENVIRONMENT", "value": "production"},
        {"name": "PORT", "value": "5001"},
        {"name": "FLASK_DEBUG", "value": "0"},
        {"name": "CORS_ORIGINS", "value": "https://defect-analyzer.wiko.com"},
        {"name": "RATE_LIMIT_PER_IP", "value": "60 per minute"},
        {"name": "MAX_IMAGE_SIZE_MB", "value": "16"}
      ],
      "secrets": [
        {"name": "AZURE_AI_API_KEY", "valueFrom": "arn:aws:secretsmanager:us-east-1:<account-id>:secret:wiko/azure-api-key"},
        {"name": "API_KEY", "valueFrom": "arn:aws:secretsmanager:us-east-1:<account-id>:secret:wiko/api-key"},
        {"name": "SECRET_KEY", "valueFrom": "arn:aws:secretsmanager:us-east-1:<account-id>:secret:wiko/secret-key"},
        {"name": "DATABASE_URL", "valueFrom": "arn:aws:secretsmanager:us-east-1:<account-id>:secret:wiko/database-url"},
        {"name": "REDIS_URL", "valueFrom": "arn:aws:secretsmanager:us-east-1:<account-id>:secret:wiko/redis-url"}
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/wiko-defect-analyzer",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "api"
        }
      },
      "healthCheck": {
        "command": ["CMD-SHELL", "curl -f http://localhost:5001/health || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 60
      }
    }
  ]
}
EOF

# Register task definition
aws ecs register-task-definition --cli-input-json file://task-definition.json
```

**Create ECS cluster:**
```bash
aws ecs create-cluster --cluster-name wiko-defect-analyzer-prod
```

**Create Application Load Balancer:**
```bash
# Create ALB
aws elbv2 create-load-balancer \
  --name wiko-api-alb \
  --subnets subnet-xxxxxx subnet-yyyyyy \
  --security-groups sg-xxxxxxxxx \
  --scheme internet-facing \
  --type application \
  --tags Key=Environment,Value=production

# Create target group
aws elbv2 create-target-group \
  --name wiko-api-tg \
  --protocol HTTP \
  --port 5001 \
  --vpc-id vpc-xxxxxxxx \
  --target-type ip \
  --health-check-path /health \
  --health-check-interval-seconds 30 \
  --health-check-timeout-seconds 5 \
  --healthy-threshold-count 2 \
  --unhealthy-threshold-count 3

# Create HTTPS listener (requires ACM certificate)
aws elbv2 create-listener \
  --load-balancer-arn <alb-arn> \
  --protocol HTTPS \
  --port 443 \
  --certificates CertificateArn=<acm-cert-arn> \
  --default-actions Type=forward,TargetGroupArn=<target-group-arn>
```

**Create ECS service with auto-scaling:**
```bash
# Create service
aws ecs create-service \
  --cluster wiko-defect-analyzer-prod \
  --service-name wiko-api-service \
  --task-definition wiko-defect-analyzer \
  --desired-count 2 \
  --launch-type FARGATE \
  --platform-version LATEST \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxxxx,subnet-yyyyy],securityGroups=[sg-xxxxxxx],assignPublicIp=DISABLED}" \
  --load-balancers "targetGroupArn=<target-group-arn>,containerName=wiko-api,containerPort=5001" \
  --health-check-grace-period-seconds 60

# Configure auto-scaling
aws application-autoscaling register-scalable-target \
  --service-namespace ecs \
  --scalable-dimension ecs:service:DesiredCount \
  --resource-id service/wiko-defect-analyzer-prod/wiko-api-service \
  --min-capacity 2 \
  --max-capacity 10

# CPU-based scaling policy
aws application-autoscaling put-scaling-policy \
  --service-namespace ecs \
  --scalable-dimension ecs:service:DesiredCount \
  --resource-id service/wiko-defect-analyzer-prod/wiko-api-service \
  --policy-name cpu-scaling \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration '{
    "TargetValue": 70.0,
    "PredefinedMetricSpecification": {
      "PredefinedMetricType": "ECSServiceAverageCPUUtilization"
    },
    "ScaleInCooldown": 300,
    "ScaleOutCooldown": 60
  }'
```

---

### **Phase 3: Frontend Deployment (1 hour)**

#### **3.1 Configure Frontend Environment**

```bash
cd frontend

# Create production environment file
cat > .env.production <<EOF
VITE_API_URL=https://api.wiko-defect-analyzer.com
EOF
```

#### **3.2 Build React Application**

```bash
npm install
npm run build
# Output: frontend/dist/
```

#### **3.3 Create S3 Bucket for Frontend**

```bash
# Create bucket
aws s3 mb s3://wiko-frontend-prod --region us-east-1

# Configure for static website hosting
aws s3 website s3://wiko-frontend-prod \
  --index-document index.html \
  --error-document index.html

# Set bucket policy for public read
cat > bucket-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "PublicReadGetObject",
    "Effect": "Allow",
    "Principal": "*",
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::wiko-frontend-prod/*"
  }]
}
EOF

aws s3api put-bucket-policy \
  --bucket wiko-frontend-prod \
  --policy file://bucket-policy.json
```

#### **3.4 Upload Built Files**

```bash
# Upload build files
aws s3 sync dist/ s3://wiko-frontend-prod/ \
  --delete \
  --cache-control "public, max-age=31536000, immutable" \
  --exclude "index.html"

# Upload index.html separately (no caching)
aws s3 cp dist/index.html s3://wiko-frontend-prod/index.html \
  --cache-control "no-cache, no-store, must-revalidate"
```

#### **3.5 Create CloudFront Distribution**

```bash
cat > cloudfront-config.json <<EOF
{
  "CallerReference": "wiko-frontend-$(date +%s)",
  "Comment": "Wiko Defect Analyzer Frontend",
  "Enabled": true,
  "DefaultRootObject": "index.html",
  "Origins": {
    "Quantity": 1,
    "Items": [{
      "Id": "S3-wiko-frontend",
      "DomainName": "wiko-frontend-prod.s3.amazonaws.com",
      "S3OriginConfig": {
        "OriginAccessIdentity": ""
      }
    }]
  },
  "DefaultCacheBehavior": {
    "TargetOriginId": "S3-wiko-frontend",
    "ViewerProtocolPolicy": "redirect-to-https",
    "AllowedMethods": {
      "Quantity": 2,
      "Items": ["GET", "HEAD"]
    },
    "Compress": true,
    "MinTTL": 0,
    "DefaultTTL": 86400,
    "MaxTTL": 31536000,
    "ForwardedValues": {
      "QueryString": false,
      "Cookies": {"Forward": "none"}
    }
  },
  "CustomErrorResponses": {
    "Quantity": 1,
    "Items": [{
      "ErrorCode": 404,
      "ResponsePagePath": "/index.html",
      "ResponseCode": "200",
      "ErrorCachingMinTTL": 300
    }]
  },
  "Aliases": {
    "Quantity": 1,
    "Items": ["defect-analyzer.wiko.com"]
  },
  "ViewerCertificate": {
    "ACMCertificateArn": "<your-acm-cert-arn>",
    "SSLSupportMethod": "sni-only",
    "MinimumProtocolVersion": "TLSv1.2_2021"
  }
}
EOF

aws cloudfront create-distribution --distribution-config file://cloudfront-config.json
```

#### **3.6 Configure Route 53 DNS**

```bash
# Get CloudFront distribution domain name
CLOUDFRONT_DOMAIN=$(aws cloudfront list-distributions \
  --query "DistributionList.Items[?Comment=='Wiko Defect Analyzer Frontend'].DomainName" \
  --output text)

# Create Route 53 record
cat > route53-record.json <<EOF
{
  "Changes": [{
    "Action": "UPSERT",
    "ResourceRecordSet": {
      "Name": "defect-analyzer.wiko.com",
      "Type": "A",
      "AliasTarget": {
        "HostedZoneId": "Z2FDTNDATAQYW2",
        "DNSName": "$CLOUDFRONT_DOMAIN",
        "EvaluateTargetHealth": false
      }
    }
  }]
}
EOF

aws route53 change-resource-record-sets \
  --hosted-zone-id <your-hosted-zone-id> \
  --change-batch file://route53-record.json
```

---

### **Phase 4: Secrets Management (30 minutes)**

#### **4.1 Store Secrets in AWS Secrets Manager**

```bash
# Azure API Key
aws secretsmanager create-secret \
  --name wiko/azure-api-key \
  --description "Azure OpenAI API Key" \
  --secret-string "NEW_ROTATED_KEY_HERE"

# API Key for authentication
aws secretsmanager create-secret \
  --name wiko/api-key \
  --secret-string "$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')"

# Flask Secret Key
aws secretsmanager create-secret \
  --name wiko/secret-key \
  --secret-string "$(python3 -c 'import secrets; print(secrets.token_hex(32))')"

# Database URL
aws secretsmanager create-secret \
  --name wiko/database-url \
  --secret-string "postgresql://wikoAdmin:PASSWORD@<rds-endpoint>:5432/wiko_defect_db"

# Redis URL
aws secretsmanager create-secret \
  --name wiko/redis-url \
  --secret-string "redis://<redis-endpoint>:6379/0"
```

---

### **Phase 5: Database Schema Setup (15 minutes)**

```bash
# Connect to RDS (from EC2 bastion or local with VPN)
psql -h <rds-endpoint> -U wikoAdmin -d postgres

# Create database
CREATE DATABASE wiko_defect_db;
\c wiko_defect_db

# Run schema from earlier (see Section 3)
-- Copy and paste SQL schema here
```

---

### **Phase 6: Monitoring & Alarms (30 minutes)**

#### **6.1 Create CloudWatch Log Group**

```bash
aws logs create-log-group --log-group-name /ecs/wiko-defect-analyzer
aws logs put-retention-policy --log-group-name /ecs/wiko-defect-analyzer --retention-in-days 30
```

#### **6.2 Create SNS Topic for Alarms**

```bash
# Create SNS topic
aws sns create-topic --name wiko-alerts

# Subscribe email
aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-1:<account-id>:wiko-alerts \
  --protocol email \
  --notification-endpoint your-email@wiko.com
```

#### **6.3 Create CloudWatch Alarms**

```bash
# High error rate alarm
aws cloudwatch put-metric-alarm \
  --alarm-name wiko-api-high-error-rate \
  --alarm-description "Alert when API error rate exceeds 5%" \
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
  --alarm-description "Alert when API latency exceeds 3 seconds" \
  --metric-name TargetResponseTime \
  --namespace AWS/ApplicationELB \
  --statistic Average \
  --period 300 \
  --evaluation-periods 2 \
  --threshold 3 \
  --comparison-operator GreaterThanThreshold \
  --alarm-actions arn:aws:sns:us-east-1:<account-id>:wiko-alerts

# RDS CPU alarm
aws cloudwatch put-metric-alarm \
  --alarm-name wiko-db-high-cpu \
  --alarm-description "Alert when RDS CPU exceeds 80%" \
  --metric-name CPUUtilization \
  --namespace AWS/RDS \
  --dimensions Name=DBInstanceIdentifier,Value=wiko-defect-db-prod \
  --statistic Average \
  --period 300 \
  --evaluation-periods 2 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --alarm-actions arn:aws:sns:us-east-1:<account-id>:wiko-alerts
```

---

## 💰 Cost Estimation

### **Monthly Costs (Production Environment)**

| Service | Configuration | Monthly Cost |
|---------|---------------|--------------|
| **ECS Fargate** | 2-4 tasks (2 vCPU, 4GB RAM) | $100-200 |
| **RDS PostgreSQL** | db.t4g.medium, 100GB, Multi-AZ | $80-120 |
| **ElastiCache Redis** | cache.t4g.micro × 2, Multi-AZ | $30-50 |
| **S3** | 100GB images + frontend | $10-30 |
| **CloudFront** | 100GB/month transfer | $10-20 |
| **Application Load Balancer** | Standard ALB | $20-25 |
| **Route 53** | 1 hosted zone | $0.50 |
| **CloudWatch** | Logs + metrics | $20-40 |
| **Secrets Manager** | 5 secrets | $2 |
| **Data Transfer** | Outbound to Azure/internet | $20-40 |
| **TOTAL** | | **$292-527/month** |

**Cost Optimization Tips:**
- Use Reserved Instances for RDS (save 30-50%)
- Enable S3 Intelligent-Tiering for images
- Use Fargate Spot for non-critical tasks (save 70%)
- Compress CloudFront responses (reduce bandwidth)

---

## 🔐 Security Best Practices

### **1. Network Security**

- ✅ **VPC Isolation:** ECS, RDS, Redis in private subnets
- ✅ **Security Groups:** Restrict access (e.g., ALB → ECS only on port 5001)
- ✅ **NACLs:** Additional network-level firewall
- ✅ **No Public IPs:** ECS tasks use NAT Gateway for outbound

### **2. IAM & Access Control**

```json
// ECS Task Role (minimal permissions)
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject"
      ],
      "Resource": "arn:aws:s3:::wiko-defect-images-prod/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": "arn:aws:secretsmanager:us-east-1:*:secret:wiko/*"
    }
  ]
}
```

### **3. Data Encryption**

- ✅ **At Rest:** RDS encrypted, S3 encrypted (AES-256)
- ✅ **In Transit:** TLS 1.2+ everywhere (ALB, CloudFront, RDS)
- ✅ **Secrets:** AWS Secrets Manager with auto-rotation

### **4. Compliance**

- ✅ **Audit Logging:** CloudTrail for all AWS API calls
- ✅ **Database Backups:** Automated daily, 7-day retention
- ✅ **WAF:** Optional Web Application Firewall for ALB

---

## 📊 Monitoring Dashboard

### **Key Metrics to Track**

**Application Metrics:**
- API request rate (requests/minute)
- Error rate (%) - target: < 1%
- Latency (p50, p95, p99) - target: p95 < 2s
- Active ECS tasks
- Azure API response time

**Infrastructure Metrics:**
- ECS CPU/Memory utilization - target: 60-70%
- RDS connections - target: < 80% max
- Redis hit rate - target: > 90%
- S3 request rate

**Business Metrics:**
- Total analyses performed
- Defects detected (%)
- Average confidence score
- Top defect types

---

## 🧪 Testing Checklist

### **Before Going Live:**

- [ ] **Load Testing:**
  ```bash
  # Use Artillery or k6
  artillery quick --count 100 --num 10 https://api.wiko-defect-analyzer.com/health
  ```

- [ ] **Security Scan:**
  ```bash
  # OWASP ZAP scan
  docker run -t owasp/zap2docker-stable zap-baseline.py -t https://api.wiko-defect-analyzer.com
  ```

- [ ] **Backup Restore Test:**
  ```bash
  # Restore RDS snapshot to test database
  aws rds restore-db-instance-from-db-snapshot \
    --db-instance-identifier wiko-test-restore \
    --db-snapshot-identifier <snapshot-id>
  ```

- [ ] **Disaster Recovery Drill:**
  - Simulate ECS task failure (auto-recovery)
  - Simulate RDS failover (Multi-AZ)
  - Test Redis failover

- [ ] **End-to-End Test:**
  - Upload image via frontend
  - Verify analysis result stored in RDS
  - Check image stored in S3
  - Verify CloudWatch logs

---

## 🚨 Troubleshooting

### **Common Issues:**

**1. ECS Tasks Failing to Start**
```bash
# Check logs
aws logs tail /ecs/wiko-defect-analyzer --follow

# Common causes:
# - Secrets Manager permissions
# - Invalid environment variables
# - Health check failing
```

**2. High Latency**
```bash
# Check Azure API response time
# Check RDS slow query log
# Check Redis hit rate
# Scale ECS tasks horizontally
```

**3. Database Connection Pool Exhausted**
```bash
# Increase RDS max_connections parameter
# Optimize connection pooling in Flask (e.g., SQLAlchemy pool_size)
```

---

## 🔄 CI/CD Pipeline (Bonus)

### **GitHub Actions Workflow**

```yaml
# .github/workflows/deploy.yml
name: Deploy to AWS

on:
  push:
    branches: [main]

jobs:
  deploy-backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1

      - name: Login to Amazon ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v1

      - name: Build and push Docker image
        env:
          ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
          ECR_REPOSITORY: wiko-defect-analyzer
          IMAGE_TAG: ${{ github.sha }}
        run: |
          docker build -t $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG .
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG
          docker tag $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG $ECR_REGISTRY/$ECR_REPOSITORY:latest
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:latest

      - name: Update ECS service
        run: |
          aws ecs update-service \
            --cluster wiko-defect-analyzer-prod \
            --service wiko-api-service \
            --force-new-deployment

  deploy-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Build frontend
        working-directory: ./frontend
        run: |
          npm ci
          npm run build

      - name: Deploy to S3
        run: |
          aws s3 sync frontend/dist/ s3://wiko-frontend-prod/ --delete

      - name: Invalidate CloudFront
        run: |
          aws cloudfront create-invalidation \
            --distribution-id <cloudfront-id> \
            --paths "/*"
```

---

## ✅ Post-Deployment Checklist

- [ ] Verify frontend loads at https://defect-analyzer.wiko.com
- [ ] Test API endpoint: `curl https://api.wiko-defect-analyzer.com/health`
- [ ] Upload test image and verify analysis
- [ ] Check CloudWatch logs for errors
- [ ] Verify RDS connection from ECS
- [ ] Test rate limiting (61 requests in 1 minute)
- [ ] Verify API authentication with/without key
- [ ] Check S3 image upload and retrieval
- [ ] Test CloudFront cache invalidation
- [ ] Review CloudWatch alarms (all green)
- [ ] Document all endpoints and credentials
- [ ] Schedule first backup restore test

---

## 📚 Additional Resources

- [AWS ECS Best Practices](https://docs.aws.amazon.com/AmazonECS/latest/bestpracticesguide/intro.html)
- [RDS Security Best Practices](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_BestPractices.Security.html)
- [CloudFront Security](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/SecurityAndPrivateContent.html)

---

**Deployment Status:** Ready to execute
**Estimated Total Time:** 4-6 hours
**Estimated Monthly Cost:** $300-500

**Next Action:** Begin Phase 1 - Install prerequisites and configure AWS CLI.
