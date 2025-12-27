#!/bin/bash
###############################################################################
# Wiko Defect Analyzer - Infrastructure Setup Script
# Creates all required AWS resources using AWS CLI
###############################################################################

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
print_success() { echo -e "${GREEN}✅ $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
print_error() { echo -e "${RED}❌ $1${NC}"; }
print_header() {
    echo -e "\n${BLUE}═══════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}\n"
}

# Configuration
PROJECT_NAME="wiko-defect-analyzer"
AWS_REGION="${AWS_REGION:-us-east-1}"
ENVIRONMENT="${ENVIRONMENT:-production}"

# Collect user inputs
collect_inputs() {
    print_header "Infrastructure Configuration"

    # Database password
    read -sp "Enter database master password (min 8 chars): " DB_PASSWORD
    echo ""
    if [ ${#DB_PASSWORD} -lt 8 ]; then
        print_error "Password must be at least 8 characters"
        exit 1
    fi

    # VPC CIDR
    read -p "Enter VPC CIDR block (default: 10.0.0.0/16): " VPC_CIDR
    VPC_CIDR=${VPC_CIDR:-10.0.0.0/16}

    # Domain name (optional)
    read -p "Enter domain name (optional, e.g., defect-analyzer.wiko.com): " DOMAIN_NAME

    # Confirm
    echo ""
    print_info "Configuration Summary:"
    echo "  Project:    ${PROJECT_NAME}"
    echo "  Region:     ${AWS_REGION}"
    echo "  Environment: ${ENVIRONMENT}"
    echo "  VPC CIDR:   ${VPC_CIDR}"
    echo "  Domain:     ${DOMAIN_NAME:-None}"
    echo ""

    read -p "Continue with this configuration? (yes/no): " CONFIRM
    if [ "$CONFIRM" != "yes" ]; then
        print_warning "Setup cancelled"
        exit 0
    fi
}

# Create VPC and networking
create_vpc() {
    print_header "Creating VPC and Network Resources"

    # Create VPC
    print_info "Creating VPC..."
    VPC_ID=$(aws ec2 create-vpc \
        --cidr-block ${VPC_CIDR} \
        --tag-specifications "ResourceType=vpc,Tags=[{Key=Name,Value=${PROJECT_NAME}-vpc},{Key=Environment,Value=${ENVIRONMENT}}]" \
        --query 'Vpc.VpcId' \
        --output text \
        --region ${AWS_REGION})
    print_success "VPC created: ${VPC_ID}"

    # Enable DNS hostnames
    aws ec2 modify-vpc-attribute --vpc-id ${VPC_ID} --enable-dns-hostnames --region ${AWS_REGION}

    # Create Internet Gateway
    print_info "Creating Internet Gateway..."
    IGW_ID=$(aws ec2 create-internet-gateway \
        --tag-specifications "ResourceType=internet-gateway,Tags=[{Key=Name,Value=${PROJECT_NAME}-igw}]" \
        --query 'InternetGateway.InternetGatewayId' \
        --output text \
        --region ${AWS_REGION})
    aws ec2 attach-internet-gateway --vpc-id ${VPC_ID} --internet-gateway-id ${IGW_ID} --region ${AWS_REGION}
    print_success "Internet Gateway created: ${IGW_ID}"

    # Create subnets (2 public, 2 private across 2 AZs)
    print_info "Creating subnets..."

    # Get availability zones
    AZ1=$(aws ec2 describe-availability-zones --region ${AWS_REGION} --query 'AvailabilityZones[0].ZoneName' --output text)
    AZ2=$(aws ec2 describe-availability-zones --region ${AWS_REGION} --query 'AvailabilityZones[1].ZoneName' --output text)

    # Public subnet 1
    PUBLIC_SUBNET_1=$(aws ec2 create-subnet \
        --vpc-id ${VPC_ID} \
        --cidr-block 10.0.1.0/24 \
        --availability-zone ${AZ1} \
        --tag-specifications "ResourceType=subnet,Tags=[{Key=Name,Value=${PROJECT_NAME}-public-1}]" \
        --query 'Subnet.SubnetId' \
        --output text \
        --region ${AWS_REGION})

    # Public subnet 2
    PUBLIC_SUBNET_2=$(aws ec2 create-subnet \
        --vpc-id ${VPC_ID} \
        --cidr-block 10.0.2.0/24 \
        --availability-zone ${AZ2} \
        --tag-specifications "ResourceType=subnet,Tags=[{Key=Name,Value=${PROJECT_NAME}-public-2}]" \
        --query 'Subnet.SubnetId' \
        --output text \
        --region ${AWS_REGION})

    # Private subnet 1
    PRIVATE_SUBNET_1=$(aws ec2 create-subnet \
        --vpc-id ${VPC_ID} \
        --cidr-block 10.0.11.0/24 \
        --availability-zone ${AZ1} \
        --tag-specifications "ResourceType=subnet,Tags=[{Key=Name,Value=${PROJECT_NAME}-private-1}]" \
        --query 'Subnet.SubnetId' \
        --output text \
        --region ${AWS_REGION})

    # Private subnet 2
    PRIVATE_SUBNET_2=$(aws ec2 create-subnet \
        --vpc-id ${VPC_ID} \
        --cidr-block 10.0.12.0/24 \
        --availability-zone ${AZ2} \
        --tag-specifications "ResourceType=subnet,Tags=[{Key=Name,Value=${PROJECT_NAME}-private-2}]" \
        --query 'Subnet.SubnetId' \
        --output text \
        --region ${AWS_REGION})

    print_success "Subnets created"

    # Create and configure route tables
    print_info "Configuring route tables..."

    # Public route table
    PUBLIC_RT=$(aws ec2 create-route-table \
        --vpc-id ${VPC_ID} \
        --tag-specifications "ResourceType=route-table,Tags=[{Key=Name,Value=${PROJECT_NAME}-public-rt}]" \
        --query 'RouteTable.RouteTableId' \
        --output text \
        --region ${AWS_REGION})

    aws ec2 create-route --route-table-id ${PUBLIC_RT} --destination-cidr-block 0.0.0.0/0 --gateway-id ${IGW_ID} --region ${AWS_REGION}
    aws ec2 associate-route-table --subnet-id ${PUBLIC_SUBNET_1} --route-table-id ${PUBLIC_RT} --region ${AWS_REGION}
    aws ec2 associate-route-table --subnet-id ${PUBLIC_SUBNET_2} --route-table-id ${PUBLIC_RT} --region ${AWS_REGION}

    print_success "Route tables configured"

    # Save configuration
    cat > infrastructure-config.env <<EOF
# Generated infrastructure configuration
VPC_ID=${VPC_ID}
PUBLIC_SUBNET_1=${PUBLIC_SUBNET_1}
PUBLIC_SUBNET_2=${PUBLIC_SUBNET_2}
PRIVATE_SUBNET_1=${PRIVATE_SUBNET_1}
PRIVATE_SUBNET_2=${PRIVATE_SUBNET_2}
IGW_ID=${IGW_ID}
PUBLIC_RT=${PUBLIC_RT}
EOF

    print_success "VPC configuration saved to infrastructure-config.env"
}

# Create security groups
create_security_groups() {
    print_header "Creating Security Groups"

    source infrastructure-config.env

    # ALB security group
    print_info "Creating ALB security group..."
    ALB_SG=$(aws ec2 create-security-group \
        --group-name ${PROJECT_NAME}-alb-sg \
        --description "Security group for ALB" \
        --vpc-id ${VPC_ID} \
        --tag-specifications "ResourceType=security-group,Tags=[{Key=Name,Value=${PROJECT_NAME}-alb-sg}]" \
        --query 'GroupId' \
        --output text \
        --region ${AWS_REGION})

    aws ec2 authorize-security-group-ingress --group-id ${ALB_SG} --protocol tcp --port 443 --cidr 0.0.0.0/0 --region ${AWS_REGION}
    aws ec2 authorize-security-group-ingress --group-id ${ALB_SG} --protocol tcp --port 80 --cidr 0.0.0.0/0 --region ${AWS_REGION}
    print_success "ALB security group created: ${ALB_SG}"

    # ECS security group
    print_info "Creating ECS security group..."
    ECS_SG=$(aws ec2 create-security-group \
        --group-name ${PROJECT_NAME}-ecs-sg \
        --description "Security group for ECS tasks" \
        --vpc-id ${VPC_ID} \
        --tag-specifications "ResourceType=security-group,Tags=[{Key=Name,Value=${PROJECT_NAME}-ecs-sg}]" \
        --query 'GroupId' \
        --output text \
        --region ${AWS_REGION})

    aws ec2 authorize-security-group-ingress --group-id ${ECS_SG} --protocol tcp --port 5001 --source-group ${ALB_SG} --region ${AWS_REGION}
    print_success "ECS security group created: ${ECS_SG}"

    # RDS security group
    print_info "Creating RDS security group..."
    RDS_SG=$(aws ec2 create-security-group \
        --group-name ${PROJECT_NAME}-rds-sg \
        --description "Security group for RDS" \
        --vpc-id ${VPC_ID} \
        --tag-specifications "ResourceType=security-group,Tags=[{Key=Name,Value=${PROJECT_NAME}-rds-sg}]" \
        --query 'GroupId' \
        --output text \
        --region ${AWS_REGION})

    aws ec2 authorize-security-group-ingress --group-id ${RDS_SG} --protocol tcp --port 5432 --source-group ${ECS_SG} --region ${AWS_REGION}
    print_success "RDS security group created: ${RDS_SG}"

    # Redis security group
    print_info "Creating Redis security group..."
    REDIS_SG=$(aws ec2 create-security-group \
        --group-name ${PROJECT_NAME}-redis-sg \
        --description "Security group for Redis" \
        --vpc-id ${VPC_ID} \
        --tag-specifications "ResourceType=security-group,Tags=[{Key=Name,Value=${PROJECT_NAME}-redis-sg}]" \
        --query 'GroupId' \
        --output text \
        --region ${AWS_REGION})

    aws ec2 authorize-security-group-ingress --group-id ${REDIS_SG} --protocol tcp --port 6379 --source-group ${ECS_SG} --region ${AWS_REGION}
    print_success "Redis security group created: ${REDIS_SG}"

    # Append to config
    cat >> infrastructure-config.env <<EOF
ALB_SG=${ALB_SG}
ECS_SG=${ECS_SG}
RDS_SG=${RDS_SG}
REDIS_SG=${REDIS_SG}
EOF
}

# Create RDS database
create_rds() {
    print_header "Creating RDS PostgreSQL Database"

    source infrastructure-config.env

    # Create DB subnet group
    print_info "Creating DB subnet group..."
    aws rds create-db-subnet-group \
        --db-subnet-group-name ${PROJECT_NAME}-db-subnet-group \
        --db-subnet-group-description "Subnet group for ${PROJECT_NAME}" \
        --subnet-ids ${PRIVATE_SUBNET_1} ${PRIVATE_SUBNET_2} \
        --tags Key=Name,Value=${PROJECT_NAME}-db-subnet-group \
        --region ${AWS_REGION}

    # Create RDS instance
    print_info "Creating RDS instance (this takes ~10 minutes)..."
    aws rds create-db-instance \
        --db-instance-identifier ${PROJECT_NAME}-db-${ENVIRONMENT} \
        --db-instance-class db.t4g.medium \
        --engine postgres \
        --engine-version 15.4 \
        --master-username wikoAdmin \
        --master-user-password "${DB_PASSWORD}" \
        --allocated-storage 100 \
        --storage-type gp3 \
        --multi-az \
        --backup-retention-period 7 \
        --vpc-security-group-ids ${RDS_SG} \
        --db-subnet-group-name ${PROJECT_NAME}-db-subnet-group \
        --publicly-accessible false \
        --storage-encrypted \
        --tags Key=Environment,Value=${ENVIRONMENT} Key=Project,Value=${PROJECT_NAME} \
        --region ${AWS_REGION}

    print_info "Waiting for database to be available..."
    aws rds wait db-instance-available --db-instance-identifier ${PROJECT_NAME}-db-${ENVIRONMENT} --region ${AWS_REGION}

    RDS_ENDPOINT=$(aws rds describe-db-instances \
        --db-instance-identifier ${PROJECT_NAME}-db-${ENVIRONMENT} \
        --query 'DBInstances[0].Endpoint.Address' \
        --output text \
        --region ${AWS_REGION})

    print_success "RDS instance created: ${RDS_ENDPOINT}"

    cat >> infrastructure-config.env <<EOF
RDS_ENDPOINT=${RDS_ENDPOINT}
DB_NAME=wiko_defect_db
DB_USERNAME=wikoAdmin
EOF
}

# Display completion summary
show_completion() {
    print_header "Infrastructure Setup Complete!"

    source infrastructure-config.env

    echo ""
    echo "Resources Created:"
    echo "  VPC:            ${VPC_ID}"
    echo "  Public Subnets: ${PUBLIC_SUBNET_1}, ${PUBLIC_SUBNET_2}"
    echo "  Private Subnets: ${PRIVATE_SUBNET_1}, ${PRIVATE_SUBNET_2}"
    echo "  RDS Endpoint:   ${RDS_ENDPOINT}"
    echo ""
    echo "Configuration saved to: infrastructure-config.env"
    echo ""
    print_info "Next steps:"
    echo "  1. Store database password in AWS Secrets Manager"
    echo "  2. Create ECS cluster and service (see AWS_DEPLOYMENT_ARCHITECTURE.md)"
    echo "  3. Run deployment script: ./deploy-to-aws.sh"
    echo ""
    print_success "Infrastructure ready for application deployment!"
}

# Main execution
main() {
    print_header "Wiko Defect Analyzer - Infrastructure Setup"

    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        print_error "AWS CLI not found. Please install it first."
        exit 1
    fi

    # Check AWS credentials
    if ! aws sts get-caller-identity &> /dev/null; then
        print_error "AWS credentials not configured. Run: aws configure"
        exit 1
    fi

    print_success "AWS CLI configured"
    print_info "AWS Account: $(aws sts get-caller-identity --query Account --output text)"
    print_info "AWS Region: ${AWS_REGION}"

    # Collect inputs
    collect_inputs

    # Create resources
    create_vpc
    create_security_groups
    create_rds

    # Show completion
    show_completion
}

main "$@"
