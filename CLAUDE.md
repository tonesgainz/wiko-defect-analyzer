# CLAUDE.md - IntelFactor.ai Project Context

> This file provides context to Claude Code (claude-cli) for understanding and working with the IntelFactor.ai manufacturing intelligence platform.

---

## Project Overview

**IntelFactor.ai** is an AI-powered manufacturing intelligence SaaS platform specializing in real-time defect detection for Wiko Cutlery Ltd, a 61-year-old premium knife manufacturer with facilities in Hong Kong, Shenzhen, and Yangjiang, China.

### Mission
Transform quality inspection data into actionable intelligence using computer vision and AI reasoning to detect defects across manufacturing processes.

### Key Value Proposition
- **Real-time defect detection** using GPT-5.2/Claude 3.5 vision models
- **Root cause analysis** linking defects to specific manufacturing stages
- **B2B sales intelligence** (future) for data-driven customer decisions
- **Competitive moat**: Control of "data-generating organism" vs. sample-based AI

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      INTELFACTOR.AI ARCHITECTURE                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  EDGE LAYER                    CLOUD LAYER                              │
│  ───────────                   ───────────                              │
│  ┌──────────────┐              ┌──────────────────────────────────┐    │
│  │ Basler Camera│              │         AWS CLOUD                 │    │
│  │ + LED Light  │─────────────▶│  ┌────────────┐  ┌────────────┐  │    │
│  └──────────────┘              │  │API Gateway │──│  Lambda    │  │    │
│         │                      │  └────────────┘  └─────┬──────┘  │    │
│         ▼                      │                        │         │    │
│  ┌──────────────┐              │  ┌────────────┐  ┌─────▼──────┐  │    │
│  │ NVIDIA Jetson│              │  │    S3      │  │  Bedrock   │  │    │
│  │ Xavier NX    │              │  │  (Images)  │  │ Claude 3.5 │  │    │
│  │ (Edge Filter)│              │  └────────────┘  └────────────┘  │    │
│  └──────────────┘              │                                   │    │
│                                │  ┌────────────┐                   │    │
│  FRONTEND                      │  │ DynamoDB   │                   │    │
│  ─────────                     │  │ (Results)  │                   │    │
│  ┌──────────────┐              │  └────────────┘                   │    │
│  │   Amplify    │              └──────────────────────────────────┘    │
│  │   (React)    │                                                       │
│  │ Industrial UI│              AZURE (EXISTING)                        │
│  └──────────────┘              ─────────────────                        │
│                                ┌──────────────────────────────────┐    │
│                                │  Azure AI Foundry + GPT-5.2      │    │
│                                │  (Original defect detection)      │    │
│                                └──────────────────────────────────┘    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Repository Structure

```
wiko-defect-analyzer/
├── agents/                          # AI agent implementations
│   ├── defect_analyzer_gpt52.py     # Azure GPT-5.2 vision analyzer (WORKING)
│   └── sales_intelligence.py        # AWS Bedrock Claude (PLANNED)
│
├── views/                           # Flask API routes
│   ├── analysis.py                  # Defect analysis endpoints
│   └── intelligence.py              # B2B analytics endpoints (PLANNED)
│
├── frontend/                        # React + Vite + Tailwind
│   ├── src/
│   │   ├── App.jsx                  # Main application component
│   │   ├── WikoDashboardCharts.jsx  # Recharts dashboard
│   │   └── index.css                # Tailwind styles
│   ├── package.json
│   └── vite.config.js
│
├── infrastructure/                  # AWS CloudFormation
│   └── infrastructure.yaml          # Lambda, API Gateway, S3, DynamoDB
│
├── scripts/
│   ├── deploy.sh                    # AWS deployment script
│   ├── test_api.py                  # API testing
│   └── start_server.sh              # Local Flask server
│
├── tests/                           # Test suite
├── docs/                            # Documentation
├── app.py                           # Flask application
├── run_server.py                    # Server entry point
├── config.py                        # Configuration
├── requirements.txt                 # Python dependencies
└── CLAUDE.md                        # This file
```

