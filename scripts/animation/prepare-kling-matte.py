"""Offline whole-frame matte; needs Pillow, NumPy and SciPy, no generation API.

Usage: python scripts/animation/prepare-kling-matte.py <external sample folder>
Expects the hash-bound original and 121 losslessly extracted wave PNGs.
Never edits the original video, parts of the figure, or any production asset.
"""
from pathlib import Path
import argparse
import hashlib
import numpy as np
from PIL import Image
from scipy import ndimage as ndi


def matte(source):
    rgb = np.asarray(source.convert("RGB"), dtype=np.float32)
    # Corner marks are outside the fixed figure ROI. Preserve source provenance.
    rgb[:130] = 0
    rgb[830:] = 0
    rgb[:, :200] = 0
    rgb[:, 760:] = 0
    bright = rgb.max(axis=2)
    candidate = bright > 12
    labels, count = ndi.label(candidate)
    sizes = ndi.sum(candidate, labels, range(1, count + 1))
    silhouette = labels == (int(np.argmax(sizes)) + 1)
    silhouette = ndi.binary_fill_holes(silhouette)
    core = ndi.binary_erosion(silhouette, iterations=2)
    distance, nearest = ndi.distance_transform_edt(~core, return_indices=True)
    ref = rgb[nearest[0], nearest[1]].max(axis=2)
    alpha = np.clip(bright / np.maximum(ref, 18), 0, 1)
    alpha[core] = 1
    alpha[distance > 3] = 0
    alpha[bright <= 2] = 0
    alpha[ndi.binary_fill_holes(core)] = 1
    rgba = np.zeros((*bright.shape, 4), dtype=np.uint8)
    rgba[:, :, :3] = np.clip(rgb / np.maximum(alpha[:, :, None], .02), 0, 255).round().astype(np.uint8)
    rgba[:, :, 3] = np.round(alpha * 255).astype(np.uint8)
    rgba[rgba[:, :, 3] == 0] = 0
    result = np.array(Image.fromarray(rgba).resize((768, 768), Image.Resampling.LANCZOS))
    result[result[:, :, 3] < 12] = 0
    return Image.fromarray(result)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("sample_folder")
    args = parser.parse_args()
    folder = Path(args.sample_folder).resolve(strict=True)
    digest = hashlib.sha256((folder / "wave-original.mp4").read_bytes()).hexdigest()
    assert digest == "0f1495e856a10445ef705c57bb4faf974925a1b5868b0184a6aaa3218c6b911e"
    out = folder / "wave-cutouts-v1"
    out.mkdir(exist_ok=True)
    for i in range(121):
        source = folder / "wave-frames" / f"frame-{i+1:03d}.png"
        image = Image.open(source)
        assert image.size == (960, 960)
        target = out / f"{i:03d}.png"
        result = matte(image)
        # A repeated run must reproduce existing pixels, never silently replace.
        if target.exists():
            assert np.array_equal(np.array(Image.open(target)), np.array(result)), target
        else:
            result.save(target)
    print("121 whole-frame cutouts ready; source video unchanged")


if __name__ == "__main__":
    main()
