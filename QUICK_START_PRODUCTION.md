# Quick Start: Production Readiness Implementation

This guide helps you implement the **most critical** security and reliability fixes before production deployment.

**Estimated Time:** 2-3 days
**Priority:** 🔴 Critical - Must complete before any production deployment

---

## Day 1: Security Fundamentals

### Task 1: Set Up Environment Variables (30 minutes)

1. Copy the template:
   ```bash
   cp .env.template .env
   ```

2. Fill in your Azure credentials:
   - Get from [Azure AI Foundry Portal](https://ai.azure.com)
   - Never commit `.env` to git

3. Verify `.env` is in `.gitignore`:
   ```bash
   grep -q "^\.env$" .gitignore && echo "OK" || echo ".env" >> .gitignore
   ```

### Task 2: Implement API Authentication (2 hours)

Create `utils/auth.py`:

```python
from functools import wraps
from flask import request, jsonify
import os

def require_api_key(f):
    """Decorator to require API key authentication"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        api_key = request.headers.get('X-API-Key')

        if not api_key:
            return jsonify({
                "error": "Missing API key",
                "message": "Include X-API-Key header"
            }), 401

        valid_key = os.getenv('API_KEY')
        if not valid_key:
            return jsonify({"error": "Server misconfigured"}), 500

        if api_key != valid_key:
            return jsonify({"error": "Invalid API key"}), 401

        return f(*args, **kwargs)
    return decorated_function
```

Update `views/analysis.py`:

```python
from utils.auth import require_api_key

@analysis_bp.route('/analyze', methods=['POST'])
@require_api_key  # Add this line
def analyze_defect():
    # ... existing code
```

Generate a strong API key:
```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

Add to `.env`:
```
API_KEY=your-generated-key-here
```

### Task 3: Fix CORS Configuration (15 minutes)

Update `app.py`:

```python
from flask_cors import CORS
import os

# BEFORE (insecure):
# CORS(app)

# AFTER (secure):
allowed_origins = os.getenv('CORS_ORIGINS', 'http://localhost:3000').split(',')
CORS(app, origins=allowed_origins, supports_credentials=True)
```

Add to `.env`:
```
# Development
CORS_ORIGINS=http://localhost:3000,http://localhost:5173

# Production (update with your actual domains)
# CORS_ORIGINS=https://wiko-dashboard.azurewebsites.net,https://wiko.com.hk
```

### Task 4: Add Input Validation (2 hours)

Create `utils/validators.py`:

```python
from werkzeug.utils import secure_filename
import magic
from typing import Tuple

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'webp'}
ALLOWED_MIME_TYPES = {
    'image/jpeg',
    'image/png',
    'image/webp'
}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB

def validate_image_file(file) -> Tuple[bool, str]:
    """Validate uploaded image file"""

    # Check filename
    if not file.filename:
        return False, "No filename provided"

    filename = secure_filename(file.filename)
    if '.' not in filename:
        return False, "Invalid filename"

    ext = filename.rsplit('.', 1)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        return False, f"Invalid extension. Allowed: {ALLOWED_EXTENSIONS}"

    # Check file size
    file.seek(0, 2)  # Seek to end
    size = file.tell()
    file.seek(0)  # Reset

    if size > MAX_FILE_SIZE:
        return False, f"File too large. Max: {MAX_FILE_SIZE / 1024 / 1024}MB"

    # Check magic bytes (actual file type)
    try:
        mime = magic.from_buffer(file.read(2048), mime=True)
        file.seek(0)

        if mime not in ALLOWED_MIME_TYPES:
            return False, f"Invalid file type: {mime}"
    except Exception as e:
        return False, f"Could not validate file: {str(e)}"

    return True, "OK"

def validate_product_sku(sku: str) -> Tuple[bool, str]:
    """Validate product SKU format"""
    if not sku or len(sku) > 50:
        return False, "Invalid SKU length"

    # Add your SKU format validation
    # Example: WK-XX-### format
    if not sku.startswith('WK-'):
        return False, "SKU must start with WK-"

    return True, "OK"

def validate_facility(facility: str) -> Tuple[bool, str]:
    """Validate facility code"""
    VALID_FACILITIES = {'hongkong', 'shenzhen', 'yangjiang'}

    if facility.lower() not in VALID_FACILITIES:
        return False, f"Invalid facility. Must be one of: {VALID_FACILITIES}"

    return True, "OK"
```

Update `views/analysis.py`:

```python
from utils.validators import validate_image_file, validate_product_sku, validate_facility

@analysis_bp.route('/analyze', methods=['POST'])
@require_api_key
def analyze_defect():
    if 'image' not in request.files:
        return jsonify({"error": "No image file provided"}), 400

    file = request.files['image']

    # Validate image file
    valid, message = validate_image_file(file)
    if not valid:
        return jsonify({"error": message}), 400

    # Validate product SKU
    product_sku = request.form.get('product_sku', 'WK-KN-200')
    valid, message = validate_product_sku(product_sku)
    if not valid:
        return jsonify({"error": message}), 400

    # Validate facility
    facility = request.form.get('facility', 'yangjiang')
    valid, message = validate_facility(facility)
    if not valid:
        return jsonify({"error": message}), 400

    # ... rest of existing code
