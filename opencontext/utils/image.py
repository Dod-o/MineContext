# -*- coding: utf-8 -*-

# Copyright (c) 2025 Beijing Volcano Engine Technology Co., Ltd.
# SPDX-License-Identifier: Apache-2.0

"""
OpenContext module: image
"""

from typing import Optional

from PIL import Image


def _get_image_pixels(image: Image.Image) -> list[int]:
    if hasattr(image, "get_flattened_data"):
        return list(image.get_flattened_data())
    return list(image.getdata())


def _difference_hash(image: Image.Image, hash_size: int = 8) -> str:
    """
    Calculate a dHash compatible fixed-width hex string without external numeric deps.
    """
    grayscale = image.convert("L")
    resized = grayscale.resize((hash_size + 1, hash_size), Image.Resampling.LANCZOS)
    pixels = _get_image_pixels(resized)

    value = 0
    for row in range(hash_size):
        row_offset = row * (hash_size + 1)
        for col in range(hash_size):
            left = pixels[row_offset + col]
            right = pixels[row_offset + col + 1]
            value = (value << 1) | int(left > right)

    width = (hash_size * hash_size + 3) // 4
    return f"{value:0{width}x}"


def calculate_bytes2phash(image_bytes: bytes) -> Optional[str]:
    """
    Calculate perceptual hash of image (cached).
    Uses difference hash instead of average hash for better performance.
    """
    try:
        import io

        with Image.open(io.BytesIO(image_bytes)) as image:
            return _difference_hash(image, hash_size=8)
    except Exception:
        return None


def calculate_phash(path: str) -> Optional[str]:
    """
    Calculate perceptual hash of image file (cached).
    """
    try:
        with Image.open(path) as image:
            return _difference_hash(image, hash_size=8)
    except Exception:
        return None


def _percentile(sorted_values: list[int], percentile: float) -> int:
    if not sorted_values:
        return 0
    index = min(len(sorted_values) - 1, max(0, int(round((len(sorted_values) - 1) * percentile))))
    return sorted_values[index]


def normalize_hdr_screenshot(path: str) -> bool:
    """
    Apply conservative tone correction to screenshots that look washed out by HDR capture.
    Normal screenshots and white documents are skipped by the percentile gates.
    """
    try:
        with Image.open(path) as img:
            sample = img.convert("L")
            sample.thumbnail((256, 256), Image.Resampling.BILINEAR)
            pixels = sorted(int(value) for value in _get_image_pixels(sample))
            if not pixels:
                return False

            p05 = _percentile(pixels, 0.05)
            p95 = _percentile(pixels, 0.95)
            avg_luma = sum(pixels) / len(pixels)

            if avg_luma < 185 or p05 < 160 or p95 < 245 or (p95 - p05) < 20:
                return False

            black_point = min(p05, 220)
            white_point = max(p95, black_point + 1)
            scale = 255.0 / (white_point - black_point)
            lut = [
                max(0, min(255, int(round((value - black_point) * scale))))
                for value in range(256)
            ]

            has_alpha = img.mode in ("RGBA", "LA") or (
                img.mode == "P" and "transparency" in img.info
            )
            converted = img.convert("RGBA" if has_alpha else "RGB")
            channels = converted.split()
            corrected_channels = [channel.point(lut) for channel in channels[:3]]
            if has_alpha:
                corrected_channels.append(channels[3])

            corrected = Image.merge(converted.mode, corrected_channels)
            if path.lower().endswith((".jpg", ".jpeg")):
                corrected = corrected.convert("RGB")
                corrected.save(path, quality=90, format="JPEG", optimize=True)
            elif path.lower().endswith(".png"):
                corrected.save(path, format="PNG", optimize=True, compress_level=6)
            else:
                corrected.save(path, format=img.format if img.format else "PNG")
            return True
    except Exception as e:
        from opencontext.utils.logging_utils import get_logger

        logger = get_logger(__name__)
        logger.error(f"Failed to normalize HDR screenshot {path}: {e}")
    return False


def resize_image(path: str, max_size: int, resize_quality: int) -> bool:
    """
    Scale image proportionally if size exceeds maximum limit.
    Optimization: uses more efficient scaling algorithm.
    """
    try:
        with Image.open(path) as img:
            if max_size and (img.width > max_size or img.height > max_size):
                img.thumbnail((max_size, max_size), Image.Resampling.BILINEAR)
                if path.lower().endswith((".jpg", ".jpeg")):
                    img.save(path, quality=resize_quality, format="JPEG", optimize=True)
                elif path.lower().endswith(".png"):
                    img.save(path, format="PNG", optimize=True, compress_level=6)
                else:
                    img.save(path, format=img.format if img.format else "PNG")
                return True
    except Exception as e:
        from opencontext.utils.logging_utils import get_logger

        logger = get_logger(__name__)
        logger.error(f"Failed to resize image {path}: {e}")
    return False
