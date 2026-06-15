// ========================================
// MOBILE RESPONSIVE HELPERS
// ========================================
var _isMobile = false;
var _isLandscape = false;
var _mobileMediaQuery = window.matchMedia('(max-width: 767px)');
var _landscapeMediaQuery = window.matchMedia('(max-height: 500px) and (orientation: landscape)');

function handleMobileChange(e) {
  _isMobile = e.matches;
  moveMemorySection(_isMobile);
  moveInstrumentRow(_isMobile);
  if (typeof render === 'function') render();
}

function handleLandscapeChange(e) {
  _isLandscape = e.matches;
  if (_isLandscape) {
    // Move instrument row to info panel for landscape too
    moveInstrumentRow(true);
    // Render 32-pad overlay
    syncPlayControls();
    renderPad32();
  } else if (!_isMobile) {
    // Restore desktop layout
    moveInstrumentRow(false);
    var cp = document.querySelector('.control-panel');
    var sp = document.getElementById('staff-ep-panel');
    if (cp) cp.classList.remove('landscape-hidden');
    if (sp) sp.classList.remove('landscape-hidden');
  }
  if (typeof render === 'function') render();
}

function moveMemorySection(toMobile) {
  // Memory stays in #staff-ep-panel (Screen 3) in all modes
  // No DOM move needed
}

function moveInstrumentRow(toMobile) {
  // On mobile: diagrams stay in instrument-row (Screen 1, below pad)
  // No DOM move needed — CSS handles sizing
}

function initScreenDots() {
  var appLayout = document.querySelector('.app-layout');
  var dots = document.querySelectorAll('#screen-dots .dot');
  if (!appLayout || !dots.length) return;
  appLayout.addEventListener('scroll', function() {
    if (!_isMobile) return;
    var scrollLeft = appLayout.scrollLeft;
    var screenWidth = appLayout.clientWidth;
    var idx = Math.round(scrollLeft / screenWidth);
    dots.forEach(function(d, i) {
      d.classList.toggle('active', i === idx);
    });
  });
}

function goToScreen(index) {
  var appLayout = document.querySelector('.app-layout');
  if (!appLayout) return;
  appLayout.scrollTo({
    left: index * appLayout.clientWidth,
    behavior: 'smooth'
  });
}

function setLandscapeTab(tab) {
  var cp = document.querySelector('.control-panel');
  var sp = document.getElementById('staff-ep-panel');
  var tabs = document.querySelectorAll('.landscape-tab');
  if (tab === 'control') {
    if (cp) cp.classList.remove('landscape-hidden');
    if (sp) sp.classList.add('landscape-hidden');
  } else {
    if (cp) cp.classList.add('landscape-hidden');
    if (sp) sp.classList.remove('landscape-hidden');
  }
  tabs.forEach(function(t) {
    t.classList.toggle('active', (tab === 'control' && t.textContent === 'Control') || (tab === 'info' && t.textContent === 'Info'));
  });
}

// ========================================
// RENDER (MAIN)
// ========================================

function computeRenderState() {
  var inputNotes = AppState.mode === 'input'
    ? [...PlainState.activeNotes].sort(function(a, b) { return a - b; }) : [];
  var instrumentNotes = AppState.mode === 'input' && instrumentInputActive
    ? getAllInputMidiNotes() : [];
  var builderPCS = AppState.mode === 'chord' ? getBuilderPCS() : null;
  var chordNameVal = AppState.mode === 'chord' && builderPCS ? getBuilderChordName() : '';
  var extNotesArr = AppState.mode === 'chord' && padExtNotes.size > 0
    ? [...padExtNotes].sort(function(a, b) { return a - b; }) : [];

  return padComputeRenderState({
    cFixed: AppState.padCFixed === true,
    mode: AppState.mode,
    key: AppState.key,
    scaleIdx: AppState.scaleIdx,
    builderRoot: BuilderState.root,
    qualityPCS: BuilderState.quality ? BuilderState.quality.pcs : null,
    builderPCS: builderPCS,
    chordName: chordNameVal,
    builderBass: BuilderState.bass,
    inputNotes: inputNotes,
    instrumentNotes: instrumentNotes,
    detectChordFn: typeof detectChord === 'function' ? detectChord : null,
    voicing: {
      omit5: VoicingState.omit5,
      rootless: VoicingState.rootless,
      omit3: VoicingState.omit3,
      shell: VoicingState.shell
    },
    tasty: {
      enabled: TastyState.enabled,
      midiNotes: TastyState.midiNotes,
      degreeMap: TastyState.degreeMap,
      topNote: TastyState.topNote,
      boxSelected: VoicingState.selectedBoxIdx !== null,
      padPositions: TastyState.padPositions
    },
    stock: (function() {
      // Single source of truth: gate every Stock field on enabled + currentIndex >= 0
      // to prevent stale lhMidi/rhMidi/degreeMap from leaking into Push display etc.
      // after updateStockMatches resets currentIndex but before cycleStock refreshes.
      var stockActive = StockState.enabled && StockState.currentIndex >= 0;
      return {
        enabled: stockActive,
        midiNotes: stockActive ? (StockState.lhMidi || []).concat(StockState.rhMidi || []) : [],
        degreeMap: stockActive ? (StockState.degreeMap || {}) : {},
        topNote: (stockActive && StockState.rhMidi && StockState.rhMidi.length > 0) ? StockState.rhMidi[StockState.rhMidi.length - 1] : null,
        padPositions: stockActive ? StockState.padPositions : []
      };
    })(),
    extNotes: extNotesArr,
    selectedPS: _selectedPS || null,
    noRootLabel: t('builder.select_root')
  });
}

