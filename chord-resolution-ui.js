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
      padWebApplyTopResolvedDocumentState(false);
      return { entries: [], equivalent: false, separator: ' · ' };
    }

    var aliases = padWebGetPrimaryExactAliasEntries(candidates);
    if (aliases.length >= 2) {
      padWebApplyTopResolvedDocumentState(true);
      return { entries: aliases, equivalent: true, separator: ' = ' };
    }

    var top = padWebGetTopResolvedCandidates(candidates);
    var entries = top.map(function(candidate) {
      return { candidate: candidate, index: candidates.indexOf(candidate) };
    });
    padWebApplyTopResolvedDocumentState(false);
    return { entries: entries, equivalent: false, separator: ' · ' };
  }

  function padWebApplyTopResolvedDocumentState(equivalent) {
    if (typeof document === 'undefined' || !document.documentElement) return;
    document.documentElement.classList.toggle('pad-top-alias-equivalent', equivalent === true);
  }

  function padWebGetTopResolvedSeparator(candidates) {
    return padWebGetResolvedPresentation(candidates).separator;
  }

  function padWebFormatTopResolvedChordText(candidates) {
    var presentation = padWebGetResolvedPresentation(candidates);
    return presentation.entries
      .map(function(entry) { return entry.candidate && entry.candidate.name || ''; })
      .filter(Boolean)
      .join(presentation.separator);
  }

  global.padWebGetTopResolvedCandidates = padWebGetTopResolvedCandidates;
  global.padWebCandidatesAreEquivalentAliases = padWebCandidatesAreEquivalentAliases;
  global.padWebGetPrimaryExactAliasEntries = padWebGetPrimaryExactAliasEntries;
  global.padWebTopResolvedGroupIsEquivalent = padWebTopResolvedGroupIsEquivalent;
  global.padWebGetResolvedPresentation = padWebGetResolvedPresentation;
  global.padWebGetTopResolvedSeparator = padWebGetTopResolvedSeparator;
  global.padWebFormatTopResolvedChordText = padWebFormatTopResolvedChordText;

  if (typeof module !== 'undefined') module.exports = {
    padWebGetTopResolvedCandidates: padWebGetTopResolvedCandidates,
    padWebCandidatesAreEquivalentAliases: padWebCandidatesAreEquivalentAliases,
    padWebGetPrimaryExactAliasEntries: padWebGetPrimaryExactAliasEntries,
    padWebTopResolvedGroupIsEquivalent: padWebTopResolvedGroupIsEquivalent,
    padWebGetResolvedPresentation: padWebGetResolvedPresentation,
    padWebGetTopResolvedSeparator: padWebGetTopResolvedSeparator,
    padWebFormatTopResolvedChordText: padWebFormatTopResolvedChordText,
  };
})(typeof window !== 'undefined' ? window : globalThis);
