"""
Authentication utilities for Wiko Defect Analyzer API
"""

import os
from functools import wraps
from flask import request, jsonify


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
