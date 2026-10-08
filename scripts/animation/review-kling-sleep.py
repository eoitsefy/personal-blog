"""Whole-frame review boards and native-clock animated previews, not release approval."""
from pathlib import Path
import argparse
import hashlib
import json
from PIL import Image, ImageDraw


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("folder")
    args = parser.parse_args()
    root = Path(args.folder).resolve(strict=True)
    report = json.loads((root / "matte-refined-review.json").read_text(encoding="utf-8"))
    assert report["revision"] == 12 and report["status"] == "FULL_PENDING_ART_REVIEW"
    out = root / "review-v2"
    out.mkdir(exist_ok=True)
    animations = {}
    for action, count in [("enter", 193), ("wake", 121)]:
        frames = []
        for i in range(count):
            path = root / f"{action}-cutouts-v12/{i:03d}.png"
            assert hashlib.sha256(path.read_bytes()).hexdigest() == report["frames"][action][i]["sha256"]
            frames.append(Image.open(path).convert("RGBA").resize((480, 480), Image.Resampling.LANCZOS))
        for start in range(0, count, 24):
            for theme, bg in [("light", "#f7f4eb"), ("dark", "#15191f")]:
                sheet = Image.new("RGBA", (1440, 1040), bg)
                pen = ImageDraw.Draw(sheet)
                for k, frame in enumerate(frames[start:start+24]):
                    sheet.alpha_composite(frame.resize((240, 240), Image.Resampling.LANCZOS), (k % 6 * 240, k // 6 * 260))
                    pen.text((k % 6 * 240 + 5, k // 6 * 260 + 243), f"{action} {start+k}", fill="white" if theme == "dark" else "black")
                sheet.convert("RGB").save(out / f"{action}-{start:03d}-{theme}.png")
        durations = [round((i+1)*1000/24)-round(i*1000/24) for i in range(count)]
        frames[0].save(out / f"{action}-preview.webp", save_all=True, append_images=frames[1:], duration=durations, loop=0, quality=90, method=5)
        animations[action] = frames
        print(f"{action}: all {count} review frames and animated preview saved", flush=True)
    indices = list(range(192, 143, -1)) + list(range(145, 192))
    loop = [animations["enter"][i] for i in indices]
    loop[0].save(out / "sleep-loop-preview.webp", save_all=True, append_images=loop[1:], duration=[round((i+1)*1000/24)-round(i*1000/24) for i in range(len(loop))], loop=0, quality=90, method=5)
    seam = Image.new("RGBA", (480*4, 480), "#f7f4eb")
    for k, im in enumerate([animations["enter"][192], loop[-1], loop[0], animations["wake"][0]]):
        seam.alpha_composite(im, (480*k, 0))
    seam.convert("RGB").save(out / "loop-wake-seam.png")
    print("96-frame 4-second sleeping loop and seam board saved", flush=True)


if __name__ == "__main__":
    main()
