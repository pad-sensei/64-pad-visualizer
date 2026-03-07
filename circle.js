// ========================================
// CIRCLE OF FIFTHS — Compact display for 64 Pad Explorer
// Extracted from standalone circle-of-fifths app
// ========================================

// Key order around the circle (fifths): C, G, D, A, E, B, Gb, Db, Ab, Eb, Bb, F
var CIRCLE_KEYS = [
  { pc: 0,  major: 'C',  minor: 'Am' },
  { pc: 7,  major: 'G',  minor: 'Em' },
  { pc: 2,  major: 'D',  minor: 'Bm' },
  { pc: 9,  major: 'A',  minor: 'F\u266Fm' },
  { pc: 4,  major: 'E',  minor: 'C\u266Fm' },
  { pc: 11, major: 'B',  minor: 'G\u266Fm' },
  { pc: 6,  major: 'G\u266D', minor: 'E\u266Dm' },
  { pc: 1,  major: 'D\u266D', minor: 'B\u266Dm' },
  { pc: 8,  major: 'A\u266D', minor: 'Fm' },
  { pc: 3,  major: 'E\u266D', minor: 'Cm' },
  { pc: 10, major: 'B\u266D', minor: 'Gm' },
  { pc: 5,  major: 'F',  minor: 'Dm' },
];

