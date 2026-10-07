"""Source-bound, owner-authorized RGB-only fist correction, no body compositing."""
from pathlib import Path
import argparse
import hashlib
import json
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

SOURCE_SHA = "99605e9caecdcd6761cb563e06605949ba1ed59bfc1f6576c778ded8f3891ffc"


def correct(image):
    original = np.asarray(image.convert("RGBA"))
    rgb = original[:, :, :3].astype(np.float32)
    r, g, b = (rgb[:, :, i] for i in range(3))
    strength = (np.clip((np.minimum(np.minimum(r, g), b) - 190) / 50, 0, 1)
                * np.clip((26 - (r - g)) / 12, 0, 1)
                * np.clip((38 - (r - b)) / 18, 0, 1))
    # Label the entire image BEFORE bounding-box filtering: clipping the face
    # into a hand ROI could otherwise misclassify a small bright cheek fragment.
    labels, _ = ndi.label((strength > .08) & (original[:, :, 3] > 128))
    keep = np.zeros(r.shape, dtype=bool)
    boxes = []
    for label, bounds in enumerate(ndi.find_objects(labels), start=1):
        if bounds is None:
            continue
        sy, sx = bounds
        component = labels == label
        size = int(component.sum())
        hand_side = (260 <= sx.start and sx.stop <= 338) or (447 <= sx.start and sx.stop <= 515)
        if hand_side and 345 <= sy.start and sy.stop <= 525 and 5 <= sx.stop-sx.start <= 42 and 6 <= sy.stop-sy.start <= 48 and 35 <= size <= 1500:
            keep |= component
            boxes.append([sx.start, sy.start, sx.stop, sy.stop, size])
    result = original.copy()
    result[:, :, :3] = np.clip(rgb - (strength * keep)[:, :, None] * np.array([4, 25, 37]), 0, 255).round().astype(np.uint8)
    assert np.array_equal(original[:, :, 3], result[:, :, 3]), "Alpha changed"
    assert np.array_equal(original[~keep], result[~keep]), "Protected artwork changed"
    return Image.fromarray(result), {
        "handComponents": boxes,
        "changedPixels": int(np.any(original[:, :, :3] != result[:, :, :3], axis=2).sum()),
        "maskSha256": hashlib.sha256(keep.tobytes()).hexdigest(),
        "alphaChanges": 0, "outsideMaskChanges": 0,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("sample_folder")
    folder = Path(parser.parse_args().sample_folder).resolve(strict=True)
    assert hashlib.sha256((folder / "cheer-original.mp4").read_bytes()).hexdigest() == SOURCE_SHA
    output = folder / "cheer-cutouts-color-v2"
    output.mkdir(exist_ok=True)
    frames = []
    for i in range(73):
        source = folder / "cheer-cutouts-trial-v1" / f"{i:03d}.png"
        image, report = correct(Image.open(source))
        target = output / f"{i:03d}.png"
        if target.exists():
            assert np.array_equal(np.asarray(Image.open(target)), np.asarray(image)), target
        else:
            image.save(target)
        report.update(index=i, sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(), resultSha256=hashlib.sha256(target.read_bytes()).hexdigest())
        frames.append(report)
    report = {"sourceVideoSha256": SOURCE_SHA, "ownerAuthorized": True,
              "status": "PALETTE_ONLY_TECHNICAL_CHECKS_PASSED", "geometryChanges": 0,
              "alphaChanges": 0, "outsideMaskChanges": 0, "rgbDeltaAtFullStrength": [4, 25, 37],
              "changedFrames": sum(f["changedPixels"] > 0 for f in frames), "frames": frames}
    target = output / "report.json"
    encoded = json.dumps(report, indent=2) + "\n"
    if target.exists():
        assert target.read_text(encoding="utf-8") == encoded
    else:
        target.write_text(encoded, encoding="utf-8")
    print(json.dumps({k: v for k, v in report.items() if k != "frames"}))


if __name__ == "__main__":
    main()