function renderPads(svg, state, grid) {
  var rows = grid ? grid.ROWS : ROWS;
  var cols = grid ? grid.COLS : COLS;
  var padSize = grid ? grid.PAD_SIZE : PAD_SIZE;
  var padGap = grid ? grid.PAD_GAP : PAD_GAP;
  var margin = grid ? grid.MARGIN : MARGIN;
  const { activePCS, activeIvPCS, rootPC, bassPC, charPCS, omittedPCS, guide3PCS, guide7PCS, tensionPCS, qualityPCS, avoidPCS, overlayPCS, overlayCharPCS, tastyMidiSet, tastyDegreeMap, tastyTopMidi, tastyPadPositions } = state;
  var scaleBgRootPC = typeof state.scaleBgRootPC === 'number' ? state.scaleBgRootPC : AppState.key;
  var overlayDegreeRootPC = typeof state.overlayDegreeRootPC === 'number' ? state.overlayDegreeRootPC : rootPC;
  // Build compact position set for TASTY/Stock pad positioning
  var tastyPadPosSet = null;
  if (tastyPadPositions && tastyPadPositions.length > 0) {
    tastyPadPosSet = new Set(tastyPadPositions.map(function(p) { return p.row + ',' + p.col; }));
  }
  // Build position set for selected voicing box (for dimming non-selected pads).
  // STOCK/TASTY are their own voicing display; a stale normal voicing-box
  // selection must not hide their fixed-register pad positions.
  const guitarEngineActive = !grid
    && typeof isGuitarEngineActive === 'function'
    && isGuitarEngineActive()
    && _instrumentPadSet;
  const specialVoicingActive = (tastyMidiSet && tastyMidiSet.size > 0) || guitarEngineActive;
  // Perform view never uses a voicing-box selection (it has its own one-position / all-positions
  // render). A stale selectedBoxIdx from before entering Perform must not dim pads or cancel the
  // perform scale background. (When a slot is played, applyNotesToBuilder already resets it; this
  // also covers the idle-perform state before any slot is pressed.)
  const _performView = !grid && memoryViewMode === 'perform';
  const selBox = !grid && !specialVoicingActive && !_performView && VoicingState.selectedBoxIdx !== null ? VoicingState.lastBoxes[VoicingState.selectedBoxIdx] : null;
  const selMidi = selBox ? new Set(selBox.midiNotes) : null;
  const selPos = selBox ? new Set(selBox.alternatives[selBox.currentAlt].positions.map(p => p.row + ',' + p.col)) : null;
  // Basic-form default (chord mode, no box): color only the one shape's pads via a position
  // filter (below); every other pad stays a plain off-pad. No dimming / no invisible holes.
  const basicPadSet = (!grid && !selBox && state.basicFormPadSet) ? state.basicFormPadSet : null;
  // All-positions view: paint the scale background behind every chord position (no single shape).
  const allPosScaleBg = (!grid && !selBox && state.allPosScaleBg) ? true : false;
  // Perform "one position" view (beginner default): the explorer COLLAPSES the playing voicing's
  // actual pitches to ONE compact pad arrangement for DISPLAY (educational), the same look as the
  // chord basic form — grey single shape over the blue/orange scale background, degree/tension
  // labels, "1/N" badge. render() supplies that one arrangement via state.basicFormPadSet (built
  // from basicFormArrangements() on the played notes), so here we just drive the input-style grey
  // off basic-form membership. AUDIO IS UNAFFECTED: perform.js always plays slot.midiNotes verbatim.
  // 表示設定 toggle (AppState.performAllPositions === true) shows the exact recorded pitches.
  // Perform must never inherit stale TASTY/STOCK voicing colour state. It is a memory-slot
  // educational display only: grey played notes over the scale background.
  const _performOnePos = _performView && AppState.performAllPositions !== true;
  const _performSameNotes = _performView && AppState.performAllPositions === true
    && PlainState.activeNotes && PlainState.activeNotes.size > 0;
  // One-position display branch. In Perform view it is driven SOLELY by the toggle
  // (AppState.performAllPositions) so the toggle actually switches the display; outside Perform,
  // input mode keeps its own one-position behaviour. Previously these were OR'd
  // (mode === 'input' || _performOnePos), which made the Perform toggle inert whenever the
  // underlying mode happened to be 'input' (the usual case while playing saved slots).
  const _onePosDisplay = _performView ? _performOnePos : (AppState.mode === 'input');
  // Interval-PC set of the actual playing voicing (relative to the detected root), used as the
  // finalPCS for chordDegreeName so #9 (interval 3 alongside a major 3rd) reads as "#9" not "m3".
  // In Perform/input mode padComputeRenderState returns activeIvPCS = null (only chord mode fills
  // it), but qualityPCS is present, so 11/#11/b13/13 already resolve; this only adds the #9 case.
  const _performIvPCS = ((_performOnePos || _performSameNotes) && rootPC !== null && activePCS)
    ? new Set(Array.from(activePCS).map(function(p) { return ((p - rootPC) + 12) % 12; }))
    : null;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const midi = midiNote(row, col);
      const pc = pitchClass(midi);
      const x = margin + col * (padSize + padGap);
      const y = margin + (rows - 1 - row) * (padSize + padGap);
      const interval = ((pc - rootPC) + 12) % 12;
      // Voicing filter: pad-position filter (deduped, WYSIWYG) > MIDI filter > no filter
      const _padPosFilter = !grid && !selBox && !basicPadSet && _instrumentPadSet;
      const _instrFilter = !grid && !selBox && !basicPadSet && !_padPosFilter && _instrumentMidiSet;
      const _voicingPass = (tastyMidiSet && tastyMidiSet.size > 0)
        ? true  // TASTY mode: bypass instrument filters entirely (_isTastyMiss handles dimming)
        : (basicPadSet ? basicPadSet.has(row * cols + col) : (_padPosFilter ? _padPosFilter.has(row * cols + col) : (_instrFilter ? _instrFilter.has(midi) : true)));
      const _performExactMidi = _performSameNotes && PlainState.activeNotes.has(midi);
      const isRoot = !_performSameNotes && pc === rootPC && !omittedPCS.has(pc) && _voicingPass;
      const isBass = !_performSameNotes && bassPC !== null && pc === bassPC && _voicingPass;
      const isActive = _performSameNotes ? _performExactMidi : ((_voicingPass && !_performOnePos) ? activePCS.has(pc) : false);
      const isOmitted = !_performSameNotes && omittedPCS.has(pc) && _voicingPass;
      const isChar = !_performSameNotes && AppState.mode === 'scale' && charPCS.has(pc) && !isRoot;
      const isGuide3 = !_performSameNotes && AppState.mode === 'chord' && guide3PCS.has(pc) && !isRoot && !tensionPCS.has(pc) && _voicingPass;
      const isGuide7 = !_performSameNotes && AppState.mode === 'chord' && guide7PCS.has(pc) && !isRoot && !tensionPCS.has(pc) && _voicingPass;
      const isGuide = isGuide3 || isGuide7;
      const isTension = AppState.mode === 'chord' && tensionPCS.has(pc) && !isRoot && !isGuide && _voicingPass;
      const isAvoid = !_performSameNotes && AppState.mode === 'chord' && avoidPCS.has(pc) && !isRoot && _voicingPass;
      const isOverlay = !_performSameNotes && !(_padPosFilter || _instrFilter) && !isOmitted && overlayPCS && overlayPCS.has(pc) && !activePCS.has(pc);

      // Plain mode: highlight selected notes only (exact-MIDI match → input WYSIWYG).
      // Perform one-position view instead highlights the ONE compact arrangement (basicPadSet,
      // built in render() from the played voicing) so the same pitch shows at a single position,
      // not at every duplicate grid slot. Both feed the grey single-colour chord shape below.
      const isPlainActive = _performSameNotes
        ? _performExactMidi
        : (_performOnePos
        ? (basicPadSet !== null && basicPadSet.has(row * cols + col))
        : (_onePosDisplay && PlainState.activeNotes.has(midi)));

      // colorOff = single-color mode: keep the root colour, collapse every other
      // lit pad (bass/3rd/7th/tension/avoid/characteristic) to one scale/chord colour.
      const colorOff = AppState.colorOff;
      let fill = 'var(--pad-off)', textColor = 'var(--text-muted)';
      if (_onePosDisplay || _performSameNotes) {
        // input / perform display: only the shown pads are coloured (single neutral grey, no root
        // distinction). In perform ON, shown pads are exact recorded MIDI pitches only.
        if (isPlainActive) { fill = 'var(--pad-basic-chord)'; textColor = '#000'; }
      } else if (isOmitted) { fill = 'var(--pad-omitted)'; textColor = '#999'; }
      else if (isRoot) {
        // Chord single-colour mode: the chord (root included) is the neutral colour, NOT the
        // scale/root orange — keeps the chord one consistent colour in every chord view.
        fill = (AppState.mode === 'chord' && colorOff) ? 'var(--pad-basic-chord)' : 'var(--pad-root)';
        textColor = '#000';
      }
      else if (!colorOff && isBass) { fill = '#ff9800'; textColor = '#000'; }
      else if (!colorOff && isGuide3) { fill = 'var(--pad-guide3)'; textColor = '#fff'; }
      else if (!colorOff && isGuide7) { fill = 'var(--pad-guide7)'; textColor = '#fff'; }
      else if (!colorOff && isChar) { fill = 'var(--pad-char)'; textColor = '#000'; }
      else if (!colorOff && isAvoid) { fill = 'var(--pad-avoid)'; textColor = '#fff'; }
      else if (!colorOff && isTension) { fill = 'var(--pad-tension)'; textColor = '#fff'; }
      else if (isActive || (colorOff && (isBass || isGuide3 || isGuide7 || isChar || isAvoid || isTension))) {
        fill = AppState.mode === 'scale' ? 'var(--pad-scale)' : (colorOff ? 'var(--pad-basic-chord)' : 'var(--pad-chord)');
        textColor = AppState.mode === 'scale' ? '#fff' : '#000';  // darker scale blue needs light text
      }
      else if (overlayPCS && overlayPCS.has(pc) && !activePCS.has(pc)) {
        // Scale overlay: note is in the selected scale but not in the chord
        // Show even when voicing box is selected (bypass _voicingPass)
        if (!colorOff && overlayCharPCS.has(pc)) {
          fill = 'var(--pad-overlay-char)';
        } else {
          fill = 'var(--pad-overlay)';
        }
        textColor = 'var(--text-muted)';
      }
      // TASTY/Stock voicing: a pad is a "hit" only at its compact voicing position (or
      // lowest-row fallback); every other pad is a "miss". Computed BEFORE the scale-background
      // paint so the engine educational scale can repaint the miss pads.
      var _isTastyMiss = false;
      if (tastyMidiSet && tastyMidiSet.size > 0) {
        if (tastyPadPosSet) {
          // Compact position set: exact (row,col) match
          _isTastyMiss = !tastyPadPosSet.has(row + ',' + col);
        } else if (!tastyMidiSet.has(midi)) {
          _isTastyMiss = true;
        } else {
          // Fallback: MIDI match but check if there's a lower-row occurrence (skip this one)
          var _bm = baseMidi(), _ri = ROW_INTERVAL;
          for (var pr = 0; pr < row; pr++) {
            var pc2 = midi - _bm - pr * _ri;
            if (pc2 >= 0 && pc2 < cols) { _isTastyMiss = true; break; }
          }
        }
        if (_isTastyMiss) {
          // Keep original chord tone color — opacity reduction applied later
          textColor = 'var(--text-muted)';
        }
      }
      // Scale-background slot = a pad that is NOT a voicing hit, so the scale shows through.
      // TASTY/STOCK mark hits via _isTastyMiss (their _voicingPass bypass makes every chord-tone
      // pc "active" everywhere, so !isActive alone would leave the scale holey); basic form /
      // all-positions / guitar use !isActive.
      var _isScaleBgSlot = (tastyMidiSet && tastyMidiSet.size > 0) ? _isTastyMiss
        : ((_onePosDisplay || _performSameNotes) ? !isPlainActive : !isActive);
      // Basic-form / all-positions / engine layering: faint scale background + single-colour
      // chord shape on top. The chord shape pads keep the colour set by the chain above; here we
      // only paint the non-voicing pads: opaque blue scale, ORANGE tonic (scale root), off otherwise.
      if ((basicPadSet || allPosScaleBg) && _isScaleBgSlot) {
        if (state.scaleBgPCS && state.scaleBgPCS.has(pc)) {
          if (pc === scaleBgRootPC) { fill = 'var(--pad-root)'; textColor = '#000'; }
          else { fill = 'var(--pad-basic-scale)'; textColor = '#fff'; }
        } else {
          fill = 'var(--pad-off)'; textColor = 'var(--text-muted)';
        }
      }
      // Input / Perform direct-education view: force the final colour language to match
      // Scale/Chord basic form. Background = scale (blue) + tonic (orange). Shown/played notes
      // = neutral grey. This intentionally overrides root/guide/tension/engine colours so
      // Perform never shows green, and Input stays readable against a calm scale surface.
      var _directEduView = !grid && (AppState.mode === 'input' || _performOnePos || _performSameNotes);
      if (_directEduView && state.scaleBgPCS) {
        var _directEduActive = _performSameNotes
          ? _performExactMidi
          : (_performOnePos ? isPlainActive : PlainState.activeNotes.has(midi));
        if (_directEduActive) {
          fill = 'var(--pad-basic-chord)';
          textColor = '#000';
        } else if (state.scaleBgPCS.has(pc)) {
          if (pc === scaleBgRootPC) { fill = 'var(--pad-root)'; textColor = '#000'; }
          else { fill = 'var(--pad-basic-scale)'; textColor = '#fff'; }
        } else {
          fill = 'var(--pad-off)';
          textColor = 'var(--text-muted)';
        }
      }
      // Engine educational mode: a scale-background pad here carries a readable scale-degree
      // label (R, 2, 3, …) like basic form, driven off the key-rooted scaleBgPCS (deterministic,
      // independent of any chord-rooted overlay selection).
      var isEngineScaleBg = !grid && state.engineScaleBg && _isScaleBgSlot
        && state.scaleBgPCS && state.scaleBgPCS.has(pc);
      var _doubleStopPad = !grid && state.doubleStopPadSet && state.doubleStopPadSet.has(row * cols + col);
      if (_doubleStopPad) {
        fill = 'var(--pad-basic-chord)';
        textColor = '#000';
      }

      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      // Blink removed (too high load). "Other positions exist" is shown by a 1/3 badge instead.
      rect.setAttribute('class', 'pad');
      rect.setAttribute('x', x); rect.setAttribute('y', y);
      rect.setAttribute('width', padSize); rect.setAttribute('height', padSize);
      rect.setAttribute('rx', 6); rect.setAttribute('fill', fill);
      // Hold pad: noteOn on press, noteOff on global release (no mouseleave)
      // Plain mode: click toggles note on/off
      (function(m, r, gridRow, gridCol) {
        r.addEventListener('mousedown', (e) => {
          // Right-click (button 2) opens the pad context menu — never play the note.
          if (e.button !== 0) return;
          e.preventDefault();
          if (linkMode) {
            _heldMidi = m; noteOn(m); midiActiveNotes.add(m); scheduleMidiUpdate(); return;
          }
          if (!grid && AppState.mode === 'scale' && typeof doubleStopPlayPad === 'function' && doubleStopPlayPad(gridRow, gridCol)) {
            _heldMidi = null;
          } else if (AppState.mode === 'input') { togglePlainNote(m); }
          else if (TastyState.enabled || StockState.enabled) {
            // TASTY/Stock mode: play note only, don't modify chord builder
            e.stopPropagation();
            _heldMidi = m; noteOn(m);
          } else {
            _heldMidi = m; noteOn(m);
          }
        });
        r.addEventListener('touchstart', (e) => {
          e.preventDefault();
          if (linkMode) {
            for (const t of e.changedTouches) { _heldTouches.set(t.identifier, m); }
            noteOn(m); midiActiveNotes.add(m); scheduleMidiUpdate(); return;
          }
          if (!grid && AppState.mode === 'scale' && typeof doubleStopPlayPad === 'function' && doubleStopPlayPad(gridRow, gridCol)) {
            // Double-stop playback is momentary through playMidiNotes.
          } else if (AppState.mode === 'input') { togglePlainNote(m); }
          else if (TastyState.enabled || StockState.enabled) {
            e.stopPropagation();
            for (const t of e.changedTouches) { _heldTouches.set(t.identifier, m); }
            noteOn(m);
          } else {
            for (const t of e.changedTouches) { _heldTouches.set(t.identifier, m); }
            noteOn(m);
          }
        });
      })(midi, rect, row, col);
      if (selMidi) {
        // Voicing box selected: no individual pad strokes (dashed box is the boundary)
        rect.setAttribute('stroke', 'none');
      } else if (basicPadSet || allPosScaleBg) {
        // Basic-form / all-positions: NO borders anywhere. The chord pads are solid colour and
        // the scale is the background; white brackets/frames must not appear.
        rect.setAttribute('stroke', 'none');
      } else if (isOmitted) {
        rect.setAttribute('stroke', 'rgba(255,255,255,0.2)');
        rect.setAttribute('stroke-width', 1); rect.setAttribute('stroke-dasharray', '4 2');
      } else {
        const hasStroke = isActive || isBass || isChar || isGuide || isOverlay;
        rect.setAttribute('stroke', hasStroke ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.05)');
        rect.setAttribute('stroke-width', hasStroke ? 1.5 : 0.5);
      }
      // Dim non-selected pads when a voicing box is selected (match by grid position, not MIDI)
      const isDimmed = selPos && !selPos.has(row + ',' + col);
      const isDimChordTone = isDimmed && (isActive || isRoot || isBass || isGuide);
      const isOverlayPad = isDimmed && overlayPCS && overlayPCS.has(pc) && !activePCS.has(pc);
      if (isDimmed) {
        if (isOverlayPad) {
          // Scale overlay pads: keep overlay color, slightly dimmed
          rect.setAttribute('opacity', '0.6');
        } else if (isDimChordTone) {
          // Chord tones outside voicing box = invisible (noise reduction)
          rect.setAttribute('fill', 'var(--bg)');
          rect.setAttribute('opacity', '0');
        } else {
          // Non-chord-tone pads = grid reference (like guitar inlays)
          rect.setAttribute('fill', 'var(--pad-off)');
          rect.setAttribute('opacity', '0.7');
        }
        rect.setAttribute('stroke', 'none');
      }
      // TASTY/STOCK mode: show only the actual voicing positions as hits.
      // Earlier versions left same-pitch-class duplicates as faint chord-tone ghosts; that made
      // Desktop disagree with Push, where Stock/Tasty are WYSIWYG pad positions.
      const isTastyActive = tastyMidiSet && tastyMidiSet.size > 0;
      if (isTastyActive && _isTastyMiss) {
        rect.setAttribute('stroke', 'none');
        if (!(basicPadSet || allPosScaleBg)) {
          rect.setAttribute('fill', 'var(--pad-off)');
          rect.setAttribute('opacity', '0.7');
        }
      } else if (isTastyActive) {
        rect.setAttribute('stroke', 'none');
      }
      // TASTY hit: highlight pad. Each MIDI note appears 1-2 times on the grid;
      // only highlight the LOWEST row occurrence (closest to bass = most natural fingering)
      const isTastyHit = isTastyActive && !_isTastyMiss;
      const isTastyTop = isTastyHit && tastyTopMidi !== null && midi === tastyTopMidi;
      if (isTastyHit) {
        rect.setAttribute('stroke', '#fff');
        rect.setAttribute('stroke-width', isTastyTop ? 3 : 1.5);
      }
      svg.appendChild(rect);

      // Perform one-position view: the playing voicing pads carry chord-degree labels
      // (R, 3, 5, 7, 9, 11, 13) so tensions read as tensions, not raw scale steps or note names.
      const _performVoicingLabel = (_performOnePos || _performSameNotes) && isPlainActive;
      // In Perform one-position view ONLY the playing voicing pads carry labels (鳴っている押さえだけ);
      // the PC-based isRoot/isBass/… clause is suppressed so stray labels don't appear on dark pads.
      const showDegree = rootPC !== null && (isEngineScaleBg || _performVoicingLabel || (!(_performOnePos || _performSameNotes) && !_isTastyMiss && (isTastyHit || isActive || isRoot || isBass || isOmitted || isChar || isGuide || isAvoid || isOverlay)));
      let degName = '';
      let voicingDegreeRaw = null;
      if (showDegree) {
        // Engine educational scale background: key-rooted scale degree (R, 2, 3, …) — same basis
        // as basic form, independent of any chord-rooted overlay selection.
        if (isEngineScaleBg) {
          var _sbRoot = typeof state.scaleBgRootPC === 'number'
            ? state.scaleBgRootPC
            : ((AppState.padCFixed === true) ? 0 : AppState.key);
          degName = SCALE_DEGREE_NAMES[((pc - _sbRoot) + 12) % 12];
        } else if (_performVoicingLabel) {
          // Always use chord-degree names for the playing voicing so a 9/11/13 reads as a
          // tension regardless of the underlying mode (input/scale). Pass the voicing's own
          // interval set as finalPCS so #9 (interval 3 + major 3rd present) reads as "#9".
          degName = chordDegreeName(interval, qualityPCS, _performIvPCS);
        } else if (tastyDegreeMap && tastyMidiSet && tastyMidiSet.has(midi) && tastyDegreeMap[midi]) {
          voicingDegreeRaw = tastyDegreeMap[midi];
          degName = displayDegreeLabel(voicingDegreeRaw, { qualityPCS: qualityPCS });
        } else if (isOverlay) {
          // Overlay notes use scale degree names (not chord degree names)
          degName = SCALE_DEGREE_NAMES[((pc - overlayDegreeRootPC) + 12) % 12];
        } else if (AppState.mode === 'scale') {
          degName = SCALE_DEGREE_NAMES[interval];
        } else {
          degName = chordDegreeName(interval, qualityPCS, activeIvPCS);
        }
        if (!tastyDegreeMap && (isTension || isAvoid) && AppState.mode === 'chord') {
          degName = '(' + degName + ')';
        }
      }

      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('class', 'pad-label');
      text.setAttribute('x', x + padSize / 2);
      text.setAttribute('y', showDegree ? y + padSize * 0.24 : y + padSize / 2 - 4);
      text.setAttribute('text-anchor', 'middle'); text.setAttribute('dominant-baseline', 'middle');
      text.setAttribute('fill', textColor);
      text.setAttribute('font-size', padSize < 50 ? '8px' : (showDegree ? '10px' : '9px'));
      text.setAttribute('font-weight', showDegree ? '600' : '400');
      text.textContent = voicingDegreeRaw
        ? formatVoicingNoteName(midi, voicingDegreeRaw, pcName(rootPC), { qualityPCS: qualityPCS })
        : pcName(pc);
      if (isDimmed) text.setAttribute('opacity', isDimChordTone ? '0' : (isOverlayPad ? '0.9' : '0.4'));
      if (isTastyActive && _isTastyMiss && !state.engineScaleBg) text.setAttribute('opacity', '0.05');
      svg.appendChild(text);

      if (showDegree) {
        const degText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        degText.setAttribute('class', 'pad-label');
        degText.setAttribute('x', x + padSize / 2);
        degText.setAttribute('y', y + padSize * 0.55);
        degText.setAttribute('text-anchor', 'middle'); degText.setAttribute('dominant-baseline', 'middle');
        degText.setAttribute('fill', textColor);
        degText.setAttribute('font-size', padSize < 50 ? '10px' : '13px'); degText.setAttribute('font-weight', '700');
        if (isOmitted) degText.setAttribute('text-decoration', 'line-through');
        degText.textContent = degName;
        if (isDimmed) degText.setAttribute('opacity', isDimChordTone ? '0' : (isOverlayPad ? '0.9' : '0.4'));
        svg.appendChild(degText);
        // TASTY top note: white border is the visual hint (text label removed — bar shows TOP info)
      }

      const octText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      octText.setAttribute('class', 'pad-label');
      octText.setAttribute('x', x + padSize / 2);
      octText.setAttribute('y', showDegree ? y + padSize * 0.82 : y + padSize / 2 + 12);
      octText.setAttribute('text-anchor', 'middle'); octText.setAttribute('dominant-baseline', 'middle');
      octText.setAttribute('fill', textColor);
      octText.setAttribute('font-size', padSize < 50 ? '6px' : '8px'); octText.setAttribute('opacity', isDimmed ? (isDimChordTone ? '0' : (isOverlayPad ? '0.7' : '0.3')) : '0.6');
      octText.textContent = noteName(midi);
      svg.appendChild(octText);
    }
  }
}

