// Pure Push headline layout contract: preserve all semantic text and fit by scale.
// No candidate dropping, ellipsis, or silent character truncation is allowed here.
export function pushPixelTextUnits(raw) {
  const text = String(raw || '');
  let units = 0;
  for (const char of text) units += char === ' ' ? 4 : 6;
  return units;
}

export function fitPushPixelText(raw, maxScale = 4, maxWidth = 688) {
  const text = String(raw || '');
  const units = pushPixelTextUnits(text);
  if (units <= 0) return { text, scale: maxScale, width: 0 };

  const idealScale = maxWidth / units;
  const integerScale = Math.floor(idealScale);
  const scale = integerScale >= 1
    ? Math.min(maxScale, integerScale)
    : Math.min(maxScale, idealScale);

  return { text, scale, width: units * scale };
}
