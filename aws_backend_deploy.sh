#!/bin/bash

# AWS Backend Deployment Script
# Deploys Flask backend to AWS Lambda + API Gateway with Bedrock

set -e

echo "╔════════════════════════════════════════════════════════════╗"
echo "║   WIKO AWS BACKEND DEPLOYMENT                              ║"
echo "║   Flask → Lambda + API Gateway + Bedrock                   ║"
echo "╚════════════════════════════════════════════════════════════╝"

# Configuration
APP_NAME="wiko-defect-analyzer"
REGION="us-east-1"
RUNTIME="python3.11"
LAMBDA_ROLE_NAME="WikoLambdaExecutionRole"
API_NAME="wiko-api"

# Step 1: Create IAM Role for Lambda
echo ""
echo "📋 Step 1/7: Creating IAM role for Lambda..."

cat > /tmp/lambda-trust-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "lambda.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

# Create role
aws iam create-role \
  --role-name $LAMBDA_ROLE_NAME \
  --assume-role-policy-document file:///tmp/lambda-trust-policy.json \
  2>/dev/null || echo "Role already exists"

# Attach policies
aws iam attach-role-policy \
  --role-name $LAMBDA_ROLE_NAME \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole

aws iam attach-role-policy \
  --role-name $LAMBDA_ROLE_NAME \
  --policy-arn arn:aws:iam::aws:policy/AmazonBedrockFullAccess

# Get role ARN
ROLE_ARN=$(aws iam get-role --role-name $LAMBDA_ROLE_NAME --query 'Role.Arn' --output text)
echo "✓ IAM Role created: $ROLE_ARN"

# Wait for role to propagate
echo "⏳ Waiting for IAM role propagation..."
sleep 10

# Step 2: Create Lambda Layer for Dependencies
echo ""
echo "📦 Step 2/7: Creating Lambda layer for Python dependencies..."

mkdir -p /tmp/lambda-layer/python
cd /tmp/lambda-layer

# Create requirements for layer
cat > python/requirements.txt << 'EOF'
flask==3.0.0
boto3==1.34.0
anthropic==0.18.0
pillow==11.3.0
python-dotenv==1.0.0
werkzeug==3.0.1
EOF

# Install dependencies
python3 -m pip install -r python/requirements.txt -t python/ --platform manylinux2014_x86_64 --only-binary=:all:

# Create layer zip
zip -r layer.zip python/
aws lambda publish-layer-version \
  --layer-name wiko-dependencies \
  --zip-file fileb://layer.zip \
  --compatible-runtimes $RUNTIME \
  --region $REGION > /tmp/layer-output.json

LAYER_ARN=$(cat /tmp/layer-output.json | grep -o 'arn:aws:lambda:[^"]*')
echo "✓ Layer created: $LAYER_ARN"

# Step 3: Prepare Lambda Function Code
echo ""
echo "🔨 Step 3/7: Preparing Lambda function code..."

cat > /tmp/lambda_handler.py << 'EOF'
import json
import boto3
import base64
import os
from io import BytesIO
from PIL import Image

bedrock_runtime = boto3.client(
    service_name='bedrock-runtime',
    region_name=os.environ.get('AWS_REGION', 'us-east-1')
)

DEFECT_CLASSIFICATION = {
    "surface_defects": ["scratches", "dents", "discoloration", "pitting"],
    "edge_defects": ["chipping", "burrs", "irregular_geometry"],
    "structural": ["warping", "cracks", "porosity"],
    "contamination": ["particles", "stains", "residue"]
}

def analyze_defect_bedrock(image_base64: str, product_sku: str, facility: str):
    """Analyze defect using Claude Opus 4 via Bedrock"""
    
    request_body = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 2000,
        "temperature": 0.1,
        "messages": [{
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": "image/jpeg",
                        "data": image_base64
                    }
                },
                {
                    "type": "text",
                    "text": f"""Analyze this cutlery image for manufacturing defects.

Product: {product_sku}
Facility: {facility}

Classify defects from these categories:
{json.dumps(DEFECT_CLASSIFICATION, indent=2)}

Return ONLY valid JSON:
{{
  "defect_detected": boolean,
  "defect_type": "string from classification",
  "severity": "minor|major|critical",
  "confidence_score": float (0-1),
  "location": "description",
  "recommended_action": "PASS|REWORK|SCRAP",
  "reasoning": "brief explanation"
}}"""
                }
            ]
        }]
    }
    
    response = bedrock_runtime.invoke_model(
        modelId='us.anthropic.claude-opus-4-20250514-v1:0',
        body=json.dumps(request_body)
    )
    
    response_body = json.loads(response['body'].read())
    result_text = response_body['content'][0]['text']
    
    # Extract JSON from response
    import re
    json_match = re.search(r'\{.*\}', result_text, re.DOTALL)
    if json_match:
        return json.loads(json_match.group())
    
    return {"error": "Failed to parse response"}

