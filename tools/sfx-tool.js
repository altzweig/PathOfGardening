// Dev-only sound tool (run in the browser console of `npm run dev`):
//   const T = await import('/tools/sfx-tool.js'); await T.load(); await T.viz('name', [['file.wav', t0, t1], ...]);
//   await T.cut('out_name', 'file.wav', t0, t1, { gain, fade, rate })
// Reads raw files from sfx/, writes trimmed mono 16-bit WAVs to public/audio/ via the dev server.
export const S = {};
const ac = new OfflineAudioContext(1, 1, 44100);

export async function load(files) {
  files = files || (await (await fetch('/__tools/list-sfx')).json());
  for (const f of files) {
    if (S[f]) continue;
    const buf = await (await fetch('/sfx/' + encodeURIComponent(f))).arrayBuffer();
    const ab = await ac.decodeAudioData(buf);
    const n = ab.length, ch = ab.numberOfChannels, mono = new Float32Array(n);
    for (let c = 0; c < ch; c++) { const d = ab.getChannelData(c); for (let i = 0; i < n; i++) mono[i] += d[i] / ch; }
    S[f] = { mono, sr: ab.sampleRate };
  }
  return Object.keys(S);
}

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k], vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}

/** waveform + spectrogram (0-11 kHz) rows, saved as .tools-out/<name>.png */
export async function viz(name, list) {
  const W = 1600, rowH = Math.min(400, Math.floor(1400 / list.length));
  const cv = document.createElement('canvas'); cv.width = W; cv.height = rowH * list.length;
  const g = cv.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, W, cv.height);
  list.forEach(([f, t0, t1], row) => {
    const { mono, sr } = S[f]; t1 = Math.min(t1, mono.length / sr);
    const a = Math.floor(t0 * sr), b = Math.floor(t1 * sr), y0 = row * rowH, wh = rowH * .32, sh = rowH * .62;
    g.strokeStyle = '#6cf'; g.beginPath();
    for (let x = 0; x < W; x++) {
      const i0 = a + Math.floor((b - a) * x / W), i1 = a + Math.floor((b - a) * (x + 1) / W); let mn = 0, mx = 0;
      for (let i = i0; i < i1; i++) { if (mono[i] < mn) mn = mono[i]; if (mono[i] > mx) mx = mono[i]; }
      g.moveTo(x, y0 + wh / 2 - mx * wh / 2); g.lineTo(x, y0 + wh / 2 - mn * wh / 2);
    }
    g.stroke();
    const N = 1024, cols = 500, H = Math.floor(sh), img = g.createImageData(cols, H);
    for (let c = 0; c < cols; c++) {
      const s = a + Math.floor((b - a - N) * c / cols); const re = new Float32Array(N), im = new Float32Array(N);
      for (let i = 0; i < N; i++) re[i] = (mono[s + i] || 0) * (.5 - .5 * Math.cos(2 * Math.PI * i / N));
      fft(re, im);
      for (let y = 0; y < H; y++) {
        const fr = Math.pow(1 - y / H, 2) * 11000, bin = Math.min(N / 2 - 1, Math.round(fr / sr * N));
        const db = 20 * Math.log10(Math.hypot(re[bin], im[bin]) + 1e-6), v = Math.max(0, Math.min(1, (db + 50) / 60)), o = (y * cols + c) * 4;
        img.data[o] = v * 255; img.data[o + 1] = v * v * 200; img.data[o + 2] = (1 - v) * v * 255; img.data[o + 3] = 255;
      }
    }
    const tmp = document.createElement('canvas'); tmp.width = cols; tmp.height = H; tmp.getContext('2d').putImageData(img, 0, 0);
    g.drawImage(tmp, 0, y0 + wh, W, sh);
    g.fillStyle = '#fff'; g.font = '24px sans-serif'; g.fillText(`${f}  ${t0}-${t1.toFixed(2)} s`, 8, y0 + 24);
    const step = (t1 - t0) > 12 ? 1 : .1;
    for (let t = Math.ceil(t0 / step) * step; t < t1; t += step) {
      const x = (t - t0) / (t1 - t0) * W, major = Math.abs(t - Math.round(t)) < 1e-6;
      g.fillStyle = major ? '#ff0' : '#777'; g.fillRect(x, y0 + wh - 6, major ? 2 : 1, 12);
      if (major) { g.font = '16px sans-serif'; g.fillText(String(Math.round(t)), x + 3, y0 + wh + 14); }
    }
  });
  const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
  await fetch('/__tools/save-png?name=' + name + '.png', { method: 'POST', body: blob });
  return name + '.png';
}

/** cut [t0,t1] from a source, normalize to peak `gain`, short fades, optional resample rate, save as mono 16-bit WAV */
export async function cut(out, f, t0, t1, o = {}) {
  const { mono, sr } = S[f]; const gain = o.gain ?? .9, fade = o.fade ?? .008, outSr = o.sr ?? 32000;
  const a = Math.max(0, Math.floor(t0 * sr)), b = Math.min(mono.length, Math.floor(t1 * sr));
  let seg = mono.slice(a, b);
  // high-pass (remove rumble / DC)
  if (o.hp !== false) { const rc = 1 / (2 * Math.PI * (o.hp || 60)), dt = 1 / sr, al = rc / (rc + dt); let py = 0, px = seg[0]; for (let i = 0; i < seg.length; i++) { const x = seg[i]; py = al * (py + x - px); px = x; seg[i] = py; } }
  // resample (linear)
  const n2 = Math.floor(seg.length * outSr / sr), r = new Float32Array(n2);
  for (let i = 0; i < n2; i++) { const p = i * sr / outSr, k = Math.floor(p), fr = p - k; r[i] = (seg[k] || 0) * (1 - fr) + (seg[k + 1] || 0) * fr; }
  let pk = 0; for (const v of r) pk = Math.max(pk, Math.abs(v)); const m = pk > 0 ? gain / pk : 1;
  const fi = Math.floor((o.fadeIn ?? fade) * outSr), fo = Math.floor((o.fadeOut ?? fade * 4) * outSr);
  for (let i = 0; i < n2; i++) { let e = 1; if (i < fi) e = i / fi; if (i > n2 - fo) e = Math.min(e, (n2 - i) / fo); r[i] *= m * e; }
  if (o.loop) { // crossfade end into start for seamless loops
    const L = Math.floor(o.loop * outSr); for (let i = 0; i < L; i++) { const t = i / L; r[i] = r[i] * t + r[n2 - L + i] * (1 - t); }
    const r2 = r.slice(0, n2 - L); return save(out, r2, outSr);
  }
  return save(out, r, outSr);
}
async function save(out, r, outSr) {
  const n = r.length, buf = new ArrayBuffer(44 + n * 2), dv = new DataView(buf);
  const ws = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); ws(8, 'WAVE'); ws(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, outSr, true); dv.setUint32(28, outSr * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); ws(36, 'data'); dv.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) dv.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, Math.round(r[i] * 32767))), true);
  await fetch('/__tools/save-sfx?name=' + out + '.wav', { method: 'POST', body: buf });
  return `${out}.wav ${(n / outSr).toFixed(2)}s ${(buf.byteLength / 1024).toFixed(0)}KB`;
}
