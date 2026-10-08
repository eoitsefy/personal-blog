"""Hash-bound, offline whole-frame sleep video inspection and preparation."""
from pathlib import Path
import argparse
import hashlib
import json
import sys
import numpy as np
from PIL import Image, ImageDraw

SOURCES = {
    "enter": (193, "94851ca10b61a09d315b4190dbdc910087f1f04ace59364f51aabc12ad0e50e0"),
    "wake": (121, "151f88f4ab10be186544afb297c6de67afb4b3d8f22b3bc380c8e0f2b99e888c"),
}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def inspect(folder):
    review = folder / "source-review"
    review.mkdir(exist_ok=True)
    records = {}
    for action, (count, expected) in SOURCES.items():
        assert digest(folder / f"{action}-original.mp4") == expected
        images = sorted((folder / f"{action}-frames").glob("frame-*.png"))
        assert len(images) == count
        sheet = Image.new("RGB", (10 * 160, ((count + 9) // 10) * 180), "#eee9df")
        pen = ImageDraw.Draw(sheet)
        frames = []
        for i, path in enumerate(images):
            with Image.open(path) as source:
                assert source.size == (960, 960)
                sheet.paste(source.resize((160, 160), Image.Resampling.LANCZOS), (i % 10 * 160, i // 10 * 180))
            pen.text((i % 10 * 160 + 4, i // 10 * 180 + 162), str(i), fill="black")
            frames.append({"index": i, "sha256": digest(path)})
        sheet.save(review / f"{action}-all.png")
        chosen = [0, count // 5, count * 2 // 5, count * 3 // 5, count * 4 // 5, count - 1]
        detail = Image.new("RGB", (6 * 480, 504), "#eee9df")
        label = ImageDraw.Draw(detail)
        for j, i in enumerate(chosen):
            with Image.open(images[i]) as image:
                detail.paste(image.resize((480, 480), Image.Resampling.LANCZOS), (j * 480, 0))
            label.text((j * 480 + 8, 483), f"{action} {i} / {i/24:.3f}s", fill="black")
        detail.save(review / f"{action}-detail.png")
        records[action] = {"videoSha256": expected, "frameCount": count, "fps": 24, "size": [960, 960], "frames": frames}
        print(f"{action}: {count} source frames inspected and hashed", flush=True)
    (folder / "sources.json").write_text(json.dumps(records, indent=2) + "\n", encoding="utf-8")


def gray_matte(source):
    import cv2
    from scipy import ndimage as ndi
    cv2.setNumThreads(1)
    cv2.setRNGSeed(0)
    rgb = np.asarray(source.convert("RGB"), dtype=np.float32)
    # Per-row exterior samples follow the provider's black-to-gray background.
    samples = rgb[:, 20:85]
    bg = np.median(samples, axis=1)
    bg = ndi.median_filter(bg, size=(15, 1))[:, None, :]
    horizontal = ndi.median_filter(np.median(rgb[100:165], axis=0), size=(25, 1))
    bg = np.clip(bg + horizontal[None] - np.median(horizontal[20:85], axis=0), 0, 255)
    delta = np.max(np.abs(rgb - bg), axis=2)
    chroma = np.ptp(rgb, axis=2)
    mask = np.full(delta.shape, cv2.GC_PR_BGD, dtype=np.uint8)
    mask[(delta > 8) | (chroma > 6)] = cv2.GC_PR_FGD
    mask[(delta > 25) & (chroma > 12)] = cv2.GC_FGD
    # Dark, near-neutral hair must not be mistaken for the gray background.
    mask[(delta > 14) & (np.arange(960)[:, None] < 710)] = cv2.GC_FGD
    mask[delta < 3] = cv2.GC_BGD
    mask[:65] = cv2.GC_BGD
    mask[875:] = cv2.GC_BGD
    mask[:, :4] = mask[:, -4:] = cv2.GC_BGD
    # A small offline saliency model only supplies an exterior-background hint.
    # RGB, anatomy and all motion remain the original provider pixels.
    if SALIENCY is not None:
        small = np.asarray(source.convert("RGB").resize((320, 320), Image.Resampling.LANCZOS), dtype=np.float32)
        small /= max(float(small.max()), 1e-6)
        small = (small - np.array([.485, .456, .406], dtype=np.float32)) / np.array([.229, .224, .225], dtype=np.float32)
        prediction = SALIENCY.run(None, {SALIENCY.get_inputs()[0].name: small.transpose(2, 0, 1)[None]})[0][0, 0]
        prediction = (prediction-prediction.min()) / max(float(np.ptp(prediction)), 1e-6)
        hint = np.asarray(Image.fromarray(prediction).resize(source.size, Image.Resampling.BILINEAR))
        mask[(hint < .15) & (chroma < 9) & (np.arange(960)[:, None] > 710)] = cv2.GC_BGD
        if HINT_ONLY:
            color = (chroma > 8) & (delta > 12)
            color = ndi.binary_closing(color, iterations=2)
            silhouette = (hint > .35) | color
            floor = (np.arange(960)[:, None] > 710) & (chroma < 9) & (hint < .8) & (ndi.distance_transform_edt(~color) > 5)
            silhouette[floor] = False
            silhouette[:65] = silhouette[875:] = False
            silhouette[:, :4] = silhouette[:, -4:] = False
    bg_model, fg_model = np.zeros((1, 65)), np.zeros((1, 65))
    if not HINT_ONLY:
        cv2.grabCut(rgb.astype(np.uint8), mask, None, bg_model, fg_model, 3, cv2.GC_INIT_WITH_MASK)
    if not HINT_ONLY:
        silhouette = (mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD)
    labels, count = ndi.label(silhouette)
    sizes = np.bincount(labels.ravel())
    keep = sizes > 600
    keep[0] = False
    silhouette = keep[labels]
    silhouette = ndi.binary_fill_holes(silhouette)
    core = ndi.binary_erosion(silhouette, iterations=2)
    distance, nearest = ndi.distance_transform_edt(~core, return_indices=True)
    reference = rgb[nearest[0], nearest[1]]
    difference = reference - bg
    numerator = np.sum((rgb - bg) * difference, axis=2)
    denominator = np.sum(difference * difference, axis=2)
    alpha = np.clip(numerator / np.maximum(denominator, 16), 0, 1)
    alpha[core] = 1
    alpha[distance > 3] = 0
    alpha[(delta < 3) & ~core] = 0
    alpha[:65] = alpha[875:] = 0
    alpha[:, :4] = alpha[:, -4:] = 0
    rgba = np.zeros((*delta.shape, 4), dtype=np.uint8)
    rgba[:, :, :3] = np.clip((rgb - (1-alpha[:, :, None])*bg) / np.maximum(alpha[:, :, None], .03), 0, 255).round().astype(np.uint8)
    rgba[:, :, 3] = np.round(alpha*255).astype(np.uint8)
    rgba[rgba[:, :, 3] < 12] = 0
    islands, _ = ndi.label(rgba[:, :, 3] > 12)
    areas = np.bincount(islands.ravel())
    tiny = areas < 20
    tiny[0] = False
    rgba[tiny[islands]] = 0
    return Image.fromarray(rgba)


def trial(folder, full=False):
    records = json.loads((folder / "sources.json").read_text(encoding="utf-8"))
    report = {"status": "FULL_PENDING_ART_REVIEW" if full else "TRIAL_NOT_RELEASED", "wholeFrame": True, "geometryEdits": False, "limbComposites": False, "recipeSha256": digest(Path(__file__)), "revision": 9, "modelSha256": MODEL_SHA, "hintOnly": HINT_ONLY, "frames": {}}
    for action, data in records.items():
        out = folder / f"{action}-cutouts-v9"
        out.mkdir(exist_ok=True)
        recipe = {key: report[key] for key in ["recipeSha256", "modelSha256", "hintOnly"]}
        recipe_file = out / "recipe.json"
        if recipe_file.exists():
            assert json.loads(recipe_file.read_text(encoding="utf-8")) == recipe, "Cached matte recipe differs"
        else:
            recipe_file.write_text(json.dumps(recipe, indent=2)+"\n", encoding="utf-8")
        indices = list(range(data["frameCount"])) if full else list(dict.fromkeys([0, 24, 48, 72, 96, 120, min(144, data["frameCount"]-1), data["frameCount"]-1]))
        cells = []
        stats = []
        for i in indices:
            original = folder / f"{action}-frames/frame-{i+1:03d}.png"
            assert digest(original) == data["frames"][i]["sha256"]
            target = out / f"{i:03d}.png"
            if not target.exists():
                gray_matte(Image.open(original)).save(target)
            image = Image.open(target).convert("RGBA")
            stats.append({"index": i, "bbox": image.getbbox(), "sha256": digest(target)})
            if full and i % 24 == 0:
                print(f"{action}: {i}/{len(indices)}", flush=True)
            if not full or i % 6 == 0 or i == indices[-1]:
                cells.append((i, image.resize((240, 240), Image.Resampling.LANCZOS)))
        for theme, color in [("light", "#f7f4eb"), ("dark", "#15191f")]:
            sheet = Image.new("RGBA", (6*240, ((len(cells)+5)//6)*260), color)
            pen = ImageDraw.Draw(sheet)
            for j, (i, image) in enumerate(cells):
                sheet.alpha_composite(image, (j%6*240, j//6*260))
                pen.text((j%6*240+4, j//6*260+242), f"{action} {i}", fill="#fff" if theme=="dark" else "#000")
            sheet.convert("RGB").save(folder / "source-review" / f"{action}-matte-{theme}.png")
        report["frames"][action] = stats
        print(f"{action}: {len(indices)} matte frames prepared", flush=True)
    (folder / "matte-review.json").write_text(json.dumps(report, indent=2)+"\n", encoding="utf-8")


SALIENCY = None
HINT_ONLY = False
MODEL_SHA = None

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("folder")
    parser.add_argument("--matte", action="store_true")
    parser.add_argument("--full", action="store_true")
    parser.add_argument("--opencv-extra")
    parser.add_argument("--saliency")
    parser.add_argument("--hint-only", action="store_true")
    args = parser.parse_args()
    HINT_ONLY = args.hint_only
    if args.opencv_extra:
        sys.path.insert(0, args.opencv_extra)
    if args.saliency:
        import onnxruntime as ort
        assert hashlib.md5(Path(args.saliency).read_bytes()).hexdigest() in ["8e83ca70e441ab06c318d82300c84806", "60024c5c889badc19c04ad937298a77b"]
        MODEL_SHA = digest(Path(args.saliency))
        options = ort.SessionOptions()
        options.intra_op_num_threads = options.inter_op_num_threads = 1
        SALIENCY = ort.InferenceSession(args.saliency, sess_options=options, providers=["CPUExecutionProvider"])
    folder = Path(args.folder).resolve(strict=True)
    if args.matte:
        trial(folder, args.full)
    else:
        inspect(folder)
