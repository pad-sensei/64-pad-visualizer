from pathlib import Path

# Product behavior: move the existing manual Push Display control from the
# Audio-section header to the global app header, immediately before Tutorials.
p = Path('push-display-webusb-app.js')
s = p.read_text()
old = "  const host = document.getElementById('sound-header');\n  if (host) {"
new = "  const host = document.querySelector('.header-bar');\n  const anchor = document.getElementById('tut-btn');\n  if (host && anchor && anchor.parentElement === host) {"
assert old in s
s = s.replace(old, new, 1)

old = "    status.style.cssText = 'font-size:0.55rem;color:var(--text-muted);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';\n    status.textContent = 'Push USB: ready';\n\n    host.insertBefore(button, host.firstChild);\n    host.insertBefore(status, button.nextSibling);"
new = "    status.style.cssText = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;';\n    status.setAttribute('aria-live', 'polite');\n    status.textContent = 'Push USB: ready';\n\n    host.insertBefore(button, anchor);\n    host.insertBefore(status, anchor);"
assert old in s
s = s.replace(old, new, 1)

old = "      status.textContent = text;\n      status.title = text;\n      button.disabled = state === 'connecting' || state === 'stopping' || state === 'blocked' || !supported;"
new = "      status.textContent = text;\n      status.title = text;\n      button.title = text || 'Connect Push 2 / Push 3 display via WebUSB (Chrome)';\n      button.disabled = state === 'connecting' || state === 'stopping' || state === 'blocked' || !supported;"
assert old in s
s = s.replace(old, new, 1)

old = "      button.disabled = true;\n      status.textContent = 'WebUSB unavailable: use Chrome over HTTPS';"
new = "      button.disabled = true;\n      status.textContent = 'WebUSB unavailable: use Chrome over HTTPS';\n      button.title = status.textContent;"
assert old in s
s = s.replace(old, new, 1)
p.write_text(s)

# Fresh delivery identities for the changed display module.
repls = {
    'push-display-webusb-app.js?v=webusb-20260913-active-color': 'push-display-webusb-app.js?v=webusb-20260913-header',
    '64pad-v180-preview-20260913-active-color': '64pad-v180-preview-20260913-header',
}
for name in ['index.html', 'sw.js', 'tests/unit/push-display-exposure.test.js', 'tests/unit/push-web-cc-integration.test.js']:
    p = Path(name)
    s = p.read_text()
    for a, b in repls.items():
        s = s.replace(a, b)
    p.write_text(s)

# Lock the visible placement contract without changing WebUSB/control semantics.
p = Path('tests/unit/push-display-exposure.test.js')
s = p.read_text()
needle = "  it('shows Standalone Root and Quality entry labels on the normal Chord screen', () => {"
insert = """  it('places the manual Push Display control in the global header before Tutorials', () => {
    expect(app).toContain(\"document.querySelector('.header-bar')\");
    expect(app).toContain(\"document.getElementById('tut-btn')\");
    expect(app).toContain('host.insertBefore(button, anchor)');
    expect(app).toContain(\"status.setAttribute('aria-live', 'polite')\");
    expect(app).not.toContain(\"document.getElementById('sound-header')\");
  });

""" + needle
assert needle in s
s = s.replace(needle, insert, 1)
p.write_text(s)

# Persist the measured performance baseline for future v2.x/refactor comparison.
Path('docs/PERFORMANCE_BASELINE_v1.8_2026-09-13.md').write_text('''# 64 Pad Explorer Web performance baseline — v1.7 → v1.8\n\nDate: 2026-09-13\n\n## Compared revisions\n\n- v1.7 Web integration: `2e0dc0b06bd44b6f0b846258b123cbd6d37369d0`\n- v1.8 candidate: `8d4d0af31ea76ba3261b6dff561afa477082c21d`\n\n## Method\n\nGitHub Actions run `34734838828`, job `103664278358` (SUCCESS). Same Ubuntu 24.04 runner class and Playwright Chromium 145. Seven alternating runs; medians reported. External analytics/fonts and Service Worker were blocked to isolate local application cost.\n\n| Metric | v1.7 | v1.8 | Delta |\n|---|---:|---:|---:|\n| Referenced JS/CSS, gzip-9 | 372.55 KiB | 395.29 KiB | +6.1% |\n| Referenced JS/CSS, raw | 1344.17 KiB | 1434.19 KiB | +6.7% |\n| Browser local encoded body | 1508.99 KiB | 1611.24 KiB | +6.8% |\n| Wall load | 152.80 ms | 170.98 ms | +11.9% |\n| DOMContentLoaded | 150.40 ms | 168.90 ms | +12.3% |\n| Idle main-thread task over 5 s | 177.98 ms | 191.94 ms | +7.8% |\n| Idle script over 5 s | 0.00 ms | 0.00 ms | +0.0% |\n| JS heap after settle | 9.54 MiB | 9.54 MiB | +0.0% |\n\n## Interpretation / future use\n\nThis is the baseline for later lightweighting work, not a claim about every user's machine. The measured v1.8 increase is modest relative to the added Push control/display surface. Hardware WebUSB transfer cost and real audio-device CPU were not measured in CI. Owner physical playing acceptance found no performance problem.\n\nUse this same methodology again when a future large architecture/refactor changes the performance envelope (for example the planned v2.x code-progression-analysis work). Small v1.8 bug fixes should not trigger optimization work solely to improve these numbers.\n''')
