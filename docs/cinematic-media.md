# Portfolio cinematic media

Created with Higgsfield / Seedance 2.0 on 2026-11-05. Two silent eight-second films were requested at 4K, standard mode, high bitrate. Both delivered sources were verified with ffprobe as 3840 × 2160 HEVC, with no audio stream.

- Impact: `2a974092-0d88-4d02-aa0c-398704ac5f0e` — a ceramic neural engine and orbiting signals. Retired from the site on 2026-11-11; the impact section now opens with a canvas drawn in `src/signal.ts` (see below).
- Contact: `18dcce79-2f44-4900-a04f-10c3ed165a59` — sculptural speech bubbles exchanging a glowing idea. Retired from the site on 2026-11-12; the contact section now shows a greeting drawn in `src/hello.ts` (see below).

The generated sources remain in the user's Higgsfield library. Neither film ships with the site any more, and `src/cinema.ts` and `public/assets/films/` have been removed. The hero keeps its own looping film in `public/assets/scenes/`.

## Project covers

Created with Higgsfield / GPT Image 2.6 on 2026-11-11: one 4:3 still per published project, in a shared style (matte ceramic and chrome objects on a flat palette colour, no text). The generated PNG sources remain in the user's Higgsfield library; the site ships 600px and 1200px WebP exports in `public/assets/work/<project-slug>-<width>.webp`.

`src/art.ts` lists the slugs that have a cover. The work spiral and the project dialog use it; a project without a cover falls back to a typographic tile and its illustrated vignette. Covers are decorative (`alt=""`): titles, results and links stay in HTML. A project's own `image_url` from the database still takes priority in the dialog.

## Impact results field

`src/signal.ts` draws the band that opens the impact section: square dots gather into each reported figure in turn (taken from the published impact cards), while the matching project is shown beneath. Tabs choose a result and stop the automatic turn; the dots also scatter around the pointer. It is generated in the browser, with no media files, and takes its colours from the theme. The canvas is decorative (`aria-hidden`); the figures remain in the HTML summaries. Under reduced motion or the global motion toggle the current figure is shown still. Without JavaScript the canvas and tabs stay hidden and all three results are listed.

## Contact greeting

`src/hello.ts` draws the band in the contact section with the same dot field as the impact stage (`src/dots.ts`): the dots say hello in English, Hindi, Arabic, Spanish, French and Japanese in turn, in ink and cream on the accent. Pointing at or focusing a conversation starter redraws the dots as that starter's short form (`data-say`), and leaving it returns to the greeting. The non-Latin greetings use the visitor's system fonts. The canvas is decorative (`aria-hidden`), is hidden without JavaScript, and holds still under reduced motion or the global motion toggle.

## Colour

The palette is warm paper, ink and one vermilion accent (`--hot`, `#ff4d1c`), used as a fill behind ink text or for large display type; small accent text on paper uses the deeper `--hot-deep`. Every section follows the theme (paper by day, near-black by night) except two fixed ones: the contact section is set on the accent, and the footer is dark. The older cobalt, mint, yellow, coral, sky, lilac and lime tokens are remapped to this palette at the end of `styles.css`. Project covers and the hero artwork keep their own colours.
