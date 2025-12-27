"""
Analysis-related API endpoints for Wiko Defect Analyzer
Enhanced with security, validation, and proper async handling
"""

import asyncio
import json
import logging
import tempfile
import os
from datetime import datetime
from flask import Blueprint, request, jsonify, current_app
from agents.defect_analyzer_gpt52 import WikoDefectAnalyzerGPT52, DefectAnalysis, DefectType, Severity, ProductionStage
from utils.validation import (
    validate_image_file,
    validate_facility,
    validate_product_sku,
    sanitize_filename
)
from utils.auth import require_api_key

# Set up logging
logger = logging.getLogger(__name__)

analysis_bp = Blueprint('analysis_bp', __name__)
analyzer = WikoDefectAnalyzerGPT52()

# Get limiter from app context (will be registered by app.py)
def get_limiter():
    """Get rate limiter from Flask app context"""
    return current_app.extensions.get('limiter')

# Shared event loop for async operations
_event_loop = None

def get_event_loop():
    """Get or create a shared event loop for async operations"""
    global _event_loop
    if _event_loop is None or _event_loop.is_closed():
        _event_loop = asyncio.new_event_loop()
        asyncio.set_event_loop(_event_loop)
    return _event_loop

def cleanup_event_loop():
    """Cleanup shared event loop on application shutdown"""
    global _event_loop
    if _event_loop and not _event_loop.is_closed():
        try:
            # Cancel all pending tasks
            pending = asyncio.all_tasks(_event_loop)
            for task in pending:
                task.cancel()
            # Run until all tasks are cancelled
            _event_loop.run_until_complete(asyncio.gather(*pending, return_exceptions=True))
            _event_loop.close()
            logger.info("Event loop cleaned up successfully")
        except Exception as e:
            logger.error(f"Error cleaning up event loop: {e}")
        finally:
            _event_loop = None


@analysis_bp.route('/analyze', methods=['POST'])
@require_api_key
def analyze_defect():
    """
    Analyze a single product image for defects.

    Request:
        - image: Image file (JPEG/PNG/WebP, max 16MB)
        - product_sku: Product SKU (e.g., WK-KN-200)
        - facility: Facility code (hongkong/shenzhen/yangjiang)
        - production_data: Optional JSON with batch/process data

    Response:
        JSON with analysis results or error
    """
    # Validate file upload
    if 'image' not in request.files:
        return jsonify({"error": "No image file provided"}), 400

    file = request.files['image']
    if not file or file.filename == '':
        return jsonify({"error": "No file selected"}), 400

    # Validate image file with magic bytes
    is_valid, error_msg = validate_image_file(file)
    if not is_valid:
        logger.warning(f"Invalid file upload: {error_msg}")
        return jsonify({"error": error_msg}), 400

    # Validate product SKU
    product_sku = request.form.get('product_sku', '').strip().upper()
    is_valid, error_msg = validate_product_sku(product_sku)
    if not is_valid:
        return jsonify({"error": error_msg}), 400

    # Validate facility
    facility = request.form.get('facility', '').strip().lower()
    is_valid, error_msg = validate_facility(facility)
    if not is_valid:
        return jsonify({"error": error_msg}), 400

    # Parse optional production data
    production_data = None
    if 'production_data' in request.form:
        try:
            production_data = json.loads(request.form['production_data'])
        except json.JSONDecodeError as e:
            logger.warning(f"Invalid production_data JSON: {e}")
            return jsonify({"error": "Invalid production_data JSON format"}), 400

    # Save uploaded file to secure temporary location
    temp_path = None
    try:
        # Create temporary file with secure permissions
        with tempfile.NamedTemporaryFile(
            suffix='.jpg',
            delete=False,
            prefix='wiko_analysis_'
        ) as tmp:
            file.save(tmp.name)
            temp_path = tmp.name

        # Run async analysis using shared event loop
        loop = get_event_loop()
        result = loop.run_until_complete(
            analyzer.analyze_defect(
                image_path=temp_path,
                product_sku=product_sku,
                facility=facility,
                production_data=production_data
            )
        )

        logger.info(f"Analysis complete: {result.defect_id}, defect_detected={result.defect_detected}")
        return jsonify({"success": True, "analysis": result.to_dict()})

    except asyncio.TimeoutError:
        logger.error("Analysis timed out")
        return jsonify({
            "success": False,
            "error": "Analysis request timed out. Please try again."
        }), 504

    except ValueError as e:
        logger.error(f"Validation error: {e}")
        return jsonify({"success": False, "error": str(e)}), 400

    except Exception as e:
        # Log the full error but return generic message to user
        logger.error(f"Analysis failed: {e}", exc_info=True)
        return jsonify({
            "success": False,
            "error": "Internal server error during analysis"
        }), 500

    finally:
        # Always clean up temp file
        if temp_path and os.path.exists(temp_path):
            try:
                os.unlink(temp_path)
            except Exception as e:
                logger.warning(f"Failed to delete temp file {temp_path}: {e}")


