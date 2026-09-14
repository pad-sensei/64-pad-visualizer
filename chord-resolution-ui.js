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

  function padWebGetTopResolvedCandidates(candidates) {
    if (!Array.isArray(candidates) || candidates.length === 0) return [];
    var tied = candidates.filter(function(candidate) {
      return candidate && candidate.isTopRanked === true;
    });
    var top = tied.length > 0 ? tied : [candidates[0]];
    padWebApplyTopResolvedDocumentState(top);
    return top;
  }

  function padWebTopResolvedGroupIsEquivalent(topCandidates) {
    if (!Array.isArray(topCandidates) || topCandidates.length < 2) return false;
    var first = topCandidates[0];
    if (!first || first.resolutionCompleteness !== 'exact') return false;
    var firstScore = Number(first.resolutionScore);
    if (!Number.isFinite(firstScore)) return false;
    var firstExplained = first.resolutionExplainedPCS || [];
    if (firstExplained.length === 0) return false;

    for (var i = 1; i < topCandidates.length; i++) {
      var candidate = topCandidates[i];
      if (!candidate || candidate.resolutionCompleteness !== 'exact') return false;
      if (Number(candidate.resolutionScore) !== firstScore) return false;
      if (!padWebPitchClassSetsEqual(candidate.resolutionExplainedPCS || [], firstExplained)) return false;
    }
    return true;
  }

  function padWebApplyTopResolvedDocumentState(topCandidates) {
    if (typeof document === 'undefined' || !document.documentElement) return;
    document.documentElement.classList.toggle(
      'pad-top-alias-equivalent',
      padWebTopResolvedGroupIsEquivalent(topCandidates)
    );
  }

  function padWebGetTopResolvedSeparator(candidates) {
    var top = Array.isArray(candidates) && candidates.length > 0 && candidates.every(function(candidate) {
      return candidate && candidate.isTopRanked === true;
    }) ? candidates : padWebGetTopResolvedCandidates(candidates);
    return padWebTopResolvedGroupIsEquivalent(top) ? ' = ' : ' · ';
  }

  function padWebFormatTopResolvedChordText(candidates) {
    var top = padWebGetTopResolvedCandidates(candidates);
    return top
      .map(function(candidate) { return candidate && candidate.name || ''; })
      .filter(Boolean)
      .join(padWebTopResolvedGroupIsEquivalent(top) ? ' = ' : ' · ');
  }

  if (typeof document !== 'undefined' && document.head && !document.getElementById('pad-tied-alias-equivalence-style')) {
    var style = document.createElement('style');
    style.id = 'pad-tied-alias-equivalence-style';
    style.textContent = '.pad-top-alias-equivalent .detect-top-group .detect-candidate-best + .detect-candidate-best::before{content:"= ";opacity:.8;margin-right:2px;}';
    document.head.appendChild(style);
  }

  global.padWebGetTopResolvedCandidates = padWebGetTopResolvedCandidates;
  global.padWebTopResolvedGroupIsEquivalent = padWebTopResolvedGroupIsEquivalent;
  global.padWebGetTopResolvedSeparator = padWebGetTopResolvedSeparator;
  global.padWebFormatTopResolvedChordText = padWebFormatTopResolvedChordText;

  if (typeof module !== 'undefined') module.exports = {
    padWebGetTopResolvedCandidates: padWebGetTopResolvedCandidates,
    padWebTopResolvedGroupIsEquivalent: padWebTopResolvedGroupIsEquivalent,
    padWebGetTopResolvedSeparator: padWebGetTopResolvedSeparator,
    padWebFormatTopResolvedChordText: padWebFormatTopResolvedChordText,
  };
})(typeof window !== 'undefined' ? window : globalThis);
