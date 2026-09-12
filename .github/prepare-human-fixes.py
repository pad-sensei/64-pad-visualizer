# Preparation branch only. The final PR branch is never modified by this helper.
import hashlib, os, pathlib, shutil, subprocess
BASE = '62bc8f2a92f041a43bb4a5334a2fb69f009ef4d6'
prep = pathlib.Path(__file__).resolve().parent
assert subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip() == BASE
patch = (prep/'semitone-fix.patch').read_text().replace('\n diff --git ','\ndiff --git ')
subprocess.run(['git','apply','--check','-'],input=patch.encode(),check=True)
subprocess.run(['git','apply','-'],input=patch.encode(),check=True)
def replace(name,old,new):
    path=pathlib.Path(name); text=path.read_text()
    assert text.count(old)==1, 'unexpected source context: '+name
    path.write_text(text.replace(old,new))
replace('render.js', '''    updateLaunchpadLEDs(ledState);
  }
}''', '''    updateLaunchpadLEDs(ledState);
  }
  // The optional WebUSB display is another view of this live application state.
  // Key/scale changes need a new frame even when #midi-detect did not change.
  // This only updates the prepared frame; USB ownership stays manual/explicit.
  if (!window.IS_DESKTOP_MODE && typeof window.padWebRefreshPushDisplay === 'function') {
    window.padWebRefreshPushDisplay();
  }
}''')
replace('push-display-webusb-app.js', '''    const refreshFrame = () => {
      try { probe.setFrame(drawFrame()); } catch (_) {}
    };''', '''    // Coalesce render/DOM notifications without polling or waiting for a new
    // note. Microtasks also work when the tab is hidden (unlike animation frames).
    let refreshQueued = false;
    const refreshFrame = () => {
      if (refreshQueued) return;
      refreshQueued = true;
      queueMicrotask(() => {
        refreshQueued = false;
        try { probe.setFrame(drawFrame()); } catch (_) {}
      });
    };
    window.padWebRefreshPushDisplay = refreshFrame;''')
replace('index.html','src="render.js?v=6.7.52"','src="render.js?v=1.8.0-display3"')
replace('sw.js',"'render.js?v=6.7.52'","'render.js?v=1.8.0-display3'")
for name in ['index.html','sw.js','tests/unit/push-display-exposure.test.js']:
    path=pathlib.Path(name);text=path.read_text();assert 'webusb-20260912-11' in text
    path.write_text(text.replace('webusb-20260912-11','webusb-20260912-12'))
shutil.copyfile(prep/'push-fullpage.spec.js','tests/e2e/push-pedal-fullpage.spec.js')
replace('.github/workflows/deploy-dev.yml','Full-page MIDI to audio verification','Full-page MIDI, audio and Push display verification')
paths=['.github/workflows/deploy-dev.yml','index.html','push-web-control.js','render.js','push-display-webusb-app.js','sw.js','tests/e2e/push-pedal-fullpage.spec.js','tests/push-standalone-parity.cjs','tests/unit/push-display-exposure.test.js','tests/unit/push-standalone-parity.test.js','tests/unit/v180-web-contract.test.js']
subprocess.run(['git','add','--']+paths,check=True)
subprocess.run(['git','diff','--cached','--check'],check=True)
for name in paths: print(name,hashlib.sha256(pathlib.Path(name).read_bytes()).hexdigest())
subprocess.run(['git','-c','user.name=github-actions[bot]','-c','user.email=41898282+github-actions[bot]@users.noreply.github.com','commit','-m','prepare: semitone display and full-page verification tree'],check=True)
