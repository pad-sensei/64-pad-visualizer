(function(global) {
  'use strict';

  function padWebGetTopResolvedCandidates(candidates) {
    if (!Array.isArray(candidates) || candidates.length === 0) return [];
    var tied = candidates.filter(function(candidate) {
      return candidate && candidate.isTopRanked === true;
    });
    return tied.length > 0 ? tied : [candidates[0]];
  }

  function padWebFormatTopResolvedChordText(candidates) {
    return padWebGetTopResolvedCandidates(candidates)
      .map(function(candidate) { return candidate && candidate.name || ''; })
      .filter(Boolean)
      .join(' · ');
  }

  global.padWebGetTopResolvedCandidates = padWebGetTopResolvedCandidates;
  global.padWebFormatTopResolvedChordText = padWebFormatTopResolvedChordText;

  if (typeof module !== 'undefined') module.exports = {
    padWebGetTopResolvedCandidates: padWebGetTopResolvedCandidates,
    padWebFormatTopResolvedChordText: padWebFormatTopResolvedChordText,
  };
})(typeof window !== 'undefined' ? window : globalThis);
