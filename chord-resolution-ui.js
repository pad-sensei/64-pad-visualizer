(function(global) {
  'use strict';

  function padWebSortedUniquePitchClasses(values) {
    var seen = {};
    var out = [];
    (values || []).forEach(function(value) {
      var pc = ((Number(value) % 12) + 12) % 12;
      if (!seen[pc]) {
        seen[pc] = true;
        out.push(pc);
      }
    });
    return out.sort(function(a, b) { return a - b; });
  }

  function padWebPitchClassSetsEqual(a, b) {
    var left = padWebSortedUniquePitchClasses(a);
    var right = padWebSortedUniquePitchClasses(b);
    if (left.length !== right.length) return false;
    for (var i = 0; i < left.length; i++) {
      if (left[i] !== right[i]) return false;
    }
    return true;
  }

  function padWebCandidateIsFullExact(candidate) {
    if (!candidate || candidate.resolutionCompleteness !== 'exact') return false;
    if (/\(omit/i.test(String(candidate.name || ''))) return false;
    var cardinality = Number(candidate.resolutionChordCardinality);
    return Number.isFinite(cardinality)
      && cardinality > 0
      && Array.isArray(candidate.resolutionExplainedPCS)
      && candidate.resolutionExplainedPCS.length > 0;
  }

  function padWebCandidatesAreEquivalentAliases(primary, candidate) {
    if (!padWebCandidateIsFullExact(primary) || !padWebCandidateIsFullExact(candidate)) return false;
    if (Number(primary.resolutionChordCardinality) !== Number(candidate.resolutionChordCardinality)) return false;
    return padWebPitchClassSetsEqual(
      primary.resolutionExplainedPCS || [],
      candidate.resolutionExplainedPCS || []
    );
  }

  function padWebGetTopResolvedCandidates(candidates) {
    if (!Array.isArray(candidates) || candidates.length === 0) return [];
    var tied = candidates.filter(function(candidate) {
      return candidate && candidate.isTopRanked === true;
    });
    return tied.length > 0 ? tied : [candidates[0]];
  }

  function padWebGetPrimaryExactAliasEntries(candidates) {
    if (!Array.isArray(candidates) || candidates.length === 0) return [];
    var primary = candidates[0];
    if (!padWebCandidateIsFullExact(primary)) return [];

    var entries = [];
    for (var i = 0; i < candidates.length; i++) {
      if (padWebCandidatesAreEquivalentAliases(primary, candidates[i])) {
        entries.push({ candidate: candidates[i], index: i });
      }
    }
    return entries;
  }

  function padWebTopResolvedGroupIsEquivalent(candidates) {
    return padWebGetPrimaryExactAliasEntries(candidates).length >= 2;
  }

  function padWebGetResolvedPresentation(candidates) {
    if (!Array.isArray(candidates) || candidates.length === 0) {
      return { entries: [], equivalent: false, separator: ' · ' };
    }

    var aliases = padWebGetPrimaryExactAliasEntries(candidates);
    if (aliases.length >= 2) {
      return { entries: aliases, equivalent: true, separator: ' = ' };
    }

    var top = padWebGetTopResolvedCandidates(candidates);
    return {
      entries: top.map(function(candidate) {
        return { candidate: candidate, index: candidates.indexOf(candidate) };
      }),
      equivalent: false,
      separator: ' · '
    };
  }

  function padWebGetNeutralTopEntries(candidates, presentation) {
    if (!presentation || !presentation.equivalent || !Array.isArray(candidates)) return [];
    var aliasIndexSet = {};
    presentation.entries.forEach(function(entry) { aliasIndexSet[entry.index] = true; });
    return padWebGetTopResolvedCandidates(candidates).map(function(candidate) {
      return { candidate: candidate, index: candidates.indexOf(candidate) };
    }).filter(function(entry) {
      return entry.index >= 0 && !aliasIndexSet[entry.index];
    });
  }

  function padWebGetTopResolvedSeparator(candidates) {
    return padWebGetResolvedPresentation(candidates).separator;
  }

  function padWebFormatTopResolvedChordText(candidates) {
    var presentation = padWebGetResolvedPresentation(candidates);
    var text = presentation.entries
      .map(function(entry) { return entry.candidate && entry.candidate.name || ''; })
      .filter(Boolean)
      .join(presentation.separator);

    if (!presentation.equivalent) return text;

    var neutralNames = padWebGetNeutralTopEntries(candidates, presentation)
      .map(function(entry) { return entry.candidate && entry.candidate.name || ''; })
      .filter(Boolean);
    if (neutralNames.length > 0) {
      text += (text ? ' · ' : '') + neutralNames.join(' · ');
    }
    return text;
  }

  function padWebCurrentDetectedCandidates() {
    try {
      if (typeof lastDetectedCandidates !== 'undefined' && Array.isArray(lastDetectedCandidates)) {
        return lastDetectedCandidates;
      }
    } catch (e) {}
    return [];
  }

  function padWebCurrentCandidatesFromApp() {
    var current = padWebCurrentDetectedCandidates();
    if (current.length > 0) return current;
    // plain.js defines getCurrentChordMidiNotes() as a classic-script global.
    // This is a real fallback for states where no lastDetectedCandidates snapshot
    // exists yet; it is not the demonstrated cause of the prior live-render miss.
    try {
      if (typeof global.getCurrentChordMidiNotes === 'function' && typeof global.detectChord === 'function') {
        var notes = global.getCurrentChordMidiNotes();
        if (Array.isArray(notes) && notes.length > 0) {
          var detected = global.detectChord(notes);
          if (Array.isArray(detected)) return detected;
        }
      }
    } catch (e) {}
    return [];
  }

  function padWebMakeAliasSeparator(text) {
    var span = document.createElement('span');
    span.className = 'detect-alias-separator';
    span.setAttribute('aria-hidden', 'true');
    span.textContent = text;
    return span;
  }

  // Keep resolver order and original candidate indexes. This decorator only
  // re-groups already-rendered exact aliases; score/rank metadata is untouched.
  function padWebDecorateAliasEquation(root, candidates) {
    if (typeof document === 'undefined' || !root) return;
    var presentation = padWebGetResolvedPresentation(candidates);
    if (!presentation.equivalent || presentation.entries.length < 2) return;

    var topGroup = root.querySelector('.detect-top-group');
    if (!topGroup) return;

    var desired = presentation.entries.slice();
    padWebGetNeutralTopEntries(candidates, presentation).forEach(function(entry) {
      desired.push({ candidate: entry.candidate, index: entry.index, neutralTop: true });
    });

    var nodes = [];
    desired.forEach(function(entry, position) {
      var node = root.querySelector('[data-candidate-idx="' + entry.index + '"]');
      if (!node) return;
      if (position > 0) {
        var previous = desired[position - 1];
        var separator = (!entry.neutralTop && !previous.neutralTop) ? '=' : '·';
        nodes.push(padWebMakeAliasSeparator(separator));
      }
      node.classList.remove('detect-candidate');
      node.classList.add('detect-candidate-best');
      nodes.push(node);
    });

    if (nodes.length > 0) topGroup.replaceChildren.apply(topGroup, nodes);
  }

  function padWebDecorateCurrentDetection() {
    if (typeof document === 'undefined') return;
    var root = document.getElementById('midi-detect');
    if (!root) return;
    padWebDecorateAliasEquation(root, padWebCurrentCandidatesFromApp());
  }

  // The Human Gate proved that the observer-only live path was insufficient,
  // but not why that observer path missed the deployed render. Treat the exact
  // observer failure mechanism as unknown. The synchronous hook below is the
  // demonstrated repair: it decorates immediately after every INPUT render.
  // The observer remains only as a fallback for other DOM writers.
  function padWebInstallPlainDisplayHook() {
    if (typeof global.updatePlainDisplay !== 'function') return false;
    if (global.updatePlainDisplay.__padAliasEquationWrapped === true) return true;
    var original = global.updatePlainDisplay;
    var wrapped = function() {
      var result = original.apply(this, arguments);
      padWebDecorateCurrentDetection();
      return result;
    };
    wrapped.__padAliasEquationWrapped = true;
    wrapped.__padAliasEquationOriginal = original;
    global.updatePlainDisplay = wrapped;
    return true;
  }

  function padWebInstallAliasObserver() {
    if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
    if (global.__padAliasEquationObserver) return;
    var root = document.getElementById('midi-detect');
    if (!root) return;

    var observer = new MutationObserver(function() {
      observer.disconnect();
      try {
        padWebDecorateAliasEquation(root, padWebCurrentCandidatesFromApp());
      } finally {
        observer.observe(root, { childList: true, subtree: true });
      }
    });
    observer.observe(root, { childList: true, subtree: true });
    global.__padAliasEquationObserver = observer;
  }

  function padWebInstallAliasRuntime() {
    padWebInstallAliasObserver();
    padWebInstallPlainDisplayHook();
  }

  if (typeof document !== 'undefined' && document.head && !document.getElementById('pad-alias-equation-style')) {
    var style = document.createElement('style');
    style.id = 'pad-alias-equation-style';
    style.textContent = '.detect-alias-separator{font-weight:800;opacity:.9;line-height:1;margin:0 -1px;}';
    document.head.appendChild(style);
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', padWebInstallAliasRuntime, { once: true });
    } else {
      padWebInstallAliasRuntime();
    }
  }

  global.padWebGetTopResolvedCandidates = padWebGetTopResolvedCandidates;
  global.padWebCandidatesAreEquivalentAliases = padWebCandidatesAreEquivalentAliases;
  global.padWebGetPrimaryExactAliasEntries = padWebGetPrimaryExactAliasEntries;
  global.padWebTopResolvedGroupIsEquivalent = padWebTopResolvedGroupIsEquivalent;
  global.padWebGetResolvedPresentation = padWebGetResolvedPresentation;
  global.padWebGetNeutralTopEntries = padWebGetNeutralTopEntries;
  global.padWebGetTopResolvedSeparator = padWebGetTopResolvedSeparator;
  global.padWebFormatTopResolvedChordText = padWebFormatTopResolvedChordText;
  global.padWebDecorateAliasEquation = padWebDecorateAliasEquation;
  global.padWebDecorateCurrentDetection = padWebDecorateCurrentDetection;
  global.padWebInstallPlainDisplayHook = padWebInstallPlainDisplayHook;

  if (typeof module !== 'undefined') module.exports = {
    padWebGetTopResolvedCandidates: padWebGetTopResolvedCandidates,
    padWebCandidatesAreEquivalentAliases: padWebCandidatesAreEquivalentAliases,
    padWebGetPrimaryExactAliasEntries: padWebGetPrimaryExactAliasEntries,
    padWebTopResolvedGroupIsEquivalent: padWebTopResolvedGroupIsEquivalent,
    padWebGetResolvedPresentation: padWebGetResolvedPresentation,
    padWebGetNeutralTopEntries: padWebGetNeutralTopEntries,
    padWebGetTopResolvedSeparator: padWebGetTopResolvedSeparator,
    padWebFormatTopResolvedChordText: padWebFormatTopResolvedChordText,
    padWebDecorateAliasEquation: padWebDecorateAliasEquation,
    padWebDecorateCurrentDetection: padWebDecorateCurrentDetection,
    padWebInstallPlainDisplayHook: padWebInstallPlainDisplayHook,
  };
})(typeof window !== 'undefined' ? window : globalThis);
