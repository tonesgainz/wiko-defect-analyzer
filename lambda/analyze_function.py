import json
import boto3
import base64
import os
import uuid
from datetime import datetime
from decimal import Decimal

bedrock = boto3.client('bedrock-runtime', region_name=os.environ['AWS_REGION'])
s3 = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ['DEFECTS_TABLE'])

def lambda_handler(event, context):
    try:
        # Parse request body
        body = json.loads(event.get('body', '{}'))
        image_base64 = body.get('image')
        product_sku = body.get('product_sku', 'UNKNOWN')
        facility = body.get('facility', 'UNKNOWN')

        if not image_base64:
            return {
                'statusCode': 400,
                'headers': {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Access-Control-Allow-Methods': 'POST, OPTIONS'
                },
                'body': json.dumps({'error': 'Missing image data'})
            }

        # Generate IDs
        defect_id = str(uuid.uuid4())
        timestamp = int(datetime.utcnow().timestamp())
        image_key = 'inspections/%s/%s/%s.jpg' % (facility, product_sku, defect_id)

        # Store image in S3
        image_data = base64.b64decode(image_base64.split(',')[1] if ',' in image_base64 else image_base64)
        s3.put_object(
            Bucket=os.environ['IMAGE_BUCKET'],
            Key=image_key,
            Body=image_data,
            ContentType='image/jpeg'
        )

        # Comprehensive prompt for structured JSON output
        prompt = '''You are an expert quality inspector for Wiko Cutlery. Analyze this product image for manufacturing defects.

CRITICAL: Output ONLY valid JSON with NO markdown, NO code blocks, NO explanatory text.

Product SKU: %s
Facility: %s

Required JSON structure:
{
  "has_defect": boolean,
  "defect_type": "rust_spot|blade_scratch|edge_irregularity|blade_chip|handle_crack|handle_discoloration|weld_defect|polish_defect|dimensional_error|assembly_misalignment|surface_contamination|heat_treatment_defect|none",
  "severity": "critical|major|minor|cosmetic|pass",
  "confidence": number (0.0-1.0, use 0.90-0.99 for no-defect cases),
  "location": {
    "region": "blade_edge|blade_surface|blade_spine|handle_left|handle_right|bolster|tip|full_product",
    "bounding_box": {"x": number, "y": number, "width": number, "height": number}
  },
  "description": "2-3 sentence technical description",
  "probable_stage": "blade_stamp|bolster_welding|back_edge_polishing|taper_grinding|heat_treatment|vacuum_quench|handle_injection|rivet_assembly|handle_polishing|blade_glazing|cutting_edge_honing|logo_print",
  "root_cause_hypothesis": "Technical explanation or N/A if no defect",
  "corrective_actions": ["action1", "action2"],
  "recommended_action": "reject|rework|accept_with_discount|accept|escalate_to_supervisor",
  "measurements": {
    "defect_size_mm": number or null,
    "affected_area_percent": number or null
  }
}

Defect Types:
- rust_spot: CRITICAL - Surface oxidation from vacuum quench failure
- blade_scratch: Surface scratches (major if >5mm, minor if <5mm)
- edge_irregularity: Uneven cutting edge
- blade_chip: CRITICAL - Missing blade material
- handle_crack: Cracks in handle
- weld_defect: Bolster welding issues
- polish_defect: Uneven polish
- dimensional_error: Size/shape out of spec
- assembly_misalignment: Misaligned components
- surface_contamination: Foreign material
- none: No defects (use severity: "pass")

Severity Rules:
- critical: Safety hazard (rust_spot, blade_chip)
- major: Cannot ship (weld defects, large scratches, handle cracks)
- minor: Can ship with discount (small scratches <5mm)
- cosmetic: Within tolerance
- pass: No defects detected (ONLY with defect_type: "none")

NO-DEFECT Example (use when product passes):
{
  "has_defect": false,
  "defect_type": "none",
  "severity": "pass",
  "confidence": 0.95,
  "location": {"region": "full_product", "bounding_box": {"x": 0, "y": 0, "width": 100, "height": 100}},
  "description": "Product meets all Wiko quality standards. Blade is clean with consistent finish, edge is sharp and uniform, handle shows no defects. Ready for packaging.",
  "probable_stage": "logo_print",
  "root_cause_hypothesis": "N/A - product passes all quality criteria",
  "corrective_actions": ["Proceed to packaging", "Update quality metrics"],
  "recommended_action": "accept",
  "measurements": {"defect_size_mm": null, "affected_area_percent": null}
}

Analyze the image and output ONLY the JSON.''' % (product_sku, facility)

        # Call Bedrock
        response = bedrock.invoke_model(
            modelId=os.environ['BEDROCK_MODEL_ID'],
            contentType='application/json',
            accept='application/json',
            body=json.dumps({
                'anthropic_version': 'bedrock-2023-05-31',
                'max_tokens': 4096,
                'messages': [
                    {
                        'role': 'user',
                        'content': [
                            {
                                'type': 'image',
                                'source': {
                                    'type': 'base64',
                                    'media_type': 'image/jpeg',
                                    'data': image_base64.split(',')[1] if ',' in image_base64 else image_base64
                                }
                            },
                            {
                                'type': 'text',
                                'text': prompt
                            }
                        ]
                    }
                ]
            })
        )

        # Parse Bedrock response
        response_body = json.loads(response['body'].read())
        content_text = response_body['content'][0]['text']

        # Extract JSON from response
        try:
            # Remove markdown code blocks if present
            if '```json' in content_text:
                content_text = content_text.split('```json')[1].split('```')[0].strip()
            elif '```' in content_text:
                content_text = content_text.split('```')[1].split('```')[0].strip()

            # Find JSON object
            json_start = content_text.find('{')
            json_end = content_text.rfind('}') + 1
            if json_start >= 0 and json_end > json_start:
                content_text = content_text[json_start:json_end]

            analysis = json.loads(content_text)

            # Validate required fields
            if 'has_defect' not in analysis:
                raise ValueError('Missing has_defect field')

        except Exception as e:
            print('Error parsing JSON: %s' % str(e))
            print('Raw content: %s' % content_text[:500])
            # Fallback structure
            analysis = {
                'has_defect': False,
                'defect_type': 'none',
                'severity': 'cosmetic',
                'confidence': 0.5,
                'location': {
                    'region': 'full_product',
                    'bounding_box': {'x': 0, 'y': 0, 'width': 100, 'height': 100}
                },
                'description': 'Unable to parse AI response. Raw: %s' % content_text[:200],
                'probable_stage': 'logo_print',
                'root_cause_hypothesis': 'Response parsing error',
                'corrective_actions': ['Manual review required'],
                'recommended_action': 'escalate_to_supervisor',
                'measurements': {'defect_size_mm': None, 'affected_area_percent': None}
            }

        # Store in DynamoDB
        item = {
            'defect_id': defect_id,
            'timestamp': timestamp,
            'facility': facility,
            'product_sku': product_sku,
            'image_url': 's3://%s/%s' % (os.environ['IMAGE_BUCKET'], image_key),
            'analysis': analysis,
            'created_at': datetime.utcnow().isoformat()
        }

        # Convert floats to Decimal for DynamoDB
        item = json.loads(json.dumps(item), parse_float=Decimal)
        table.put_item(Item=item)

        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            'body': json.dumps({
                'defect_id': defect_id,
                'timestamp': timestamp,
                'analysis': analysis
            })
        }

    except Exception as e:
        print('Error: %s' % str(e))
        return {
            'statusCode': 500,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            'body': json.dumps({'error': str(e)})
        }
