"""Local candidate-only matte/export for the selected thanks/thinking repairs.

Never edits sources, repairs anatomy, changes global colours, synthesizes a bridge,
or grants art approval. Explicit user authorization covers deterministic pixel work.
Requires Pillow, numpy and scipy. Output must be a new directory.
"""
from __future__ import annotations

import argparse
import hashlib
import html
import json
from pathlib import Path
import shutil
import tempfile

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi


DURATIONS = [63 if i % 2 == 0 else 62 for i in range(49)]
SCALE = 1440 / 1254
OFFSET = -141 * 480 / 1254
BACKGROUNDS = {"light": (245, 242, 235), "dark": (23, 27, 35)}


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def array_sha(array):
    return hashlib.sha256(np.ascontiguousarray(array).tobytes()).hexdigest()


def load_rgb(path):
    with Image.open(path) as image:
        if image.size != (512, 512):
            raise ValueError(f"Expected fixed 512x512 source: {path}")
        if image.mode == "RGBA" and image.getchannel("A").getextrema() != (255, 255):
            raise ValueError(f"Source already transparent; do not rematte: {path}")
        return np.asarray(image.convert("RGB")).copy()


def matte(rgb, refine=True, hair_refine=False):
    """Estimate a flat-background matte without shrinking the visible silhouette.

    Exterior-connected near-background is cleared. A narrow peripheral shell also
    allows neutral background pockets outside explicitly protected eye/tee areas.
    Interior whites are protected by silhouette hole filling. Deeper enclosed
    background pockets still need independent visual review.
    Distance selects reliable colour samples; it does NOT erode the output alpha.
    Thin dark ink also seeds full opacity, so it need not contain a 2px interior.
    """
    h, w = rgb.shape[:2]
    yy, xx = np.indices((h, w))
    features = np.stack([np.ones_like(xx), xx / w, yy / h, xx * yy / (w * h)], -1)
    border = (xx < 18) | (xx >= w - 18) | (yy < 18) | (yy >= h - 18)
    plane = features @ np.linalg.lstsq(features[border], rgb[border], rcond=None)[0]
    delta = np.linalg.norm(rgb.astype(float) - plane, axis=-1)
    labels, count = ndi.label(delta > 28)
    if count == 0:
        raise ValueError("No foreground component detected")
    sizes = np.bincount(labels.ravel())
    sizes[0] = 0
    component = labels == int(sizes.argmax())
    silhouette = ndi.binary_fill_holes(component)
    distance_inside = ndi.distance_transform_edt(silhouette)
    ink = (rgb.mean(axis=-1) < 160) & (delta > 75) & silhouette
    trusted = (distance_inside > 1.5) | ink
    if not trusted.any():
        raise ValueError("No reliable foreground colour samples")
    distance, nearest = ndi.distance_transform_edt(~trusted, return_indices=True)
    foreground = rgb[nearest[0], nearest[1]].astype(float)
    direction = foreground - plane
    alpha = np.clip(np.sum((rgb - plane) * direction, axis=-1)
                    / np.maximum(1, np.sum(direction ** 2, axis=-1)), 0, 1)
    alpha[trusted] = 1
    support = ndi.binary_dilation(silhouette, iterations=1)
    alpha[~support] = 0
    near_background = delta < 10
    exterior = ndi.binary_propagation(border & near_background, mask=near_background)
    alpha[exterior] = 0
    alpha[alpha < .025] = 0
    # Only matte fringe RGB is decontaminated. All fully opaque RGB stays exact.
    decontaminated = (rgb - (1 - alpha[..., None]) * plane) / np.maximum(alpha[..., None], .025)
    rgba = np.dstack([np.clip(decontaminated, 0, 255), alpha * 255]).round().astype(np.uint8)
    rgba[rgba[..., 3] == 255, :3] = rgb[rgba[..., 3] == 255]
    rgba[rgba[..., 3] == 0] = 0
    cleared = np.zeros((h, w), bool)
    refined = np.zeros((h, w), bool)
    hair_edit = np.zeros((h, w), bool)
    if refine:
        # Local topology/background with eye/tee protection, not the old wave map.
        # Restrict to a four-pixel peripheral shell. Eyes and white shirt remain
        # deep inside the body silhouette; warm skin is excluded independently.
        shell = support & (distance_inside <= 4)
        neutral = np.ptp(rgb.astype(float), axis=-1) < 25
        # Explicit protective regions cover both selected motions' eyes/white tee.
        # Only neutral white pockets near the silhouette outside these regions
        # may be cleared. This is not a general-purpose anatomy detector.
        protect = ((xx >= 179) & (xx <= 300) & (yy >= 122) & (yy <= 229))
        protect |= ((xx >= 224) & (xx <= 280) & (yy >= 228) & (yy <= 320))
        generated_white_background = (rgb.min(axis=-1) > 225) & (yy < 320) & ~protect
        background_like = ((delta < 9) | generated_white_background) & neutral
        # Independently inspected selected-motion defect: white/cream background
        # crescents behind the viewer-right hair above the gold headset. Some lie
        # >4px inside a filled silhouette hole, so peripheral-shell logic misses
        # them. This box excludes eye whites, skin and the white shirt; saturated
        # gold headset highlights do not meet the near-neutral light criterion.
        headset_gap = (xx >= 315) & (xx <= 355) & (yy >= 125) & (yy <= 225)
        verified_gap = headset_gap & (rgb.min(axis=-1) > 215) & (np.ptp(rgb.astype(float),axis=-1) < 30) & (rgba[...,3] > 0)
        dark_ink = silhouette & (rgb.mean(axis=-1) < 125) & (delta > 100)
        ink_distance, ink_nearest = ndi.distance_transform_edt(~dark_ink, return_indices=True)
        cleared = (shell & background_like & (ink_distance <= 3) & (rgba[..., 3] > 0)) | verified_gap
        # A nearby dark source outline provides an alpha-compositing foreground
        # for neutral pale fringe. This changes no opaque warm hand pixels and
        # removes neither the dark line nor its alpha by morphological erosion.
        fringe = support & (distance_inside <= 3)
        warm_skin = ((rgb[..., 0].astype(float) - rgb[..., 2]) > 24) & ((rgb[..., 0].astype(float) - rgb[..., 1]) > 8)
        refined = fringe & (delta < 170) & (np.ptp(rgb.astype(float), axis=-1) < 35) & (ink_distance <= 3.5) & ~cleared & ~warm_skin
        if refined.any():
            donor = rgb[ink_nearest[0], ink_nearest[1]].astype(float)
            direction = donor - plane
            fitted_alpha = np.clip(np.sum((rgb - plane) * direction, axis=-1)
                                   / np.maximum(1, np.sum(direction ** 2, axis=-1)), 0, 1)
            rgba[refined, :3] = donor[refined].round().astype(np.uint8)
            rgba[refined, 3] = (fitted_alpha[refined] * 255).round().astype(np.uint8)
        rgba[cleared] = 0
        rgba[rgba[..., 3] == 0] = 0
        if hair_refine:
            # Only the selected characters' exposed top/side hair perimeter.
            # Unlike the broad old warm-skin exclusion, brown hair may be demixed.
            # Sample actual interior ink, not an eroded alpha or invented colour.
            face_or_hand = (((xx >= 188) & (xx <= 312) & (yy >= 150)) | (yy >= 230))
            hair_zone = (yy >= 48) & (yy < 230) & ~face_or_hand
            inner_ink = silhouette & (distance_inside >= 2.5) & (rgb.mean(axis=-1) < 135)
            if inner_ink.any():
                hd, hn = ndi.distance_transform_edt(~inner_ink, return_indices=True)
                hair_edit = hair_zone & support & (distance_inside <= 2.25) & (hd <= 5)
                # Preserve already opaque dark contours; retain the golden lock.
                hair_edit &= (rgb.mean(axis=-1) > 120) & (np.ptp(rgb.astype(float), axis=-1) < 65) & ~cleared
                donor = rgb[hn[0], hn[1]].astype(float)
                direction = donor - plane
                fitted_alpha = np.clip(np.sum((rgb - plane) * direction, axis=-1)
                                       / np.maximum(1, np.sum(direction ** 2, axis=-1)), 0, 1)
                # If projection says fully opaque, retain the original solid ink.
                hair_edit &= fitted_alpha < (254.5 / 255)
                rgba[hair_edit, :3] = donor[hair_edit].round().astype(np.uint8)
                rgba[hair_edit, 3] = (fitted_alpha[hair_edit] * 255).round().astype(np.uint8)
                rgba[rgba[..., 3] == 0] = 0
    visible = rgba[..., 3] > 0
    edit = np.any(rgba[..., :3] != rgb, axis=-1) & visible
    opaque = rgba[..., 3] == 255
    metrics = {
        "visiblePixels": int(visible.sum()),
        "opaquePixels": int(opaque.sum()),
        "softPixels": int(((rgba[..., 3] > 0) & ~opaque).sum()),
        "matteFringeRgbEditPixels": int(edit.sum()),
        "opaqueRgbChangedPixels": int((np.any(rgba[..., :3] != rgb, axis=-1) & opaque).sum()),
        "outsideVisibleEditMaskRgbExact": bool(np.array_equal(rgba[..., :3][visible & ~edit], rgb[visible & ~edit])),
        "zeroAlphaRgbZero": bool(np.all(rgba[~visible] == 0)),
        "backgroundResidualP95": float(np.percentile(delta[border], 95)),
        "visibleCanvasEdgePixels": int(visible[0].sum() + visible[-1].sum() + visible[:, 0].sum() + visible[:, -1].sum()),
        "disconnectedStrongPixelsExcluded": int(((delta > 28) & ~component).sum()),
        "peripheralBackgroundPixelsCleared": int(cleared.sum()),
        "neutralOutlineMixPixelsRefined": int(refined.sum()),
        "hairPerimeterPixelsRefined": int(hair_edit.sum()),
    }
    return rgba, edit.astype(np.uint8) * 255, metrics


