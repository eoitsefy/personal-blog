# Video fixtures

These original 1-second blue 64×48 clips were generated locally with FFmpeg 7.1; no third-party video is included. MP4 uses H.264/yuv420p, MOV remuxes the same stream, and WebM uses VP9. Tests use the real containers without requiring FFmpeg at runtime.

Regeneration:

```sh
ffmpeg -f lavfi -i color=c=blue:s=64x48:d=1 -an -c:v libx264 -pix_fmt yuv420p -movflags +faststart video.mp4
ffmpeg -i video.mp4 -c copy video.mov
ffmpeg -i video.mp4 -c:v libvpx-vp9 -an video.webm
```

Container inspection follows the [MP4 registration authority](https://mp4ra.org/) and [WebM container guidelines](https://www.webmproject.org/docs/container/). It validates bounded container structure and supported video-track declarations, not every encoded frame; it is not a malware scanner or transcoder. Browser playback compatibility depends on the encoding.
