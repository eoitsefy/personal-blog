"""Offline whole-frame alpha extraction; no redraw, interpolation, or pose edits."""
from pathlib import Path
import argparse
import hashlib
import importlib.util
import json
import os
import sys
import types
import numpy as np
from PIL import Image, ImageDraw

MODEL_SHA = "4417d89795250e698c3cb0ae8df15743810065f646f48a694fdfa7ca052d0815"


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("folder")
    parser.add_argument("--tools", required=True)
    parser.add_argument("--full", action="store_true")
    args = parser.parse_args()
    root, extra = Path(args.folder).resolve(strict=True), Path(args.tools).resolve(strict=True)
    model_path = extra / "birefnet-lite.safetensors"
    assert digest(model_path) == MODEL_SHA
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    sys.path.insert(0, str(extra))
    import torch
    from scipy import ndimage as ndi
    from safetensors.torch import load_file
    torch.set_num_threads(1)
    torch.manual_seed(0)
    assert torch.cuda.is_available(), "This bounded runner requires the installed CUDA runtime"
    package = types.ModuleType("sleep_birefnet_local")
    package.__path__ = [str(extra)]
    sys.modules[package.__name__] = package
    spec = importlib.util.spec_from_file_location(package.__name__ + ".birefnet", extra / "birefnet.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    model = module.BiRefNet(config=module.BiRefNetConfig(bb_pretrained=False))
    model.load_state_dict(load_file(str(model_path)), strict=True)
    model = model.eval().to("cuda").half()
    mean = torch.tensor([.485, .456, .406], device="cuda", dtype=torch.float16)[None, :, None, None]
    std = torch.tensor([.229, .224, .225], device="cuda", dtype=torch.float16)[None, :, None, None]
    recipe = {"revision": 11, "recipeSha256": digest(Path(__file__)), "modelSha256": MODEL_SHA,
              "modelCodeSha256": digest(extra / "birefnet.py"), "configCodeSha256": digest(extra / "BiRefNet_config.py"),
              "wholeFrame": True, "geometryEdits": False, "limbComposites": False,
              "inputSize": 1024, "nativeSize": 960, "holeFilling": False}
    sources = json.loads((root / "sources.json").read_text(encoding="utf-8"))
    report = {**recipe, "status": "FULL_PENDING_ART_REVIEW" if args.full else "TRIAL_NOT_RELEASED", "frames": {}}
    review = root / "review-birefnet-trial"
    review.mkdir(exist_ok=True)
    for action, data in sources.items():
        assert digest(root / f"{action}-original.mp4") == data["videoSha256"]
        out = root / f"{action}-cutouts-v11"
        out.mkdir(exist_ok=True)
        recipe_file = out / "recipe.json"
        if recipe_file.exists():
            assert json.loads(recipe_file.read_text(encoding="utf-8")) == recipe
        else:
            recipe_file.write_text(json.dumps(recipe, indent=2)+"\n", encoding="utf-8")
        indices = list(range(data["frameCount"])) if args.full else sorted(set([0, 24, 37, 38, 39, 45, 48, 72, 96, 120, min(144, data["frameCount"]-1), data["frameCount"]-1]))
        records, cells = [], []
        for index in indices:
            source = root / f"{action}-frames/frame-{index+1:03d}.png"
            assert digest(source) == data["frames"][index]["sha256"]
            target = out / f"{index:03d}.png"
            if not target.exists():
                image = Image.open(source).convert("RGB")
                pixels = np.asarray(image.resize((1024, 1024), Image.Resampling.LANCZOS), dtype=np.float32) / 255
                tensor = torch.from_numpy(pixels.transpose(2, 0, 1).copy())[None].to("cuda", dtype=torch.float16)
                with torch.inference_mode():
                    pred = model((tensor-mean)/std)[-1].sigmoid().float().cpu()[0, 0].numpy()
                alpha = np.asarray(Image.fromarray(pred).resize((960, 960), Image.Resampling.BILINEAR))
                alpha = np.clip((alpha-.03)/.94, 0, 1)
                alpha[:65] = alpha[875:] = 0
                alpha[:, :4] = alpha[:, -4:] = 0
                rgb = np.asarray(image, dtype=np.float32)
                bg = ndi.median_filter(np.median(rgb[:, 20:85], axis=1), size=(15, 1))[:, None, :]
                horizontal = ndi.median_filter(np.median(rgb[100:165], axis=0), size=(25, 1))
                bg = np.clip(bg + horizontal[None] - np.median(horizontal[20:85], axis=0), 0, 255)
                # Decontaminate only the model's soft exterior; retain all opaque source pixels.
                cleaned = np.clip((rgb-(1-alpha[:, :, None])*bg)/np.maximum(alpha[:, :, None], .04), 0, 255)
                rgba = np.concatenate([cleaned.round().astype(np.uint8), (alpha*255).round().astype(np.uint8)[:, :, None]], axis=2)
                rgba[rgba[:, :, 3] < 8] = 0
                Image.fromarray(rgba).save(target)
            prepared = Image.open(target).convert("RGBA")
            records.append({"index": index, "bbox": prepared.getbbox(), "sha256": digest(target)})
            if not args.full:
                cells.append((index, prepared.resize((320, 320), Image.Resampling.LANCZOS)))
            if index % 24 == 0 or not args.full:
                print(f"{action}: {index}/{data['frameCount']} alpha extracted", flush=True)
        report["frames"][action] = records
        if cells:
            for theme, bg in [("light", "#f7f4eb"), ("dark", "#15191f")]:
                sheet = Image.new("RGBA", (4*320, ((len(cells)+3)//4)*344), bg)
                pen = ImageDraw.Draw(sheet)
                for k, (index, im) in enumerate(cells):
                    sheet.alpha_composite(im, (k%4*320, k//4*344))
                    pen.text((k%4*320+5, k//4*344+322), f"{action} {index}", fill="white" if theme=="dark" else "black")
                sheet.convert("RGB").save(review / f"{action}-{theme}.png")
    (root / "matte-birefnet-review.json").write_text(json.dumps(report, indent=2)+"\n", encoding="utf-8")
    print("GPU peak allocated MiB="+str(round(torch.cuda.max_memory_allocated()/1024**2)), flush=True)


if __name__ == "__main__":
    main()
