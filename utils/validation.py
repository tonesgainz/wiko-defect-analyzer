"""
Input validation utilities for secure file upload and request validation
"""

import os
import imghdr
from typing import Tuple, Optional
from werkzeug.datastructures import FileStorage


# Allowed MIME types and their magic bytes
ALLOWED_IMAGE_TYPES = {
    'image/jpeg': [b'\xFF\xD8\xFF'],
    'image/png': [b'\x89\x50\x4E\x47\x0D\x0A\x1A\x0A'],
    'image/webp': [b'RIFF', b'WEBP'],
}

# Maximum file sizes
MAX_IMAGE_SIZE_MB = int(os.getenv('MAX_IMAGE_SIZE_MB', 16))
MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024

# Allowed values for enums
ALLOWED_FACILITIES = ['hongkong', 'shenzhen', 'yangjiang']
ALLOWED_PRODUCT_SKUS = [
    'WK-KN-200', 'WK-KN-150', 'WK-KN-100',
    'WK-SC-200', 'WK-CI-200', 'WK-CI-280'
]


def validate_image_file(file: FileStorage) -> Tuple[bool, Optional[str]]:
    """
    Validate uploaded image file using magic bytes and file properties.

    Args:
        file: Uploaded file from Flask request

    Returns:
        Tuple of (is_valid, error_message)
    """
    if not file or not file.filename:
        return False, "No file provided"

    # Check file extension
    allowed_extensions = {'jpg', 'jpeg', 'png', 'webp'}
    ext = file.filename.rsplit('.', 1)[-1].lower() if '.' in file.filename else ''
    if ext not in allowed_extensions:
        return False, f"Invalid file extension. Allowed: {', '.join(allowed_extensions)}"

    # Read file content for validation
    file_content = file.read()
    file.seek(0)  # Reset file pointer for later use

    # Check file size
    file_size = len(file_content)
    if file_size == 0:
        return False, "Empty file"
    if file_size > MAX_IMAGE_SIZE_BYTES:
        return False, f"File too large. Maximum size: {MAX_IMAGE_SIZE_MB}MB"

    # Validate magic bytes (file signature)
    is_valid_type = False
    for mime_type, magic_signatures in ALLOWED_IMAGE_TYPES.items():
        for magic in magic_signatures:
            if file_content.startswith(magic):
                is_valid_type = True
                break
        if is_valid_type:
            break

    if not is_valid_type:
        return False, "Invalid file type. File signature does not match allowed image formats."

    # Additional validation using imghdr
    file.seek(0)
    detected_type = imghdr.what(file)
    file.seek(0)

    if detected_type not in ['jpeg', 'png', 'webp']:
        return False, f"File validation failed. Detected type: {detected_type}"

    return True, None


def validate_facility(facility: str) -> Tuple[bool, Optional[str]]:
    """
    Validate facility parameter.

    Args:
        facility: Facility code to validate

    Returns:
        Tuple of (is_valid, error_message)
    """
    if not facility:
        return False, "Facility is required"

    facility = facility.lower().strip()
    if facility not in ALLOWED_FACILITIES:
        return False, f"Invalid facility. Allowed: {', '.join(ALLOWED_FACILITIES)}"

    return True, None


def validate_product_sku(sku: str) -> Tuple[bool, Optional[str]]:
    """
    Validate product SKU parameter.

    Args:
        sku: Product SKU to validate

    Returns:
        Tuple of (is_valid, error_message)
    """
    if not sku:
        return False, "Product SKU is required"

    sku = sku.upper().strip()
    if sku not in ALLOWED_PRODUCT_SKUS:
        return False, f"Invalid product SKU. Allowed: {', '.join(ALLOWED_PRODUCT_SKUS)}"

    return True, None


def sanitize_filename(filename: str) -> str:
    """
    Sanitize filename to prevent path traversal attacks.

    Args:
        filename: Original filename

    Returns:
        Sanitized filename
    """
    # Remove path components
    filename = os.path.basename(filename)

    # Remove any null bytes
    filename = filename.replace('\0', '')

    # Limit length
    if len(filename) > 255:
        name, ext = os.path.splitext(filename)
        filename = name[:250] + ext

    return filename
