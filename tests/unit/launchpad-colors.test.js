import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';
const lp = require('../../launchpad-programmer.js');
function settingsWorld(saved) {
  const storage = new Map(saved ? [['64pad-settings',JSON.stringify(saved)]] : []);
  const c = { console, location:{pathname:'/'}, document:{readyState:'loading',addEventListener(){},getElementById(){return null;}},
    localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)}, render:vi.fn(), t:k=>k };
  c.window=c; vm.createContext(c);
  for(const file of ['pad-core/data.js','data.js','launchpad-programmer.js']) vm.runInContext(fs.readFileSync(file,'utf8'),c,{filename:file});
  const main = fs.readFileSync('main.js','utf8');
  vm.runInContext(main.slice(main.indexOf('// Launchpad uses its own firmware palette/RGB')),c);
  c.state = vm.runInContext('AppState',c);
  return {c,storage};
}
describe('Launchpad colour settings',()=>{
  it('validates palette/RGB independently of Push and preserves off=0',()=>{
    for(const v of ['p:0','p:127','#00aAFF']) expect(lp.validColor(v)).toBe(true);
    for(const v of ['p:128','p:-1','p:01','#123',null,13]) expect(lp.validColor(v)).toBe(false);
    expect(lp.colorForRole('guide',{guide:'p:0'})).toBe(0);
    expect(lp.sanitizeColors({c:'p:128',guide:'#00aAFF'})).toEqual({...lp.defaultColors,guide:'#00aAFF'});
  });
  it('saves/reloads roles through actual app settings, resets independently, and redraws',()=>{
    const {c,storage}=settingsWorld(); const push=c.state.pushScaleRootColor;
    expect(c.setLaunchpadColor('guideC','#00aaff')).toBe(true);
    expect(c.setLaunchpadColor('pressed','p:0')).toBe(true);
    expect(c.setLaunchpadColor('guide','p:128')).toBe(false);
    expect(c.render).toHaveBeenCalledTimes(2);
    const saved=JSON.parse(storage.get('64pad-settings'));
    expect(saved.launchpadColors.guideC).toBe('#00aaff'); expect(saved.launchpadColors.pressed).toBe('p:0');
    const restored=settingsWorld(saved);restored.c.loadAppSettings();
    expect(restored.c.state.launchpadColors).toEqual(saved.launchpadColors);
    c.resetLaunchpadColors();expect(c.state.launchpadColors).toEqual(lp.defaultColors);
    expect(c.state.pushScaleRootColor).toBe(push);
    expect(JSON.parse(storage.get('64pad-settings')).launchpadColors).toEqual(lp.defaultColors);
  });
  it('loads old settings with defaults and rejects malformed saved values',()=>{
    const w=settingsWorld({launchpadColors:{c:'bogus',scale:'p:0',guideC:'#123456'}});w.c.loadAppSettings();
    expect(w.c.state.launchpadColors).toEqual({...lp.defaultColors,scale:'p:0',guideC:'#123456'});
    const old=settingsWorld({key:2});old.c.loadAppSettings();expect(old.c.state.launchpadColors).toEqual(lp.defaultColors);
  });
  it('sends exact mixed RGB/palette bytes and redraws changed descriptors only',async()=>{
    const input={name:'LPProMK3 MIDI'},output={name:'LPProMK3 MIDI',send:vi.fn()};
    const link=lp.create();await link.connect({sysexEnabled:true,inputs:new Map([['i',input]]),outputs:new Map([['o',output]])},[input]);
    const colors=Array(64).fill(0);link.paint(colors);output.send.mockClear();
    colors[0]='#ff8000';colors[1]=13;expect(link.paint(colors)).toBe(true);
    expect(output.send.mock.calls[0][0]).toEqual([240,0,32,41,2,14,3,3,11,127,64,0,0,12,13,247]);
    link.paint(colors);expect(output.send).toHaveBeenCalledTimes(1);
    colors[0]='#gg0000';expect(link.paint(colors)).toBe(false);expect(output.send).toHaveBeenCalledTimes(1);
  });
  it('executes UI selection, RGB changes, reset and reopen without duplicating controls',()=>{
    function element() {
      return {children:[],dataset:{},style:{},value:'',hidden:false,attributes:{},
        appendChild(child){this.children.push(child);return child;},setAttribute(k,v){this.attributes[k]=v;},
        querySelectorAll(selector){
          const match=selector.match(/^\[data-launchpad-(role|rgb)(?:="([^"]+)")?\]$/);
          const key=match && (match[1]==='role'?'launchpadRole':'launchpadRgb');
          const found=[];function visit(e){for(const c of e.children){if(key && c.dataset[key]!==undefined && (!match[2] || c.dataset[key]===match[2]))found.push(c);visit(c);}}visit(this);return found;
        },querySelector(selector){return this.querySelectorAll(selector)[0] || null;}};
    }
    const {c}=settingsWorld();const root=element();
    c.document.getElementById=id=>id==='launchpad-color-settings'?root:null;c.document.createElement=element;
    c.syncLaunchpadColorSettings();expect(root.querySelectorAll('[data-launchpad-role]')).toHaveLength(5);
    const guide=root.querySelector('[data-launchpad-role="guide"]');const rgb=root.querySelector('[data-launchpad-rgb="guide"]');
    guide.value='rgb';guide.onchange();expect(rgb.hidden).toBe(false);expect(c.state.launchpadColors.guide).toBe('#0000ff');
    rgb.value='#aabbcc';rgb.onchange();expect(c.state.launchpadColors.guide).toBe('#aabbcc');
    guide.value='p:0';guide.onchange();expect(rgb.hidden).toBe(true);expect(c.state.launchpadColors.guide).toBe('p:0');
    c.syncLaunchpadColorSettings();expect(root.querySelectorAll('[data-launchpad-role]')).toHaveLength(5);
    root.children.at(-1).onclick();expect(c.state.launchpadColors.guide).toBe('p:13');expect(guide.value).toBe('p:13');
  });
  it('provides all five colour settings and guidance in nine languages',()=>{
    for(const lang of ['en','ja','zh','es','fr','pt','de','ko','it']){
      let data;vm.runInNewContext(fs.readFileSync(`lang-${lang}.js`,'utf8'),{I18N:{addLang:(_,d)=>data=d}});
      for(const role of ['scale','c','guide','guideC','pressed','custom','reset']) expect(data.help['launchpad_color_'+role]).toBeTruthy();
      expect(data.help.launchpad_colors_hint).toBeTruthy();
    }
  });
});