---

## Wiko Manufacturing Context

### Company Profile
- **Name**: Wiko Cutlery Ltd
- **Age**: 61 years (established 1964)
- **Facilities**: Hong Kong (HQ), Shenzhen (R&D), Yangjiang (Production)
- **Products**: Premium kitchen knives, scissors, cast iron cookware
- **Clients**: Williams Sonoma, Sur La Table, Amazon, Harrods

### 12-Stage Manufacturing Process

| Stage | Code | Description | Common Defects |
|-------|------|-------------|----------------|
| 1 | `blade_stamp` | Blade Stamping from German 4116 steel | dimensional_error |
| 2 | `bolster_welding` | Welding bolster to blade | weld_defect |
| 3 | `back_edge_polishing` | Back edge finishing | polish_defect |
| 4 | `taper_grinding` | V-shape edge geometry | edge_irregularity |
| 5 | `heat_treatment` | Heating to 1000°C | - |
| 6 | `vacuum_quench` | PROPRIETARY rapid cooling (1000°C→600°C in 2 min) | rust_spot (CRITICAL) |
| 7 | `handle_injection` | Handle molding | handle_crack |
| 8 | `rivet_assembly` | Handle attachment | assembly_misalignment |
| 9 | `handle_polishing` | Handle finishing | handle_discoloration |
| 10 | `blade_glazing` | Mirror/satin finish | polish_defect |
| 11 | `cutting_edge_honing` | Final sharpening | edge_irregularity |
| 12 | `logo_print` | Branding + final QC | - |

### Defect Types

```python
DEFECT_TYPES = {
    "rust_spot": "Surface oxidation (CRITICAL - indicates vacuum quench failure)",
    "blade_scratch": "Surface scratches on blade",
    "edge_irregularity": "Uneven or wavy cutting edge",
    "handle_crack": "Cracks in handle material",
    "weld_defect": "Issues with bolster welding",
    "polish_defect": "Uneven or missing polish",
    "blade_chip": "Missing material from blade edge",
    "handle_discoloration": "Color inconsistency in handle",
    "dimensional_error": "Size/shape out of specification",
    "assembly_misalignment": "Components not properly aligned",
    "surface_contamination": "Foreign material on surface"
}
```

### Severity Levels

| Level | Description | Action |
|-------|-------------|--------|
| `critical` | Safety issue or process failure | Stop line, investigate |
| `major` | Cannot ship, visible quality issue | Quarantine, rework |
| `minor` | Can ship with discount | Flag for review |
| `cosmetic` | Within tolerance | Log only |

### Defect-Stage Correlations (Important for RCA)

```python
DEFECT_STAGE_MAP = {
    "rust_spot": "vacuum_quench",        # Slow cooling causes chromium carbide
    "edge_irregularity": ["taper_grinding", "cutting_edge_honing"],
    "handle_crack": "handle_injection",   # Temperature/pressure issues
    "weld_defect": "bolster_welding",
    "blade_scratch": ["blade_glazing", "handle_polishing"],
    "polish_defect": ["back_edge_polishing", "blade_glazing"],
}
```

---

## API Endpoints

### Current (Working)

```
POST /api/v1/analyze
  Body: { image: base64, product_sku: string, facility: string }
  Response: { defect_id, analysis: {...} }

GET /api/v1/defects
  Query: ?facility=yangjiang&limit=50
  Response: { defects: [...], count: number }

GET /api/v1/stats
  Response: { total_inspections, total_defects, defect_rate, by_type, by_severity }

GET /health
  Response: { status: "healthy", timestamp: "..." }
```

### Planned (B2B Intelligence)

```
POST /api/v1/intelligence/query
  Body: { query: "natural language question" }
  Response: { summary, metrics, recommendations }

GET /api/v1/intelligence/report/:distributor_id
  Response: { quality_report for distributor }

POST /api/v1/intelligence/capacity
  Body: { product_sku, quantity, target_defect_rate, deadline }
  Response: { feasibility_assessment }
```