def mapped(rgba):
    """Fixed isotropic 512->480 registration; bilinear premultiplied sampling."""
    values = rgba.astype(np.float32) / 255
    values[..., :3] *= values[..., 3:4]
    inverse = (1 / SCALE, 0, -OFFSET / SCALE, 0, 1 / SCALE, -OFFSET / SCALE)
    channels = [np.asarray(Image.fromarray(values[..., c]).transform(
        (480, 480), Image.Transform.AFFINE, inverse,
        resample=Image.Resampling.BILINEAR, fillcolor=0)) for c in range(4)]
    result = np.clip(np.stack(channels, -1), 0, 1)
    result[..., :3] /= np.maximum(result[..., 3:4], 1 / 255)
    result = np.round(np.clip(result, 0, 1) * 255).astype(np.uint8)
    result[result[..., 3] == 0] = 0
    return result


def composite(rgba, background):
    image = Image.fromarray(rgba)
    base = Image.new("RGBA", image.size, (*background, 255))
    return Image.alpha_composite(base, image).convert("RGB")


def save_animation(arrays, path, background=None):
    images = [Image.fromarray(a) if background is None else composite(a, background) for a in arrays]
    images[0].save(path, save_all=True, append_images=images[1:], duration=DURATIONS,
                   loop=0, lossless=True, quality=100, method=4, exact=True)
    # Verify actual container timing/count and decoded pixels, not just arguments.
    with Image.open(path) as result:
        count = result.n_frames
        actual_durations = []
        exact = count == len(images)
        for index in range(count):
            result.seek(index)
            decoded = np.asarray(result.convert("RGBA")).copy()
            actual_durations.append(result.info.get("duration"))
            if index < len(images):
                expected = np.asarray(images[index].convert("RGBA")).copy()
                decoded[decoded[..., 3] == 0] = 0
                expected[expected[..., 3] == 0] = 0
                exact = exact and np.array_equal(decoded, expected)
    if count != 49 or actual_durations != DURATIONS or not exact:
        raise ValueError(f"Encoded animation failed frame/timing/pixel verification: {path}")
    return {"path": path.name, "sha256": sha(path), "frames": count,
            "durationMs": sum(actual_durations), "decodedRgbaExact": bool(exact)}


