// el stub almacena fSize para simular measureText.
function makeCtx() {
  return {
    font: '', textAlign: '', textBaseline: '', _fSize: 80,
    measureText(text) {
      const fSize = this._fSize;
      const per = fSize * 0.53;
      return { width: text.length * per, actualBoundingBoxAscent: fSize * 0.72, actualBoundingBoxDescent: fSize * 0.18 };
    }
  };
}

// Réplica exacta del algoritmo de RegionTexturePainter.measureTextBounds (debe ser idéntico al .js)
function measureTextBounds(data, ctx) {
  const fSize = data.fontSize || 80;
  const font = `bold ${fSize}px "Georgia", serif`;
  ctx.font = font; ctx._fSize = fSize; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const spacing = data.letterSpacing !== undefined ? data.letterSpacing : Math.floor(fSize * 0.25);
  const message = (data.name || '').toUpperCase();
  if (!message) return { widthPx: fSize, heightPx: fSize * 1.5 };
  const straightWidth = ctx.measureText(message).width + ((message.length - 1) * spacing);
  const m = ctx.measureText(message);
  const heightPx = (m.actualBoundingBoxAscent || 0) + (m.actualBoundingBoxDescent || 0) || (fSize * 1.2);
  let widthPx = straightWidth, outH = heightPx;
  const curveRadius = data.curveRadius || 0, rotationDeg = data.rotation || 0;
  if (curveRadius !== 0) {
    const radius = Math.abs(curveRadius); let totalAngle = 0;
    for (let i = 0; i < message.length; i++) { const cw = ctx.measureText(message[i]).width; totalAngle += (cw + spacing) / radius; }
    totalAngle -= spacing / radius;
    const outerR = radius + (fSize * 0.5);
    widthPx = (2 * outerR * Math.sin(totalAngle / 2)) + (fSize * 0.3);
    outH = radius * (1 - Math.cos(totalAngle / 2)) + (fSize * 1.0);
  }
  // Réplica: straightWidth/straightHeight (del return) = dimensiones SIN rotar (ver RegionTexturePainter).
  const innerW = widthPx;
  const innerH = outH;
  if (rotationDeg !== 0) {
    const r = rotationDeg * Math.PI / 180; const c = Math.abs(Math.cos(r)), s = Math.abs(Math.sin(r));
    const w = widthPx, h = outH; widthPx = w * c + h * s; outH = w * s + h * c;
  }
  return { widthPx, heightPx: outH, straightWidth: innerW, straightHeight: innerH };
}

const ctx = makeCtx();
const cases = [
  { name: 'ARGENTINA', fontSize: 80 },
  { name: 'URUGUAY', fontSize: 80 },
  { name: 'RIO DE LA PLATA', fontSize: 70, letterSpacing: 5 },
  { name: 'BRASIL', fontSize: 90, curveRadius: 120, rotation: 23 },
  { name: 'OCEANO', fontSize: 80, rotation: 45 },
];
let ok = true;
for (const d of cases) {
  const r = measureTextBounds(d, ctx);
  const finite = Number.isFinite(r.widthPx) && Number.isFinite(r.heightPx) && r.widthPx > 0 && r.heightPx > 0;
  const fSize = d.fontSize || 80;
  const oldApprox = (fSize * 0.8 * d.name.length) + (Math.floor(fSize * 0.25) * (d.name.length - 1));
  const realWorldW = r.widthPx * (100 / 4096) * 1.3;
  const oldWorldW = oldApprox * (100 / 4096) * 1.9;
  console.log(JSON.stringify(d), '->', JSON.stringify(r), '| finite>0:', finite, '| worldW px real/old:', realWorldW.toFixed(2), '/', oldWorldW.toFixed(2));
  if (!finite) ok = false;
}
console.log(ok ? 'ALL OK' : 'FAIL');