```

Install required package:
```bash
pip install python-magic
```

Update `requirements.txt`:
```
python-magic==0.4.27
```

---

## Day 2: Error Handling & Reliability

### Task 5: Add Structured Logging (2 hours)

Create `utils/logger.py`:

```python
import logging
import json
import os
from datetime import datetime
from flask import request, g
import uuid

class JSONFormatter(logging.Formatter):
    """Format logs as JSON"""

    def format(self, record):
        log_data = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno
        }

        # Add request context if available
        if has_request_context():
            log_data.update({
                "request_id": getattr(g, 'request_id', None),
                "method": request.method,
                "path": request.path,
                "ip": request.remote_addr
            })

        # Add exception info if present
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)

        return json.dumps(log_data)

def setup_logging():
    """Configure application logging"""
    log_level = os.getenv('LOG_LEVEL', 'INFO')
    json_logging = os.getenv('JSON_LOGGING', 'true').lower() == 'true'

    # Root logger
    logger = logging.getLogger()
    logger.setLevel(log_level)

    # Remove existing handlers
    logger.handlers = []

    # Console handler
    handler = logging.StreamHandler()

    if json_logging:
        handler.setFormatter(JSONFormatter())
    else:
        formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
        handler.setFormatter(formatter)

    logger.addHandler(handler)

    return logger

def get_logger(name):
    """Get a logger instance"""
    return logging.getLogger(name)
```

Update `app.py`:

```python
from utils.logger import setup_logging, get_logger
from flask import g
import uuid

# Set up logging
setup_logging()
logger = get_logger(__name__)

@app.before_request
def before_request():
    """Add request ID for tracing"""
    g.request_id = request.headers.get('X-Request-ID', str(uuid.uuid4()))
    logger.info("Request started", extra={
        "request_id": g.request_id,
        "method": request.method,
        "path": request.path
    })

@app.after_request
def after_request(response):
    """Log request completion"""
    logger.info("Request completed", extra={
        "request_id": g.request_id,
        "status_code": response.status_code
    })
    response.headers['X-Request-ID'] = g.request_id
    return response
```

### Task 6: Add API Timeout and Retry Logic (2 hours)

Update `agents/defect_analyzer_gpt52.py`:

```python
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from openai import RateLimitError, APIError, APITimeoutError
import httpx

class WikoDefectAnalyzerGPT52:
    def __init__(self):
        # ... existing code ...

        # Add timeout configuration
        timeout = httpx.Timeout(
            timeout=float(os.getenv('AZURE_API_TIMEOUT', '30.0')),
            connect=10.0
        )

        self.client = AzureOpenAI(
            azure_endpoint=self._get_openai_endpoint(),
            api_key=self.api_key,
            api_version=self.api_version,
            timeout=timeout,  # Add this
            max_retries=0  # We'll handle retries ourselves
        )

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type((RateLimitError, APIError, APITimeoutError))
    )
    async def _run_vision_classification_agent(
        self,
        image_path: str,
        product_sku: str,
        reasoning_effort: str = "high"
    ) -> Dict[str, Any]:
        """Vision analysis with retry logic"""
        try:
            # ... existing code ...

            response = self.client.chat.completions.create(
                model=self.vision_deployment,
                messages=[...],
                max_completion_tokens=2000,
                response_format={"type": "json_object"},
                reasoning_effort=reasoning_effort,
                timeout=30  # Per-request timeout
            )

            return result

        except RateLimitError as e:
            logger.warning(f"Rate limit hit: {e}")
            raise  # Will be retried
        except APITimeoutError as e:
            logger.error(f"API timeout: {e}")
            raise  # Will be retried
        except Exception as e:
            logger.error(f"Unexpected error: {e}", exc_info=True)
            raise
```

Install required package:
```bash
pip install tenacity
```

Update `requirements.txt`:
```
tenacity==8.2.3
```

### Task 7: Improve Error Handling (1 hour)

Update `views/analysis.py`:

```python
from utils.logger import get_logger

logger = get_logger(__name__)

@analysis_bp.route('/analyze', methods=['POST'])
@require_api_key
def analyze_defect():
    try:
        # ... validation code ...

        # Analysis
        result = loop.run_until_complete(
            analyzer.analyze_defect(
                image_path=temp_path,
                product_sku=product_sku,
                facility=facility,
                production_data=production_data
            )
        )

        logger.info("Analysis completed", extra={
            "request_id": g.request_id,
            "defect_detected": result.defect_detected,
            "confidence": result.confidence
        })

        return jsonify({"success": True, "analysis": result.to_dict()})

    except ValueError as e:
        logger.warning(f"Validation error: {e}")
        return jsonify({"success": False, "error": "Invalid input"}), 400

    except RateLimitError:
        logger.error("Azure API rate limit exceeded")
        return jsonify({
            "success": False,
            "error": "Service temporarily unavailable"
        }), 503

    except APITimeoutError:
        logger.error("Azure API timeout")
        return jsonify({
            "success": False,
            "error": "Request timeout"
        }), 504

    except Exception as e:
        logger.error(f"Analysis failed: {e}", exc_info=True)
        return jsonify({
            "success": False,
            "error": "Internal server error",
            "request_id": g.request_id
        }), 500

    finally:
        # Ensure cleanup
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception as e:
                logger.error(f"Failed to cleanup temp file: {e}")