---

## Environment Variables

### Backend (.env)

```bash
# Azure AI Foundry (existing)
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
AZURE_OPENAI_KEY=your-key
AZURE_OPENAI_DEPLOYMENT=gpt-5.2-vision

# AWS (new)
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_DEFAULT_REGION=us-east-1
DATALAKE_BUCKET=intelfactor-datalake-{account-id}

# Application
FLASK_ENV=development
FLASK_DEBUG=1
```

### Frontend (.env)

```bash
VITE_API_URL=https://your-api.execute-api.us-east-1.amazonaws.com/prod/api/v1
```

---

## Common Commands

### Local Development

```bash
# Backend
cd ~/wiko-defect-analyzer-clean
source venv/bin/activate
python run_server.py

# Frontend
cd frontend
npm install
npm run dev
```

### AWS Deployment

```bash
# Deploy infrastructure
cd ~/wiko-aws-backend
./deploy.sh

# Test API
python test_api.py --stats
python test_api.py --image test.jpg

# View Lambda logs
aws logs tail /aws/lambda/wiko-defect-analyzer-analyze --follow

# Check DynamoDB
aws dynamodb scan --table-name wiko-defect-analyzer-defects --max-items 5
```

### Frontend Deployment (Amplify)

```bash
cd ~/wiko-defect-analyzer-clean/frontend
npm run build
git add . && git commit -m "Update" && git push origin main
# Amplify auto-deploys from main branch
```

---

## Key Files to Understand

### 1. `agents/defect_analyzer_gpt52.py`
Main AI agent using Azure GPT-5.2 for vision analysis. Contains:
- `DefectType` enum
- `ProductionStage` enum
- `WikoDefectAnalyzer` class with `analyze_image()` method
- Wiko-specific prompt engineering

### 2. `infrastructure.yaml`
AWS CloudFormation template creating:
- S3 bucket for images
- DynamoDB table for results
- Lambda function with Bedrock access
- API Gateway with CORS
- IAM roles and permissions

### 3. `frontend/src/App.jsx`
React application with:
- Industrial design system (teal/cyan accents, JetBrains Mono)
- Drag-and-drop image upload
- Real-time stats display
- API health monitoring
- Severity color coding

### 4. `config.py`
Application configuration including:
- Defect types data
- Production stages data
- Facility information
- File upload settings

---

## Coding Conventions

### Python
- Use type hints
- Docstrings for all public methods
- Logging with `logger = logging.getLogger(__name__)`
- Exception handling with specific error types

### React/JavaScript
- Functional components with hooks
- Tailwind CSS for styling
- Lucide React for icons
- Component names in PascalCase

### Commit Messages
```
feat: Add new feature
fix: Bug fix
docs: Documentation update
refactor: Code refactoring
test: Add tests
chore: Maintenance tasks
```

---

## Current Status

### ✅ Working
- Azure GPT-5.2 defect detection
- Flask API backend
- React frontend on Amplify
- 12-stage manufacturing context
- Root cause analysis

### 🔜 Ready to Deploy
- AWS Bedrock infrastructure (CloudFormation ready)
- Enhanced frontend UI
- Dashboard charts

### 📋 Planned
- B2B Sales Intelligence Agent
- Natural language queries
- Distributor reports
- Edge computing integration (Jetson)

---

## Stakeholders

| Person | Role | Relevance |
|--------|------|-----------|
| **Tony Lo** | Founder, SNF Global LLC | Project owner |
| **Matthew Stanton** | AWS Account Executive | GenAI funding ($45K potential) |
| **Jim Woods** | Director of Cloud Services, UCSB | Technical validation |
| **Wiko Leadership** | Manufacturing client | Anchor customer |

---

## Resources

### Cloud Credits
- AWS Activate: $1,000 (active)
- AWS GenAI Partner Funding: $45,000 (pending)
- Azure AI Foundry: $5,000 (active)