function renderVoicingBoxes(svg, state) {
  const { activePCS, rootPC, qualityPCS } = state;
  // TASTY/Stock mode: no voicing boxes (pad highlights via tastyMidiSet in render loop)
  if ((TastyState.enabled && TastyState.midiNotes.length > 0) ||
      (StockState.enabled && StockState.currentIndex >= 0)) {
    VoicingState.lastBoxes = [];
    return;
  }
  // Reset computed boxes (will be populated if any chord bounding boxes are drawn)
  const hasChordNotes = AppState.mode === 'chord' && activePCS instanceof Set && activePCS.size > 0;
  if (!hasChordNotes) {
    VoicingState.lastBoxes = [];
    if (VoicingState.selectedBoxIdx !== null) resetVoicingSelection();
  }

  // Shell voicing bounding boxes
  if (AppState.mode === 'chord' && VoicingState.shell && hasChordNotes) {
    const shellIntervals = getShellIntervals(qualityPCS, VoicingState.shell, 0, getBuilderPCS());
    if (shellIntervals) {
      let voiced = [...shellIntervals];
      let targetPC = rootPC;
      if (state.bassPC !== null) {
        voiced = applyOnChordBass(voiced, rootPC, state.bassPC);
        targetPC = state.bassPC;
      }
      const shellOffsets = voiced.map(v => v - voiced[0]);
      const maxRS = voiced.length <= 3 ? 4 : 5;
      const maxCS = voiced.length <= 3 ? 5 : 6;
      computeAndDrawVoicingBoxes(svg, shellOffsets, targetPC, '#fff', '#fff', maxRS, maxCS);
    }
  }

  // Inversion / Drop voicing bounding boxes
  if (AppState.mode === 'chord' && !VoicingState.shell && (VoicingState.inversion > 0 || VoicingState.drop) && activePCS.size > 0) {
    const chordPCS = getBuilderPCS();
    if (chordPCS && chordPCS.length >= 3) {
      let inv = Math.min(VoicingState.inversion, chordPCS.length - 1);
      if (state.bassPC !== null) {
        const bc = getBassCase(state.bassPC, rootPC, chordPCS);
        if (bc.isChordTone) inv = bc.inversionIndex;
      }
      const result = calcVoicingOffsets(chordPCS, inv, VoicingState.drop);
      let voiced = [...result.voiced];
      if (state.bassPC !== null) {
        voiced = applyOnChordBass(voiced, rootPC, state.bassPC);
      }
      const newOffsets = voiced.map(v => v - voiced[0]);
      const bassAbsPC = ((rootPC + voiced[0]) % 12 + 12) % 12;
      computeAndDrawVoicingBoxes(svg, newOffsets, bassAbsPC, '#fff', '#fff');
    }
  }

  // Basic chord bounding boxes (no shell/inversion/drop)
  if (AppState.mode === 'chord' && !VoicingState.shell && VoicingState.inversion === 0 && !VoicingState.drop && hasChordNotes) {
    const chordPCS = getBuilderPCS();
    if (chordPCS && chordPCS.length >= 3) {
      let voiced = [...chordPCS].sort((a, b) => a - b);
      let targetPC = rootPC;
      if (state.bassPC !== null) {
        const bc = getBassCase(state.bassPC, rootPC, chordPCS);
        if (bc.isChordTone) {
          for (let i = 0; i < bc.inversionIndex; i++) voiced.push(voiced.shift() + 12);
          voiced.sort((a, b) => a - b);
        } else {
          voiced = applyOnChordBass(voiced, rootPC, state.bassPC);
        }
        targetPC = state.bassPC;
      }
      const basicOffsets = voiced.map(v => v - voiced[0]);
      computeAndDrawVoicingBoxes(svg, basicOffsets, targetPC, '#fff', '#fff');
    }
  }
}

