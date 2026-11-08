'use strict';
// TABLETS. The interface is drawn for a phone (about 360 to 430 px wide). On a bigger screen the whole interface is scaled up so that it keeps the
// proportions it was drawn for, and in landscape it sits in a centred column. The game itself (the canvas) simply fills the screen.
//  - OD.uiK: the scale of the interface (1 on a phone)
//  - the CSS units vw / vh / vmin / vmax are written in the stylesheet as var(--vw) ... so that they follow the scaled screen
//  - html.tablet, html.land, html.port tell the stylesheet which case it is; --col is the width of the centred column
OD.uiK = 1;
(() => {
  const root = document.documentElement;
  const TARGET_W = 520, TARGET_H = 660, MAXK = 2.6;
  function apply() {
    const w = window.innerWidth, h = window.innerHeight, land = w > h, sh = Math.min(w, h);
    const tablet = sh >= 600;
    let k = 1;
    if (tablet) k = land ? Math.max(0.88, Math.min(MAXK, h / TARGET_H)) : Math.max(1.08, Math.min(MAXK, w / TARGET_W));   // (the interface needs about 640 px of height: a short landscape screen scales it down a little instead)
    OD.uiK = k;
    const lw = w / k, lh = h / k;
    root.classList.toggle('tablet', tablet); root.classList.toggle('land', land && tablet); root.classList.toggle('port', !land || !tablet);
    root.style.setProperty('--col', land && tablet ? Math.min(lw, 560) + 'px' : '100%');
    for (const id of ['ui', 'boot', 'sky', 'fx']) {
      const el = document.getElementById(id); if (!el) continue;
      if (tablet) {
        Object.assign(el.style, { position: 'fixed', inset: 'auto', left: '0px', top: '0px', width: lw + 'px', height: lh + 'px', transform: `scale(${k})`, transformOrigin: '0 0' });
        if (id === 'sky' || id === 'fx') continue;   // these two are drawn by the game in phone-size units and only need the scale
        el.style.setProperty('--vw', lw / 100 + 'px'); el.style.setProperty('--vh', lh / 100 + 'px');
        el.style.setProperty('--vmin', Math.min(lw, lh) / 100 + 'px'); el.style.setProperty('--vmax', Math.max(lw, lh) / 100 + 'px');
      } else {
        Object.assign(el.style, { position: '', inset: '', left: '', top: '', width: '', height: '', transform: '', transformOrigin: '' });
        for (const v of ['--vw', '--vh', '--vmin', '--vmax']) el.style.removeProperty(v);
      }
    }
  }
  OD.layoutApply = apply;
  apply();
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', () => setTimeout(apply, 60));
  document.addEventListener('DOMContentLoaded', apply);
})();
