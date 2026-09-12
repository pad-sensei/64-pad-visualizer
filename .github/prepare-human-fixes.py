# Preparation only: publish a Git tree object, not a commit, ref or deployment.
# Candidate publication and exact-head tests occur separately through normal Git.
import hashlib, json, os, pathlib, shutil, subprocess, sys, urllib.request

BASE = '62bc8f2a92f041a43bb4a5334a2fb69f009ef4d6'
prep = pathlib.Path(__file__).resolve().parent
assert subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip() == BASE
patch = (prep / 'semitone-fix.patch').read_text().replace('\n diff --git ', '\ndiff --git ')
subprocess.run(['git','apply','--check','-'],input=patch.encode(),check=True)
subprocess.run(['git','apply','-'],input=patch.encode(),check=True)

def replace(name, old, new):
    path = pathlib.Path(name)
    source = path.read_text()
    assert source.count(old) == 1, 'unexpected source context: ' + name
    path.write_text(source.replace(old,new))

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
    path=pathlib.Path(name)
    text=path.read_text()
    assert 'webusb-20260912-11' in text
    path.write_text(text.replace('webusb-20260912-11','webusb-20260912-12'))
shutil.copyfile(prep/'push-fullpage.spec.js','tests/e2e/push-pedal-fullpage.spec.js')
replace('.github/workflows/deploy-dev.yml','Full-page MIDI to audio verification','Full-page MIDI, audio and Push display verification')
subprocess.run(['git','diff','--check'],check=True)
paths = ['.github/workflows/deploy-dev.yml','index.html','push-web-control.js','render.js','push-display-webusb-app.js','sw.js','tests/e2e/push-pedal-fullpage.spec.js','tests/push-standalone-parity.cjs','tests/unit/push-display-exposure.test.js','tests/unit/push-standalone-parity.test.js','tests/unit/v180-web-contract.test.js']
elements=[]
for name in paths:
    content=pathlib.Path(name).read_text()
    elements.append({'path':name,'mode':'100644','type':'blob','content':content})
    print(name,hashlib.sha256(content.encode()).hexdigest())
body=json.dumps({'base_tree':subprocess.check_output(['git','rev-parse','HEAD^{tree}'],text=True).strip(),'tree':elements}).encode()
request=urllib.request.Request('https://api.github.com/repos/pad-sensei/64-pad-visualizer/git/trees',data=body,method='POST',headers={'Authorization':'Bearer '+os.environ['GH_TOKEN'],'Accept':'application/vnd.github+json','Content-Type':'application/json'})
with urllib.request.urlopen(request) as response:
    result=json.load(response)
print('PREPARED_TREE='+result['sha'])
print('NO COMMIT / NO BRANCH UPDATE / NO DEPLOY')