function renderInfoText(state) {
  const { activeLabel, rootPC } = state;
  const infoEl = document.getElementById('info-text');
  if (!infoEl) return;
  if (AppState.mode === 'scale') {
    const scale = SCALES[AppState.scaleIdx];
    const notes = scale.pcs.map(pc => pcName((pc + AppState.key) % 12));
    infoEl.textContent = activeLabel + ' (' + t('info.note_count', {n: scale.pcs.length}) + ') : ' + notes.join(' - ');
  } else {
    const pcs = getBuilderPCS();
    if (pcs) {
      const notes = pcs.map(pc => {
        const absPC = (pc + rootPC) % 12;
        const iv = pc % 12;
        if (BuilderState.quality) {
          const deg = chordDegreeName(iv, BuilderState.quality.pcs, null);
          if (deg.startsWith('b') || deg === 'm3') return NOTE_NAMES_FLAT[absPC];
          if (deg.startsWith('#') || deg.startsWith('△')) return NOTE_NAMES_SHARP[absPC];
        }
        return pcName(absPC);
      });
      let txt = activeLabel + ' (' + t('info.note_count', {n: pcs.length}) + ') : ' + notes.join(' - ');
      if (BuilderState.bass !== null) txt += ' / ' + pcName(BuilderState.bass, _chordContextKey());
      const mods = [];
      if (VoicingState.shell) {
        let shellLabel = 'Shell ' + VoicingState.shell.split('').join('-');
        mods.push(shellLabel);
      }
      if (VoicingState.rootless) mods.push('Rootless');
      if (!VoicingState.shell && VoicingState.omit5) mods.push('Omit5');
      if (VoicingState.omit3) mods.push('Omit3');
      if (!VoicingState.shell && VoicingState.inversion > 0) {
        const invNames = ['', '1st Inv', '2nd Inv', '3rd Inv'];
        mods.push(invNames[VoicingState.inversion]);
      }
      if (!VoicingState.shell && VoicingState.drop) {
        mods.push(VoicingState.drop === 'drop2' ? 'Drop 2' : 'Drop 3');
      }
      if (mods.length > 0) txt += ' [' + mods.join(', ') + ']';
      infoEl.textContent = txt;
    } else {
      infoEl.textContent = '';
    }
  }
}

