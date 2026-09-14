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

  function padWebCurrentDetectedCandidates() {
    try {
      if (typeof lastDetectedCandidates !== 'undefined' && Array.isArray(lastDetectedCandidates)) {
        return lastDetectedCandidates;
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

  // plain.js intentionally keeps resolver order and original candidate indexes.
  // This decorator only moves already-rendered exact aliases into the equation
  // presentation after DOM construction; resolver score/rank metadata is untouched.
  function padWebDecorateAliasEquation(root, candidates) {
    if (typeof document === 'undefined' || !root) return;
    var presentation = padWebGetResolvedPresentation(candidates);
    if (!presentation.equivalent || presentation.entries.length < 2) return;

    var topGroup = root.querySelector('.detect-top-group');
    if (!topGroup) return;

    var aliasIndexSet = {};
    presentation.entries.forEach(function(entry) { aliasIndexSet[entry.index] = true; });
    var existingTop = padWebGetTopResolvedCandidates(candidates).map(function(candidate) {
      return candidates.indexOf(candidate);
    }).filter(function(index) { return index >= 0 && !aliasIndexSet[index]; });

    var desired = presentation.entries.slice();
    existingTop.forEach(function(index) {
      desired.push({ candidate: candidates[index], index: index, neutralTop: true });
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

  function padWebInstallAliasObserver() {
    if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
    if (global.__padAliasEquationObserver) return;
    var root = document.getElementById('midi-detect');
    if (!root) return;

    var observer = new MutationObserver(function() {
      observer.disconnect();
      try {
        padWebDecorateAliasEquation(root, padWebCurrentDetectedCandidates());
      } finally {
        observer.observe(root, { childList: true, subtree: true });
      }
    });
    observer.observe(root, { childList: true, subtree: true });
    global.__padAliasEquationObserver = observer;
  }

  if (typeof document !== 'undefined' && document.head && !document.getElementById('pad-alias-equation-style')) {
    var style = document.createElement('style');
    style.id = 'pad-alias-equation-style';
    style.textContent = '.detect-alias-separator{font-weight:800;opacity:.9;line-height:1;margin:0 -1px;}';
    document.head.appendChild(style);
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', padWebInstallAliasObserver, { once: true });
    } else {
      padWebInstallAliasObserver();
    }
  }

  global.padWebGetTopResolvedCandidates = padWebGetTopResolvedCandidates;
  global.padWebCandidatesAreEquivalentAliases = padWebCandidatesAreEquivalentAliases;
  global.padWebGetPrimaryExactAliasEntries = padWebGetPrimaryExactAliasEntries;
  global.padWebTopResolvedGroupIsEquivalent = padWebTopResolvedGroupIsEquivalent;
  global.padWebGetResolvedPresentation = padWebGetResolvedPresentation;
  global.padWebGetTopResolvedSeparator = padWebGetTopResolvedSeparator;
  global.padWebFormatTopResolvedChordText = padWebFormatTopResolvedChordText;
  global.padWebDecorateAliasEquation = padWebDecorateAliasEquation;

  if (typeof module !== 'undefined') module.exports = {
    padWebGetTopResolvedCandidates: padWebGetTopResolvedCandidates,
    padWebCandidatesAreEquivalentAliases: padWebCandidatesAreEquivalentAliases,
    padWebGetPrimaryExactAliasEntries: padWebGetPrimaryExactAliasEntries,
    padWebTopResolvedGroupIsEquivalent: padWebTopResolvedGroupIsEquivalent,
    padWebGetResolvedPresentation: padWebGetResolvedPresentation,
    padWebGetTopResolvedSeparator: padWebGetTopResolvedSeparator,
    padWebFormatTopResolvedChordText: padWebFormatTopResolvedChordText,
    padWebDecorateAliasEquation: padWebDecorateAliasEquation,
  };
})(typeof window !== 'undefined' ? window : globalThis);
