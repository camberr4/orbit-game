'use strict';
// LANGUAGES. The game's text is written in English in the code; this layer translates it as it reaches the screen.
//  - OD.t(text, ...args): a translated string. {0} {1} in the text are filled with args (after translating); numbers inside a text may be matched by a "{0}" pattern.
//  - the DOM is translated by an observer: every text (and every small piece of text with <b>/<i>/<br> inside) that appears in the page is looked up in the dictionary.
//  - text drawn on the canvas goes through OD.t in the game code (banners, callouts).
//  - dictionaries are in i18n/<lang>.js (OD.i18n.add('es', { 'English text': 'Texto' })); a missing entry simply stays in English.
//  - 'xx' is a test language: every word is lengthened by about 40%, to find layouts that would break.
OD.i18n = (() => {
  const LANGS = [
    { id: 'en', name: 'English' }, { id: 'es', name: 'Español' }, { id: 'de', name: 'Deutsch' },
    { id: 'fr', name: 'Français' }, { id: 'pt', name: 'Português (Brasil)' }, { id: 'pl', name: 'Polski' },
  ];
  const dicts = {}, miss = new Set();
  let lang = 'en', D = null, hits = new Map(), obs = null;
  const norm = s => String(s).replace(/\s+/g, ' ').trim();
  const HAS_LETTER = /[A-Za-zÀ-ɏ]/;
  const CAPS = /[A-Z]{2}/;
  const NUM = /\d+(?:[.,]\d+)*/g;

  // the test language: lengthen words, keep tags and {0} placeholders
  function pseudo(s) {
    return s.split(/(<[^>]+>|\{\d+\})/).map((seg, i) => i % 2 ? seg : seg.replace(/[A-Za-zÀ-ɏ]{3,}/g, w => { const extra = Math.max(1, Math.round(w.length * 0.4)); return w + 'e'.repeat(extra); })).join('');
  }
  function fill(s, args) { return args && args.length ? String(s).replace(/\{(\d+)\}/g, (m, i) => (args[i] != null ? args[i] : m)) : s; }
  // plural forms: tn(3, '{0} run', '{0} runs') -> English picks by n; other languages find the entry 'one | other' holding a list of forms
  function plIdx(n) {
    if (lang === 'pl') return n === 1 ? 0 : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) ? 1 : 2;
    if (lang === 'fr' || lang === 'pt') return n >= 0 && n < 2 ? 0 : 1;
    return n === 1 ? 0 : 1;
  }
  function tn(n, one, other) {
    n = Number(n); const fmt = x => String(x).replace(/\{0\}/g, OD.fmt ? OD.fmt(n) : String(n));
    if (lang === 'en' || lang === 'xx') return fmt(lang === 'xx' ? pseudo(n === 1 ? one : other) : (n === 1 ? one : other));
    const e = D && D[one + ' | ' + other];
    if (Array.isArray(e)) return fmt(e[Math.min(plIdx(n), e.length - 1)]);
    return fmt(n === 1 ? one : other);
  }
  function lookup(n) {   // n: normalized text -> translation or undefined
    if (lang === 'xx') return HAS_LETTER.test(n) ? pseudo(n) : undefined;
    if (!D) return undefined;
    let r = D[n];
    if (r !== undefined) return r;
    // a pattern with numbers in it: "Reach the {0}th planet"
    if (/\d/.test(n)) { const nums = []; const key = n.replace(NUM, m => { nums.push(m); return '{' + (nums.length - 1) + '}'; }); r = D[key]; if (r !== undefined) return fill(r, nums); }
    return undefined;
  }
  function t(s, ...args) {
    if (s == null) return s;
    const str = String(s);
    if (lang === 'en' && !args.length) return str;
    if (lang === 'en') return fill(str, args);
    if (!HAS_LETTER.test(str)) return fill(str, args);
    const n = norm(str);
    const key = args.length ? n : n;
    let r = lookup(key);
    if (r === undefined) { if (!miss.has(key) && miss.size < 4000) miss.add(key); return fill(str, args); }
    const lead = str.match(/^\s*/)[0], trail = str.match(/\s*$/)[0];
    r = fill(r, args);
    if (CAPS.test(str) && str === str.toUpperCase()) r = r.toLocaleUpperCase(lang);   // a title written in capitals stays in capitals
    return lead + r + trail;
  }

  // ---- the page
  const INLINE = new Set(['B', 'I', 'EM', 'STRONG', 'SMALL', 'BR', 'U']);
  const SKIP = new Set(['SCRIPT', 'STYLE', 'CANVAS', 'SVG', 'PATH', 'TEXTAREA', 'INPUT', 'SELECT']);
  // an element whose children are text and plain inline tags (no attributes) is translated as one piece: "<b>Stardust</b> adds to your score ..."
  function unitHtml(el) {
    let hasEl = false, hasText = false;
    for (const c of el.childNodes) {
      if (c.nodeType === 3) { if (c.nodeValue.trim()) hasText = true; }
      else if (c.nodeType === 1) { if (!INLINE.has(c.tagName) || c.attributes.length) return null; for (const g of c.childNodes) if (g.nodeType === 1 && !(g.tagName === 'BR')) return null; hasEl = true; }
      else if (c.nodeType !== 8) return null;
    }
    if (!hasEl || !hasText) return null;
    return el.innerHTML;
  }
  function textNode(n) {
    const v = n.nodeValue; if (!v || !HAS_LETTER.test(v)) return;
    if (n.__t === v) return;
    const r = t(v); if (r !== v) { n.nodeValue = r; n.__t = r; }
  }
  function walk(node) {
    if (node.nodeType === 3) return textNode(node);
    if (node.nodeType !== 1) return;
    if (SKIP.has(node.tagName) || (node.hasAttribute && node.hasAttribute('data-notr'))) return;
    for (const a of ['aria-label', 'title', 'alt', 'placeholder']) { const v = node.getAttribute(a); if (v && HAS_LETTER.test(v)) { const r = t(v); if (r !== v) node.setAttribute(a, r); } }
    const u = unitHtml(node);
    if (u) { const n = norm(u), r = lang === 'en' ? undefined : lookup(n); if (r !== undefined && r !== n) { node.innerHTML = r; return; } if (r === undefined && lang !== 'en' && lang !== 'xx' && HAS_LETTER.test(n) && miss.size < 4000) miss.add(n); }
    for (const c of Array.from(node.childNodes)) walk(c);
  }
  function start() {
    if (obs || typeof MutationObserver === 'undefined') return;
    obs = new MutationObserver(list => {
      if (lang === 'en') return;
      for (const m of list) {
        if (m.type === 'characterData') { textNode(m.target); continue; }
        for (const n of m.addedNodes) walk(n);
      }
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  function guess() {   // the phone's language, when it is one we have
    const l = String((navigator.languages && navigator.languages[0]) || navigator.language || 'en').toLowerCase();
    for (const L of LANGS) if (l === L.id || l.startsWith(L.id + '-')) return L.id;
    return 'en';
  }
  function setLang(id, redraw) {
    if (id !== 'xx' && !LANGS.some(L => L.id === id)) id = 'en';
    lang = id; D = dicts[id] || null; document.documentElement.lang = id === 'xx' ? 'en' : id; document.documentElement.dataset.lang = id;
    if (OD.save && OD.save.settings) { OD.save.settings.lang = id; }
    if (redraw !== false) { if (document.body) walk(document.body); if (OD.ui && OD.ui.internals) { const cur = OD.ui.internals.cur; if (cur && cur !== 'hud') OD.ui.show(cur); } }
  }
  function init() {
    const s = OD.save && OD.save.settings; const id = s && s.lang ? s.lang : guess();
    start(); setLang(id, false); if (lang !== 'en' && document.body) walk(document.body);
  }
  return { LANGS, add(id, d) { dicts[id] = Object.assign(dicts[id] || {}, d); if (lang === id) D = dicts[id]; }, t, tn, setLang, init, get lang() { return lang; }, get locale() { return { en: 'en-US', es: 'es-ES', de: 'de-DE', fr: 'fr-FR', pt: 'pt-BR', pl: 'pl-PL' }[lang] || 'en-US'; }, missing: () => Array.from(miss), walk, lookup, pseudo, has: id => !!dicts[id] };
})();
OD.t = (s, ...a) => OD.i18n.t(s, ...a);
OD.tn = (n, a, b) => OD.i18n.tn(n, a, b);
