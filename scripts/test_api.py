#!/usr/bin/env python3
"""
Wiko AWS API Test Script
Tests the deployed AWS Bedrock backend
"""

import os
import sys
import json
import base64
import argparse
import requests
from datetime import datetime

# Load config
def load_config():
    config = {}
    env_file = '.env.aws'
    if os.path.exists(env_file):
        with open(env_file) as f:
            for line in f:
                if '=' in line and not line.startswith('#'):
                    key, value = line.strip().split('=', 1)
                    config[key] = value
    return config

CONFIG = load_config()
API_ENDPOINT = CONFIG.get('AWS_API_ENDPOINT', '')


def encode_image(image_path: str) -> str:
    """Encode image to base64"""
    with open(image_path, 'rb') as f:
        return base64.b64encode(f.read()).decode('utf-8')


def test_analyze(image_path: str, product_sku: str = 'WK-KN-200', facility: str = 'yangjiang'):
    """Test the /api/v1/analyze endpoint"""
    
    print(f"\n{'='*60}")
    print("TEST: POST /api/v1/analyze")
    print(f"{'='*60}")
    
    if not os.path.exists(image_path):
        print(f"❌ Image not found: {image_path}")
        return None
    
    # Encode image
    image_b64 = encode_image(image_path)
    print(f"→ Image encoded: {len(image_b64):,} bytes")
    
    # Send request
    url = f"{API_ENDPOINT}/api/v1/analyze"
    payload = {
        'image': image_b64,
        'product_sku': product_sku,
        'facility': facility
    }
    
    print(f"→ Sending to: {url}")
    print(f"→ Product: {product_sku}")
    print(f"→ Facility: {facility}")
    print(f"→ Waiting for Bedrock response (10-30s)...")
    
    try:
        start_time = datetime.now()
        response = requests.post(url, json=payload, timeout=120)
        elapsed = (datetime.now() - start_time).total_seconds()
        
        print(f"→ Response time: {elapsed:.1f}s")
        print(f"→ Status code: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            
            if result.get('success'):
                analysis = result.get('analysis', {})
                
                print(f"\n✅ ANALYSIS COMPLETE")
                print(f"   Defect ID: {analysis.get('defect_id')}")
                
                if analysis.get('defect_detected'):
                    print(f"\n   ⚠️  DEFECT DETECTED")
                    print(f"   Type: {analysis.get('defect_type')}")
                    print(f"   Severity: {analysis.get('severity', '').upper()}")
                    print(f"   Confidence: {analysis.get('confidence', 0):.1%}")
                    print(f"   Stage: {analysis.get('probable_stage')}")
                    print(f"\n   Root Cause:")
                    print(f"   {analysis.get('root_cause')}")
                    
                    if analysis.get('corrective_actions'):
                        print(f"\n   Corrective Actions:")
                        for action in analysis['corrective_actions']:
                            print(f"   → {action}")
                else:
                    print(f"\n   ✅ NO DEFECT - Product passed inspection")
                    print(f"   {analysis.get('description')}")
                
                return result
            else:
                print(f"❌ Analysis failed: {result.get('error')}")
        else:
            print(f"❌ Error: {response.text}")
            
    except requests.exceptions.Timeout:
        print("❌ Request timed out (>120s)")
    except Exception as e:
        print(f"❌ Error: {e}")
    
    return None


def test_get_defects(facility: str = None, limit: int = 10):
    """Test the /api/v1/defects endpoint"""
    
    print(f"\n{'='*60}")
    print("TEST: GET /api/v1/defects")
    print(f"{'='*60}")
    
    url = f"{API_ENDPOINT}/api/v1/defects"
    params = {'limit': limit}
    if facility:
        params['facility'] = facility
    
    print(f"→ Fetching from: {url}")
    
    try:
        response = requests.get(url, params=params, timeout=30)
        print(f"→ Status code: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            defects = result.get('defects', [])
            
            print(f"\n✅ Found {result.get('count', 0)} defects")
            
            for d in defects[:5]:
                severity = d.get('severity', 'N/A')
                severity_icon = {'critical': '🔴', 'major': '🟠', 'minor': '🟡', 'cosmetic': '🟢'}.get(severity, '⚪')
                
                print(f"\n   {severity_icon} {d.get('defect_id')}")
                print(f"      Type: {d.get('defect_type')} ({severity})")
                print(f"      Product: {d.get('product_sku')}")
                print(f"      Time: {d.get('timestamp')}")
            
            if len(defects) > 5:
                print(f"\n   ... and {len(defects) - 5} more")
            
            return result
        else:
            print(f"❌ Error: {response.text}")
            
    except Exception as e:
        print(f"❌ Error: {e}")
    
    return None


def test_get_stats():
    """Test the /api/v1/stats endpoint"""
    
    print(f"\n{'='*60}")
    print("TEST: GET /api/v1/stats")
    print(f"{'='*60}")
    
    url = f"{API_ENDPOINT}/api/v1/stats"
    print(f"→ Fetching from: {url}")
    
    try:
        response = requests.get(url, timeout=30)
        print(f"→ Status code: {response.status_code}")
        
        if response.status_code == 200:
            stats = response.json()
            
            print(f"\n✅ STATISTICS")
            print(f"   Total Inspections: {stats.get('total_inspections', 0)}")
            print(f"   Total Defects: {stats.get('total_defects', 0)}")
            print(f"   Defect Rate: {stats.get('defect_rate', 0)}%")
            
            if stats.get('by_type'):
                print(f"\n   By Type:")
                for t, count in stats['by_type'].items():
                    print(f"     • {t}: {count}")
            
            if stats.get('by_severity'):
                print(f"\n   By Severity:")
                for s, count in stats['by_severity'].items():
                    icon = {'critical': '🔴', 'major': '🟠', 'minor': '🟡', 'cosmetic': '🟢'}.get(s, '⚪')
                    print(f"     {icon} {s}: {count}")
            
            if stats.get('by_stage'):
                print(f"\n   By Stage:")
                for stage, count in sorted(stats['by_stage'].items(), key=lambda x: -x[1])[:5]:
                    print(f"     • {stage}: {count}")
            
            return stats
        else:
            print(f"❌ Error: {response.text}")
            
    except Exception as e:
        print(f"❌ Error: {e}")
    
    return None


def main():
    parser = argparse.ArgumentParser(description='Test Wiko AWS Bedrock API')
    parser.add_argument('--image', type=str, help='Image path to analyze')
    parser.add_argument('--sku', type=str, default='WK-KN-200', help='Product SKU')
    parser.add_argument('--facility', type=str, default='yangjiang', help='Facility')
    parser.add_argument('--defects', action='store_true', help='Get defects list')
    parser.add_argument('--stats', action='store_true', help='Get statistics')
    parser.add_argument('--all', action='store_true', help='Run all tests')
    parser.add_argument('--endpoint', type=str, help='Override API endpoint')
    
    args = parser.parse_args()
    
    global API_ENDPOINT
    if args.endpoint:
        API_ENDPOINT = args.endpoint
    
    if not API_ENDPOINT:
        print("❌ API endpoint not configured.")
        print("   Run deploy.sh first, or use --endpoint <url>")
        sys.exit(1)
    
    print("""
╔═══════════════════════════════════════════════════════════════════╗
║     WIKO DEFECT ANALYZER - AWS API TEST                           ║
║     Powered by AWS Bedrock Claude 3.5 Sonnet                      ║
╚═══════════════════════════════════════════════════════════════════╝
    """)
    print(f"API Endpoint: {API_ENDPOINT}")
    
    # Run tests
    if args.image:
        test_analyze(args.image, args.sku, args.facility)
    
    if args.all or args.defects:
        test_get_defects(args.facility if args.facility != 'yangjiang' else None)
    
    if args.all or args.stats:
        test_get_stats()
    
    if not any([args.image, args.defects, args.stats, args.all]):
        # Default: run stats test
        print("\nNo specific test requested. Running stats test...")
        test_get_stats()
        print("\n" + "="*60)
        print("USAGE:")
        print("="*60)
        print("  python test_api.py --image knife.jpg     # Analyze image")
        print("  python test_api.py --defects             # List defects")
        print("  python test_api.py --stats               # Get statistics")
        print("  python test_api.py --all --image x.jpg   # Run all tests")


if __name__ == '__main__':
    main()
