import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { isolateColourPage } from './helpers/isolated-colour-page';
test.use({viewport:{width:1280,height:900},launchOptions:{args:['--mute-audio']}});
async function prepare(page,config={}) {
  const errors=await isolateColourPage(page,test.info().project.use.baseURL);
  await page.addInitScript(({sysex=true,ambiguous=false})=>{
    class Input extends EventTarget {
      constructor(){super();this.id='fake-lp-in';this.name='LPProMK3 MIDI';this.state='connected';}
      emit(data){const event=Object.assign(new Event('midimessage'),{data:new Uint8Array(data)});this.dispatchEvent(event);this.onmidimessage?.(event);}
    }
    const input=new Input(),packets=[],output={id:'fake-lp-out',name:input.name,state:'connected',open:async()=>{},clear(){},send(data){packets.push(Array.from(data));}};
    const access={sysexEnabled:sysex,inputs:new Map([[input.id,input]]),outputs:new Map([[output.id,output]]),addEventListener(){}};
    if(ambiguous)access.outputs.set('other',{...output,id:'other'});
    window.__lp191={input,output,access,packets,events:[]};
    Object.defineProperty(navigator,'requestMIDIAccess',{configurable:true,value:async()=>access});
  },config);
  await page.goto('./?e2e=launchpad-confirmation');
  await page.waitForFunction(()=>typeof launchpadLink!=='undefined'&&['pending','unconfirmed'].includes(launchpadLink.getStatus()));
  await page.evaluate(()=>{ensureAudioResumed=()=>{};noteOn=n=>window.__lp191.events.push(['on',n]);noteOff=n=>window.__lp191.events.push(['off',n]);playCurrentChord=()=>{};});
  if(await page.locator('#audio-start-overlay').isVisible())await page.locator('#audio-start-overlay').click();
  await page.evaluate(()=>{if(getComputedStyle(document.getElementById('sound-controls')).display==='none')toggleInstrument('sound');});
  // A real UI selection starts a fresh confirmation after the audio-start gesture.
  await page.locator('#midi-device-select').selectOption('fake-lp-in');
  await page.waitForFunction(()=>['pending','unconfirmed'].includes(launchpadLink.getStatus()));
  return errors;
}
async function emit(page,data){await page.evaluate(d=>window.__lp191.input.emit(d),data);}
const ack=[240,0,32,41,2,14,0,17,0,0,247];
async function record(page,info,name,errors){
  await page.evaluate(()=>{if(getComputedStyle(document.getElementById('sound-controls')).display==='none')toggleInstrument('sound');});
  await expect(page.locator('#audio-start-overlay')).toBeHidden();
  await page.locator('#midi-status').scrollIntoViewIfNeeded();
  const state=await page.evaluate(()=>({status:launchpadLink.getStatus(),label:document.getElementById('launchpad-status').textContent,hidden:document.getElementById('launchpad-status').hidden,indicator:getComputedStyle(document.getElementById('midi-indicator')).backgroundColor,active:launchpadLink.isActiveFor(window.__lp191.input),held:getMidiHeldSources(),events:window.__lp191.events,packets:window.__lp191.packets,octave:AppState.octaveShift,version:document.querySelector('.version-tag').textContent,layout:(()=>{const label=document.getElementById('launchpad-status'),shown=label.hidden,withStatus=document.documentElement.scrollWidth;label.hidden=true;const withoutStatus=document.documentElement.scrollWidth;label.hidden=shown;return {withStatus,withoutStatus,labelWidth:label.getBoundingClientRect().width,containerWidth:document.getElementById('sound-header').getBoundingClientRect().width};})(),grid:[...document.querySelectorAll('#pad-grid rect.pad')].map(p=>({fill:p.getAttribute('fill'),computed:getComputedStyle(p).fill,width:p.getBoundingClientRect().width}))}));
  await writeFile(info.outputPath(name+'.json'),JSON.stringify({state,errors},null,2));await page.screenshot({path:info.outputPath(name+'.png')});
  expect(state.version).toBe('v1.9.1');expect(state.hidden).toBe(false);expect(state.layout.withStatus).toBeLessThanOrEqual(state.layout.withoutStatus);expect(state.layout.labelWidth).toBeGreaterThan(0);expect(state.layout.labelWidth).toBeLessThanOrEqual(state.layout.containerWidth);expect(state.grid).toHaveLength(64);expect(state.grid.every(p=>p.width>0)).toBe(true);
  for(const key of ['page','network','http'])expect(errors[key]).toEqual([]);
  expect(errors.console.filter(e=>!(e.message.includes('ERR_BLOCKED_BY_CLIENT')&&errors.blockedExternal.length)&&(!e.url||e.url.startsWith(errors.origin+'/')))).toEqual([]);
  return state;
}
for(const mobile of [false,true])test(`ACK gates real input, status and LED frames (mobile ${mobile})`,async({page},info)=>{
  if(mobile)await page.setViewportSize({width:390,height:844});
  const errors=await prepare(page);
  await emit(page,[144,11,100]);await emit(page,[176,91,127]);
  await emit(page,[240,0,32,41,2,12,0,17,0,0,247]);
  const waiting=await record(page,info,'01-unconfirmed',errors);
  expect(waiting.status).toBe('pending');expect(waiting.active).toBe(false);expect(waiting.events).toEqual([]);expect(waiting.octave).toBe(0);expect(waiting.indicator).toBe('rgb(255, 152, 0)');expect(waiting.packets.filter(p=>p[6]===3)).toHaveLength(0);
  await emit(page,ack);await page.waitForFunction(()=>launchpadLink.getStatus()==='confirmed');
  const connected=await record(page,info,'02-confirmed',errors);expect(connected.active).toBe(true);expect(connected.indicator).toBe('rgb(76, 175, 80)');expect(connected.packets.some(p=>p[6]===3&&p.length===200)).toBe(true);
  const events=await page.evaluate(()=>{for(let i=0;i<64;i++){const raw=padLaunchpadProgrammer.padNote(i);window.__lp191.input.emit([144,raw,100]);window.__lp191.input.emit([128,raw,0]);}return window.__lp191.events;});
  expect(events).toHaveLength(128);for(let i=0;i<64;i++){const pitch=36+(i>>3)*5+i%8;expect(events.slice(i*2,i*2+2)).toEqual([['on',pitch],['off',pitch]]);}
  await emit(page,[144,11,100]);await emit(page,[176,80,127]);await emit(page,[240,0,32,41,2,14,0,4,0,0,247]);
  const lost=await record(page,info,'03-confirmation-lost',errors);expect(lost.status).toBe('mismatch');expect(lost.active).toBe(false);expect(lost.held).toEqual([]);expect(lost.events.at(-1)).toEqual(['off',36]);
});
test('timeout, late response, disconnect and fresh reconnect',async({page},info)=>{
  const errors=await prepare(page);await page.waitForFunction(()=>launchpadLink.getStatus()==='timeout');
  await emit(page,ack);await emit(page,[144,11,100]);const expired=await record(page,info,'01-timeout-late',errors);expect(expired.status).toBe('timeout');expect(expired.events).toEqual([]);expect(expired.active).toBe(false);
  await page.evaluate(()=>{window.__lp191.oldHandler=window.__lp191.input.onmidimessage;window.__lp191.output.state='disconnected';window.__lp191.access.onstatechange();window.__lp191.output.state='connected';window.__lp191.access.onstatechange();});
  await page.waitForFunction(()=>launchpadLink.getStatus()==='pending');
  await page.evaluate(()=>window.__lp191.oldHandler({data:new Uint8Array([144,11,100])}));
  expect(await page.evaluate(()=>window.__lp191.events)).toEqual([]);await emit(page,ack);await page.waitForFunction(()=>launchpadLink.getStatus()==='confirmed');
  const restored=await record(page,info,'02-reconnected',errors);expect(restored.active).toBe(true);expect(restored.packets.some(p=>p[6]===3&&p.length===200)).toBe(true);
});
for(const config of [{sysex:false},{ambiguous:true}])test(`unavailable transport stays unconfirmed ${JSON.stringify(config)}`,async({page},info)=>{
  const errors=await prepare(page,config);await emit(page,ack);await emit(page,[144,11,100]);await emit(page,[176,91,127]);
  const s=await record(page,info,'unavailable',errors);expect(s.status).toBe('unconfirmed');expect(s.active).toBe(false);expect(s.events).toEqual([]);expect(s.octave).toBe(0);expect(s.indicator).toBe('rgb(255, 152, 0)');expect(s.packets).toEqual([]);
});
