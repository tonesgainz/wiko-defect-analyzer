#!/bin/bash
###############################################################################
# Wiko Defect Analyzer - AWS Deployment Script
# This script automates the deployment of the application to AWS
###############################################################################

set -e  # Exit on error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration variables
PROJECT_NAME="wiko-defect-analyzer"
AWS_REGION="${AWS_REGION:-us-east-1}"
ENVIRONMENT="${ENVIRONMENT:-production}"

# Function to print colored messages
print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_header() {
    echo -e "\n${BLUE}═══════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}\n"
}

# Function to check prerequisites
check_prerequisites() {
    print_header "Checking Prerequisites"

    local missing_tools=()

    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        missing_tools+=("aws-cli")
    else
        print_success "AWS CLI installed: $(aws --version | head -n1)"
    fi

    # Check Docker
    if ! command -v docker &> /dev/null; then
        missing_tools+=("docker")
    else
        print_success "Docker installed: $(docker --version)"
    fi

    # Check jq
    if ! command -v jq &> /dev/null; then
        print_warning "jq not installed (optional but recommended)"
    else
        print_success "jq installed: $(jq --version)"
    fi

    if [ ${#missing_tools[@]} -ne 0 ]; then
        print_error "Missing required tools: ${missing_tools[*]}"
        print_info "Install missing tools and try again"
        exit 1
    fi

    # Check AWS credentials
    if ! aws sts get-caller-identity &> /dev/null; then
        print_error "AWS credentials not configured"
        print_info "Run: aws configure"
        exit 1
    else
        print_success "AWS credentials configured"
        aws sts get-caller-identity --query 'Account' --output text | xargs echo "AWS Account ID:"
    fi
}

# Function to get AWS account ID
get_account_id() {
    aws sts get-caller-identity --query 'Account' --output text
}

# Function to build and push Docker image
build_and_push_image() {
    print_header "Building and Pushing Docker Image"

    local ACCOUNT_ID=$(get_account_id)
    local ECR_REGISTRY="${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
    local ECR_REPO="${PROJECT_NAME}"
    local IMAGE_TAG="${1:-latest}"

    print_info "Building Docker image..."

    # Create Dockerfile if it doesn't exist
    if [ ! -f "Dockerfile" ]; then
        print_warning "Dockerfile not found. Creating default Dockerfile..."
        cat > Dockerfile <<'EOF'
FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN useradd -m -u 1000 wikouser && chown -R wikouser:wikouser /app
USER wikouser

EXPOSE 5001

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:5001/health || exit 1

CMD ["gunicorn", "--bind", "0.0.0.0:5001", "--workers", "4", "--timeout", "120", "--access-logfile", "-", "--error-logfile", "-", "app:app"]
EOF
        print_success "Dockerfile created"
    fi

    # Build image
    docker build -t ${PROJECT_NAME}:${IMAGE_TAG} .
    print_success "Docker image built: ${PROJECT_NAME}:${IMAGE_TAG}"

    # Create ECR repository if it doesn't exist
    print_info "Checking ECR repository..."
    if ! aws ecr describe-repositories --repository-names ${ECR_REPO} --region ${AWS_REGION} &> /dev/null; then
        print_warning "ECR repository not found. Creating..."
        aws ecr create-repository \
            --repository-name ${ECR_REPO} \
            --region ${AWS_REGION} \
            --image-scanning-configuration scanOnPush=true \
            --tags Key=Environment,Value=${ENVIRONMENT} Key=Project,Value=${PROJECT_NAME}
        print_success "ECR repository created"
    else
        print_success "ECR repository exists"
    fi

    # Login to ECR
    print_info "Logging into ECR..."
    aws ecr get-login-password --region ${AWS_REGION} | \
        docker login --username AWS --password-stdin ${ECR_REGISTRY}
    print_success "Logged into ECR"

    # Tag and push image
    print_info "Tagging and pushing image to ECR..."
    docker tag ${PROJECT_NAME}:${IMAGE_TAG} ${ECR_REGISTRY}/${ECR_REPO}:${IMAGE_TAG}
    docker push ${ECR_REGISTRY}/${ECR_REPO}:${IMAGE_TAG}

    # Also tag as 'latest' if this is a specific version
    if [ "${IMAGE_TAG}" != "latest" ]; then
        docker tag ${PROJECT_NAME}:${IMAGE_TAG} ${ECR_REGISTRY}/${ECR_REPO}:latest
        docker push ${ECR_REGISTRY}/${ECR_REPO}:latest
        print_success "Image pushed: ${ECR_REGISTRY}/${ECR_REPO}:${IMAGE_TAG} and :latest"
    else
        print_success "Image pushed: ${ECR_REGISTRY}/${ECR_REPO}:${IMAGE_TAG}"
    fi

    echo "${ECR_REGISTRY}/${ECR_REPO}:${IMAGE_TAG}"
}

# Function to deploy frontend to S3
deploy_frontend() {
    print_header "Deploying Frontend to S3"

    local BUCKET_NAME="${PROJECT_NAME}-frontend-${ENVIRONMENT}"

    # Check if frontend directory exists
    if [ ! -d "frontend" ]; then
        print_error "Frontend directory not found"
        return 1
    fi

    cd frontend

    # Install dependencies and build
    print_info "Installing frontend dependencies..."
    npm ci

    print_info "Building frontend..."
    npm run build

    print_success "Frontend built successfully"

    # Create S3 bucket if it doesn't exist
    print_info "Checking S3 bucket..."
    if ! aws s3 ls s3://${BUCKET_NAME} &> /dev/null; then
        print_warning "S3 bucket not found. Creating..."
        aws s3 mb s3://${BUCKET_NAME} --region ${AWS_REGION}

        # Enable versioning
        aws s3api put-bucket-versioning \
            --bucket ${BUCKET_NAME} \
            --versioning-configuration Status=Enabled

        # Enable website hosting
        aws s3 website s3://${BUCKET_NAME} \
            --index-document index.html \
            --error-document index.html

        print_success "S3 bucket created and configured"
    else
        print_success "S3 bucket exists"
    fi

    # Upload build files
    print_info "Uploading frontend files to S3..."

    # Upload all files except index.html with long cache
    aws s3 sync dist/ s3://${BUCKET_NAME}/ \
        --delete \
        --cache-control "public, max-age=31536000, immutable" \
        --exclude "index.html"

    # Upload index.html separately with no cache
    aws s3 cp dist/index.html s3://${BUCKET_NAME}/index.html \
        --cache-control "no-cache, no-store, must-revalidate"

    print_success "Frontend deployed to S3: ${BUCKET_NAME}"

    cd ..
}

# Function to update ECS service
update_ecs_service() {
    print_header "Updating ECS Service"

    local CLUSTER_NAME="${PROJECT_NAME}-${ENVIRONMENT}"
    local SERVICE_NAME="${PROJECT_NAME}-api-service"

    print_info "Forcing new deployment of ECS service..."

    if aws ecs describe-services \
        --cluster ${CLUSTER_NAME} \
        --services ${SERVICE_NAME} \
        --region ${AWS_REGION} &> /dev/null; then

        aws ecs update-service \
            --cluster ${CLUSTER_NAME} \
            --service ${SERVICE_NAME} \
            --force-new-deployment \
            --region ${AWS_REGION} > /dev/null

        print_success "ECS service update initiated"
        print_info "Waiting for service to stabilize (this may take 5-10 minutes)..."

        aws ecs wait services-stable \
            --cluster ${CLUSTER_NAME} \
            --services ${SERVICE_NAME} \
            --region ${AWS_REGION}

        print_success "ECS service updated successfully"
    else
        print_warning "ECS service not found. Skipping update."
        print_info "You may need to create the ECS service first."
    fi
}

# Function to invalidate CloudFront cache
invalidate_cloudfront() {
    print_header "Invalidating CloudFront Cache"

    # Find CloudFront distribution for this project
    local DISTRIBUTION_ID=$(aws cloudfront list-distributions \
        --query "DistributionList.Items[?Comment=='${PROJECT_NAME}'].Id" \
        --output text 2>/dev/null)

    if [ -z "$DISTRIBUTION_ID" ]; then
        print_warning "CloudFront distribution not found. Skipping cache invalidation."
        return 0
    fi

    print_info "Creating CloudFront invalidation for distribution: ${DISTRIBUTION_ID}"

    aws cloudfront create-invalidation \
        --distribution-id ${DISTRIBUTION_ID} \
        --paths "/*" > /dev/null

    print_success "CloudFront cache invalidation created"
}

# Function to run database migrations (placeholder)
run_migrations() {
    print_header "Running Database Migrations"

    print_warning "Database migration functionality not implemented yet"
    print_info "Manually connect to RDS and run SQL scripts if needed"
}

# Function to show deployment summary
show_summary() {
    print_header "Deployment Summary"

    local ACCOUNT_ID=$(get_account_id)

    echo ""
    echo "Environment:        ${ENVIRONMENT}"
    echo "AWS Region:         ${AWS_REGION}"
    echo "AWS Account:        ${ACCOUNT_ID}"
    echo ""

    # Check ECS service status
    local CLUSTER_NAME="${PROJECT_NAME}-${ENVIRONMENT}"
    local SERVICE_NAME="${PROJECT_NAME}-api-service"

    if aws ecs describe-services \
        --cluster ${CLUSTER_NAME} \
        --services ${SERVICE_NAME} \
        --region ${AWS_REGION} &> /dev/null; then

        local RUNNING_COUNT=$(aws ecs describe-services \
            --cluster ${CLUSTER_NAME} \
            --services ${SERVICE_NAME} \
            --region ${AWS_REGION} \
            --query 'services[0].runningCount' \
            --output text)

        local DESIRED_COUNT=$(aws ecs describe-services \
            --cluster ${CLUSTER_NAME} \
            --services ${SERVICE_NAME} \
            --region ${AWS_REGION} \
            --query 'services[0].desiredCount' \
            --output text)

        echo "ECS Tasks:          ${RUNNING_COUNT}/${DESIRED_COUNT} running"
    fi

    # Check ALB
    local ALB_NAME="${PROJECT_NAME}-alb"
    local ALB_DNS=$(aws elbv2 describe-load-balancers \
        --names ${ALB_NAME} \
        --region ${AWS_REGION} \
        --query 'LoadBalancers[0].DNSName' \
        --output text 2>/dev/null || echo "Not found")

    echo "API Endpoint:       https://${ALB_DNS}"

    # Check S3 bucket
    local BUCKET_NAME="${PROJECT_NAME}-frontend-${ENVIRONMENT}"
    if aws s3 ls s3://${BUCKET_NAME} &> /dev/null; then
        echo "Frontend S3:        s3://${BUCKET_NAME}"
    fi

    echo ""
    print_success "Deployment completed successfully!"
    echo ""
}

# Main deployment function
main() {
    print_header "Wiko Defect Analyzer - AWS Deployment"

    echo "Environment: ${ENVIRONMENT}"
    echo "AWS Region:  ${AWS_REGION}"
    echo ""

    # Parse command line arguments
    local DEPLOY_BACKEND=true
    local DEPLOY_FRONTEND=true
    local IMAGE_TAG="$(git rev-parse --short HEAD 2>/dev/null || echo 'latest')"

    while [[ $# -gt 0 ]]; do
        case $1 in
            --backend-only)
                DEPLOY_FRONTEND=false
                shift
                ;;
            --frontend-only)
                DEPLOY_BACKEND=false
                shift
                ;;
            --tag)
                IMAGE_TAG="$2"
                shift 2
                ;;
            --help)
                echo "Usage: $0 [OPTIONS]"
                echo ""
                echo "Options:"
                echo "  --backend-only      Deploy only the backend"
                echo "  --frontend-only     Deploy only the frontend"
                echo "  --tag <tag>         Specify Docker image tag (default: git commit hash or 'latest')"
                echo "  --help              Show this help message"
                echo ""
                echo "Environment variables:"
                echo "  AWS_REGION          AWS region (default: us-east-1)"
                echo "  ENVIRONMENT         Deployment environment (default: production)"
                exit 0
                ;;
            *)
                print_error "Unknown option: $1"
                echo "Use --help for usage information"
                exit 1
                ;;
        esac
    done

    # Check prerequisites
    check_prerequisites

    # Deploy backend
    if [ "$DEPLOY_BACKEND" = true ]; then
        build_and_push_image "${IMAGE_TAG}"
        update_ecs_service
    fi

    # Deploy frontend
    if [ "$DEPLOY_FRONTEND" = true ]; then
        deploy_frontend
        invalidate_cloudfront
    fi

    # Show summary
    show_summary

    print_info "For detailed deployment guide, see: AWS_DEPLOYMENT_ARCHITECTURE.md"
}

# Run main function
main "$@"
