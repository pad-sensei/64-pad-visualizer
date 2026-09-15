// Pure Push headline layout contract: preserve all semantic text and fit by scale.
// No candidate dropping, ellipsis, or silent character truncation is allowed here.
export function pushPixelTextUnits(raw) {
  const text = String(raw || '');
  let units = 0;
  for (const char of text) units += char === ' ' ? 4 : 6;
  return units;
}

function wrapPushPixelTextAtScaleOne(text, maxWidth) {
  const lines = [];
  let line = '';
  let units = 0;

  for (const char of text) {
    const charUnits = char === ' ' ? 4 : 6;
    if (line && units + charUnits > maxWidth) {
      lines.push(line);
      line = char;
      units = charUnits;
    } else {
      line += char;
      units += charUnits;
    }
  }

  if (line || lines.length === 0) lines.push(line);
  return lines;
}

export function fitPushPixelText(raw, maxScale = 4, maxWidth = 688) {
  const text = String(raw || '');
  const units = pushPixelTextUnits(text);
  if (units <= 0) return { text, scale: maxScale, width: 0, lines: [text] };

  const integerScale = Math.floor(maxWidth / units);
  if (integerScale >= 1) {
    const scale = Math.min(maxScale, integerScale);
    return { text, scale, width: units * scale, lines: [text] };
  }

  // Sub-pixel 5x7 cells are not a readable fallback. Preserve every character,
  // keep one physical pixel per dot, and wrap only when scale 1 cannot fit.
  const scale = 1;
  const lines = wrapPushPixelTextAtScaleOne(text, maxWidth);
  const width = Math.max(...lines.map(pushPixelTextUnits)) * scale;
  return { text, scale, width, lines };
}