function toggleColorCoding(checked) {
  // Settings opt-in. checked = show degree/characteristic colours.
  // Default (unchecked) = single colour to keep beginners' cognitive load low.
  AppState.colorOff = !checked;
  if (typeof saveAppSettings === 'function') saveAppSettings();
  render();
}

function toggleShowAllPositions(show) {
  // Chord mode display, the single source of truth (AppState.showAllPositions).
  // false (default) = one basic form only (where to press).
  // true = all grid positions of the chord tones (overview) + A/B/C/D voicing boxes.
  // Drives both the on-screen view and the Push chord overview / Swap button.
  show = show === true;
  AppState.showAllPositions = show;
  // Basic form must not carry a stale box selection (boxes only exist in all-positions mode).
  if (!show && typeof resetVoicingSelection === 'function') resetVoicingSelection();
  if (typeof updateVoicingButtons === 'function') updateVoicingButtons();
  var sapBtn = document.getElementById('btn-show-all-positions');
  if (sapBtn) sapBtn.classList.toggle('active', show);
  if (typeof saveAppSettings === 'function') saveAppSettings();
  render();
  if (typeof refreshLaunchpadLEDs === 'function') refreshLaunchpadLEDs();
  if (typeof window !== 'undefined' && typeof window._pushNotifyShowAllPositionsChanged === 'function') {
    window._pushNotifyShowAllPositionsChanged();
  }
}

function renderLegend(state) {
  const { charPCS, guide3PCS, guide7PCS, omittedPCS, tensionPCS, avoidPCS, overlayPCS } = state;
  const swatch = document.getElementById('legend-swatch');
  const ltxt = document.getElementById('legend-text');
  const legendChar = document.getElementById('legend-char');
  const legendGuide3 = document.getElementById('legend-guide3');
  const legendGuide7 = document.getElementById('legend-guide7');
  const legendTension = document.getElementById('legend-tension');
  const legendAvoid = document.getElementById('legend-avoid');
  const legendOverlay = document.getElementById('legend-overlay');
  const legendOmit = document.getElementById('legend-omit');
  const legendBasic = document.getElementById('legend-basic-wrap');
  const legendWrap = document.getElementById('legend-wrap');
  const legendRoot = document.getElementById('legend-root');
  // Basic-form: dedicated legend (chord = neutral, scale = blue, scale root = orange).
  if (typeof chordBasicFormActive === 'function' && chordBasicFormActive()) {
    if (legendBasic) legendBasic.style.display = '';
    if (legendWrap) legendWrap.style.display = 'none';
    return;
  }
  if (legendBasic) legendBasic.style.display = 'none';
  if (legendWrap) legendWrap.style.display = '';
  // Chord single-colour mode shows the chord as the neutral colour (no orange root); scale
  // mode and colour-coding keep the orange root item.
  if (legendRoot) legendRoot.style.display = (AppState.mode === 'chord' && AppState.colorOff) ? 'none' : '';
  if (AppState.colorOff) {
    // Single-color mode: chord = neutral colour (or scale = blue), plus Off.
    swatch.style.background = AppState.mode === 'scale' ? 'var(--pad-scale)' : 'var(--pad-basic-chord)';
    ltxt.textContent = AppState.mode === 'scale' ? t('legend.scale_note') : t('legend.chord_tone');
    legendChar.style.display = 'none';
    legendGuide3.style.display = 'none';
    legendGuide7.style.display = 'none';
    legendTension.style.display = 'none';
    legendAvoid.style.display = 'none';
    if (legendOverlay) legendOverlay.style.display = 'none';
    legendOmit.style.display = 'none';
    return;
  }
  if (AppState.mode === 'scale') {
    swatch.style.background = 'var(--pad-scale)'; ltxt.textContent = t('legend.scale_note');
    legendChar.style.display = charPCS.size > 0 ? '' : 'none';
    legendGuide3.style.display = 'none'; legendGuide7.style.display = 'none';
    legendTension.style.display = 'none';
    legendAvoid.style.display = 'none';
    if (legendOverlay) legendOverlay.style.display = 'none';
    legendOmit.style.display = 'none';
  } else {
    swatch.style.background = 'var(--pad-chord)'; ltxt.textContent = t('legend.chord_tone');
    legendChar.style.display = 'none';
    legendGuide3.style.display = guide3PCS.size > 0 ? '' : 'none';
    legendGuide7.style.display = guide7PCS.size > 0 ? '' : 'none';
    legendTension.style.display = tensionPCS.size > 0 ? '' : 'none';
    legendAvoid.style.display = avoidPCS.size > 0 ? '' : 'none';
    if (legendOverlay) legendOverlay.style.display = overlayPCS ? '' : 'none';
    legendOmit.style.display = omittedPCS.size > 0 ? '' : 'none';
  }
}

// Chord-mode "basic form" default: show one playable shape (root register C2-C3 =
// builder chord at rootMidi 48+rootPC, with the current inversion/drop/omit applied),
// computed every render WITHOUT the voicing-box mechanism so that transpose/inversion/
// octave never enter the box position-preservation path (this is what avoids #13).
// AppState.showAllPositions = true reverts to the all-positions overview + A/B/C/D boxes.
function chordBasicFormActive() {
  // padCFixed is intentionally NOT a gate: in HPS the pad surface IS C-Major-fixed +
  // 4th-chromatic (the fixed "instrument", like a bass fretboard). Basic form = the one
  // shape to press for this chord; it lives ON that fixed surface, so the two coexist.
  return AppState.mode === 'chord'
    && !AppState.showAllPositions
    && memoryViewMode !== 'perform'  // Perform view has its own one-position / all-positions render (never the chord grey basic-form shape)
    && BuilderState.root !== null && BuilderState.quality
    && !TastyState.enabled && !StockState.enabled
    && !(typeof isGuitarEngineActive === 'function' && isGuitarEngineActive())
    && !(_voicingReflectMode && _guitarSyncSource === 'position')
    && !_stockReflectMode
    && !_instrumentMidiSet && !_instrumentPadSet  // instrument-input WYSIWYG filter active → defer to it
    && padExtNotes.size === 0                       // pad-clicked notes not yet folded into builder → show all
    && VoicingState.selectedBoxIdx === null;
}