function _circlePolar(cx, cy, r, angleDeg) {
  var rad = (angleDeg - 90) * Math.PI / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function _circleSegmentPath(cx, cy, innerR, outerR, startA, endA) {
  var s1 = _circlePolar(cx, cy, outerR, startA);
  var s2 = _circlePolar(cx, cy, outerR, endA);
  var s3 = _circlePolar(cx, cy, innerR, endA);
  var s4 = _circlePolar(cx, cy, innerR, startA);
  var large = (endA - startA) <= 180 ? '0' : '1';
  return 'M ' + s1.x + ' ' + s1.y +
    ' A ' + outerR + ' ' + outerR + ' 0 ' + large + ' 1 ' + s2.x + ' ' + s2.y +
    ' L ' + s3.x + ' ' + s3.y +
    ' A ' + innerR + ' ' + innerR + ' 0 ' + large + ' 0 ' + s4.x + ' ' + s4.y + ' Z';
}

function renderCircleOfFifths(svgEl, currentKey) {
  if (!svgEl) return;
  svgEl.innerHTML = '';
  var size = 200;
  svgEl.setAttribute('viewBox', '0 0 ' + size + ' ' + size);
  var cx = size / 2, cy = size / 2;
  var outerR = 90, innerR = 62, minorR = 62, centerR = 38;
  var angle = 30;

  // Determine current key's position in circle
  var currentPC = currentKey % 12;

  // Diatonic PCs for highlighting (major scale from currentKey)
  var diatonicPCs = new Set([0, 2, 4, 5, 7, 9, 11].map(function(iv) { return (iv + currentPC) % 12; }));

  // Draw segments
  for (var i = 0; i < 12; i++) {
    var k = CIRCLE_KEYS[i];
    var startA = i * angle - angle / 2;
    var endA = startA + angle;
    var midA = startA + angle / 2;

    // Major segment (outer ring)
    var isCurrentMajor = k.pc === currentPC;
    var isDiatonic = diatonicPCs.has(k.pc);

    // Colors: current=accent, diatonic=highlighted, other=neutral
    var majorFill = isCurrentMajor ? '#E69F00' : (isDiatonic ? '#555' : '#333');
    var majorPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    majorPath.setAttribute('d', _circleSegmentPath(cx, cy, innerR, outerR, startA, endA));
    majorPath.setAttribute('fill', majorFill);
    majorPath.setAttribute('stroke', '#222');
    majorPath.setAttribute('stroke-width', '1');
    majorPath.setAttribute('cursor', 'pointer');
    majorPath.setAttribute('data-pc', k.pc);
    majorPath.onclick = function(pc) { return function() { _circleKeyClick(pc); }; }(k.pc);
    svgEl.appendChild(majorPath);

    // Major label
    var tp = _circlePolar(cx, cy, (outerR + innerR) / 2, midA);
    var txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    txt.setAttribute('x', tp.x);
    txt.setAttribute('y', tp.y);
    txt.setAttribute('text-anchor', 'middle');
    txt.setAttribute('dominant-baseline', 'middle');
    txt.setAttribute('font-size', '10');
    txt.setAttribute('font-weight', isCurrentMajor ? '700' : '500');
    txt.setAttribute('fill', isCurrentMajor ? '#000' : '#ddd');
    txt.setAttribute('pointer-events', 'none');
    txt.textContent = k.major;
    svgEl.appendChild(txt);

    // Minor segment (inner ring)
    var minorPC = (k.pc + 9) % 12; // relative minor
    var isCurrentMinor = minorPC === currentPC;
    var isMinorDiatonic = diatonicPCs.has(minorPC);
    var minorFill = isCurrentMinor ? '#E69F00' : (isMinorDiatonic ? '#444' : '#2a2a2a');
    var minorPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    minorPath.setAttribute('d', _circleSegmentPath(cx, cy, centerR, minorR, startA, endA));
    minorPath.setAttribute('fill', minorFill);
    minorPath.setAttribute('stroke', '#222');
    minorPath.setAttribute('stroke-width', '1');
    minorPath.setAttribute('cursor', 'pointer');
    minorPath.setAttribute('data-pc', minorPC);
    minorPath.onclick = function(pc) { return function() { _circleKeyClick(pc); }; }(minorPC);
    svgEl.appendChild(minorPath);

    // Minor label
    var mp = _circlePolar(cx, cy, (minorR + centerR) / 2, midA);
    var mtxt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    mtxt.setAttribute('x', mp.x);
    mtxt.setAttribute('y', mp.y);
    mtxt.setAttribute('text-anchor', 'middle');
    mtxt.setAttribute('dominant-baseline', 'middle');
    mtxt.setAttribute('font-size', '7.5');
    mtxt.setAttribute('font-weight', isCurrentMinor ? '700' : '400');
    mtxt.setAttribute('fill', isCurrentMinor ? '#000' : '#aaa');
    mtxt.setAttribute('pointer-events', 'none');
    mtxt.textContent = k.minor;
    svgEl.appendChild(mtxt);
  }

  // Center circle
  var centerCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  centerCircle.setAttribute('cx', cx);
  centerCircle.setAttribute('cy', cy);
  centerCircle.setAttribute('r', centerR);
  centerCircle.setAttribute('fill', '#1a1a1a');
  svgEl.appendChild(centerCircle);

  // Center text: current key name
  var keyName = NOTE_NAMES_SHARP[currentPC];
  if (FLAT_MAJOR_KEYS.has(currentPC)) keyName = NOTE_NAMES_FLAT[currentPC];
  var ctext = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  ctext.setAttribute('x', cx);
  ctext.setAttribute('y', cy);
  ctext.setAttribute('text-anchor', 'middle');
  ctext.setAttribute('dominant-baseline', 'middle');
  ctext.setAttribute('font-size', '16');
  ctext.setAttribute('font-weight', '700');
  ctext.setAttribute('fill', '#E69F00');
  ctext.textContent = keyName;
  svgEl.appendChild(ctext);
}

function _circleKeyClick(pc) {
  AppState.key = pc;
  if (typeof updateKeyButtons === 'function') updateKeyButtons();
  if (typeof render === 'function') render();
  if (typeof saveAppSettings === 'function') saveAppSettings();
}

function toggleCircle() {
  AppState.showCircle = !AppState.showCircle;
  var wrap = document.getElementById('circle-wrap');
  if (wrap) wrap.style.display = AppState.showCircle ? '' : 'none';
  var btn = document.getElementById('inst-toggle-circle');
  if (btn) btn.classList.toggle('active', AppState.showCircle);
  if (AppState.showCircle) renderCircleOfFifths(document.getElementById('circle-svg'), AppState.key);
  saveAppSettings();
}
