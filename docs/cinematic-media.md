# Portfolio cinematic media

Created with Higgsfield / Seedance 2.0 on 2026-11-05. Two silent eight-second films were requested at 4K, standard mode, high bitrate. Both delivered sources were verified with ffprobe as 3840 × 2160 HEVC, with no audio stream.

- Impact: `2a974092-0d88-4d02-aa0c-398704ac5f0e` — a ceramic neural engine and orbiting signals. Retired from the site on 2026-11-11; the impact section now opens with a canvas drawn in `src/signal.ts` (see below).
- Contact: `18dcce79-2f44-4900-a04f-10c3ed165a59` — sculptural speech bubbles exchanging a glowing idea.

The generated sources remain in the user's Higgsfield library. The site uses self-hosted H.264 / yuv420p MP4 encodes with fast-start metadata and VP9 WebM alternatives for browser compatibility, at 3840, 1920 and 1280 pixel widths. The 4K encode preserves the source dimensions. Poster artwork comes from frame 3.5 seconds, exported to 1920px WebP.

`src/cinema.ts` selects 720p on phone layouts, 4K above 1920 effective viewport pixels, and 1080p otherwise. It assigns no video URL until the film is visible and motion is enabled. Data Saver defaults to a still with opt-in playback; reduced motion defaults to posters without video requests. Each video pauses off-screen or in a hidden tab, supports its own pause control, and obeys the global motion toggle. Playback errors leave the poster visible. Text, results, and contact links remain HTML.

## Project covers

Created with Higgsfield / GPT Image 2.6 on 2026-11-11: one 4:3 still per published project, in a shared style (matte ceramic and chrome objects on a flat palette colour, no text). The generated PNG sources remain in the user's Higgsfield library; the site ships 600px and 1200px WebP exports in `public/assets/work/<project-slug>-<width>.webp`.

`src/art.ts` lists the slugs that have a cover. The work spiral and the project dialog use it; a project without a cover falls back to a typographic tile and its illustrated vignette. Covers are decorative (`alt=""`): titles, results and links stay in HTML. A project's own `image_url` from the database still takes priority in the dialog.

## Impact signal field

`src/signal.ts` draws the band that opens the impact section: square dots drift as noise, then gather into QUESTION, DATA, MODEL and IMPACT in turn, and scatter around the pointer. It is generated in the browser, with no media files. It is decorative (`aria-hidden`), runs only while on screen, and shows the finished word IMPACT as a still under reduced motion or the global motion toggle. Without JavaScript the band stays hidden.
