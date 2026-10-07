"""Owner-authorized palette-only correction; never warp or composite body parts."""
from pathlib import Path
import argparse
import hashlib
import json
import numpy as np
from PIL import Image
from scipy import ndimage as ndi


def correct(source):
    rgba = np.asarray(source.convert("RGBA")).copy()
    rgb = rgba[:, :, :3].astype(np.float32)
    r, g, b = (rgb[:, :, c] for c in range(3))
    strength = (np.clip((np.minimum(np.minimum(r, g), b)-190)/50, 0, 1)
                * np.clip((26-(r-g))/12, 0, 1)
                * np.clip((38-(r-b))/18, 0, 1))
    # Fixed hand-side ROI excludes the white shirt, eyes and collar badge.
    roi = np.zeros(r.shape, dtype=bool)
    roi[290:525, 226:324] = True
    candidates = roi & (strength > .08) & (rgba[:, :, 3] > 128)
    labels, count = ndi.label(candidates)
    keep = np.zeros(r.shape, dtype=bool)
    for label, bounds in enumerate(ndi.find_objects(labels), start=1):
        if bounds is None:
            continue
        sy, sx = bounds
        component = labels == label
        size = int(component.sum())
        # Reject small face highlights and thin jacket stitching in the ROI.
        if size >= 20 and 5 <= sx.stop-sx.start <= 60 and 8 <= sy.stop-sy.start <= 65 and sx.stop <= 324 and (sx.start+sx.stop)/2 < 314:
            keep |= component
    strength *= keep
    delta = np.array([4, 25, 37], dtype=np.float32)
    result = rgba.copy()
    result[:, :, :3] = np.clip(rgb-strength[:, :, None]*delta, 0, 255).round().astype(np.uint8)
    changed = np.any(result[:, :, :3] != rgba[:, :, :3], axis=2)
    assert np.array_equal(result[:, :, 3], rgba[:, :, 3]), "Alpha changed"
    assert np.array_equal(result[~keep], rgba[~keep]), "Protected pixels changed"
    ys, xs = np.where(changed)
    bounds = [int(xs.min()), int(ys.min()), int(xs.max()+1), int(ys.max()+1)] if len(xs) else None
    return Image.fromarray(result), {"changedPixels": int(changed.sum()), "bounds": bounds,
                                   "alphaChanges": 0, "outsideMaskChanges": 0,
                                   "maskSha256": hashlib.sha256(keep.tobytes()).hexdigest()}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("sample_folder")
    args = parser.parse_args()
    folder = Path(args.sample_folder).resolve(strict=True)
    assert hashlib.sha256((folder/"wave-original.mp4").read_bytes()).hexdigest() == "0f1495e856a10445ef705c57bb4faf974925a1b5868b0184a6aaa3218c6b911e"
    out = folder/"wave-cutouts-palm-v2"
    out.mkdir(exist_ok=True)
    frames = []
    for i in range(121):
        source = folder/"wave-cutouts-v1"/f"{i:03d}.png"
        result, stats = correct(Image.open(source))
        target = out/f"{i:03d}.png"
        if target.exists():
            assert np.array_equal(np.asarray(Image.open(target)), np.asarray(result)), target
        else:
            result.save(target)
        stats.update(index=i, sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(), resultSha256=hashlib.sha256(target.read_bytes()).hexdigest())
        frames.append(stats)
    report = {"status": "PALETTE_ONLY_TECHNICAL_CHECKS_PASSED", "ownerAuthorized": True,
              "rgbDeltaAtFullStrength": [4, 25, 37], "fixedRoi": [226, 290, 324, 525],
              "geometryChanges": 0, "alphaChanges": 0, "outsideMaskChanges": 0,
              "changedFrames": sum(f["changedPixels"] > 0 for f in frames), "frames": frames}
    (out/"report.json").write_text(json.dumps(report, indent=2)+"\n", encoding="utf-8")
    print(json.dumps({k:v for k,v in report.items() if k != "frames"}))


if __name__ == "__main__":
    main()