def contact_sheet(frames, path):
    indices = [0, 8, 16, 24, 32, 40, 48]
    board = Image.new("RGB", (256 * len(indices), 550), "white")
    draw = ImageDraw.Draw(board)
    for row, (name, background) in enumerate(BACKGROUNDS.items()):
        for col, index in enumerate(indices):
            board.paste(composite(frames[index], background).resize((256, 256)), (col * 256, row * 275 + 19))
            draw.text((col * 256 + 5, row * 275 + 3), f"F{index:03} {name}", fill="black")
    board.save(path)


def edge_comparison(rgb_frames, refined_frames, path, hair_refine=False):
    """Actual RGB-derived v1/v2 comparison, no synthetic illustration."""
    indices = [0, 12, 24, 36, 48]
    board = Image.new("RGB", (1840, 585 * len(indices)), "white")
    draw = ImageDraw.Draw(board)
    for row, index in enumerate(indices):
        before, _, _ = matte(rgb_frames[index], refine=hair_refine, hair_refine=False)
        for col, (name, background) in enumerate(BACKGROUNDS.items()):
            for version, array in enumerate((before, refined_frames[index])):
                # Fixed upper-body window includes hair, ears, hands and armpits.
                patch = composite(array, background).crop((115, 55, 345, 330)).resize((460, 550), Image.Resampling.NEAREST)
                x, y = col * 920 + version * 460, row * 585
                board.paste(patch, (x, y + 30))
                label = ["v2b", "v3"][version] if hair_refine else ["v1", "v2"][version]
                draw.text((x + 3, y + 8), f"F{index:03} {name} {label}", fill="black")
    board.save(path)
    if hair_refine:
        # Exact native-size and 320px whole-character viewing, no stretched crop.
        display = Image.new("RGB", (1664, 540 * len(indices)), "white")
        dd = ImageDraw.Draw(display)
        for row, index in enumerate(indices):
            before, _, _ = matte(rgb_frames[index], refine=True, hair_refine=False)
            for version, array in enumerate((before, refined_frames[index])):
                im = composite(array, BACKGROUNDS["dark"])
                x = version * 832
                display.paste(im, (x, row * 540 + 25))
                display.paste(im.resize((320, 320), Image.Resampling.LANCZOS), (x + 512, row * 540 + 25))
                dd.text((x + 5, row * 540 + 5), f"F{index:03} {'v2b' if version == 0 else 'v3'} native 512 / display 320", fill="black")
        display.save(path.with_name("hair-native-320-comparison.png"))


