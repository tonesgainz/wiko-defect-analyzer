"""
Wiko Defect Analyzer REST API
==============================
Flask-based API for manufacturing defect analysis.
"""

import os
from datetime import datetime
from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from functools import wraps

from config import Config
from views.analysis import analysis_bp
from views.metadata import metadata_bp

app = Flask(__name__)

# Environment-based CORS configuration
cors_origins = os.getenv('CORS_ORIGINS', 'http://localhost:3000,http://localhost:5173')
if cors_origins == '*':
    # Only allow wildcard in development
    if os.getenv('ENVIRONMENT', 'development') == 'production':
        raise ValueError("CORS_ORIGINS cannot be '*' in production. Set specific origins in .env")
    CORS(app)
else:
    # Production: restrict to specific origins
    allowed_origins = [origin.strip() for origin in cors_origins.split(',') if origin.strip()]
    CORS(app, origins=allowed_origins, supports_credentials=True)

# Configuration
app.config['MAX_CONTENT_LENGTH'] = Config.MAX_CONTENT_LENGTH
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev-secret-key-change-in-production')

# Rate Limiting
# Configure different limits based on environment
rate_limit_per_ip = os.getenv('RATE_LIMIT_PER_IP', '60 per minute')
rate_limit_per_key = os.getenv('RATE_LIMIT_PER_KEY', '300 per minute')

limiter = Limiter(
    get_remote_address,
    app=app,
    default_limits=[rate_limit_per_ip],
    storage_uri=os.getenv('REDIS_URL', 'memory://'),  # Use Redis in production
    strategy="fixed-window"
)

# API Authentication Middleware
def require_api_key(f):
    """Decorator to require API key authentication for endpoints"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Skip authentication in development mode if API_KEY not set
        api_key_required = os.getenv('API_KEY')
        if not api_key_required and os.getenv('ENVIRONMENT', 'development') == 'development':
            # Development mode without API key - allow access but warn
            return f(*args, **kwargs)

        # Production mode or API key is set - enforce authentication
        api_key = request.headers.get('X-API-Key') or request.args.get('api_key')
        if not api_key or api_key != api_key_required:
            return jsonify({
                "error": "Unauthorized",
                "message": "Valid API key required. Include X-API-Key header or api_key query parameter."
            }), 401
        return f(*args, **kwargs)
    return decorated_function

# Security headers middleware
@app.after_request
def add_security_headers(response):
    """Add security headers to all responses"""
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['X-XSS-Protection'] = '1; mode=block'

    # Only add HSTS in production with HTTPS
    if os.getenv('ENVIRONMENT') == 'production':
        response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'

    # Content Security Policy
    response.headers['Content-Security-Policy'] = "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'"

    return response

# Register Blueprints
app.register_blueprint(analysis_bp, url_prefix='/api/v1')
app.register_blueprint(metadata_bp, url_prefix='/api/v1')


@app.route('/', methods=['GET'])
def index():
    """API documentation endpoint"""
    return jsonify({
        "service": "Wiko Defect Analyzer API",
        "version": "1.0.0",
        "description": "AI-powered defect detection and root cause analysis for cutlery manufacturing",
        "endpoints": {
            "GET /health": "Health check",
            "GET /api/v1/defect-types": "List defect classifications",
            "GET /api/v1/production-stages": "List production stages",
            "GET /api/v1/facilities": "List Wiko facilities",
            "POST /api/v1/analyze": "Analyze single image (requires: image, product_sku)",
            "POST /api/v1/analyze/batch": "Batch image analysis",
            "POST /api/v1/shift-report": "Generate shift report"
        },
        "example": {
            "curl": "curl -X POST http://localhost:5001/api/v1/analyze -F 'image=@test.jpg' -F 'product_sku=WK-KN-200' -F 'facility=yangjiang'"
        },
        "documentation": "https://github.com/wiko-cutlery/defect-analyzer"
    })


@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        "status": "healthy",
        "service": "wiko-defect-analyzer",
        "version": "1.0.0",
        "timestamp": datetime.now().isoformat()
    })


@app.errorhandler(413)
def too_large(e):
    return jsonify({"error": "File too large. Maximum size is 16MB."}), 413


@app.errorhandler(500)
def server_error(e):
    return jsonify({"error": "Internal server error"}), 500


if __name__ == '__main__':
    port = int(os.getenv('PORT', 5001)) # Changed port to 5001
    debug = os.getenv('FLASK_DEBUG', '0') == '1'
    
    print(f"""
    ╔═══════════════════════════════════════════════════════════╗
    ║     WIKO DEFECT ANALYZER API                              ║
    ║     Manufacturing Intelligence Platform                    ║
    ╠═══════════════════════════════════════════════════════════╣
    ║  Endpoints:                                                ║
    ║    POST /api/v1/analyze        - Single image analysis    ║
    ║    POST /api/v1/analyze/batch  - Batch analysis           ║
    ║    POST /api/v1/shift-report   - Generate shift report    ║
    ║    GET  /api/v1/defect-types   - List defect types        ║
    ║    GET  /api/v1/production-stages - Production flow       ║
    ║    GET  /api/v1/facilities     - Wiko facilities          ║
    ╚═══════════════════════════════════════════════════════════╝
    """)
    
    app.run(host='0.0.0.0', port=port, debug=debug)
