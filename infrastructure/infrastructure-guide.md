# AWS Bedrock + Frontend Integration Guide
## Complete Step-by-Step Setup for Wiko Defect Analyzer

---

## Overview

This guide connects your Amplify frontend to AWS Bedrock Claude 3.5 for defect analysis.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ARCHITECTURE                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────────────────┐   │
│  │   Amplify    │     │ API Gateway  │     │    AWS Lambda            │   │
│  │   Frontend   │────▶│   REST API   │────▶│    (Python)              │   │
│  │   (React)    │     │              │     │                          │   │
│  └──────────────┘     └──────────────┘     └───────────┬──────────────┘   │
│                                                         │                   │
│                              ┌──────────────────────────┼──────────────┐   │
│                              │                          ▼              │   │
│                              │  ┌──────────────┐  ┌──────────────┐    │   │
│                              │  │   Bedrock    │  │     S3       │    │   │
│                              │  │  Claude 3.5  │  │   (Images)   │    │   │
│                              │  └──────────────┘  └──────────────┘    │   │
│                              │                                         │   │
│                              │  ┌──────────────┐                      │   │
│                              │  │  DynamoDB    │                      │   │
│                              │  │  (Results)   │                      │   │
│                              │  └──────────────┘                      │   │
│                              └─────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Prerequisites Checklist

- [ ] AWS Account with $1,000 Activate credits
- [ ] AWS CLI installed and configured
- [ ] Node.js 18+ installed
- [ ] Your Amplify frontend deployed

---

## PART 1: Enable AWS Bedrock Model Access

### Step 1.1: Open Bedrock Console

```bash
# Open in browser
https://console.aws.amazon.com/bedrock/home?region=us-east-1#/modelaccess
```

### Step 1.2: Request Model Access

1. Click **"Manage model access"**
2. Find **"Anthropic"** section
3. Check **"Claude 3.5 Sonnet"** (anthropic.claude-3-5-sonnet-20241022-v2:0)
4. Click **"Save changes"**
5. Wait for status to show **"Access granted"** (usually instant)

### Step 1.3: Verify Access

```bash
aws bedrock list-foundation-models \
  --region us-east-1 \
  --query "modelSummaries[?contains(modelId, 'claude')].modelId"
```

Expected output:
```json
[
    "anthropic.claude-3-5-sonnet-20241022-v2:0",
    "anthropic.claude-3-sonnet-20240229-v1:0",
    ...
]
```

---

## PART 2: Deploy Backend Infrastructure

### Step 2.1: Create Project Directory

```bash
mkdir -p ~/wiko-aws-backend
cd ~/wiko-aws-backend
```

### Step 2.2: Create CloudFormation Template

Create file `infrastructure.yaml`:

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Description: Wiko Defect Analyzer - AWS Bedrock Backend

Parameters:
  Environment:
    Type: String
    Default: prod
    AllowedValues: [dev, prod]
  
  ProjectName:
    Type: String
    Default: wiko-defect-analyzer