def run(args):
    source, output, reference = args.source.resolve(), args.output.resolve(), args.reference.resolve()
    if output.exists():
        raise ValueError("Output already exists; choose an isolated new version")
    if source == output or source in output.parents or output in source.parents:
        raise ValueError("Output must not overlap the input frame directory")
    files = [source / f"frame-{i:03}.png" for i in range(49)]
    if any(not p.is_file() for p in files):
        raise ValueError("Exactly frame-000.png..frame-048.png are required")
    if len(list(source.glob("frame-*.png"))) != 49:
        raise ValueError("Unexpected additional frames; refusing implicit trim")
    anchor_rgb = load_rgb(reference)
    hashes = [sha(p) for p in files]
    reference_hash = sha(reference)
    output.parent.mkdir(parents=True, exist_ok=True)
    if shutil.disk_usage(output.parent).free < 512 * 1024 * 1024:
        raise RuntimeError("Less than 512 MiB free at output; stopped without processing")
    output.mkdir()
    for folder in ("rgba-512", "rgba-480", "matte-rgb-edit-masks"):
        (output / folder).mkdir()
    anchor, _, anchor_metrics = matte(anchor_rgb, hair_refine=args.hair_refine)
    Image.fromarray(anchor).save(output / "input-anchor-rgba-512.png")
    Image.fromarray(mapped(anchor)).save(output / "input-anchor-rgba-480.png")
    rows, frames, smaller, rgb_frames = [], [], [], []
    for index, path in enumerate(files):
        rgb = load_rgb(path)
        rgb_frames.append(rgb)
        rgba, edit, metrics = matte(rgb, hair_refine=args.hair_refine)
        small = mapped(rgba)
        for array, folder in ((rgba, "rgba-512"), (small, "rgba-480"), (edit, "matte-rgb-edit-masks")):
            Image.fromarray(array).save(output / folder / path.name)
        frames.append(rgba)
        smaller.append(small)
        rows.append({"frame": index, "sourceSha256": hashes[index],
                     "rgba512Sha256": array_sha(rgba), "rgba480Sha256": array_sha(small),
                     "editMaskSha256": sha(output / "matte-rgb-edit-masks" / path.name), **metrics})
    animations = []
    if not args.skip_previews:
        animations.append(save_animation(frames, output / "transparent-512.webp"))
        animations.append(save_animation(smaller, output / "transparent-480.webp"))
        for name, background in BACKGROUNDS.items():
            animations.append(save_animation(frames, output / f"{name}-512.webp", background))
    contact_sheet(frames, output / "contact-sheet.png")
    edge_comparison(rgb_frames, frames, output / "edge-v1-v2-comparison.png", hair_refine=args.hair_refine)
    unchanged = hashes == [sha(p) for p in files] and reference_hash == sha(reference)
    report = {"status": "CANDIDATE_NEEDS_VISUAL_REVIEW", "action": args.action,
              "source": str(source), "reference": str(reference), "referenceSha256": reference_hash,
              "sourceUnchanged": unchanged, "frames": 49, "frameDurationsMs": DURATIONS,
              "durationMs": sum(DURATIONS), "colourCorrectionApplied": False,
              "flowBridgeApplied": False, "outputAlphaErosionApplied": False,
              "hairPerimeterRefinementEnabled": args.hair_refine,
              "mapping": {"scale": SCALE, "translateX": OFFSET, "translateY": OFFSET,
                          "output": [480, 480], "sampling": "bilinear-premultiplied-RGBA",
                          "basis": "1254 source centered with 141px padding in 1536 then reduced to 512"},
              "alphaMethod": "border-plane; largest component; peripheral background/neutral-ink demix; protected selected-motion eye/tee regions",
              "limitations": ["Enclosed background pockets are not automatically identified.",
                              "Largest-component assumption requires no detached props/body parts.",
                              "No temporal flicker, anatomy or endpoint colour acceptance is implied.",
                              "Zero-alpha RGB is normalized; exact preservation applies to opaque source RGB, not resized RGB.",
                              "No first/last replacement or idle bridge was generated."],
              "anchor": anchor_metrics, "animations": animations, "perFrame": rows}
    (output / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    cards = "".join(f'<section><h2>{html.escape(a["path"])}</h2><a href="{a["path"]}">Open animation</a><br><img loading="lazy" width="512" src="{a["path"]}"></section>' for a in animations)
    (output / "review.html").write_text('<!doctype html><meta charset="utf-8"><title>Selected motion candidate</title><style>body{font:16px sans-serif;background:#ddd;color:#111}section{display:inline-block;vertical-align:top;margin:12px}img{max-width:100%;height:auto}</style>'
        f'<h1>{html.escape(args.action)} — candidate, NOT approved/released</h1><p>49 frames / 3063 ms. No colour correction, no bridge, no alpha erosion. Review dark/light edges and entire playback.</p><a href="report.json">Provenance and limitations</a><p><a href="contact-sheet.png">Full contact sheet</a> · <a href="edge-v1-v2-comparison.png">Actual black/light v1-v2 edge comparison</a></p><img src="contact-sheet.png" width="1200">{cards}', encoding="utf-8")
    if not unchanged:
        raise RuntimeError("Source changed during processing; candidate invalid")
    print(json.dumps({"output": str(output), "sourceUnchanged": unchanged,
                      "opaqueChanged": sum(r["opaqueRgbChangedPixels"] for r in rows),
                      "status": report["status"]}))


def self_test():
    rgb = np.full((512, 512, 3), (245, 242, 235), dtype=np.uint8)
    rgb[150:360, 190:320] = (40, 35, 30)
    rgb[220:330, 220:290] = (255, 255, 255)  # enclosed white shirt
    rgb[180:240, 170:191] = (40, 35, 30)
    rgb[165:190, 172:174] = (60, 42, 32)  # thin connected finger
    rgb[165:190, 178:181] = (60, 42, 32)
    rgba, edit, stats = matte(rgb)
    assert np.all(rgba[240:320, 230:280, 3] == 255), "White interior damaged"
    assert np.all(rgba[165:180, 172:174, 3] == 255), "Thin finger eroded"
    assert np.all(rgba[165:180, 175:177, 3] == 0), "Open finger gap not transparent"
    assert stats["opaqueRgbChangedPixels"] == 0
    assert not np.any(rgba[rgba[..., 3] == 0])
    assert mapped(rgba).shape == (480, 480, 4)
    hair_variant, _, hair_stats = matte(rgb, hair_refine=True)
    assert hair_stats["opaqueRgbChangedPixels"] == 0
    assert np.all(hair_variant[240:320, 230:280, 3] == 255)
    assert np.all(hair_variant[165:180, 172:174, 3] == 255)
    assert sum(DURATIONS) == 3063
    # Animation test uses a deliberately changing internal pixel to forbid merging.
    with tempfile.TemporaryDirectory(prefix="selected-matte-test-") as temporary:
        frames = []
        for i in range(49):
            frame = rgba.copy()
            frame[250, 250, 0] = i
            frames.append(frame)
        result = save_animation(frames, Path(temporary) / "test.webp")
        assert result["decodedRgbaExact"]
    print("SELF_TEST_OK: white interior, thin finger, gap, opaque RGB, fixed mapping, 49 lossless frames and exact timings")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--reference", type=Path)
    parser.add_argument("--action", choices=["thanks", "thinking"])
    parser.add_argument("--skip-previews", action="store_true", help="PNG/contact/report only for a fast diagnostic")
    parser.add_argument("--hair-refine", action="store_true", help="Optional v3 top/side hair-edge demix; without this preserves v2b")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
    else:
        if not all([args.source, args.output, args.reference, args.action]):
            parser.error("--source --output --reference --action are required")
        run(args)
