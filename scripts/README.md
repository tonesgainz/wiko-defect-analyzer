# Deployment Scripts

This directory contains automation scripts for deploying the Wiko Defect Analyzer to AWS.

## 📜 Scripts

### `deploy-to-aws.sh`

Automated deployment script for AWS infrastructure.

**Features:**
- ✅ Builds and pushes Docker images to ECR
- ✅ Updates ECS Fargate service
- ✅ Deploys React frontend to S3
- ✅ Invalidates CloudFront cache
- ✅ Checks prerequisites automatically
- ✅ Color-coded output for easy monitoring

**Prerequisites:**
- AWS CLI installed and configured
- Docker installed and running
- Node.js 18+ (for frontend build)
- AWS credentials with appropriate permissions

**Basic Usage:**

```bash
# Deploy everything (backend + frontend)
./scripts/deploy-to-aws.sh

# Deploy backend only
./scripts/deploy-to-aws.sh --backend-only

# Deploy frontend only
./scripts/deploy-to-aws.sh --frontend-only

# Deploy with specific image tag
./scripts/deploy-to-aws.sh --tag v1.2.3

# Show help
./scripts/deploy-to-aws.sh --help
```

**Environment Variables:**

```bash
# Set AWS region (default: us-east-1)
export AWS_REGION=us-west-2

# Set environment (default: production)
export ENVIRONMENT=staging

# Run deployment
./scripts/deploy-to-aws.sh
```

**Example Output:**

```
═══════════════════════════════════════════════════════
  Wiko Defect Analyzer - AWS Deployment
═══════════════════════════════════════════════════════

Environment: production
AWS Region:  us-east-1

═══════════════════════════════════════════════════════
  Checking Prerequisites
═══════════════════════════════════════════════════════

✅ AWS CLI installed: aws-cli/2.13.0
✅ Docker installed: Docker version 24.0.6
✅ AWS credentials configured
AWS Account ID: 123456789012

═══════════════════════════════════════════════════════
  Building and Pushing Docker Image
═══════════════════════════════════════════════════════

ℹ️  Building Docker image...
✅ Docker image built: wiko-defect-analyzer:abc123
✅ ECR repository exists
ℹ️  Logging into ECR...
✅ Logged into ECR
ℹ️  Tagging and pushing image to ECR...
✅ Image pushed: 123456789012.dkr.ecr.us-east-1.amazonaws.com/wiko-defect-analyzer:abc123

═══════════════════════════════════════════════════════
  Updating ECS Service
═══════════════════════════════════════════════════════

ℹ️  Forcing new deployment of ECS service...
✅ ECS service update initiated
ℹ️  Waiting for service to stabilize (this may take 5-10 minutes)...
✅ ECS service updated successfully

═══════════════════════════════════════════════════════
  Deploying Frontend to S3
═══════════════════════════════════════════════════════

ℹ️  Installing frontend dependencies...
ℹ️  Building frontend...
✅ Frontend built successfully
✅ S3 bucket exists
ℹ️  Uploading frontend files to S3...
✅ Frontend deployed to S3: wiko-defect-analyzer-frontend-production

═══════════════════════════════════════════════════════
  Invalidating CloudFront Cache
═══════════════════════════════════════════════════════

ℹ️  Creating CloudFront invalidation for distribution: E1234567890ABC
✅ CloudFront cache invalidation created

═══════════════════════════════════════════════════════
  Deployment Summary
═══════════════════════════════════════════════════════

Environment:        production
AWS Region:         us-east-1
AWS Account:        123456789012

ECS Tasks:          3/3 running
API Endpoint:       https://wiko-api-alb-123456789.us-east-1.elb.amazonaws.com
Frontend S3:        s3://wiko-defect-analyzer-frontend-production

✅ Deployment completed successfully!

ℹ️  For detailed deployment guide, see: AWS_DEPLOYMENT_ARCHITECTURE.md
```

## 🔐 Required IAM Permissions

The AWS user/role running this script needs the following permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecr:*",
        "ecs:UpdateService",
        "ecs:DescribeServices",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:ListBucket",
        "s3:CreateBucket",
        "cloudfront:CreateInvalidation",
        "cloudfront:ListDistributions"
      ],
      "Resource": "*"
    }
  ]
}
```

## 🚀 CI/CD Integration

### GitHub Actions

Add this to `.github/workflows/deploy.yml`:

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

      - name: Run deployment script
        run: |
          chmod +x scripts/deploy-to-aws.sh
          ./scripts/deploy-to-aws.sh --tag ${{ github.sha }}
```

### GitLab CI

Add this to `.gitlab-ci.yml`:

```yaml
deploy:
  stage: deploy
  image: docker:latest
  services:
    - docker:dind
  before_script:
    - apk add --no-cache aws-cli bash
  script:
    - chmod +x scripts/deploy-to-aws.sh
    - ./scripts/deploy-to-aws.sh --tag $CI_COMMIT_SHORT_SHA
  only:
    - main
```

## 🧪 Testing the Deployment

After deployment completes, verify everything works:

```bash
# Test API health endpoint
curl https://your-alb-endpoint.amazonaws.com/health

# Test frontend
curl https://your-cloudfront-domain.cloudfront.net

# Check ECS service status
aws ecs describe-services \
  --cluster wiko-defect-analyzer-production \
  --services wiko-defect-analyzer-api-service \
  --region us-east-1

# Check recent CloudWatch logs
aws logs tail /ecs/wiko-defect-analyzer --follow
```

## 🔄 Rollback

To rollback to a previous version:

```bash
# List available image tags
aws ecr list-images \
  --repository-name wiko-defect-analyzer \
  --region us-east-1

# Deploy specific version
./scripts/deploy-to-aws.sh --tag <previous-tag>
```

## 📝 Troubleshooting

### Script fails with "AWS credentials not configured"

```bash
# Configure AWS credentials
aws configure
```

### Docker build fails

```bash
# Check Docker is running
docker ps

# Check Dockerfile exists
ls -la Dockerfile
```

### ECS service not found

```bash
# Create ECS infrastructure first using Terraform or manually
# See: AWS_DEPLOYMENT_ARCHITECTURE.md
```

### S3 upload fails with permissions error

```bash
# Verify IAM permissions include s3:PutObject
# Check bucket policy allows your AWS account
```

## 📚 Related Documentation

- [AWS_DEPLOYMENT_ARCHITECTURE.md](../AWS_DEPLOYMENT_ARCHITECTURE.md) - Complete AWS setup guide
- [CODEBASE_CLEANUP_SUMMARY.md](../CODEBASE_CLEANUP_SUMMARY.md) - Codebase organization
- [SECURITY_FIXES_SUMMARY.md](../SECURITY_FIXES_SUMMARY.md) - Security improvements

---

**Questions or Issues?** Open an issue on GitHub or contact the DevOps team.
