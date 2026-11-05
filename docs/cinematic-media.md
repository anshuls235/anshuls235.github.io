# Portfolio cinematic media

Created with Higgsfield / Seedance 2.0 on 2026-11-05. Two silent eight-second films were requested at 4K, standard mode, high bitrate. Both delivered sources were verified with ffprobe as 3840 × 2160 HEVC, with no audio stream.

- Impact: `2a974092-0d88-4d02-aa0c-398704ac5f0e` — a ceramic neural engine and orbiting signals.
- Contact: `18dcce79-2f44-4900-a04f-10c3ed165a59` — sculptural speech bubbles exchanging a glowing idea.

The generated sources remain in the user's Higgsfield library. The site uses self-hosted H.264 / yuv420p MP4 encodes with fast-start metadata for browser compatibility, at 3840, 1920 and 1280 pixel widths. The 4K encode preserves the source dimensions. Poster artwork comes from frame 3.5 seconds, exported to 1920px WebP.

`src/cinema.ts` selects 720p on phone layouts, 4K above 1920 effective viewport pixels, and 1080p otherwise. It assigns no video URL until the film is visible and motion is enabled. Data Saver defaults to a still with opt-in playback; reduced motion defaults to posters without video requests. Each video pauses off-screen or in a hidden tab, supports its own pause control, and obeys the global motion toggle. Playback errors leave the poster visible. Text, results, and contact links remain HTML.