// Basic-form "1/3" badge: shows how many same-register arrangements exist and which one is
// shown. Clickable (cycles to the next) so it works without remembering the Space shortcut.
// No white border (avoids the white-bracket look) — a dark pill with light text.
function drawBasicFormBadge(svg, positions, current, total, onCycle) {
  if (!positions || !positions.length) return;
  var NS = 'http://www.w3.org/2000/svg';
  // Basic form: anchor the count badge on the LOWEST note (bass) pad — that pad is
  // the chord's anchor, so it's the lowest-cognitive-load place to look.
  var bm = baseMidi();
  var best = positions[0];
  var bestMidi = bm + best.row * ROW_INTERVAL + best.col;
  positions.forEach(function(p){
    var m = bm + p.row * ROW_INTERVAL + p.col;
    if (m < bestMidi) { bestMidi = m; best = p; }
  });
  var px = MARGIN + best.col * (PAD_SIZE + PAD_GAP);
  var py = MARGIN + (ROWS - 1 - best.row) * (PAD_SIZE + PAD_GAP);
  // Small corner badge: top-right of the shape's top-right pad, clear of the
  // centered note name (note name reaches ~x+37 worst case; badge starts ~x+41).
  var label = current + '/' + total;
  var bw = Math.max(18, label.length * 4 + 8), bh = 13;
  var bx = px + PAD_SIZE - bw - 2, by = py + 2;
  var g = document.createElementNS(NS, 'g');
  g.setAttribute('class', 'basic-form-badge');
  g.style.cursor = 'pointer';
  var r = document.createElementNS(NS, 'rect');
  r.setAttribute('x', bx); r.setAttribute('y', by); r.setAttribute('width', bw); r.setAttribute('height', bh);
  r.setAttribute('rx', 6); r.setAttribute('fill', 'rgba(15,15,15,0.88)');
  var t = document.createElementNS(NS, 'text');
  t.setAttribute('x', bx + bw / 2); t.setAttribute('y', by + bh / 2 + 0.5);
  t.setAttribute('text-anchor', 'middle'); t.setAttribute('dominant-baseline', 'middle');
  t.setAttribute('font-size', '8px'); t.setAttribute('font-weight', '700'); t.setAttribute('fill', '#fff');
  t.textContent = current + '/' + total;
  g.appendChild(r); g.appendChild(t);
  g.addEventListener('click', function(e){
    e.stopPropagation();
    var _fn = (typeof onCycle === 'function') ? onCycle : cycleBasicFormPosition;
    if (typeof _fn === 'function') _fn();
  });
  svg.appendChild(g);
}

// Perform one-position badge cycle: advance to the next compact arrangement of the SAME recorded
// pitches and re-render. DISPLAY ONLY — unlike cycleBasicFormPosition this never calls
// playMidiNotes, so the recorded playback is left exactly as it is (録音した音のまま再生は絶対).
function cyclePerformOnePos() {
  var arr = computePerformOnePosArrangements();
  if (arr.length <= 1) return false;
  PerformState.onePosIdx = ((PerformState.onePosIdx || 0) + 1) % arr.length;
  render();  // re-layout only; playback untouched
  return true;
}

function computePerformRegisterOctave() {
  if (!PlainState.activeNotes || PlainState.activeNotes.size === 0) return 0;
  var notes = Array.from(PlainState.activeNotes);
  var minNote = Math.min.apply(null, notes);
  var maxNote = Math.max.apply(null, notes);
  var gridLo = baseMidi();
  var gridHi = baseMidi() + (ROWS - 1) * ROW_INTERVAL + (COLS - 1);
  var bestOct = 0;
  var bestScore = Infinity;
  for (var oct = -4; oct <= 4; oct++) {
    var lo = minNote + oct * 12;
    var hi = maxNote + oct * 12;
    var overflow = Math.max(0, gridLo - lo) + Math.max(0, hi - gridHi);
    var registerDistance = Math.abs(oct);
    var score = overflow * 1000 + registerDistance;
    if (score < bestScore) {
      bestScore = score;
      bestOct = oct;
    }
  }
  return bestOct;
}

function computePerformOnePosArrangements() {
  if (!PlainState.activeNotes || PlainState.activeNotes.size === 0) return [];
  var oct = computePerformRegisterOctave();
  var notes = Array.from(PlainState.activeNotes).map(function(n) {
    return n + oct * 12;
  }).sort(function(a, b) { return a - b; });
  var bass = notes[0];
  var offsets = notes.map(function(n) { return n - bass; });
  var bm = baseMidi();
  var bassPositions = [];
  for (var r = 0; r < ROWS; r++) {
    var c = bass - bm - r * ROW_INTERVAL;
    if (c >= 0 && c < COLS) bassPositions.push({ row: r, col: c });
  }
  var all = [];
  bassPositions.forEach(function(bp) {
    var arr = calcAllVoicingPositions(bp.row, bp.col, offsets);
    if (arr) arr.forEach(function(vp) { all.push(vp); });
  });
  var seen = {}, uniq = [];
  all.forEach(function(vp) {
    var key = vp.positions.map(function(p) { return p.row + ',' + p.col; }).sort().join('|');
    if (!seen[key]) { seen[key] = 1; uniq.push(vp); }
  });
  uniq.sort(function(a, b) { return a.maxDim - b.maxDim || a.area - b.area; });
  return uniq;
}

function applyPerformPlayedChordState(state) {
  if (!PlainState.activeNotes || PlainState.activeNotes.size === 0) return;
  var notes = Array.from(PlainState.activeNotes).sort(function(a, b) { return a - b; });
  var candidates = (typeof detectChord === 'function') ? detectChord(notes) : [];
  if (!candidates || candidates.length === 0) return;
  var root = candidates[0].rootPC;
  state.rootPC = root;
  state.activePCS = new Set(notes.map(function(n) { return n % 12; }));
  state.activeIvPCS = new Set(notes.map(function(n) { return ((n % 12) - root + 12) % 12; }));
  state.bassPC = null;
  state.omittedPCS = new Set();
  state.guide3PCS = new Set();
  state.guide7PCS = new Set();
  state.tensionPCS = new Set();
  state.avoidPCS = new Set();
  state.overlayPCS = null;
  state.tastyMidiSet = null;
  state.tastyDegreeMap = null;
  state.tastyTopMidi = null;
  state.tastyPadPositions = null;
  if (BuilderState.quality && BuilderState.quality.pcs) {
    state.qualityPCS = BuilderState.quality.pcs;
  }
}

