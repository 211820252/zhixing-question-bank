import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const context = vm.createContext({});
vm.runInContext(readFileSync(new URL('../encouragement.js', import.meta.url), 'utf8'), context);
const { normalize, advance } = context.ZhixingEncouragementCore;
const yes = () => .1;
let state = normalize(null);
for (let i=1;i<=7;i++) {
  const result = advance(state, true, 1_000_000 + i*30_000, yes);
  assert.equal(result.message, null, 'no encouragement in first seven answers');
  state = result.state;
}
let result = advance(state, true, 1_240_000, yes);
assert.match(result.message.text, /洁猪/);
assert.match(result.message.text, /8/);
assert.equal(result.state.sinceShown, 0);
const firstId = result.message.id;
state = normalize(JSON.parse(JSON.stringify(result.state)));
for (let i=1;i<=8;i++) {
  result = advance(state, true, 1_240_000+i*1_000, yes);
  assert.equal(result.message, null, 'time cooldown survives persistence and suppresses rapid milestones');
  state=result.state;
}
for (let i=17;i<=18;i++) {
  result = advance(state, true, 1_340_000+i*1_000, yes);
  state=result.state;
}
assert.ok(result.message, 'eligible later streak can trigger after both cooldowns');
assert.notEqual(result.message.id, firstId, 'consecutive cards do not repeat the same message');
result=advance(state,false,1_400_000,yes);
assert.equal(result.state.streak,0,'wrong answer resets streak');
assert.equal(result.message,null);
state=normalize(null);
for(let i=1;i<=8;i++){result=advance(state,false,2_000_000+i*30_000,yes);state=result.state;}
assert.match(result.message.id,/^effort:/,'effort encouragement is possible even without correct answers');
assert.match(result.message.text,/洁猪/);
result=advance({attempts:11,correct:5,streak:0,sinceShown:11},true,3_000_000,yes);
assert.match(result.message.id,/^correct:/,'correct-answer accumulation has its own trigger');
result=advance({attempts:7,correct:0,sinceShown:7},false,4_000_000,()=>.99);
assert.equal(result.message,null,'milestone can miss its probability roll');
result=advance({attempts:9,correct:6,streak:0,sinceShown:9},false,4_000_000,yes);
assert.equal(result.message,null,'wrong answer cannot retrigger an old correct-answer milestone');
result=advance({attempts:15,correct:15,streak:15,sinceShown:7,lastShownAt:4_000_000},true,4_090_000,yes);
assert.ok(result.message,'exact minimum answer/time boundaries permit a trigger');
state=normalize(null);
let lastCount=0,lastTime=0,cards=0;
for(let i=1;i<=300;i++){
  const now=5_000_000+i*20_000;
  result=advance(state,i%9!==0,now,yes);state=result.state;
  if(result.message){
    assert.ok(i-lastCount>=8,'long practice respects question spacing');
    if(lastTime)assert.ok(now-lastTime>=90_000,'long practice respects time spacing');
    lastCount=i;lastTime=now;cards++;
  }
}
assert.ok(cards>0&&cards<=37);
assert.equal(normalize({attempts:-1,correct:99,streak:Infinity,sinceShown:'bad'}).correct,0);
console.log('Encouragement tests passed: all three triggers, probability misses, answer/time cooldowns, reload, wrong-answer reset, no repeated messages and long-session spacing.');