@analysis_bp.route('/analyze/batch', methods=['POST'])
@require_api_key
def analyze_batch():
    """
    Analyze multiple product images in batch.

    Request:
        - images: Multiple image files
        - product_sku: Product SKU (required)
        - facility: Facility code (optional, default: yangjiang)

    Response:
        JSON with batch analysis results
    """
    if 'images' not in request.files:
        return jsonify({"error": "No image files provided"}), 400

    files = request.files.getlist('images')
    if not files or len(files) == 0:
        return jsonify({"error": "No files selected"}), 400

    # Check batch size limit
    max_batch_size = int(os.getenv('MAX_BATCH_SIZE', 50))
    if len(files) > max_batch_size:
        return jsonify({
            "error": f"Batch size exceeds limit. Maximum: {max_batch_size} images"
        }), 400

    # Validate product SKU (required for batch)
    product_sku = request.form.get('product_sku', '').strip().upper()
    is_valid, error_msg = validate_product_sku(product_sku)
    if not is_valid:
        return jsonify({"error": error_msg}), 400

    # Validate facility
    facility = request.form.get('facility', 'yangjiang').strip().lower()
    is_valid, error_msg = validate_facility(facility)
    if not is_valid:
        return jsonify({"error": error_msg}), 400

    # Validate and save all files to temp locations
    temp_paths = []
    validation_errors = []

    for idx, file in enumerate(files):
        if not file or file.filename == '':
            validation_errors.append(f"File {idx + 1}: No file selected")
            continue

        # Validate image file
        is_valid, error_msg = validate_image_file(file)
        if not is_valid:
            validation_errors.append(f"File {idx + 1} ({file.filename}): {error_msg}")
            continue

        # Save to temp file
        try:
            with tempfile.NamedTemporaryFile(
                suffix='.jpg',
                delete=False,
                prefix=f'wiko_batch_{idx}_'
            ) as tmp:
                file.save(tmp.name)
                temp_paths.append(tmp.name)
        except Exception as e:
            logger.error(f"Failed to save file {file.filename}: {e}")
            validation_errors.append(f"File {idx + 1}: Failed to save")

    # Return validation errors if any
    if validation_errors:
        # Clean up any temp files created before error
        for temp_path in temp_paths:
            try:
                os.unlink(temp_path)
            except:
                pass
        return jsonify({
            "error": "File validation failed",
            "details": validation_errors
        }), 400

    if not temp_paths:
        return jsonify({"error": "No valid image files provided"}), 400

    try:
        # Run async batch analysis
        loop = get_event_loop()
        results = loop.run_until_complete(
            analyzer.analyze_batch(
                image_paths=temp_paths,
                product_sku=product_sku,
                facility=facility
            )
        )

        # Generate summary report
        summary = analyzer.generate_shift_report(results)

        logger.info(f"Batch analysis complete: {len(results)} images, {summary['total_defects']} defects")

        return jsonify({
            "success": True,
            "count": len(results),
            "analyses": [r.to_dict() for r in results],
            "summary": summary
        })

    except asyncio.TimeoutError:
        logger.error("Batch analysis timed out")
        return jsonify({
            "success": False,
            "error": "Batch analysis timed out. Try with fewer images."
        }), 504

    except Exception as e:
        logger.error(f"Batch analysis failed: {e}", exc_info=True)
        return jsonify({
            "success": False,
            "error": "Internal server error during batch analysis"
        }), 500

    finally:
        # Clean up all temp files
        for temp_path in temp_paths:
            if os.path.exists(temp_path):
                try:
                    os.unlink(temp_path)
                except Exception as e:
                    logger.warning(f"Failed to delete temp file {temp_path}: {e}")


@analysis_bp.route('/shift-report', methods=['POST'])
@require_api_key
def generate_shift_report():
    """
    Generate a shift summary report from analysis results.

    Request:
        JSON with 'analyses' array containing analysis objects

    Response:
        JSON with shift report
    """
    data = request.get_json()
    if not data or 'analyses' not in data:
        return jsonify({"error": "analyses array is required in request body"}), 400

    if not isinstance(data['analyses'], list):
        return jsonify({"error": "analyses must be an array"}), 400

    try:
        analyses = []
        for idx, a in enumerate(data['analyses']):
            # Validate required fields
            required_fields = ['defect_id', 'timestamp', 'facility', 'product_sku',
                             'defect_detected', 'defect_type', 'severity', 'confidence']
            missing_fields = [f for f in required_fields if f not in a]
            if missing_fields:
                return jsonify({
                    "error": f"Analysis {idx + 1} missing required fields: {', '.join(missing_fields)}"
                }), 400

            # Create DefectAnalysis object
            analysis = DefectAnalysis(
                defect_id=a['defect_id'],
                timestamp=datetime.fromisoformat(a['timestamp']),
                facility=a['facility'],
                product_sku=a['product_sku'],
                defect_detected=a['defect_detected'],
                defect_type=DefectType(a['defect_type']),
                severity=Severity(a['severity']),
                confidence=a['confidence'],
                description=a.get('description', ''),
                affected_area=a.get('affected_area', ''),
                bounding_box=a.get('bounding_box'),
                probable_stage=ProductionStage(a['probable_stage']) if a.get('probable_stage') else None,
                root_cause=a.get('root_cause', ''),
                five_why_chain=a.get('five_why_chain', []),
                contributing_factors=a.get('contributing_factors', []),
                corrective_actions=a.get('corrective_actions', []),
                preventive_actions=a.get('preventive_actions', []),
                reasoning_tokens_used=a.get('reasoning_tokens_used', 0),
                model_version=a.get('model_version', 'gpt-5.2')
            )
            analyses.append(analysis)

        # Generate report
        report = analyzer.generate_shift_report(analyses)

        logger.info(f"Shift report generated: {len(analyses)} analyses")

        return jsonify({
            "success": True,
            "report": report
        })

    except ValueError as e:
        logger.error(f"Invalid data in shift report: {e}")
        return jsonify({
            "success": False,
            "error": f"Invalid data: {str(e)}"
        }), 400

    except Exception as e:
        logger.error(f"Shift report generation failed: {e}", exc_info=True)
        return jsonify({
            "success": False,
            "error": "Internal server error generating shift report"
        }), 500
