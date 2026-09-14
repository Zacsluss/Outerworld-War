// The ground textures' levels, for test/terraintex.js: for every texture TERRAIN_TEX names, its length in bytes, an FNV-1a hash of
// those bytes and a histogram of each channel as the game samples it (drawn into a Terrain.TEX_PX canvas, as Terrain.texSet does,
// before any healing). node has no JPEG decoder, so this runs in a browser, and the suite works out from the histograms how light
// each graded material is -- a texture changed without being measured again fails there by its hash.
//
// In the page tools/terrain-shot.js serves (http://localhost:8897/), in the console or the Browser pane:
//   await new Promise(r => { const s = document.createElement('script'); s.src = '/tools/terrain-levels.js'; s.onload = r; document.head.appendChild(s); });
//   await TerrainLevels.write()      // POST /levels -> test/terrain-levels.json
'use strict';
window.TerrainLevels = {
  fnv(bytes) { let h = 0x811c9dc5; for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 16777619); } return (h >>> 0).toString(16).padStart(8, '0'); },
  async measure() {
    const files = [...new Set(Object.values(TERRAIN_TEX).flatMap(s => Object.values(s)))].sort(), S = Terrain.TEX_PX, out = {};
    for (const url of files) {
      const buf = new Uint8Array(await (await fetch('/' + url, { cache: 'no-store' })).arrayBuffer());
      const img = await createImageBitmap(new Blob([buf], { type: 'image/jpeg' }));
      const cv = document.createElement('canvas'); cv.width = cv.height = S;
      const x = cv.getContext('2d'); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; x.drawImage(img, 0, 0, S, S);
      const d = x.getImageData(0, 0, S, S).data, h = { r: new Array(256).fill(0), g: new Array(256).fill(0), b: new Array(256).fill(0) };
      for (let p = 0; p < d.length; p += 4) { h.r[d[p]]++; h.g[d[p + 1]]++; h.b[d[p + 2]]++; }
      out[url.split('/').pop()] = { bytes: buf.length, fnv: this.fnv(buf), r: h.r, g: h.g, b: h.b };
    }
    return out;
  },
  async write() { const res = await fetch('/levels', { method: 'POST', body: JSON.stringify(await this.measure()) }); return res.text(); },
};
