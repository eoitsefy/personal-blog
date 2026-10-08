"""Recover color-supported prop edges in a whole-frame segmentation mask."""
from pathlib import Path
import argparse
import hashlib
import json
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("folder")
    parser.add_argument("--full", action="store_true")
    args = parser.parse_args()
    root = Path(args.folder).resolve(strict=True)
    sources = json.loads((root / "sources.json").read_text(encoding="utf-8"))
    semantic = json.loads((root / "matte-birefnet-review.json").read_text(encoding="utf-8"))
    exterior = json.loads((root / "matte-review.json").read_text(encoding="utf-8"))
    assert semantic["revision"] == 11 and exterior["revision"] == 9
    recipe = {"revision": 12, "recipeSha256": digest(Path(__file__)), "semanticRecipeSha256": semantic["recipeSha256"],
              "exteriorRecipeSha256": exterior["recipeSha256"], "modelSha256": semantic["modelSha256"],
              "wholeFrame": True, "geometryEdits": False, "limbComposites": False, "holeFilling": False,
              "method": "semantic alpha union with color-supported existing prop alpha within two pixels"}
    report = {**recipe, "status": "FULL_PENDING_ART_REVIEW" if args.full else "TRIAL_NOT_RELEASED", "frames": {}}
    review = root / "review-refined-trial"
    review.mkdir(exist_ok=True)
    for action, data in sources.items():
        out = root / f"{action}-cutouts-v12"
        out.mkdir(exist_ok=True)
        recipe_file = out / "recipe.json"
        if recipe_file.exists():
            assert json.loads(recipe_file.read_text(encoding="utf-8")) == recipe
        else:
            recipe_file.write_text(json.dumps(recipe, indent=2)+"\n", encoding="utf-8")
        indices = range(data["frameCount"]) if args.full else [f["index"] for f in semantic["frames"][action]]
        records, cells = [], []
        for index in indices:
            source = root / f"{action}-frames/frame-{index+1:03d}.png"
            sem = root / f"{action}-cutouts-v11/{index:03d}.png"
            ext = root / f"{action}-cutouts-v9/{index:03d}.png"
            assert digest(source) == data["frames"][index]["sha256"]
            assert digest(sem) == next(f["sha256"] for f in semantic["frames"][action] if f["index"] == index)
            assert digest(ext) == exterior["frames"][action][index]["sha256"]
            target = out / f"{index:03d}.png"
            if not target.exists():
                rgb = np.asarray(Image.open(source).convert("RGB"), dtype=np.float32)
                alpha_sem = np.asarray(Image.open(sem))[:, :, 3].astype(np.float32)/255
                alpha_ext = np.asarray(Image.open(ext))[:, :, 3].astype(np.float32)/255
                bg = ndi.median_filter(np.median(rgb[:, 20:85], axis=1), size=(15, 1))[:, None, :]
                horizontal = ndi.median_filter(np.median(rgb[100:165], axis=0), size=(25, 1))
                bg = np.clip(bg + horizontal[None] - np.median(horizontal[20:85], axis=0), 0, 255)
                chroma, delta = np.ptp(rgb, axis=2), np.max(np.abs(rgb-bg), axis=2)
                supported = (alpha_ext > .2) & ((chroma > 10) | ((rgb.mean(axis=2) > 100) & (delta > 22)))
                supported = ndi.binary_closing(supported, iterations=1)
                labels, _ = ndi.label(supported)
                keep = np.bincount(labels.ravel()) > 100
                keep[0] = False
                supported = ndi.binary_dilation(keep[labels], iterations=2)
                alpha = np.maximum(alpha_sem, np.where(supported, alpha_ext, 0))
                alpha[:65] = alpha[875:] = 0
                alpha[:, :4] = alpha[:, -4:] = 0
                clean = np.clip((rgb-(1-alpha[:, :, None])*bg)/np.maximum(alpha[:, :, None], .04), 0, 255)
                rgba = np.concatenate([clean.round().astype(np.uint8), (alpha*255).round().astype(np.uint8)[:, :, None]], axis=2)
                rgba[rgba[:, :, 3] < 8] = 0
                Image.fromarray(rgba).save(target)
            image = Image.open(target).convert("RGBA")
            records.append({"index": index, "bbox": image.getbbox(), "sha256": digest(target)})
            if not args.full:
                cells.append((index, image.resize((320, 320), Image.Resampling.LANCZOS)))
        report["frames"][action] = records
        for theme, bg in [("light", "#f7f4eb"), ("dark", "#15191f")]:
            if not cells:
                break
            sheet = Image.new("RGBA", (4*320, ((len(cells)+3)//4)*344), bg)
            pen = ImageDraw.Draw(sheet)
            for k, (index, im) in enumerate(cells):
                sheet.alpha_composite(im, (k%4*320, k//4*344))
                pen.text((k%4*320+5, k//4*344+322), f"{action} {index}", fill="white" if theme=="dark" else "black")
            sheet.convert("RGB").save(review / f"{action}-{theme}.png")
        print(f"{action}: {len(records)} whole-frame alpha refinements", flush=True)
    (root / "matte-refined-review.json").write_text(json.dumps(report, indent=2)+"\n", encoding="utf-8")


if __name__ == "__main__":
    main()