def lambda_handler(event, context):
    """AWS Lambda handler for API Gateway"""
    
    try:
        # Handle API Gateway proxy integration
        http_method = event.get('httpMethod', 'POST')
        path = event.get('path', '')
        
        # CORS headers
        headers = {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        }
        
        # Handle OPTIONS for CORS preflight
        if http_method == 'OPTIONS':
            return {
                'statusCode': 200,
                'headers': headers,
                'body': ''
            }
        
        # Route handling
        if path == '/api/v1/analyze' and http_method == 'POST':
            # Parse multipart form data from API Gateway
            body = event.get('body', '')
            is_base64 = event.get('isBase64Encoded', False)
            
            if is_base64:
                body = base64.b64decode(body).decode('utf-8')
            
            # Extract image from body (simplified - use multipart parser in production)
            # For now, expect JSON with base64 image
            data = json.loads(body)
            
            result = analyze_defect_bedrock(
                image_base64=data['image'],
                product_sku=data.get('product_sku', 'WK-KN-200'),
                facility=data.get('facility', 'yangjiang')
            )
            
            return {
                'statusCode': 200,
                'headers': headers,
                'body': json.dumps(result)
            }
        
        elif path == '/api/v1/defect-types' and http_method == 'GET':
            return {
                'statusCode': 200,
                'headers': headers,
                'body': json.dumps(DEFECT_CLASSIFICATION)
            }
        
        else:
            return {
                'statusCode': 404,
                'headers': headers,
                'body': json.dumps({'error': 'Not found'})
            }
            
    except Exception as e:
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'error': str(e)})
        }
EOF

# Create deployment package
cd /tmp
zip lambda_function.zip lambda_handler.py
echo "✓ Lambda code packaged"

# Step 4: Create Lambda Function
echo ""
echo "⚡ Step 4/7: Creating Lambda function..."

aws lambda create-function \
  --function-name $APP_NAME \
  --runtime $RUNTIME \
  --role $ROLE_ARN \
  --handler lambda_handler.lambda_handler \
  --zip-file fileb://lambda_function.zip \
  --timeout 30 \
  --memory-size 1024 \
  --layers $LAYER_ARN \
  --region $REGION 2>/dev/null || echo "Function exists, updating..."

# Update if already exists
aws lambda update-function-code \
  --function-name $APP_NAME \
  --zip-file fileb://lambda_function.zip \
  --region $REGION

echo "✓ Lambda function deployed"

# Step 5: Request Bedrock Model Access
echo ""
echo "🤖 Step 5/7: Requesting Bedrock model access..."
echo ""
echo "⚠️  MANUAL STEP REQUIRED:"
echo "   1. Go to: https://console.aws.amazon.com/bedrock/home?region=$REGION#/modelaccess"
echo "   2. Click 'Request model access'"
echo "   3. Select: Anthropic - Claude Opus 4, Claude Sonnet 4, Claude Haiku 4.5"
echo "   4. Submit request (usually instant approval)"
echo ""
read -p "Press Enter after requesting model access..."

# Step 6: Create API Gateway
echo ""
echo "🌐 Step 6/7: Creating API Gateway..."

# Create REST API
API_ID=$(aws apigateway create-rest-api \
  --name $API_NAME \
  --description "Wiko Defect Analyzer API" \
  --region $REGION \
  --query 'id' \
  --output text 2>/dev/null || \
  aws apigateway get-rest-apis --query "items[?name=='$API_NAME'].id" --output text)

echo "✓ API Gateway created: $API_ID"

# Get root resource
ROOT_ID=$(aws apigateway get-resources \
  --rest-api-id $API_ID \
  --query 'items[?path==`/`].id' \
  --output text)

# Create /api resource
API_RESOURCE_ID=$(aws apigateway create-resource \
  --rest-api-id $API_ID \
  --parent-id $ROOT_ID \
  --path-part api \
  --query 'id' \
  --output text 2>/dev/null || \
  aws apigateway get-resources --rest-api-id $API_ID --query "items[?path=='/api'].id" --output text)

# Create /api/{proxy+} for catch-all
PROXY_RESOURCE_ID=$(aws apigateway create-resource \
  --rest-api-id $API_ID \
  --parent-id $API_RESOURCE_ID \
  --path-part '{proxy+}' \
  --query 'id' \
  --output text 2>/dev/null || \
  aws apigateway get-resources --rest-api-id $API_ID --query "items[?path=='/api/{proxy+}'].id" --output text)

# Create ANY method
LAMBDA_ARN="arn:aws:lambda:$REGION:$(aws sts get-caller-identity --query Account --output text):function:$APP_NAME"

aws apigateway put-method \
  --rest-api-id $API_ID \
  --resource-id $PROXY_RESOURCE_ID \
  --http-method ANY \
  --authorization-type NONE

# Set Lambda integration
aws apigateway put-integration \
  --rest-api-id $API_ID \
  --resource-id $PROXY_RESOURCE_ID \
  --http-method ANY \
  --type AWS_PROXY \
  --integration-http-method POST \
  --uri "arn:aws:apigateway:$REGION:lambda:path/2015-03-31/functions/$LAMBDA_ARN/invocations"

# Grant API Gateway permission to invoke Lambda
aws lambda add-permission \
  --function-name $APP_NAME \
  --statement-id apigateway-invoke \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn "arn:aws:execute-api:$REGION:$(aws sts get-caller-identity --query Account --output text):$API_ID/*/*" \
  2>/dev/null || echo "Permission already exists"

# Deploy API
aws apigateway create-deployment \
  --rest-api-id $API_ID \
  --stage-name prod

API_URL="https://$API_ID.execute-api.$REGION.amazonaws.com/prod"
echo "✓ API Gateway deployed: $API_URL"

# Step 7: Test the deployment
echo ""
echo "🧪 Step 7/7: Testing deployment..."

curl -X GET "$API_URL/api/v1/defect-types"

echo ""
echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║   ✅ BACKEND DEPLOYMENT COMPLETE                           ║"
echo "╠════════════════════════════════════════════════════════════╣"
echo "║  API Endpoint: $API_URL"
echo "║  Lambda Function: $APP_NAME"
echo "║  Region: $REGION"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "Next steps:"
echo "1. Save API URL for frontend configuration"
echo "2. Test endpoint: curl $API_URL/api/v1/defect-types"
echo "3. Deploy frontend (run aws_frontend_deploy.sh)"
echo ""