```

---

## Day 3: Testing & Deployment Prep

### Task 8: Add Rate Limiting (2 hours)

Install Flask-Limiter:
```bash
pip install Flask-Limiter
```

Update `requirements.txt`:
```
Flask-Limiter==3.5.0
```

Create `utils/rate_limit.py`:

```python
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask import request
import os

def get_api_key():
    """Get API key from request for rate limiting"""
    return request.headers.get('X-API-Key', get_remote_address())

limiter = Limiter(
    key_func=get_api_key,
    default_limits=[os.getenv('RATE_LIMIT_PER_IP', '60 per minute')],
    storage_uri=os.getenv('REDIS_URL', 'memory://')
)
```

Update `app.py`:

```python
from utils.rate_limit import limiter

app = Flask(__name__)
CORS(app, origins=allowed_origins)

# Initialize rate limiter
limiter.init_app(app)
```

Update `views/analysis.py`:

```python
from utils.rate_limit import limiter

@analysis_bp.route('/analyze', methods=['POST'])
@limiter.limit("10 per minute")  # Stricter limit for expensive endpoint
@require_api_key
def analyze_defect():
    # ... existing code
```

### Task 9: Add Security Headers (30 minutes)

Update `app.py`:

```python
@app.after_request
def security_headers(response):
    """Add security headers to all responses"""
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    response.headers['Content-Security-Policy'] = "default-src 'self'"
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    return response
```

### Task 10: Create Health Check (30 minutes)

Update `app.py`:

```python
from datetime import datetime
import os

@app.route('/health', methods=['GET'])
def health_check():
    """Comprehensive health check"""
    health_status = {
        "status": "healthy",
        "service": "wiko-defect-analyzer",
        "version": "1.0.0",
        "timestamp": datetime.now().isoformat(),
        "environment": os.getenv('ENVIRONMENT', 'development'),
        "checks": {}
    }

    # Check Azure OpenAI connectivity
    try:
        # Simple ping test
        analyzer = WikoDefectAnalyzerGPT52()
        health_status["checks"]["azure_openai"] = "healthy"
    except Exception as e:
        health_status["status"] = "unhealthy"
        health_status["checks"]["azure_openai"] = f"unhealthy: {str(e)}"

    # Check environment variables
    required_vars = [
        'AZURE_AI_PROJECT_ENDPOINT',
        'AZURE_AI_API_KEY',
        'API_KEY'
    ]

    missing_vars = [var for var in required_vars if not os.getenv(var)]
    if missing_vars:
        health_status["status"] = "unhealthy"
        health_status["checks"]["environment"] = f"missing: {missing_vars}"
    else:
        health_status["checks"]["environment"] = "healthy"

    status_code = 200 if health_status["status"] == "healthy" else 503
    return jsonify(health_status), status_code
```

---

## Final Checklist

Before deploying to production, verify:

- [ ] `.env` file created and filled with production values
- [ ] `.env` is in `.gitignore` and never committed
- [ ] API authentication working (test with and without API key)
- [ ] CORS restricted to production domains
- [ ] Input validation preventing invalid files and parameters
- [ ] Structured logging producing JSON logs
- [ ] API timeouts configured
- [ ] Retry logic working for transient failures
- [ ] Error handling returns safe messages (no stack traces)
- [ ] Rate limiting active (test by exceeding limits)
- [ ] Security headers present in responses
- [ ] Health check endpoint returning correct status
- [ ] All dependencies installed and versions pinned

---

## Testing Commands

Test authentication:
```bash
# Should fail (401)
curl -X POST http://localhost:5001/api/v1/analyze \
  -F "image=@test_images/test_knife.jpg"

# Should succeed (200)
curl -X POST http://localhost:5001/api/v1/analyze \
  -H "X-API-Key: your-api-key" \
  -F "image=@test_images/test_knife.jpg" \
  -F "product_sku=WK-KN-200"
```

Test rate limiting:
```bash
# Run this in a loop - should hit rate limit
for i in {1..15}; do
  curl -X POST http://localhost:5001/api/v1/analyze \
    -H "X-API-Key: your-api-key" \
    -F "image=@test_images/test_knife.jpg"
done
```

Test health check:
```bash
curl http://localhost:5001/health
```

---

## Next Steps

After completing these tasks:

1. Review `PRODUCTION_READINESS_TODO.md` for remaining items
2. Implement monitoring and alerting (Phase 2)
3. Set up comprehensive testing (Phase 3)
4. Review `SECURITY.md` for additional hardening

**Questions?** Contact anthony.lo@wiko.com.hk
