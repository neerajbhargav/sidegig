import { test } from 'node:test';
import assert from 'node:assert/strict';

import { rewriteFrameChecks } from '../src/shared/framecheck.ts';

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
});
