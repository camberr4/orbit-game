// The badges of the goals (Goals screen and the end-of-run reel): a hexagonal plate with a metal rim (bronze, silver or gold by how big the goal is),
// a face tinted by what the goal is about, and a bold emblem of its own. OD.goalBadge(id, size, earned) returns the svg.
(function () {
  // emblems on a 40 x 40 grid. Lines are stroked (the group's stroke), parts marked fill="F" are filled with the emblem's gradient.
  const IC = {
    orbit: '<circle cx="20" cy="20" r="13" fill="none"/><circle cx="20" cy="7" r="3.6" fill="F" stroke="none"/><circle cx="20" cy="20" r="4" fill="F" stroke="none"/>',
    rings: '<circle cx="20" cy="20" r="14" fill="none" opacity=".55"/><circle cx="20" cy="20" r="9" fill="none"/><circle cx="20" cy="20" r="3.6" fill="F" stroke="none"/><circle cx="32" cy="11" r="2.6" fill="F" stroke="none"/>',
    graze: '<path d="M5 28c3-13 15-19 29-14" fill="none"/><circle cx="31" cy="15" r="3.6" fill="F" stroke="none"/><path d="M9 35l4-8 5 3 3-7 6 5 4-3" fill="none" opacity=".65"/>',
    razor: '<path d="M7 33L31 9l3.5 3.5L10.5 36.5z" fill="F" stroke="none"/><path d="M29 6l1.4 3.6L34 11l-3.6 1.4L29 16l-1.4-3.6L24 11l3.6-1.4z" fill="F" stroke="none"/>',
    flame: '<path d="M20 4c2 6 10 9 10 18a10 10 0 01-20 0c0-4 2-7 5-9 0 3 1 5 3 5-1-5-1-10 2-14z" fill="F" stroke="none"/><path d="M20 22c2 3 4 4 4 7a4 4 0 01-8 0c0-2 2-4 4-7z" fill="#0a1130" stroke="none" opacity=".45"/>',
    ember: '<path d="M20 7c1 5 7 7 7 14a7 7 0 01-14 0c0-3 2-5 3.5-6.5 0 2 .8 3.4 2.2 3.4-1-4-.8-7 1.3-10.9z" fill="F" stroke="none"/>',
    spark: '<path d="M20 4l4 12 12 4-12 4-4 12-4-12-12-4 12-4z" fill="F" stroke="none"/>',
    spark1: '<path d="M18 9l3 8.5 8.5 3-8.5 3-3 8.5-3-8.5-8.5-3 8.5-3z" fill="F" stroke="none"/><path d="M31 5l1.2 3 3 1.2-3 1.2L31 13.4l-1.2-3-3-1.2 3-1.2z" fill="F" stroke="none"/>',
    spark3: '<path d="M14 11l2.6 7.4 7.4 2.6-7.4 2.6L14 31l-2.6-7.4L4 21l7.4-2.6z" fill="F" stroke="none"/><path d="M28 6l2 5.6 5.6 2-5.6 2-2 5.6-2-5.6-5.6-2 5.6-2z" fill="F" stroke="none"/><path d="M29 24l1.6 4.4 4.4 1.6-4.4 1.6L29 36l-1.6-4.4L23 30l4.4-1.6z" fill="F" stroke="none"/>',
    chev: '<path d="M8 21l12-10 12 10" fill="none"/><path d="M8 31l12-10 12 10" fill="none"/><path d="M8 11l12-8 12 8" fill="none" opacity=".45"/>',
    weave: '<path d="M3 21c4-13 8-13 12 0s8 13 12 0 5-7 10-3" fill="none"/><circle cx="35" cy="17.5" r="3" fill="F" stroke="none"/>',
    zig: '<path d="M6 31L15 9l9 22 10-22" fill="none"/><circle cx="34" cy="9" r="3" fill="F" stroke="none"/>',
    lap: '<path d="M32 13A13 13 0 1 0 33 23" fill="none"/><path d="M33 5v9h-9" fill="none"/><circle cx="20" cy="20" r="3.4" fill="F" stroke="none"/>',
    bolt: '<path d="M23 3L9 22h9l-3 15 16-21h-9z" fill="F" stroke="none"/>',
    bolt2: '<path d="M21 3L8 21h8l-2 12 13-17h-8z" fill="F" stroke="none"/><path d="M30 20l-4 6h4l-1 6 6-8h-4z" fill="F" stroke="none" opacity=".7"/>',
    rocket: '<path d="M20 3c6 4 8 12 7 20l-4 4h-6l-4-4C12 15 14 7 20 3z" fill="F" stroke="none"/><circle cx="20" cy="14" r="3" fill="#0a1130" stroke="none"/><path d="M13 24l-6 7 8-2M27 24l6 7-8-2M20 29v6" fill="none"/>',
    well: '<path d="M20 20c2-1 3 1 2 3-2 3-7 2-8-2-1-6 5-10 11-8 8 3 8 14-1 17" fill="none"/><circle cx="20" cy="20" r="2.4" fill="F" stroke="none"/><path d="M5 12c4-5 9-8 15-8" fill="none" opacity=".5"/>',
    horizon: '<circle cx="20" cy="20" r="14" fill="none"/><circle cx="20" cy="20" r="7.5" fill="#04061a" stroke="none"/><path d="M3 23c8 5 26 4 34-5" fill="none" opacity=".85"/>',
    clock: '<circle cx="20" cy="20" r="14" fill="none"/><path d="M20 11v9.5l6 4" fill="none"/><circle cx="20" cy="20" r="2" fill="F" stroke="none"/>',
    hourglass: '<path d="M10 5h20M10 35h20" fill="none"/><path d="M12 5v4c0 6 8 8 8 11s-8 5-8 11v4M28 5v4c0 6-8 8-8 11s8 5 8 11v4" fill="none"/><path d="M14.5 33c1-4 3.4-6 5.5-6s4.5 2 5.5 6z" fill="F" stroke="none"/><path d="M20 20v6" fill="none" opacity=".6"/>',
    infinity: '<path d="M20 20c-4-7-15-7-15 0s11 7 15 0 15-7 15 0-11 7-15 0z" fill="none"/>',
    target: '<circle cx="20" cy="20" r="14" fill="none"/><circle cx="20" cy="20" r="8" fill="none"/><circle cx="20" cy="20" r="2.8" fill="F" stroke="none"/>',
    target2: '<circle cx="18" cy="22" r="12" fill="none"/><circle cx="18" cy="22" r="6" fill="none"/><circle cx="18" cy="22" r="2.2" fill="F" stroke="none"/><path d="M19 21l15-15M28 5l6 1 1 6" fill="none"/>',
    dust: '<path d="M16 8l2.6 7.4 7.4 2.6-7.4 2.6L16 28l-2.6-7.4L6 18l7.4-2.6z" fill="F" stroke="none"/><path d="M30 6l1.6 4.4 4.4 1.6-4.4 1.6L30 18l-1.6-4.4L24 12l4.4-1.6z" fill="F" stroke="none"/><circle cx="29" cy="28" r="3" fill="F" stroke="none"/><circle cx="12" cy="33" r="2.2" fill="F" stroke="none"/>',
    nova: '<circle cx="20" cy="20" r="7" fill="F" stroke="none"/><path d="M20 3v6M20 31v6M3 20h6M31 20h6M8 8l4 4M28 28l4 4M32 8l-4 4M12 28l-4 4" fill="none"/>',
    sun: '<circle cx="20" cy="20" r="9" fill="F" stroke="none"/><path d="M20 3v5M20 32v5M3 20h5M32 20h5M8 8l3.5 3.5M28.5 28.5L32 32M32 8l-3.5 3.5M11.5 28.5L8 32" fill="none"/>',
    exit: '<circle cx="17" cy="20" r="12" fill="none"/><circle cx="17" cy="20" r="5" fill="#04061a" stroke="none"/><path d="M24 20h13M32 14l6 6-6 6" fill="none"/>',
    exit2: '<circle cx="16" cy="22" r="11" fill="none"/><circle cx="16" cy="22" r="4.6" fill="#04061a" stroke="none"/><path d="M24 14l12-8M27 8l9-2-2 9" fill="none"/><circle cx="35" cy="26" r="2.2" fill="F" stroke="none"/><circle cx="32" cy="33" r="2.2" fill="F" stroke="none"/>',
    walker: '<circle cx="20" cy="22" r="12" fill="none"/><circle cx="20" cy="22" r="5" fill="#04061a" stroke="none"/><circle cx="20" cy="7" r="3.4" fill="F" stroke="none"/><path d="M20 10.4v4.2" fill="none" opacity=".6"/>',
    inner: '<circle cx="20" cy="20" r="14" fill="none" opacity=".4"/><circle cx="20" cy="20" r="8.5" fill="none"/><circle cx="20" cy="20" r="3.4" fill="F" stroke="none"/><path d="M20 3v4M20 33v4M3 20h4M33 20h4" fill="none" opacity=".7"/>',
    twin: '<circle cx="12" cy="24" r="7" fill="F" stroke="none"/><circle cx="29" cy="24" r="5" fill="none"/><path d="M7 14c8-8 18-8 26 0" fill="none"/><path d="M30 8l4 5-6 1" fill="none"/>',
    binary: '<circle cx="14" cy="22" r="7.5" fill="F" stroke="none"/><circle cx="29" cy="17" r="5" fill="F" stroke="none"/><ellipse cx="21" cy="20" rx="17" ry="6" transform="rotate(-18 21 20)" fill="none" opacity=".55"/>',
    comet: '<circle cx="29" cy="11" r="5.4" fill="F" stroke="none"/><path d="M25 15L5 35M28 17L13 35M23 11L5 27" fill="none" opacity=".8"/>',
    clutch: '<path d="M7 14h22l-5-5" fill="none"/><path d="M33 26H11l5 5" fill="none"/><circle cx="20" cy="20" r="2.4" fill="F" stroke="none"/>',
    power: '<path d="M20 3l14 17-14 17L6 20z" fill="none"/><path d="M20 12l6.5 8-6.5 8-6.5-8z" fill="F" stroke="none"/>',
    globe: '<circle cx="20" cy="20" r="14" fill="none"/><ellipse cx="20" cy="20" rx="6" ry="14" fill="none"/><path d="M6 20h28M8.5 12.5h23M8.5 27.5h23" fill="none" opacity=".6"/>',
    tree1: '<circle cx="20" cy="31" r="3.8" fill="F" stroke="none"/><circle cx="11" cy="13" r="3.8" fill="F" stroke="none"/><circle cx="29" cy="13" r="3.8" fill="F" stroke="none"/><path d="M20 27V20M20 20l-7-4.5M20 20l7-4.5" fill="none"/>',
    tree2: '<circle cx="20" cy="33" r="3.4" fill="F" stroke="none"/><circle cx="20" cy="20" r="3.4" fill="F" stroke="none"/><circle cx="9" cy="10" r="3.4" fill="F" stroke="none"/><circle cx="31" cy="10" r="3.4" fill="F" stroke="none"/><circle cx="20" cy="6" r="3" fill="F" stroke="none"/><path d="M20 30V23M20 17l-9-5M20 17l9-5M20 17V9" fill="none"/>',
    crown: '<path d="M5 30l2.5-17 8 8L20 8l4.5 13 8-8L35 30z" fill="F" stroke="none"/><path d="M6 35h28" fill="none"/>',
    check: '<path d="M8 21l8 8 16-17" fill="none"/>',
    flag: '<path d="M10 36V5" fill="none"/><path d="M10 6h20l-5 7 5 7H10z" fill="F" stroke="none"/>',
    star: '<path d="M20 4l4.9 10.3 11.1 1.5-8.1 7.8 2 11.1L20 29.4 10.1 34.7l2-11.1L4 15.8l11.1-1.5z" fill="F" stroke="none"/>',
  };
  // which emblem and which colours each goal wears
  const KINDS = {
    graze: ['#8ff3ff', '#2f9bff'], trick: ['#ffa8e6', '#a86bff'], score: ['#ffe28a', '#ff9a3d'], time: ['#b3c8ff', '#6a7dff'], combo: ['#ffbe7a', '#ff5a3d'],
    dust: ['#fff2a8', '#e0a021'], hole: ['#e6b0ff', '#8a4dff'], world: ['#a6ffd6', '#2fc79a'], power: ['#d3c2ff', '#7d5cff'], skill: ['#ffd0a0', '#ff8a5a'],
  };
  const MAP = {
    first: ['orbit', 'world'], runs50: ['rings', 'time'], graze10: ['graze', 'graze'], graze500: ['flame', 'graze'], razor10: ['spark', 'graze'], graze25: ['razor', 'graze'], clutch25: ['clutch', 'graze'], inner: ['inner', 'graze'],
    trick25: ['spark1', 'trick'], trick250: ['spark3', 'trick'], trickrun12: ['flame', 'trick'], tcombo5: ['chev', 'trick'], weave10: ['weave', 'trick'], zig10: ['zig', 'trick'], lap25: ['lap', 'trick'],
    combo5: ['bolt', 'combo'], combo8: ['bolt2', 'combo'], overdrive: ['nova', 'combo'], overdrive10: ['flame', 'combo'],
    score1k: ['ember', 'score'], score2500: ['well', 'score'], score5k: ['rocket', 'score'], score10k: ['horizon', 'score'],
    time60: ['clock', 'time'], time120: ['hourglass', 'time'], time240: ['infinity', 'time'],
    perfect5: ['target', 'power'], perfect100: ['target2', 'power'], dust1k: ['dust', 'dust'], power25: ['power', 'power'],
    boss1: ['exit', 'hole'], boss10: ['exit2', 'hole'], hole1: ['walker', 'hole'], nova1: ['sun', 'combo'], stargazer: ['comet', 'hole'],
    twin1: ['twin', 'world'], twin25: ['binary', 'world'], worlds: ['globe', 'world'], skill1: ['tree1', 'skill'], skill12: ['tree2', 'skill'],
    win1: ['crown', 'score'], win3: ['crown', 'hole'], win10: ['crown', 'combo'],
  };
  const RIM = { 1: ['#f6cfa5', '#9a5c2e'], 2: ['#f8fbff', '#8e9cba'], 3: ['#fff3b0', '#d99a1b'] };
  const hex = (r, c = 60) => { let p = ''; for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 - Math.PI / 2; p += (i ? 'L' : 'M') + (c + Math.cos(a) * r).toFixed(1) + ' ' + (c + Math.sin(a) * r).toFixed(1); } return p + 'Z'; };
  let n = 0;
  // id: the goal; size: pixels; earned: false draws it dimmed (the goal is still ahead)
  OD.goalBadge = function (id, size = 56, earned = true) {
    const goal = OD.CHALLENGES.find(c => c.id === id), [icon, kind] = MAP[id] || ['star', 'graze'], [c1, c2] = KINDS[kind];
    const tier = !goal ? 3 : goal.tier || (goal.reward >= 70 ? 3 : goal.reward >= 35 ? 2 : 1), [r1, r2] = RIM[tier], u = 'g' + (n++).toString(36);
    const body = (IC[icon] || IC.star).replace(/fill="F"/g, `fill="url(#${u}e)"`);
    const rivets = Array.from({ length: 6 }, (_, i) => { const a = i / 6 * Math.PI * 2 - Math.PI / 2; return `<circle cx="${(60 + Math.cos(a) * 50.5).toFixed(1)}" cy="${(60 + Math.sin(a) * 50.5).toFixed(1)}" r="2" fill="${r1}" opacity=".9"/>`; }).join('');
    return `<svg class="gb ${earned ? 'on' : 'off'}" viewBox="0 0 120 120" width="${size}" height="${size}" style="color:${c1}">
      <defs>
        <linearGradient id="${u}r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${r1}"/><stop offset=".55" stop-color="${r2}"/><stop offset="1" stop-color="${r1}"/></linearGradient>
        <radialGradient id="${u}f" cx=".35" cy=".25" r="1"><stop offset="0" stop-color="${c2}" stop-opacity=".55"/><stop offset=".45" stop-color="#16214f"/><stop offset="1" stop-color="#070b24"/></radialGradient>
        <linearGradient id="${u}e" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="40"><stop offset="0" stop-color="#fff"/><stop offset=".35" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>
        <radialGradient id="${u}h" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="${c1}" stop-opacity=".5"/><stop offset="1" stop-color="${c1}" stop-opacity="0"/></radialGradient>
        <linearGradient id="${u}s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".4"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
        <clipPath id="${u}c"><path d="${hex(46)}"/></clipPath>
      </defs>
      <path d="${hex(57)}" fill="url(#${u}r)" stroke="${r2}" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="${hex(48)}" fill="url(#${u}f)" stroke="#04061a" stroke-opacity=".7" stroke-width="2.5" stroke-linejoin="round"/>
      <path d="${hex(43)}" fill="none" stroke="${c1}" stroke-opacity=".35" stroke-width="1.2" stroke-linejoin="round"/>
      ${rivets}
      <circle cx="60" cy="60" r="32" fill="url(#${u}h)"/>
      <g clip-path="url(#${u}c)"><path d="M6 8L72 -6 40 52 -4 62z" fill="#fff" opacity=".07"/><g class="shine"><rect x="-70" y="-70" width="34" height="260" fill="url(#${u}s)" transform="rotate(22 60 60)"/></g></g>
      <g transform="translate(30 31) scale(1.5)" stroke="url(#${u}e)" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round" fill="none">${body}</g>
    </svg>`;
  };
})();
