import { test } from 'node:test';
import assert from 'node:assert/strict';

import { rewriteFrameChecks, rewriteTopRefs } from '../src/shared/framecheck.ts';

test('Gmail’s boot check becomes "not in a frame"', () => {
  const g = 'var Nh=window.location.href,Oh=window!=top||window.frameElement?Nh:null;\nif(Oh)Ve(Oh);else{boot()}';
  assert.equal(rewriteFrameChecks(g), 'var Nh=window.location.href,Oh=!1?Nh:null;\nif(Oh)Ve(Oh);else{boot()}');
});

test('common forms rewrite; property accesses and unrelated code stay', () => {
  assert.equal(rewriteFrameChecks('try{return window.self!==window.top}catch{}'), 'try{return !1}catch{}');
  assert.equal(rewriteFrameChecks('if(top!=self)x()'), 'if(!1)x()');
  assert.equal(rewriteFrameChecks('d=window===top'), 'd=!0');
  assert.equal(rewriteFrameChecks('a.top!==window.self'), 'a.top!==window.self');
  assert.equal(rewriteFrameChecks('e.top!=window&&f(e.top)'), 'e.top!=window&&f(e.top)');
  assert.equal(rewriteFrameChecks('var stop=1;topmost!=self'), 'var stop=1;topmost!=self');
  assert.equal(rewriteFrameChecks('b.left!==void 0?e.left:window.innerWidth'), 'b.left!==void 0?e.left:window.innerWidth');
  // A property read on top stays code (rewriting it to `!1.window` would not parse).
  assert.equal(rewriteFrameChecks('x=self!==top.window;y=window===top.self'), 'x=self!==top.window;y=window===top.self');
  assert.equal(rewriteTopRefs(rewriteFrameChecks('x=self!==top.window')), 'x=self!==self.window');
});

test('Gmail’s own uses of `top` become its own window (real lines from its module "a")', () => {
  assert.equal(rewriteTopRefs('_.pu(top,_.Ck,function(){top.gmonkey=self.gmonkey});'), '_.pu(self,_.Ck,function(){self.gmonkey=self.gmonkey});');
  assert.equal(rewriteTopRefs('_.Jo.js=window;_.Jo!=top&&delete top.js;'), '_.Jo.js=window;_.Jo!=self&&delete self.js;');
  assert.equal(rewriteTopRefs('for(n in g)n in top&&(loadTimesMap[g[n]]=top[n]);'), 'for(n in g)n in self&&(loadTimesMap[g[n]]=self[n]);');
  assert.equal(rewriteTopRefs('a=top.Array.apply(null,arguments);this.rb=_.Q1b(top);'), 'a=self.Array.apply(null,arguments);this.rb=_.Q1b(self);');
});

test('`top` as an object key, a write or text stays', () => {
  for (const s of [
    '{left:0,top:0}',
    'a.style.top="1px";var stop=1,topmost=2',
    '"left="+c+",top="+d+",status=no"',
    '"See your most recent messages at the top of your inbox."',
    '"margin-top"',
  ])
    assert.equal(rewriteTopRefs(s), s);
});

test('`x.top` reads go through the window check; writes, calls and other shapes stay', () => {
  assert.equal(rewriteTopRefs('g=_.ar(this.ha.top);'), 'g=_.ar(__sidegigTop(this.ha));');
  assert.equal(rewriteTopRefs('b=b||window.top;'), 'b=b||__sidegigTop(window);');
  assert.equal(rewriteTopRefs('new _.Xq(d.top-a.ha.top,1)'), 'new _.Xq(__sidegigTop(d)-__sidegigTop(a.ha),1)');
  for (const s of ['a.style.top="1px"', 'a.top+=b', 'a.top++', 'a.top===b', 'f(x).top', 'a[0].top', 'a?.top', 'a.top()', 'a.topmost'])
    assert.equal(rewriteTopRefs(s), s.replace('a.top===b', '__sidegigTop(a)===b'));
});