### Documentation
- [AWS Bedrock Claude](https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-claude.html)
- [Azure OpenAI Vision](https://learn.microsoft.com/en-us/azure/ai-services/openai/how-to/gpt-with-vision)
- [Amplify Hosting](https://docs.amplify.aws/react/start/getting-started/introduction/)

### Deployed URLs
- Frontend: https://main.d7wlbafpipz6w.amplifyapp.com/
- API: (varies by deployment)

---

## How to Help

When working on this project, Claude should:

1. **Understand manufacturing context** - Defects, stages, and their correlations matter
2. **Prioritize production readiness** - Working demo > feature completeness
3. **Consider cost** - Cloud credits are limited, optimize API calls
4. **Maintain industrial aesthetic** - UI should look professional, not generic
5. **Support the funding pitch** - Matthew Stanton demo is the priority

### Common Tasks

```
"Deploy AWS backend"           → Run deploy.sh, test with test_api.py
"Update frontend"              → Modify App.jsx, npm run build, git push
"Add new defect type"          → Update config.py and agent prompts
"Debug API issue"              → Check CloudWatch logs, test with curl
"Prepare for demo"             → Ensure end-to-end flow works
```

---

## Quick Reference

```bash
# Start everything locally
cd ~/wiko-defect-analyzer-clean
source venv/bin/activate && python run_server.py &
cd frontend && npm run dev &

# Deploy to production
./deploy.sh                    # Backend
git push origin main           # Frontend (Amplify auto-deploys)

# Test
curl -X POST http://localhost:5000/api/v1/analyze \
  -H "Content-Type: application/json" \
  -d '{"image": "base64...", "product_sku": "WK-KN-200", "facility": "yangjiang"}'
```

---

## Recent Changes (December 2025)

### Codebase Cleanup

**Completed December 27, 2025**

- **Removed duplicate deployment scripts** and consolidated to `scripts/deploy.sh`
- **Deleted unused frontend components**:
  - App.jsx (985 lines, commented out)
  - DefectAnalyzerDashboard.jsx (484 lines, never imported)
- **Removed Azure-specific test files** (transitioning to AWS-focused architecture)
- **Consolidated AWS documentation** into single comprehensive guide: `docs/AWS_DEPLOYMENT.md`
- **Added workers/ and lambda/ to git** (actively deployed components)
- **Cleaned up Python dependencies**:
  - Removed 4 unused packages (semantic-kernel, azure-cosmos, sqlalchemy, opencensus-ext-azure)
  - Created requirements-dev.txt for testing/development dependencies
- **Improved git configuration**:
  - Added .gitattributes for consistent line endings
  - Enhanced .gitignore with Amplify, Claude Code, and build artifact patterns

### Current Active Components

- **Frontend**: WikoDefectAnalyzerPro.jsx (single page app, 1,184 lines)
- **Backend**: Flask API (app.py) + agents/defect_analyzer_gpt52.py (Azure GPT-5.2)
- **Workers**: workers/defect_worker.py (Azure Service Bus consumer for async processing)
- **Lambda**: lambda/analyze_function.py (AWS Bedrock handler with Claude Opus 4)
- **Infrastructure**: infrastructure/infrastructure.yaml (CloudFormation for AWS resources)

### Deployment Status

- **Frontend**: Deployed on AWS Amplify - https://main.d16gtun6rcncmo.amplifyapp.com
- **Backend API**: AWS Lambda + API Gateway - https://6j6rqn6rug.execute-api.us-east-1.amazonaws.com/prod
- **AI Model**: Claude Opus 4 via AWS Bedrock (us.anthropic.claude-opus-4-20250514-v1:0)

### Cleanup Metrics

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Tracked files | 72 | ~52 | -28% |
| Frontend LoC | 3,332 | 1,800 | -46% |
| Root docs | 13 files | 5 files | -62% |
| Python deps | 40 | 36 | -10% |

---

*Last updated: December 27, 2025*
