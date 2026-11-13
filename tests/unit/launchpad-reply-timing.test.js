import { describe,it,expect,vi } from 'vitest';
const lp=require('../../launchpad-programmer.js');
const ack=[240,0,32,41,2,14,0,17,0,0,247];
const note=[240,0,32,41,2,14,0,4,0,0,247];
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function world(options={}) {
  const listeners=new Set();
  const input={id:'input',name:'LPProMK3 MIDI',manufacturer:'Novation',state:'connected',connection:'open',open:vi.fn(async()=>{}),addEventListener(t,fn){if(t==='midimessage')listeners.add(fn);},removeEventListener(t,fn){listeners.delete(fn);},emit(data,timeStamp=101){for(const fn of [...listeners])fn({data,timeStamp});}};
  const output={id:'output',name:input.name,manufacturer:'Novation',state:'connected',connection:'open',open:vi.fn(async()=>{}),send:vi.fn(),clear:vi.fn()};
  const access={sysexEnabled:true,inputs:new Map([[input.id,input]]),outputs:new Map([[output.id,output]])};
  const release=vi.fn(),link=lp.create(release,{timeoutMs:30,now:()=>100.5,...options});
  return {input,output,access,release,link,connect:()=>link.connect(access,[input]),listeners};
}
describe('mode reply timing and reception diagnostics',()=>{
  it.each([100,1,-500,101])('accepts a dispatched exact ACK with timestamp %s despite clock precision/origin differences',async stamp=>{
    const w=world();const p=w.connect();await tick();w.input.emit(ack,stamp);
    expect(await p).toBe(true);expect(w.link.isActiveFor(w.input)).toBe(true);w.link.disconnect();
  });
  it('sends no mode/query packet until explicit input.open completes',async()=>{
    const w=world();let finish;w.input.open.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
    const p=w.connect();await tick();const count=w.output.send.mock.calls.length;
    if(finish)finish();await tick();w.input.emit(ack);await p;w.link.disconnect();
    expect(count).toBe(0);expect(w.input.open).toHaveBeenCalledOnce();
  });
  it('distinguishes received short SysEx from no response without accepting nine-byte ACK',async()=>{
    const w=world(),p=w.connect();await tick();w.input.emit([240,0,32,41,2,14,0,17,247]);
    expect(await p).toBe(false);expect(w.link.getReason()).toBe('unaccepted');expect(w.link.isActiveFor(w.input)).toBe(false);w.link.disconnect();
  });
  it('rejects an ACK dispatched beyond the local deadline even before the timeout callback',async()=>{
    let time=100.5;const w=world({now:()=>time}),p=w.connect();await tick();time=200;
    w.input.emit(ack,101);expect(await p).toBe(false);expect(w.link.getStatus()).toBe('timeout');w.link.disconnect();
  });
  it('requeries within one bounded attempt when the first response is the pre-switch layout',async()=>{
    const w=world({timeoutMs:60,queryRetryMs:[5,15]});let queries=0;
    w.output.send.mockImplementation(bytes=>{if(bytes.length===8)w.input.emit(++queries===1?note:ack);});
    expect(await w.connect()).toBe(true);expect(queries).toBe(2);expect(w.output.send.mock.calls.filter(c=>c[0].length===9&&c[0][6]===14&&c[0][7]===1)).toHaveLength(1);w.link.disconnect();
  });
});

