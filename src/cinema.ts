/** Self-hosted films, loaded only on demand and governed by the site's motion control. */
export function cinemaScene(base: string, name: 'impact' | 'contact') {
  const label = name === 'impact' ? 'The idea engine' : 'The conversation laboratory';
  const stem = `${base}assets/films/${name}`;
  return `<div class="cinema-scene cinema-${name}" data-cinema><div class="cinema-media"><img class="cinema-poster" src="${stem}-poster.webp" alt="${name === 'impact' ? 'A sculptural neural engine surrounded by flowing mint and golden signals.' : 'Two sculptural speech bubbles exchanging a glowing idea.'}" width="3840" height="2160" loading="lazy"><video class="cinema-video" data-cinema-video data-stem="${stem}" muted loop playsinline preload="none" aria-hidden="true" tabindex="-1"></video></div><div class="cinema-caption"><span class="mono">${label}<small>${name === 'impact' ? 'From possibility to impact' : 'A little hello. A new possibility.'}</small></span><button class="cinema-toggle mono" type="button" data-cinema-toggle hidden aria-label="Pause ${name} film" aria-pressed="false">Pause film <span aria-hidden="true">Ⅱ</span></button></div></div>`;
}

export function initCinema(isStill: () => boolean) {
  const saveData = (navigator as Navigator & {connection?: {saveData?: boolean}}).connection?.saveData;
  const scenes = [...document.querySelectorAll<HTMLElement>('[data-cinema]')].map(root => {
    const video = root.querySelector<HTMLVideoElement>('[data-cinema-video]')!;
    const button = root.querySelector<HTMLButtonElement>('[data-cinema-toggle]')!;
    const name = root.classList.contains('cinema-impact') ? 'impact' : 'contact';
    let visible = false;
    let localPaused = !!saveData;
    let failed = false;
    let triedAlternate = false;
    let extension = video.canPlayType('video/mp4; codecs="avc1.64001f"') ? "mp4" : "webm";
    function sync() {
      const stopped = isStill() || localPaused || document.hidden;
      button.disabled = isStill() || failed;
      button.setAttribute('aria-pressed', String(stopped));
      button.setAttribute('aria-label', `${stopped ? 'Play' : 'Pause'} ${name} film`);
      button.textContent = failed ? 'Still preview' : isStill() ? 'Motion paused' : localPaused ? 'Play film ▷' : 'Pause film Ⅱ';
      if (!visible || stopped || failed) { video.pause(); return; }
      if (!video.getAttribute('src')) {
        const resolution = innerWidth <= 700 ? '720' : innerWidth * Math.min(devicePixelRatio, 2) > 1920 ? '4k' : '1080';
        video.src = `${video.dataset.stem}-${resolution}.${extension}`;
      }
      const playbackSource = video.getAttribute("src");
      void video.play().catch((error: unknown) => {
        if (video.getAttribute("src") !== playbackSource) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        localPaused = true;
        sync();
      });
    }
    video.addEventListener('playing', () => root.classList.add('is-playing'));
    video.addEventListener('error', () => {
      root.classList.remove('is-playing');
      if (!triedAlternate) {
        triedAlternate = true;
        extension = extension === 'mp4' ? 'webm' : 'mp4';
        localPaused = !!saveData;
        video.removeAttribute('src');
        video.load();
      } else failed = true;
      sync();
    });
    button.hidden = false;
    button.addEventListener('click', () => { localPaused = !localPaused; sync(); });
    return {root, video, sync, setVisible(value: boolean) { visible = value; sync(); }};
  });
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => scenes.find(scene => scene.root === entry.target)?.setVisible(entry.isIntersecting));
  }, {threshold: 0});
  scenes.forEach(scene => observer.observe(scene.root));
  const sync = () => scenes.forEach(scene => scene.sync());
  document.addEventListener('visibilitychange', sync);
  return {sync, destroy() { observer.disconnect(); scenes.forEach(scene => scene.video.pause()); document.removeEventListener('visibilitychange', sync); }};
}
