// Pitch-preserving time stretch (WSOLA) for the DJ-style music mixes. One processor plays all the stems of a song together, so the
// layers always stay aligned: the grain positions are searched on the sum of the stems and shared by every stem.
// The song is read at `rate` (1 = original tempo) while the pitch stays where it is. At rate 1 the output is an exact copy.
const G = 2048, H = 1024;
const WIN = new Float32Array(G);
for (let i = 0; i < G; i++) WIN[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / G);
const MAXD = 160;   // the furthest a grain may slide to find a better join (samples)

class HaloStretch extends AudioWorkletProcessor {
  static get parameterDescriptors() { return [{ name: 'rate', defaultValue: 1, minValue: 0.25, maxValue: 4, automationRate: 'k-rate' }]; }
  constructor() {
    super();
    this.stems = null; this.mono = null; this.len = 0; this.n = 0;
    this.go = false; this.startFrame = 0; this.pos = 0; this.nominal = 0; this.prevStart = 0; this.first = true;
    this.ob = null; this.outPos = H; this.alive = true;
    this.port.onmessage = e => {
      const m = e.data;
      if (m.type === 'load') {
        this.stems = m.stems; this.n = m.stems.length; this.len = m.stems[0][0].length;
        const mono = new Float32Array(this.len);
        for (const st of this.stems) for (const ch of st) for (let i = 0; i < this.len; i++) mono[i] += ch[i];
        this.mono = mono;
        this.ob = this.stems.map(() => [new Float32Array(G), new Float32Array(G)]);
      } else if (m.type === 'start') {
        this.startFrame = m.frame; this.pos = m.pos * 1; this.go = true; this.first = true; this.outPos = H; this.nominal = m.pos;
      } else if (m.type === 'stop') { this.alive = false; this.go = false; }
    };
  }
  wrap(p) { const L = this.len; p %= L; return p < 0 ? p + L : p; }
  // add the next grain into the overlap buffers
  grain(rate) {
    const L = this.len, mono = this.mono;
    let start = Math.round(this.nominal);
    if (this.first) { this.prevStart = start; }
    else {
      const win = Math.round(MAXD * Math.min(1, Math.abs(rate - 1) / 0.03));
      if (win > 0) {
        // the natural continuation of the previous grain, and the candidate that fits it best
        const ref = this.wrap(this.prevStart + H);
        let best = -1e30, bd = 0;
        for (let d = -win; d <= win; d += 1) {
          const c0 = start + d;
          let cor = 0, en = 1e-9;
          for (let i = 0; i < H; i += 2) {
            const a = mono[(ref + i) % L], b = mono[this.wrap(c0 + i)];
            cor += a * b; en += b * b;
          }
          const sc = cor / Math.sqrt(en);
          if (sc > best) { best = sc; bd = d; }
        }
        start += bd;
      }
      this.prevStart = start;
    }
    const first = this.first; this.first = false;
    for (let s = 0; s < this.n; s++) {
      const st = this.stems[s], ob = this.ob[s];
      for (let c = 0; c < 2; c++) {
        const src = st[c < st.length ? c : 0], o = ob[c];
        let p = this.wrap(start);
        for (let i = 0; i < G; i++) {
          const w = first && i < H ? 1 : WIN[i];
          o[i] += src[p] * w;
          if (++p === L) p = 0;
        }
      }
    }
    this.nominal = this.wrap(this.nominal + H * rate);
  }
  process(inputs, outputs, params) {
    if (!this.alive) return false;
    const out0 = outputs[0];
    const frames = out0[0].length;
    if (!this.go || !this.stems) return true;
    const rate = params.rate[0];
    let i0 = 0;
    if (currentFrame + frames <= this.startFrame) return true;
    if (currentFrame < this.startFrame) i0 = this.startFrame - currentFrame;
    else if (this.first && currentFrame > this.startFrame) this.nominal = this.wrap(this.nominal + (currentFrame - this.startFrame));   // started late: catch up
    for (let i = i0; i < frames; i++) {
      if (this.outPos === H) {
        if (!this.first) for (const ob of this.ob) for (const o of ob) { o.copyWithin(0, H); o.fill(0, H); }
        this.grain(rate); this.outPos = 0;
      }
      for (let s = 0; s < this.n; s++) {
        const o = outputs[s], b = this.ob[s];
        o[0][i] = b[0][this.outPos]; o[1][i] = b[1][this.outPos];
      }
      this.outPos++;
    }
    return true;
  }
}
registerProcessor('halo-stretch', HaloStretch);
