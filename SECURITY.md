# Security Policy

## Reporting Security Vulnerabilities

If you discover a security vulnerability in the Wiko Defect Analyzer, please report it by emailing:

- **Security Contact:** anthony.lo@wiko.com.hk
- **Subject Line:** [SECURITY] Wiko Defect Analyzer - [Brief Description]

Please **DO NOT** create public GitHub issues for security vulnerabilities.

We will acknowledge your email within 48 hours and provide a detailed response within 7 days.

---

## Security Best Practices

### For Deployment

#### 1. Secrets Management

**❌ NEVER:**
- Commit `.env` files to version control
- Hardcode API keys, passwords, or secrets in code
- Share credentials via email or chat
- Use the same secrets across environments

**✅ ALWAYS:**
- Use Azure Key Vault or AWS Secrets Manager for production secrets
- Use Azure Managed Identity for authentication when possible
- Rotate secrets regularly (at least quarterly)
- Use different secrets for dev/staging/production
- Enable secret versioning

#### 2. API Authentication

**Current Status:** ⚠️ No authentication implemented (CRITICAL)

**Required for Production:**
- Implement API key authentication for all endpoints
- Use JWT tokens for user sessions
- Implement role-based access control (RBAC)
- Rate limit all API endpoints
- Log all authentication attempts

**Implementation Example:**
```python
from flask import request, jsonify
import os

def require_api_key(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        api_key = request.headers.get('X-API-Key')
        if api_key != os.getenv('API_KEY'):
            return jsonify({"error": "Unauthorized"}), 401
        return f(*args, **kwargs)
    return decorated_function

@app.route('/api/v1/analyze', methods=['POST'])
@require_api_key
def analyze():
    # ... analysis code
```

#### 3. CORS Configuration

**❌ Current (Development Only):**
```python
CORS(app)  # Allows all origins
```

**✅ Production:**
```python
CORS(app, origins=[
    "https://wiko-dashboard.azurewebsites.net",
    "https://wiko.com.hk"
])
```

#### 4. Input Validation

**File Uploads:**
- Validate file extensions AND magic bytes
- Enforce strict size limits (currently 16MB, consider reducing)
- Scan uploads for malware
- Never execute uploaded files

**Example:**
```python
import magic

def validate_image(file):
    # Check file size
    if len(file.read()) > 10 * 1024 * 1024:  # 10MB
        return False, "File too large"

    file.seek(0)

    # Check magic bytes
    mime = magic.from_buffer(file.read(2048), mime=True)
    if mime not in ['image/jpeg', 'image/png', 'image/webp']:
        return False, "Invalid file type"

    file.seek(0)
    return True, None
```

**Request Parameters:**
```python
from pydantic import BaseModel, validator

class AnalyzeRequest(BaseModel):
    product_sku: str
    facility: str

    @validator('facility')
    def facility_must_be_valid(cls, v):
        valid_facilities = ['hongkong', 'shenzhen', 'yangjiang']
        if v not in valid_facilities:
            raise ValueError('Invalid facility')
        return v
```

#### 5. Error Handling

**❌ NEVER expose internal details:**
```python
return jsonify({"error": str(e)}), 500  # May leak sensitive info
```

**✅ Use generic error messages:**
```python
logger.error(f"Analysis failed: {str(e)}", exc_info=True)
return jsonify({"error": "Internal server error"}), 500
```

#### 6. Logging Security

**DO:**
- Log all authentication attempts
- Log all file uploads with hashes
- Log all API calls with request IDs
- Use structured logging (JSON)

**DON'T:**
- Log sensitive data (API keys, passwords, PII)
- Log full image data
- Log Azure API keys or tokens

**Example:**
```python
import logging
import json

logger = logging.getLogger(__name__)

# Safe logging
logger.info("Analysis request", extra={
    "request_id": request_id,
    "product_sku": product_sku,
    "facility": facility,
    "file_hash": hashlib.sha256(file.read()).hexdigest(),
    "user_id": user_id  # If authenticated
})

# NEVER log this
# logger.info(f"API Key: {api_key}")  # WRONG!
```

---

## Security Checklist

### Pre-Production

- [ ] All secrets moved to Azure Key Vault
- [ ] API authentication implemented
- [ ] Rate limiting configured
- [ ] CORS restricted to production domains
- [ ] Input validation on all endpoints
- [ ] File upload security hardened
- [ ] SQL injection prevention (if database used)
- [ ] XSS prevention headers added
- [ ] HTTPS enforced (no HTTP)
- [ ] Security headers configured (CSP, HSTS, etc.)

### Code Security

- [ ] No hardcoded credentials
- [ ] No sensitive data in logs
- [ ] All user inputs validated and sanitized
- [ ] Proper error handling (no stack traces to users)
- [ ] Dependencies scanned for vulnerabilities
- [ ] Code reviewed by security team

### Infrastructure Security

- [ ] Azure resources in private VNet (if applicable)
- [ ] Network Security Groups configured
- [ ] Azure Web Application Firewall enabled
- [ ] DDoS protection enabled
- [ ] Azure Defender enabled
- [ ] Managed Identity used instead of keys
- [ ] Least privilege access (RBAC)

### Data Security

- [ ] Encryption at rest enabled
- [ ] Encryption in transit (TLS 1.2+)
- [ ] Temp files encrypted
- [ ] Data retention policy implemented
- [ ] GDPR compliance verified
- [ ] Audit logging enabled

### Monitoring

- [ ] Security logs sent to SIEM
- [ ] Alerts for failed authentication
- [ ] Alerts for unusual activity
- [ ] Regular security scan schedule
- [ ] Incident response plan documented

---

## Security Headers

Add these headers to all responses:

```python
@app.after_request
def security_headers(response):
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    response.headers['Content-Security-Policy'] = "default-src 'self'"
    return response
```

---

## Dependency Security

### Regular Updates

Run monthly:
```bash
pip list --outdated
pip-audit  # Check for known vulnerabilities
```

### Dependency Pinning

In `requirements.txt`, use exact versions:
```
openai==1.55.0  # Not >=1.55.0
flask==3.0.0
```

### Automated Scanning

Enable GitHub Dependabot:
```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "pip"
    directory: "/"
    schedule:
      interval: "weekly"
```

---

## Incident Response

### If a Security Incident Occurs:

1. **Contain:** Immediately disable affected API keys or services
2. **Assess:** Determine scope and impact
3. **Notify:** Contact security team and stakeholders
4. **Remediate:** Fix the vulnerability
5. **Review:** Conduct post-mortem
6. **Learn:** Update security practices

### Emergency Contacts

- **Security Team:** anthony.lo@wiko.com.hk
- **Azure Support:** [Azure Portal](https://portal.azure.com)
- **On-Call:** [Set up PagerDuty/OpsGenie rotation]

---

## Compliance

### Standards

- ISO 27001 (Information Security)
- GDPR (Data Protection)
- SMETA (already certified by Wiko)
- SOC 2 Type II (recommended for SaaS)

### Data Processing

- **Purpose:** Manufacturing quality control
- **Legal Basis:** Legitimate business interest
- **Retention:** Define in data retention policy
- **Transfers:** Document any data transfers outside EU/EEA
- **Rights:** Implement data export and deletion

---

## Security Contacts

- **Primary:** anthony.lo@wiko.com.hk
- **Backup:** jonathan.lo@wiko.com.hk
- **Azure Security:** security@microsoft.com (for Azure-specific issues)

---

**Last Updated:** 2025-12-25
**Next Review:** 2026-01-25 (monthly review recommended)