Resources:
  # ============================================================
  # S3 BUCKET - Image Storage
  # ============================================================
  ImagesBucket:
    Type: AWS::S3::Bucket
    Properties:
      BucketName: !Sub '${ProjectName}-images-${AWS::AccountId}'
      PublicAccessBlockConfiguration:
        BlockPublicAcls: true
        BlockPublicPolicy: true
        IgnorePublicAcls: true
        RestrictPublicBuckets: true
      CorsConfiguration:
        CorsRules:
          - AllowedHeaders: ['*']
            AllowedMethods: [GET, PUT, POST]
            AllowedOrigins: ['*']
            MaxAge: 3000
      LifecycleConfiguration:
        Rules:
          - Id: DeleteOldImages
            Status: Enabled
            ExpirationInDays: 90

  # ============================================================
  # DYNAMODB TABLE - Defect Records
  # ============================================================
  DefectsTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: !Sub '${ProjectName}-defects'
      BillingMode: PAY_PER_REQUEST
      AttributeDefinitions:
        - AttributeName: defect_id
          AttributeType: S
        - AttributeName: facility
          AttributeType: S
        - AttributeName: timestamp
          AttributeType: S
      KeySchema:
        - AttributeName: defect_id
          KeyType: HASH
      GlobalSecondaryIndexes:
        - IndexName: facility-timestamp-index
          KeySchema:
            - AttributeName: facility
              KeyType: HASH
            - AttributeName: timestamp
              KeyType: RANGE
          Projection:
            ProjectionType: ALL

  # ============================================================
  # IAM ROLE - Lambda Execution
  # ============================================================
  LambdaRole:
    Type: AWS::IAM::Role
    Properties:
      RoleName: !Sub '${ProjectName}-lambda-role'
      AssumeRolePolicyDocument:
        Version: '2012-10-17'
        Statement:
          - Effect: Allow
            Principal:
              Service: lambda.amazonaws.com
            Action: sts:AssumeRole
      ManagedPolicyArns:
        - arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
      Policies:
        - PolicyName: BedrockAccess
          PolicyDocument:
            Version: '2012-10-17'
            Statement:
              - Effect: Allow
                Action:
                  - bedrock:InvokeModel
                  - bedrock:InvokeModelWithResponseStream
                Resource: '*'
        - PolicyName: S3Access
          PolicyDocument:
            Version: '2012-10-17'
            Statement:
              - Effect: Allow
                Action:
                  - s3:GetObject
                  - s3:PutObject
                  - s3:DeleteObject
                Resource: !Sub '${ImagesBucket.Arn}/*'
        - PolicyName: DynamoDBAccess
          PolicyDocument:
            Version: '2012-10-17'
            Statement:
              - Effect: Allow
                Action:
                  - dynamodb:GetItem
                  - dynamodb:PutItem
                  - dynamodb:UpdateItem
                  - dynamodb:DeleteItem
                  - dynamodb:Query
                  - dynamodb:Scan
                Resource:
                  - !GetAtt DefectsTable.Arn
                  - !Sub '${DefectsTable.Arn}/index/*'

  # ============================================================
  # LAMBDA FUNCTION - Analyze Defect
  # ============================================================
  AnalyzeFunction:
    Type: AWS::Lambda::Function
    Properties:
      FunctionName: !Sub '${ProjectName}-analyze'
      Runtime: python3.11
      Handler: index.handler
      Role: !GetAtt LambdaRole.Arn
      Timeout: 90
      MemorySize: 1024
      Environment:
        Variables:
          IMAGES_BUCKET: !Ref ImagesBucket
          DEFECTS_TABLE: !Ref DefectsTable
          BEDROCK_MODEL_ID: anthropic.claude-3-5-sonnet-20241022-v2:0
      Code:
        ZipFile: |
          import json
          import boto3
          import base64
          import uuid
          import os
          from datetime import datetime
          from decimal import Decimal

          s3 = boto3.client('s3')
          dynamodb = boto3.resource('dynamodb')
          bedrock = boto3.client('bedrock-runtime', region_name='us-east-1')

          BUCKET = os.environ['IMAGES_BUCKET']
          TABLE = os.environ['DEFECTS_TABLE']
          MODEL_ID = os.environ['BEDROCK_MODEL_ID']

          WIKO_PROMPT = """You are a quality control expert for Wiko Cutlery Ltd, a 61-year-old premium knife manufacturer.

          WIKO 12-STAGE MANUFACTURING PROCESS:
          1. blade_stamp - Blade Stamping from German 4116 steel
          2. bolster_welding - Welding bolster to blade
          3. back_edge_polishing - Back edge finishing
          4. taper_grinding - V-shape edge geometry
          5. heat_treatment - Heating to 1000°C
          6. vacuum_quench - PROPRIETARY rapid cooling (1000°C→600°C in 2 min)
          7. handle_injection - Handle molding
          8. rivet_assembly - Handle attachment
          9. handle_polishing - Handle finishing
          10. blade_glazing - Mirror/satin finish
          11. cutting_edge_honing - Final sharpening
          12. logo_print - Branding + final QC

          DEFECT TYPES: rust_spot, blade_scratch, edge_irregularity, handle_crack, 
          weld_defect, polish_defect, blade_chip, handle_discoloration, 
          dimensional_error, assembly_misalignment, surface_contamination

          SEVERITY LEVELS:
          - critical: Safety issue or process failure (e.g., rust = vacuum quench failure)
          - major: Cannot ship, visible quality issue
          - minor: Can ship with discount
          - cosmetic: Within tolerance

          DEFECT-STAGE CORRELATIONS:
          - rust_spot → vacuum_quench (slow cooling causes chromium carbide)
          - edge_irregularity → taper_grinding or cutting_edge_honing
          - handle_crack → handle_injection (temp/pressure issues)
          - weld_defect → bolster_welding

          Analyze this product image and respond with JSON only:
          {
            "defect_detected": true/false,
            "defect_type": "type from list or null",
            "severity": "critical/major/minor/cosmetic or null",
            "confidence": 0.0-1.0,
            "description": "detailed observation",
            "affected_area": "blade/edge/handle/bolster/surface",
            "probable_stage": "manufacturing stage or null",
            "root_cause": "analysis of why this defect occurred",
            "corrective_actions": ["action1", "action2", "action3"],
            "preventive_actions": ["long-term fix 1", "long-term fix 2"]
          }"""

          def handler(event, context):
              try:
                  # Handle CORS preflight
                  if event.get('httpMethod') == 'OPTIONS':
                      return cors_response(200, {})
                  
                  # Parse request
                  body = json.loads(event.get('body', '{}'))
                  image_b64 = body.get('image')
                  product_sku = body.get('product_sku', 'WK-KN-200')
                  facility = body.get('facility', 'yangjiang')
                  
                  if not image_b64:
                      return cors_response(400, {'error': 'No image provided'})
                  
                  # Generate IDs
                  defect_id = f"DEF-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:8].upper()}"
                  timestamp = datetime.now().isoformat()
                  
                  # Save image to S3
                  s3_key = f"inspections/{defect_id}.jpg"
                  s3.put_object(
                      Bucket=BUCKET,
                      Key=s3_key,
                      Body=base64.b64decode(image_b64),
                      ContentType='image/jpeg'
                  )
                  
                  # Call Bedrock Claude 3.5
                  response = bedrock.invoke_model(
                      modelId=MODEL_ID,
                      body=json.dumps({
                          "anthropic_version": "bedrock-2023-05-31",
                          "max_tokens": 2000,
                          "messages": [{
                              "role": "user",
                              "content": [
                                  {
                                      "type": "image",
                                      "source": {
                                          "type": "base64",
                                          "media_type": "image/jpeg",
                                          "data": image_b64
                                      }
                                  },
                                  {
                                      "type": "text",
                                      "text": f"{WIKO_PROMPT}\n\nProduct SKU: {product_sku}\nFacility: {facility}"
                                  }
                              ]
                          }]
                      })
                  )
                  
                  # Parse response
                  result = json.loads(response['body'].read())
                  analysis_text = result['content'][0]['text']
                  
                  # Extract JSON
                  try:
                      if '```json' in analysis_text:
                          analysis_text = analysis_text.split('```json')[1].split('```')[0]
                      elif '```' in analysis_text:
                          analysis_text = analysis_text.split('```')[1].split('```')[0]
                      analysis = json.loads(analysis_text.strip())
                  except:
                      analysis = {"defect_detected": False, "description": "Analysis complete"}
                  
                  # Build full result
                  full_result = {
                      'defect_id': defect_id,
                      'timestamp': timestamp,
                      'facility': facility,
                      'product_sku': product_sku,
                      's3_key': s3_key,
                      **analysis
                  }
                  
                  # Save to DynamoDB (convert floats to Decimal)
                  table = dynamodb.Table(TABLE)
                  item = json.loads(json.dumps(full_result), parse_float=Decimal)
                  table.put_item(Item=item)
                  
                  return cors_response(200, {
                      'success': True,
                      'defect_id': defect_id,
                      'analysis': full_result
                  })
                  
              except Exception as e:
                  print(f"Error: {str(e)}")
                  return cors_response(500, {'error': str(e)})

          def cors_response(status_code, body):
              return {
                  'statusCode': status_code,
                  'headers': {
                      'Content-Type': 'application/json',
                      'Access-Control-Allow-Origin': '*',
                      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
                      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
                  },
                  'body': json.dumps(body)
              }

  # ============================================================
  # LAMBDA FUNCTION - Get Defects
  # ============================================================
  GetDefectsFunction:
    Type: AWS::Lambda::Function
    Properties:
      FunctionName: !Sub '${ProjectName}-get-defects'
      Runtime: python3.11
      Handler: index.handler
      Role: !GetAtt LambdaRole.Arn
      Timeout: 30
      MemorySize: 256
      Environment:
        Variables:
          DEFECTS_TABLE: !Ref DefectsTable
      Code:
        ZipFile: |
          import json
          import boto3
          import os
          from boto3.dynamodb.conditions import Key
          from decimal import Decimal

          dynamodb = boto3.resource('dynamodb')
          TABLE = os.environ['DEFECTS_TABLE']

          class DecimalEncoder(json.JSONEncoder):
              def default(self, o):
                  if isinstance(o, Decimal):
                      return float(o)
                  return super().default(o)

          def handler(event, context):
              if event.get('httpMethod') == 'OPTIONS':
                  return cors_response(200, {})
              
              try:
                  table = dynamodb.Table(TABLE)
                  params = event.get('queryStringParameters') or {}
                  facility = params.get('facility')
                  limit = int(params.get('limit', 50))
                  
                  if facility:
                      response = table.query(
                          IndexName='facility-timestamp-index',
                          KeyConditionExpression=Key('facility').eq(facility),
                          ScanIndexForward=False,
                          Limit=limit
                      )
                  else:
                      response = table.scan(Limit=limit)
                  
                  return cors_response(200, {
                      'defects': response.get('Items', []),
                      'count': len(response.get('Items', []))
                  })
              except Exception as e:
                  return cors_response(500, {'error': str(e)})

          def cors_response(status_code, body):
              return {
                  'statusCode': status_code,
                  'headers': {
                      'Content-Type': 'application/json',
                      'Access-Control-Allow-Origin': '*',
                      'Access-Control-Allow-Headers': 'Content-Type',
                      'Access-Control-Allow-Methods': 'GET,OPTIONS'
                  },
                  'body': json.dumps(body, cls=DecimalEncoder)
              }

  # ============================================================
  # LAMBDA FUNCTION - Get Stats
  # ============================================================
  GetStatsFunction:
    Type: AWS::Lambda::Function
    Properties:
      FunctionName: !Sub '${ProjectName}-get-stats'
      Runtime: python3.11
      Handler: index.handler
      Role: !GetAtt LambdaRole.Arn
      Timeout: 30
      MemorySize: 256
      Environment:
        Variables:
          DEFECTS_TABLE: !Ref DefectsTable
      Code:
        ZipFile: |
          import json
          import boto3
          import os
          from collections import defaultdict
          from decimal import Decimal

          dynamodb = boto3.resource('dynamodb')
          TABLE = os.environ['DEFECTS_TABLE']

          def handler(event, context):
              if event.get('httpMethod') == 'OPTIONS':
                  return cors_response(200, {})
              
              try:
                  table = dynamodb.Table(TABLE)
                  response = table.scan()
                  items = response.get('Items', [])
                  
                  by_type = defaultdict(int)
                  by_severity = defaultdict(int)
                  by_facility = defaultdict(int)
                  by_stage = defaultdict(int)
                  total_defects = 0
                  
                  for item in items:
                      if item.get('defect_detected'):
                          total_defects += 1
                          by_type[item.get('defect_type', 'unknown')] += 1
                          by_severity[item.get('severity', 'unknown')] += 1
                          by_facility[item.get('facility', 'unknown')] += 1
                          by_stage[item.get('probable_stage', 'unknown')] += 1
                  
                  stats = {
                      'total_inspections': len(items),
                      'total_defects': total_defects,
                      'defect_rate': round(total_defects / len(items) * 100, 2) if items else 0,
                      'by_type': dict(by_type),
                      'by_severity': dict(by_severity),
                      'by_facility': dict(by_facility),
                      'by_stage': dict(by_stage)
                  }
                  
                  return cors_response(200, stats)
              except Exception as e:
                  return cors_response(500, {'error': str(e)})

          def cors_response(status_code, body):
              return {
                  'statusCode': status_code,
                  'headers': {
                      'Content-Type': 'application/json',
                      'Access-Control-Allow-Origin': '*',
                      'Access-Control-Allow-Headers': 'Content-Type',
                      'Access-Control-Allow-Methods': 'GET,OPTIONS'
                  },
                  'body': json.dumps(body)
              }

  # ============================================================
  # API GATEWAY - REST API
  # ============================================================
  ApiGateway:
    Type: AWS::ApiGateway::RestApi
    Properties:
      Name: !Sub '${ProjectName}-api'
      Description: Wiko Defect Analyzer API
      EndpointConfiguration:
        Types: [REGIONAL]

  # /api resource
  ApiResource:
    Type: AWS::ApiGateway::Resource
    Properties:
      RestApiId: !Ref ApiGateway
      ParentId: !GetAtt ApiGateway.RootResourceId
      PathPart: api

  # /api/v1 resource
  V1Resource:
    Type: AWS::ApiGateway::Resource
    Properties:
      RestApiId: !Ref ApiGateway
      ParentId: !Ref ApiResource
      PathPart: v1

  # /api/v1/analyze
  AnalyzeResource:
    Type: AWS::ApiGateway::Resource
    Properties:
      RestApiId: !Ref ApiGateway
      ParentId: !Ref V1Resource
      PathPart: analyze

  AnalyzeMethodPost:
    Type: AWS::ApiGateway::Method
    Properties:
      RestApiId: !Ref ApiGateway
      ResourceId: !Ref AnalyzeResource
      HttpMethod: POST
      AuthorizationType: NONE
      Integration:
        Type: AWS_PROXY
        IntegrationHttpMethod: POST
        Uri: !Sub 'arn:aws:apigateway:${AWS::Region}:lambda:path/2015-03-31/functions/${AnalyzeFunction.Arn}/invocations'

  AnalyzeMethodOptions:
    Type: AWS::ApiGateway::Method
    Properties:
      RestApiId: !Ref ApiGateway
      ResourceId: !Ref AnalyzeResource
      HttpMethod: OPTIONS
      AuthorizationType: NONE
      Integration:
        Type: MOCK
        RequestTemplates:
          application/json: '{"statusCode": 200}'
        IntegrationResponses:
          - StatusCode: 200
            ResponseParameters:
              method.response.header.Access-Control-Allow-Headers: "'Content-Type,Authorization'"
              method.response.header.Access-Control-Allow-Methods: "'GET,POST,OPTIONS'"
              method.response.header.Access-Control-Allow-Origin: "'*'"
            ResponseTemplates:
              application/json: ''
      MethodResponses:
        - StatusCode: 200
          ResponseParameters:
            method.response.header.Access-Control-Allow-Headers: true
            method.response.header.Access-Control-Allow-Methods: true
            method.response.header.Access-Control-Allow-Origin: true

  # /api/v1/defects
  DefectsResource:
    Type: AWS::ApiGateway::Resource
    Properties:
      RestApiId: !Ref ApiGateway
      ParentId: !Ref V1Resource
      PathPart: defects

  DefectsMethodGet:
    Type: AWS::ApiGateway::Method
    Properties:
      RestApiId: !Ref ApiGateway
      ResourceId: !Ref DefectsResource
      HttpMethod: GET
      AuthorizationType: NONE
      Integration:
        Type: AWS_PROXY
        IntegrationHttpMethod: POST
        Uri: !Sub 'arn:aws:apigateway:${AWS::Region}:lambda:path/2015-03-31/functions/${GetDefectsFunction.Arn}/invocations'

  DefectsMethodOptions:
    Type: AWS::ApiGateway::Method
    Properties:
      RestApiId: !Ref ApiGateway
      ResourceId: !Ref DefectsResource
      HttpMethod: OPTIONS
      AuthorizationType: NONE
      Integration:
        Type: MOCK
        RequestTemplates:
          application/json: '{"statusCode": 200}'
        IntegrationResponses:
          - StatusCode: 200
            ResponseParameters:
              method.response.header.Access-Control-Allow-Headers: "'Content-Type'"
              method.response.header.Access-Control-Allow-Methods: "'GET,OPTIONS'"
              method.response.header.Access-Control-Allow-Origin: "'*'"
            ResponseTemplates:
              application/json: ''
      MethodResponses:
        - StatusCode: 200
          ResponseParameters:
            method.response.header.Access-Control-Allow-Headers: true
            method.response.header.Access-Control-Allow-Methods: true
            method.response.header.Access-Control-Allow-Origin: true

  # /api/v1/stats
  StatsResource:
    Type: AWS::ApiGateway::Resource
    Properties:
      RestApiId: !Ref ApiGateway
      ParentId: !Ref V1Resource
      PathPart: stats

  StatsMethodGet:
    Type: AWS::ApiGateway::Method
    Properties:
      RestApiId: !Ref ApiGateway
      ResourceId: !Ref StatsResource
      HttpMethod: GET
      AuthorizationType: NONE
      Integration:
        Type: AWS_PROXY
        IntegrationHttpMethod: POST
        Uri: !Sub 'arn:aws:apigateway:${AWS::Region}:lambda:path/2015-03-31/functions/${GetStatsFunction.Arn}/invocations'

  StatsMethodOptions:
    Type: AWS::ApiGateway::Method
    Properties:
      RestApiId: !Ref ApiGateway
      ResourceId: !Ref StatsResource
      HttpMethod: OPTIONS
      AuthorizationType: NONE
      Integration:
        Type: MOCK
        RequestTemplates:
          application/json: '{"statusCode": 200}'
        IntegrationResponses:
          - StatusCode: 200
            ResponseParameters:
              method.response.header.Access-Control-Allow-Headers: "'Content-Type'"
              method.response.header.Access-Control-Allow-Methods: "'GET,OPTIONS'"
              method.response.header.Access-Control-Allow-Origin: "'*'"
            ResponseTemplates:
              application/json: ''
      MethodResponses:
        - StatusCode: 200
          ResponseParameters:
            method.response.header.Access-Control-Allow-Headers: true
            method.response.header.Access-Control-Allow-Methods: true
            method.response.header.Access-Control-Allow-Origin: true

  # Lambda Permissions
  AnalyzeLambdaPermission:
    Type: AWS::Lambda::Permission
    Properties:
      FunctionName: !Ref AnalyzeFunction
      Action: lambda:InvokeFunction
      Principal: apigateway.amazonaws.com
      SourceArn: !Sub 'arn:aws:execute-api:${AWS::Region}:${AWS::AccountId}:${ApiGateway}/*'

  GetDefectsLambdaPermission:
    Type: AWS::Lambda::Permission
    Properties:
      FunctionName: !Ref GetDefectsFunction
      Action: lambda:InvokeFunction
      Principal: apigateway.amazonaws.com
      SourceArn: !Sub 'arn:aws:execute-api:${AWS::Region}:${AWS::AccountId}:${ApiGateway}/*'

  GetStatsLambdaPermission:
    Type: AWS::Lambda::Permission
    Properties:
      FunctionName: !Ref GetStatsFunction
      Action: lambda:InvokeFunction
      Principal: apigateway.amazonaws.com
      SourceArn: !Sub 'arn:aws:execute-api:${AWS::Region}:${AWS::AccountId}:${ApiGateway}/*'

  # API Deployment
  ApiDeployment:
    Type: AWS::ApiGateway::Deployment
    DependsOn:
      - AnalyzeMethodPost
      - AnalyzeMethodOptions
      - DefectsMethodGet
      - DefectsMethodOptions
      - StatsMethodGet
      - StatsMethodOptions
    Properties:
      RestApiId: !Ref ApiGateway
      StageName: !Ref Environment

Outputs:
  ApiEndpoint:
    Description: API Gateway endpoint URL
    Value: !Sub 'https://${ApiGateway}.execute-api.${AWS::Region}.amazonaws.com/${Environment}'
    Export:
      Name: !Sub '${ProjectName}-api-endpoint'
  
  ImagesBucket:
    Description: S3 bucket for defect images
    Value: !Ref ImagesBucket
  
  DefectsTable:
    Description: DynamoDB table for defect records
    Value: !Ref DefectsTable
