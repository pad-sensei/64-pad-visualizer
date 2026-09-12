const { test, expect } = require('@playwright/test');

// Real application, classic lexical state, MIDI handler, DOM, canvas and frame
// encoder. Only MIDI hardware, USB transport and audio scheduling are fixtures.
test('S1 A01-A03 real MIDI ingress, selected chord, OLED pixels and saved settings', async ({ page }, testInfo) => {
  const errors=[], localFailures=[];
  page.on('pageerror', e=>errors.push(e.message));
  page.on('response', r=>{ if(new URL(r.url()).hostname==='localhost' && r.status()>=400) localFailures.push([r.status(),r.url()]); });
  await page.setViewportSize({width:1280,height:900});
  await page.addInitScript(() => {
    const input={id:'s1-live',name:'Ableton Push 3 Live Port',state:'connected',type:'input',connection:'open',open:async()=>{},onmidimessage:null};
    const user={...input,id:'s1-user',name:'Ableton Push 3 User Port'};
    window.__s1Midi=[];
    const output={id:'s1-out',name:'Ableton Push 3 Live Port',state:'connected',type:'output',connection:'open',open:async()=>{},send:bytes=>window.__s1Midi.push(Array.from(bytes))};
    const access={inputs:new Map([[input.id,input],[user.id,user]]),outputs:new Map([[output.id,output]]),sysexEnabled:true,onstatechange:null};
    Object.defineProperty(navigator,'requestMIDIAccess',{value:async()=>access,configurable:true});
    Object.defineProperty(navigator,'usb',{value:{},configurable:true});
    window.__s1Input=input;
    const original=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(...args){
      if(this.width===960&&this.height===160) window.__s1Canvas=this;
      return original.apply(this,args);
    };
  });
  await page.route('**/push-display-webusb.js?*',async route=>{
    if(new URL(route.request().url()).searchParams.has('s1-real')) return route.continue();
    await route.fulfill({contentType:'application/javascript',body:`
      export { PUSH_DISPLAY_WIDTH, PUSH_DISPLAY_HEIGHT, encodePushDisplayFrame } from './push-display-webusb.js?s1-real=1';
      export class PushWebUsbDisplay {
        constructor(usb,frame,notify) { this.notify=notify;window.__s1Frame=Array.from(frame);window.__s1Frames=1;notify('idle','Test transport'); }
        setFrame(frame) { window.__s1Frame=Array.from(frame);window.__s1Frames++; }
        async connect() { this.notify('running','Test transport'); }
        async stop() { this.notify('idle','Test transport'); }
      }
    `});
  });
  await page.goto('./');
  await page.waitForFunction(()=>typeof padWebGetPushDisplaySnapshot==='function' && typeof getDiatonicTetrads==='function');
  await page.evaluate(async()=>{
    document.getElementById('midi-device-select').value='all';
    if(!window.__s1Input.onmidimessage) initWebMIDI();
    window.__s1Played=[];
    playCurrentChord=()=>window.__s1Played.push(getCurrentChordPlaybackMidiNotes());
    AppState.mode='chord';AppState.key=0;AppState.scaleIdx=0;AppState.diatonicMode='tetrad';
    padWebPushControlState.chordLowerLayerIndex=0;
    render();
  });
  await page.waitForFunction(()=>typeof window.__s1Input.onmidimessage==='function');
  await page.getByRole('button',{name:'Push Display',exact:true}).click();
  const send=async cc=>page.evaluate(cc=>{
    window.__s1Input.onmidimessage({data:new Uint8Array([0xb0,cc,127])});
    window.__s1Input.onmidimessage({data:new Uint8Array([0xb0,cc,0])});
  },cc);
  await send(21);
  await expect.poll(()=>page.evaluate(()=>padWebGetPushDisplaySnapshot().chordLowerRow?.labels[0])).toBe('Diatonic');
  expect(await page.evaluate(()=>[BuilderState.root,BuilderState.quality.name])).toEqual([0,'maj7']);
  expect(await page.evaluate(()=>window.__s1Played.length)).toBe(1);
  expect(await page.evaluate(()=>padWebGetPushDisplaySnapshot().chordLowerRow.labels)).toEqual(await page.evaluate(()=>['Diatonic',...getDiatonicTetrads(SCALES[0].pcs,0,4).map(t=>t.chordName)]));
  // The real renderer paints the currently selected first chord in the accent.
  const pixels=()=>page.evaluate(()=>{
    const ctx=window.__s1Canvas.getContext('2d');
    const data=ctx.getImageData(132,148,108,7).data;
    let accent=0;for(let i=0;i<data.length;i+=4) if(data[i]===255&&data[i+1]===219&&data[i+2]===92)accent++;
    return accent;
  });
  await expect.poll(pixels).toBeGreaterThan(0);
  const attach=async name=>{
    const data=await page.evaluate(()=>window.__s1Canvas.toDataURL('image/png').split(',')[1]);
    await testInfo.attach(name,{body:Buffer.from(data,'base64'),contentType:'image/png'});
    console.log('S1_OLED_PNG '+name+' '+data);
  };
  await attach('diatonic-Cmaj7');
  await send(20);
  await expect.poll(()=>page.evaluate(()=>padWebGetPushDisplaySnapshot().chordLowerRow.labels[0])).toBe('Relative');
  await send(21);
  expect(await page.evaluate(()=>[BuilderState.root,BuilderState.quality.name])).toEqual([9,'m7']);
  await expect.poll(pixels).toBeGreaterThan(0);
  await attach('relative-Am7');
  for(let i=0;i<4;i++)await send(20);
  expect(await page.evaluate(()=>padWebGetPushDisplaySnapshot().chordLowerRow.labels[0])).toBe('Secondary');
  await send(22);
  expect(await page.evaluate(()=>[BuilderState.root,BuilderState._fromSecDom,BuilderState._secDomTargetIsMajor])).toEqual([9,true,false]);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('64pad-settings')).showParentScales)).toBe(true);
  await send(20);await send(21);
  expect(await page.evaluate(()=>[BuilderState._fromSecDom,BuilderState._fromDiatonic])).toEqual([false,true]);
  const metrics=await page.evaluate(()=>{
    const r=document.getElementById('pad-grid').getBoundingClientRect();
    return {grid:{x:r.x,y:r.y,width:r.width,height:r.height},canvas:{width:window.__s1Canvas.width,height:window.__s1Canvas.height},frames:window.__s1Frames,encodedBytes:window.__s1Frame.length,snapshot:padWebGetPushDisplaySnapshot().chordLowerRow};
  });
  expect(metrics.grid.width).toBeGreaterThan(0);expect(metrics.grid.height).toBeGreaterThan(0);
  expect(metrics.canvas).toEqual({width:960,height:160});expect(metrics.frames).toBeGreaterThan(3);expect(metrics.encodedBytes).toBeGreaterThan(960*160*2);
  console.log('S1_BROWSER_EVIDENCE '+JSON.stringify({metrics,errors,localFailures}));
  expect(errors).toEqual([]);expect(localFailures).toEqual([]);
});