describe('bounded local reception evidence',()=>{
  it('records received SysEx shape and timing before parser rejection; never stores note payloads',async()=>{
    const w=world(),p=w.connect();await tick();w.input.emit([144,60,100],90);w.input.emit([240,0,32,41,2,14,0,17,247],100);
    expect(await p).toBe(false);const d=w.link.getDiagnostics();expect(d.rxCount).toBe(2);expect(d.sysexCount).toBe(1);expect(d.parserRejects.length).toBe(1);expect(d.lastSysExLength).toBe(9);expect(d.lastSysExHex).toBe('f0 00 20 29 02 0e 00 11 f7');expect(d.lastEventDeltaMs).toBe(-0.5);expect(d.lastArrivalDeltaMs).toBe(0);expect(d.reason).toBe('unaccepted');expect(d.input.name).toBe('LPProMK3 MIDI');expect(d.input.connection).toBe('open');expect(JSON.stringify(d)).not.toContain('144');d.parserRejects.length=99;expect(w.link.getDiagnostics().parserRejects.length).toBe(1);w.link.disconnect();
  });
  it('bounds diagnostic SysEx hex and rejects nonmatching shapes',async()=>{
    const w=world(),p=w.connect();await tick();w.input.emit([240,...Array(200).fill(1),247]);
    expect(await p).toBe(false);const d=w.link.getDiagnostics();expect(d.lastSysExLength).toBe(202);expect(d.lastSysExHex.split(' ')).toHaveLength(16);expect(w.link.isActiveFor(w.input)).toBe(false);w.link.disconnect();
  });
  it('makes at most four queries and one mode entry, then tears down timers/listener',async()=>{
    vi.useFakeTimers();try{
      const w=world({timeoutMs:1500}),p=w.connect();await vi.advanceTimersByTimeAsync(1500);expect(await p).toBe(false);expect(w.link.getReason()).toBe('timeout');expect(w.link.getDiagnostics().queryCount).toBe(4);expect(w.listeners.size).toBe(0);const count=w.output.send.mock.calls.length;await vi.advanceTimersByTimeAsync(3000);expect(w.output.send).toHaveBeenCalledTimes(count);w.link.disconnect();
    }finally{vi.useRealTimers();}
  });
  it('awaits both opens in order and ignores an old open completing after Retry',async()=>{
    const w=world();let finishInput;w.input.open.mockImplementationOnce(()=>new Promise(resolve=>{finishInput=resolve;}));
    const first=w.connect();await tick();expect(w.output.open).not.toHaveBeenCalled();expect(w.link.getDiagnostics().stage).toBe('input-open');
    const second=w.connect();await tick();finishInput();expect(await first).toBe(false);const count=w.output.send.mock.calls.length;w.input.emit(ack);expect(await second).toBe(true);expect(w.output.send.mock.calls.length).toBe(count);w.link.disconnect();
  });
  it('removes old listeners/requery timers so they cannot contaminate the next diagnostic attempt',async()=>{
    vi.useFakeTimers();try{
      const w=world({timeoutMs:1500}),first=w.connect();await vi.advanceTimersByTimeAsync(0);const stale=[...w.listeners][0];
      const second=w.connect();await vi.advanceTimersByTimeAsync(0);expect(await first).toBe(false);stale({data:ack,timeStamp:101});expect(w.link.getDiagnostics().rxCount).toBe(0);w.input.emit(ack);expect(await second).toBe(true);const count=w.output.send.mock.calls.length;await vi.advanceTimersByTimeAsync(2000);expect(w.output.send).toHaveBeenCalledTimes(count);w.link.disconnect();
    }finally{vi.useRealTimers();}
  });
  it('uses only the recognized MIDI pair, without copying mode/query/LED traffic to DIN or DAW',async()=>{
    const w=world(),others=[];
    for(const kind of ['DIN','DAW']){const name='LPProMK3 '+kind;const input={...w.input,id:kind,name},output={...w.output,id:kind,name,send:vi.fn()};w.access.inputs.set(kind,input);w.access.outputs.set(kind,output);others.push(output);}
    const p=w.connect();await tick();w.input.emit(ack);expect(await p).toBe(true);expect(w.link.getDiagnostics().inputCount).toBe(1);expect(w.link.getDiagnostics().outputCount).toBe(1);expect(w.link.paint(Array(64).fill(2))).toBe(true);w.link.disconnect();for(const port of others)expect(port.send).not.toHaveBeenCalled();
  });
  it('keeps a dispatched old-layout response unconfirmed, diagnoses it separately and restores Note',async()=>{
    const w=world(),p=w.connect();await tick();w.input.emit(note,99);expect(w.link.isActiveFor(w.input)).toBe(false);expect(await p).toBe(false);expect(w.link.getReason()).toBe('layout');expect(w.link.getDiagnostics().lastLayout).toEqual({layout:4,page:0});w.link.disconnect();
  });
});

it('keeps SysEx timing attached to that frame while only counting later Note traffic',async()=>{
  const w=world(),p=w.connect();await tick();w.input.emit(ack,100);expect(await p).toBe(true);const first=w.link.getDiagnostics();w.input.emit([144,60,100],10000);const next=w.link.getDiagnostics();expect(next.rxCount).toBe(first.rxCount+1);expect(next.sysexCount).toBe(first.sysexCount);expect(next.lastEventDeltaMs).toBe(-0.5);expect(next.lastSysExHex).toBe(first.lastSysExHex);w.link.disconnect();
});