function render() {
  const svg = document.getElementById('pad-grid');
  const totalW = COLS * (PAD_SIZE + PAD_GAP) - PAD_GAP + MARGIN * 2;
  const totalH = ROWS * (PAD_SIZE + PAD_GAP) - PAD_GAP + MARGIN * 2;
  svg.setAttribute('viewBox', '0 0 ' + totalW + ' ' + totalH);
  if (_isMobile || _isLandscape) {
    svg.removeAttribute('width');
    svg.removeAttribute('height');
  } else {
    svg.setAttribute('width', totalW);
    svg.setAttribute('height', totalH);
  }
  svg.innerHTML = '';

  // Compute parent scale selection BEFORE renderState (sets _selectedPS for overlay)
  renderDiatonicBar();
  renderParentScales();

  // Guitar/bass positioning BEFORE pads so voicing reflect can filter pad display
  if (typeof updateGuitarPositions === 'function') updateGuitarPositions();
  if (typeof updateBassPositions === 'function') updateBassPositions();

  // Voicing reflect: auto-positioned guitar voicing → deduped pad positions (WYSIWYG)
  if (_voicingReflectMode && _guitarSyncSource === 'position') {
    var reflectNotes = (typeof getGuitarEngineMidiNotes === 'function') ? getGuitarEngineMidiNotes() : [];
    if (reflectNotes.length >= 2) {
      _instrumentMidiSet = new Set(reflectNotes);
      var layout = _computeVoicingPadPositions(_instrumentMidiSet);
      _instrumentPadSet = layout.padSet;
      _voicingDualCount = layout.dualCount;
      _voicingLayoutCount = layout.layoutCount;
      var vrBtn = document.getElementById('voicing-reflect-btn');
      if (vrBtn) {
        vrBtn.innerHTML = '<span class="kbd-hint">V</span>' + (_voicingLayoutCount > 1
          ? t('pos.to_pad') + ' ' + (_voicingAltMode + 1) + '/' + _voicingLayoutCount
          : t('pos.to_pad'));
      }
    }
  }

  // Stock voicing reflect: Stock MIDI → deduped pad positions
  if (_stockReflectMode && StockState.enabled && StockState.currentIndex >= 0) {
    var stockNotes = StockState.lhMidi.concat(StockState.rhMidi);
    if (stockNotes.length >= 2) {
      _instrumentMidiSet = new Set(stockNotes);
      var layout = _computeVoicingPadPositions(_instrumentMidiSet);
      _instrumentPadSet = layout.padSet;
      _voicingDualCount = layout.dualCount;
      _voicingLayoutCount = layout.layoutCount;
      ['stock-reflect-btn', 'chord-engine-to-pad'].forEach(function(id) {
        var srBtn = document.getElementById(id);
        if (!srBtn) return;
        srBtn.innerHTML = _voicingLayoutCount > 1
          ? t('pos.to_pad') + ' ' + (_voicingAltMode + 1) + '/' + _voicingLayoutCount
          : t('pos.to_pad');
      });
    }
  }

  const state = computeRenderState();
  // C-fixed mode (Pad OS): pad/LED だけ C Major に固定する別 state を作る。
  // 他 UI（staff/guitar/bass/piano/circle/legend/info）は通常の state を使う。
  // Codex P1 fix 2026-04-14.
  const padState = (typeof padApplyPadOverride === 'function') ? padApplyPadOverride(state) : state;
  if (memoryViewMode === 'perform' && PlainState.activeNotes.size > 0) {
    applyPerformPlayedChordState(padState);
  } else if (memoryViewMode === 'perform') {
    padState.activePCS = new Set();
    padState.activeIvPCS = null;
    padState.rootPC = null;
    padState.bassPC = null;
    padState.omittedPCS = new Set();
    padState.guide3PCS = new Set();
    padState.guide7PCS = new Set();
    padState.tensionPCS = new Set();
    padState.avoidPCS = new Set();
    padState.charPCS = new Set();
    padState.overlayPCS = null;
    padState.overlayCharPCS = new Set();
    padState.tastyMidiSet = null;
    padState.tastyDegreeMap = null;
    padState.tastyTopMidi = null;
    padState.tastyPadPositions = null;
  }
  // Input/Perform are direct note displays, not engine voicing displays. A previously enabled
  // TASTY/STOCK/Guitar render state must not leak green/pink/tension colours into these views.
  if (AppState.mode === 'input' || memoryViewMode === 'perform') {
    padState.tastyMidiSet = null;
    padState.tastyDegreeMap = null;
    padState.tastyTopMidi = null;
    padState.tastyPadPositions = null;
  }
  // Basic-form default: compute the one shape's pad positions and dim the rest.
  // No voicing box is touched, so transpose/inversion just recompute this set (no #13).
  if (chordBasicFormActive()) {
    VoicingState.lastBoxes = [];
    var _bfBase = getCurrentChordMidiNotes();
    if (_bfBase && _bfBase.length > 0) {
      var _gLo = baseMidi(), _gHi = baseMidi() + (ROWS - 1) * ROW_INTERVAL + (COLS - 1);
      // Clamp the Shift+Up/Down octave offset so the shape always stays on the grid
      // (a chord change or octave-range change may otherwise push it off-screen).
      var _off = VoicingState.basicOctave || 0;
      while (_off > 0 && Math.max.apply(null, _bfBase.map(function(n){ return n + _off * 12; })) > _gHi) _off--;
      while (_off < 0 && Math.min.apply(null, _bfBase.map(function(n){ return n + _off * 12; })) < _gLo) _off++;
      VoicingState.basicOctave = _off;
      // Same-register pad arrangements of the chord; [0] = basic form, others = "other positions".
      var _arr = (typeof basicFormArrangements === 'function') ? basicFormArrangements() : [];
      if (_arr.length > 0) {
        var _idx = VoicingState.basicPosIdx || 0;
        if (_idx >= _arr.length) _idx = 0;
        VoicingState.basicPosIdx = _idx;
        var _chosen = _arr[_idx];
        // Layering: the current key's scale is drawn faint (readable) in the background; the
        // chord's one arrangement is drawn on top in a single solid colour.
        padState.basicFormPadSet = new Set(_chosen.positions.map(function(p){ return p.row * COLS + p.col; }));
        // Under C-fixed the background scale stays C Major regardless of key (same rule as
        // padApplyScaleOnlyOverride): the fixed instrument surface never moves.
        var _bfCFixed = AppState.padCFixed === true;
        var _sc = SCALES[_bfCFixed ? 0 : AppState.scaleIdx];
        var _bfKey = _bfCFixed ? 0 : AppState.key;
        padState.scaleBgPCS = new Set(_sc.pcs.map(function(iv){ return (iv + _bfKey) % 12; }));
        padState.scaleBgRootPC = _bfKey;
        // "1/3" badge data (replaces the blink): same-register arrangement count + current index.
        padState.basicFormShapePositions = _chosen.positions;
        padState.basicFormArrCount = _arr.length;
        padState.basicFormPosIdx = _idx;
      }
    }
  }
  // All-positions view (showAllPositions, no box selected): draw the scale as the background
  // (blue + orange tonic) behind the grey chord positions — same colour language as basic form.
  if (AppState.mode === 'chord' && AppState.showAllPositions && VoicingState.selectedBoxIdx === null
      && !TastyState.enabled && !StockState.enabled
      && !(_voicingReflectMode && _guitarSyncSource === 'position') && !_stockReflectMode) {
    var _scAllPos = SCALES[AppState.scaleIdx];
    padState.scaleBgPCS = new Set(_scAllPos.pcs.map(function(iv){ return (iv + AppState.key) % 12; }));
    padState.scaleBgRootPC = AppState.key;
    padState.allPosScaleBg = true;
  }
  // Engine modes (TASTY / STOCK / Guitar): paint the scale as the educational background behind
  // the engine's voicing pads too, so the chord↔scale relationship stays visible — same colour
  // language and layering as basic form / all-positions, and matching the Push pad display.
  // C-fixed keeps the background C Major (same rule as basic form). うりなみさん 2026-05-30:
  // 教育目的でエンジン (TASTY/STOCK/GUITAR) 動作中も本体にスケールを点灯させたい。
  if (AppState.mode === 'chord' && !padState.scaleBgPCS
      && (TastyState.enabled || StockState.enabled
          || (typeof isGuitarEngineActive === 'function' && isGuitarEngineActive()))) {
    var _eCFixed = AppState.padCFixed === true;
    var _scEng = SCALES[_eCFixed ? 0 : AppState.scaleIdx];
    var _eKey = _eCFixed ? 0 : AppState.key;
    padState.scaleBgPCS = new Set(_scEng.pcs.map(function(iv){ return (iv + _eKey) % 12; }));
    padState.scaleBgRootPC = _eKey;
    padState.allPosScaleBg = true;
    padState.engineScaleBg = true;
  }
  // Input mode: paint the current key's scale as the educational background (same colour
  // language and layering as Scale / Chord all-positions) so free chord building happens
  // against a visible scale. C-fixed keeps it C Major, matching Scale mode
  // (padApplyScaleOnlyOverride). うりなみさん 2026-05-31: input の画面も Scale/Chord のように
  // Scale を表示する。pressed pads (isPlainActive) はコード色のまま、それ以外にスケールを敷く。
  if (AppState.mode === 'input' && memoryViewMode !== 'perform') {
    // 無条件上書きで安全。pad-core の input 分岐 (pad-core/render.js の input branch)
    // は scaleBgPCS を返さないため、先行値を尊重する !padState.scaleBgPCS ガードは不要。
    // pad-core が将来 input で scaleBgPCS を返すようになったら、このガード前提を見直すこと。
    // memoryViewMode === 'perform' は除外: Perform view は下の perform ブロックで
    // performAllPositions に応じてスケール背景を制御する (input mode が穴埋めしてはいけない)。
    var _inCFixed = AppState.padCFixed === true;
    var _scIn = SCALES[_inCFixed ? 0 : AppState.scaleIdx];
    var _inKey = _inCFixed ? 0 : AppState.key;
    padState.scaleBgPCS = new Set(_scIn.pcs.map(function(iv){ return (iv + _inKey) % 12; }));
    padState.scaleBgRootPC = _inKey;
    padState.allPosScaleBg = true;
  }
  // Perform view: the scale surface is always visible, even before a slot is triggered.
  // This keeps the screen calm and educational: the grid always shows the current scale context,
  // and the played/selected memory voicing is drawn on top when present.
  if (memoryViewMode === 'perform') {
    var _pfScaleCFixed = AppState.padCFixed === true;
    var _pfScale = SCALES[_pfScaleCFixed ? 0 : AppState.scaleIdx];
    var _pfScaleKey = _pfScaleCFixed ? 0 : AppState.key;
    padState.scaleBgPCS = new Set(_pfScale.pcs.map(function(iv){ return (iv + _pfScaleKey) % 12; }));
    padState.scaleBgRootPC = _pfScaleKey;
    padState.allPosScaleBg = true;
  }
  // Perform view DISPLAY (audio is never touched — perform.js plays slot.midiNotes verbatim):
  //  • default (one position / 同一音を表示 OFF): COLLAPSE the playing voicing's actual pitches to
  //    ONE compact pad arrangement, drawn exactly like the chord basic form (grey single shape +
  //    blue/orange scale background + degree/tension labels + "1/N" badge). The arrangement is
  //    computed directly from PlainState.activeNotes, so the saved slot register is kept — only
  //    the LAYOUT collapses to one position. うりなみさん 2026-05-31: なっている音を鳴らしつつ、
  //    表示だけ1ポジション(教育用)。
  //  • same notes (performAllPositions === true): show ONLY the exact recorded MIDI pitches in
  //    grey over the same blue/orange educational scale background. No octave copies, no green.
  // Runs LAST so it wins over any basic-form state above (chordBasicFormActive is gated off here).
  var _performOnePosState = (memoryViewMode === 'perform' && AppState.performAllPositions !== true);
  if (_performOnePosState && PlainState.activeNotes.size > 0) {
    // Arrange the recorded pitches directly. Do not call basicFormArrangements() here: in Chord /
    // Scale mode it reads BuilderState and can normalize away the saved slot register.
    var _pfArr = computePerformOnePosArrangements();
    if (_pfArr.length > 0) {
      var _pfIdx = PerformState.onePosIdx || 0;
      if (_pfIdx >= _pfArr.length) _pfIdx = 0;
      PerformState.onePosIdx = _pfIdx;
      var _pfChosen = _pfArr[_pfIdx];
      padState.basicFormPadSet = new Set(_pfChosen.positions.map(function(p){ return p.row * COLS + p.col; }));
      var _pfCF = AppState.padCFixed === true;
      var _pfScOne = SCALES[_pfCF ? 0 : AppState.scaleIdx];
      var _pfKeyOne = _pfCF ? 0 : AppState.key;
      padState.scaleBgPCS = new Set(_pfScOne.pcs.map(function(iv){ return (iv + _pfKeyOne) % 12; }));
      padState.scaleBgRootPC = _pfKeyOne;
      padState.basicFormShapePositions = _pfChosen.positions;
      padState.basicFormArrCount = _pfArr.length;
      padState.basicFormPosIdx = _pfIdx;
    }
  } else if (memoryViewMode === 'perform' && AppState.performAllPositions === true && PlainState.activeNotes.size > 0) {
    var _pfCFixed = AppState.padCFixed === true;
    var _scPf = SCALES[_pfCFixed ? 0 : AppState.scaleIdx];
    var _pfKey = _pfCFixed ? 0 : AppState.key;
    padState.scaleBgPCS = new Set(_scPf.pcs.map(function(iv){ return (iv + _pfKey) % 12; }));
    padState.scaleBgRootPC = _pfKey;
    padState.allPosScaleBg = true;
  }
  // Available Scale selection: show the chosen chord-scale surface and label its degrees from
  // the chord root. This keeps the view aligned with chord-scale theory (e.g. E Locrian = E:R).
  if (AppState.mode === 'chord' && AppState.showParentScales && _selectedPS && padState.overlayPCS) {
    padState.scaleBgPCS = new Set(padState.overlayPCS);
    padState.scaleBgRootPC = BuilderState.root;
    padState.allPosScaleBg = true;
  }
  if (AppState.mode === 'scale' && typeof doubleStopActive === 'function' && doubleStopActive()) {
    var _dsLayout = doubleStopComputeLayout();
    padState.doubleStopPadSet = _dsLayout.allPadIdxs;
    padState.doubleStopPairs = _dsLayout.pairs;
    padState.doubleStopAltCount = _dsLayout.altCount;
    padState.doubleStopBadgePositions = _dsLayout.badgePositions;
  }
  renderPads(svg, padState);
  if (AppState.mode !== 'input' && memoryViewMode !== 'perform' && !TastyState.enabled && !StockState.enabled && !(_voicingReflectMode && _guitarSyncSource === 'position') && !_stockReflectMode && !chordBasicFormActive()) {
    renderVoicingBoxes(svg, state);
  }
  // Basic-form "other positions exist" cue: a clickable "current/total" badge (no blink).
  // Chord mode cycles via cycleBasicFormPosition (which replays the shape). Perform view uses a
  // DISPLAY-ONLY cycle (cyclePerformOnePos) that re-lays-out the same recorded pitches without
  // ever replaying — the recorded playback is left exactly as-is.
  if ((chordBasicFormActive() || _performOnePosState) && padState.basicFormArrCount > 1 && padState.basicFormShapePositions) {
    drawBasicFormBadge(svg, padState.basicFormShapePositions, (padState.basicFormPosIdx || 0) + 1, padState.basicFormArrCount,
      _performOnePosState ? cyclePerformOnePos : null);
  }
  if (AppState.mode === 'scale' && padState.doubleStopAltCount > 1 && padState.doubleStopBadgePositions) {
    drawBasicFormBadge(svg, padState.doubleStopBadgePositions, (DoubleStopState.posIndex || 0) + 1, padState.doubleStopAltCount,
      typeof cycleDoubleStopPosition === 'function' ? cycleDoubleStopPosition : null);
  }
  renderLegend(state);

  // 全ポジション表示 button (now in the pad footer): a chord-mode display toggle, so hide it
  // outside chord mode where all-positions has no effect.
  var _sapBtn = document.getElementById('btn-show-all-positions');
  if (_sapBtn) _sapBtn.style.display = (AppState.mode === 'chord') ? '' : 'none';
  if (typeof renderDoubleStopControls === 'function') renderDoubleStopControls();

  // Staff notation
  if (AppState.mode === 'input') {
    // Plain mode: show selected notes on staff
    const plainNotes = [...PlainState.activeNotes].sort((a, b) => a - b);
    renderStaff('input', state.rootPC, state.activePCS, state.omittedPCS, null, plainNotes.length > 0 ? plainNotes : [], null);
  } else {
    let boxMidi = (VoicingState.selectedBoxIdx !== null && VoicingState.lastBoxes[VoicingState.selectedBoxIdx])
      ? VoicingState.lastBoxes[VoicingState.selectedBoxIdx].midiNotes : null;
    // TASTY voicing: show voicing notes on staff
    if (state.tastyMidiSet && state.tastyMidiSet.size > 0) {
      boxMidi = TastyState.midiNotes;
    }
    if (typeof isGuitarEngineActive === 'function' && isGuitarEngineActive() &&
        typeof getGuitarEngineMidiNotes === 'function') {
      boxMidi = getGuitarEngineMidiNotes();
    }
    renderStaff(AppState.mode, state.rootPC, state.activePCS, state.omittedPCS, state.qualityPCS, boxMidi, state.bassPC, state.activeIvPCS);
  }

  // Instrument diagrams (guitar + bass + piano)
  lastRenderRootPC = state.rootPC;
  lastRenderActivePCS = new Set(state.activePCS);
  lastRenderState = state;
  // Guitar/bass positions already computed above (before renderPads)
  renderGuitarDiagram(state.rootPC, state.activePCS, state.bassPC, state.overlayPCS, state.overlayCharPCS, state);
  renderBassDiagram(state.rootPC, state.activePCS, state.bassPC, state.overlayPCS, state.overlayCharPCS, state);
  renderPianoDisplay(state);
  renderCircle();

  // Re-apply instrument highlights after SVG rebuild
  if (instrumentInputActive && !(typeof isGuitarEngineActive === 'function' && isGuitarEngineActive())) {
    highlightInstrumentPads(getAllInputMidiNotes());
  }

  // Re-render 32-pad if in landscape mode
  if (_isLandscape) { syncPlayControls(); renderPad32(); syncPlayChordName(); syncPlayMode(); }

  // Auto-save to selected slot (Chord/Scale mode)
  if (PlainState.currentSlot !== null && (AppState.mode === 'chord' || AppState.mode === 'scale')) {
    const midiNotes = getCurrentChordMidiNotes();
    if (midiNotes && midiNotes.length > 0) {
      const key = midiNotes.join(',');
      const slot = PlainState.memory[PlainState.currentSlot];
      if (!slot || slot.midiNotes.join(',') !== key) {
        const chordName = getCurrentChordName();
        const voicingMeta = typeof getCurrentVoicingMeta === 'function' ? getCurrentVoicingMeta() : null;
        PlainState.memory[PlainState.currentSlot] = makeMemorySlot(midiNotes, chordName, voicingMeta);
        updateMemorySlotUI();
      }
    }
  }
  _syncOverlayHighlight();

  // Launchpad/PUSH LED update: always show current scale only
  // (urinami 2026-04-14: PUSH は楽器なので scale のみ、chord/tasty/builder は出さない).
  // C-fixed mode はさらに C Major に固定する。
  if (typeof updateLaunchpadLEDs === 'function') {
    var ledState = (typeof padApplyScaleOnlyOverride === 'function')
      ? padApplyScaleOnlyOverride(state, AppState.key, AppState.scaleIdx, AppState.padCFixed === true)
      : state;
    updateLaunchpadLEDs(ledState);
  }
}
