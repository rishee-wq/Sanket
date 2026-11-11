"""
Step 4b: short teacher videos for the Learn page.

For every word, the SAME held-out test recording that export_exemplars.py
picked is cut to the sign (plus a few frames either side), cropped to the
signer's upper body, and encoded as a small H.264 MP4 the browser can play.
Three key frames (start, middle, end of the movement) are saved as JPEGs.

INCLUDE is licensed CC BY 4.0, which allows this with attribution; the app
credits it under every video.

Output public/model/clips/<word>.mp4, <word>-1.jpg ... -3.jpg, and clips.json:
    { label: { video, frames: [jpg, jpg, jpg], start, end, fps, crop: [x0, y0, x1, y1] } }
`start` is the first source frame in the clip and `crop` is in 0..1 image
coordinates, so the app can lay the landmarks over the video exactly.

    python ml/export_clips.py
"""
from __future__ import annotations

import json
from pathlib import Path
import subprocess

import cv2
import imageio_ffmpeg
import numpy as np

from common import PUBLIC_MODEL
from extract_include import RAW

OUT = PUBLIC_MODEL / "clips"
WIDTH, HEIGHT = 384, 512  # 3:4 portrait: head to hips
MARGIN = 7  # frames kept before and after the sign
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()


def slug(label: str) -> str:
    return label.replace(" ", "-")


def main():
    index = json.loads((PUBLIC_MODEL / "exemplars.json").read_text())
    scale = index["scale"]
    data = np.frombuffer((PUBLIC_MODEL / "exemplars.bin").read_bytes(), dtype="<i2").reshape(-1, 126)
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = {}

    for item in index["items"]:
        if item["kind"] != "word":
            continue
        src = RAW / item["source"]
        cap = cv2.VideoCapture(str(src))
        W, H = cap.get(cv2.CAP_PROP_FRAME_WIDTH), cap.get(cv2.CAP_PROP_FRAME_HEIGHT)
        fps = cap.get(cv2.CAP_PROP_FPS) or 25
        cap.release()

        # Centre the crop on the signer: the median wrist x over the clip, in pixels.
        frames = data[item["offset"] : item["offset"] + item["frames"]].reshape(-1, 2, 21, 3) / scale
        wrists = frames[:, :, 0, 0]  # aspect-corrected x
        seen = wrists[np.abs(frames[:, :, 0]).sum(-1) > 0]
        cx = (np.median(seen) / item["aspect"] if len(seen) else 0.5) * W
        h = 0.86 * H
        w = h * WIDTH / HEIGHT
        x0 = int(np.clip(cx - w / 2, 0, W - w))
        y0 = int(0.02 * H)
        w, h = int(w) // 2 * 2, int(h) // 2 * 2

        a0, a1 = item["active"]
        start, end = max(0, a0 - MARGIN), min(item["frames"] - 1, a1 + MARGIN)
        name = slug(item["label"])
        crop = f"crop={w}:{h}:{x0}:{y0},scale={WIDTH}:{HEIGHT}"
        select = f"select=between(n\\,{start}\\,{end}),setpts=N/FRAME_RATE/TB"
        subprocess.run(
            [FFMPEG, "-y", "-loglevel", "error", "-i", str(src), "-vf", f"{select},{crop}", "-an",
             "-c:v", "libx264", "-preset", "slow", "-crf", "29", "-pix_fmt", "yuv420p", "-r", str(round(fps)),
             "-movflags", "+faststart", str(OUT / f"{name}.mp4")],
            check=True,
        )
        stills = []
        for k, frac in enumerate((0.15, 0.5, 0.85), 1):
            n = int(round(a0 + frac * (a1 - a0)))
            subprocess.run(
                [FFMPEG, "-y", "-loglevel", "error", "-i", str(src), "-vf",
                 f"select=eq(n\\,{n}),crop={w}:{h}:{x0}:{y0},scale=240:320", "-frames:v", "1", "-q:v", "5",
                 str(OUT / f"{name}-{k}.jpg")],
                check=True,
            )
            stills.append(f"{name}-{k}.jpg")
        manifest[item["label"]] = {
            "video": f"{name}.mp4",
            "frames": stills,
            "start": start,
            "end": end,
            "fps": round(fps),
            "crop": [x0 / W, y0 / H, (x0 + w) / W, (y0 + h) / H],
        }
        print(f"  {item['label']}: frames {start}-{end}", flush=True)

    (OUT / "clips.json").write_text(json.dumps(manifest))
    size = sum(f.stat().st_size for f in OUT.iterdir())
    print(f"{len(manifest)} clips, {size / 1e6:.1f} MB -> {OUT}")


if __name__ == "__main__":
    main()
