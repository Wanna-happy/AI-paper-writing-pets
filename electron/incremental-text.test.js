const assert = require('node:assert/strict');
const IncrementalText = require('../src/incremental-text');
(async () => {
  const jobs = new Map(), frames = []; let id = 0;
  const renderer = new IncrementalText(text => frames.push(text), { batch: 4,
    schedule: fn => { jobs.set(++id, fn); return id; }, unschedule: key => jobs.delete(key) });
  const drain = () => { while (jobs.size) { const [key, fn] = jobs.entries().next().value; jobs.delete(key); fn(); } };
  const text = '这是一段一次性抵达的长回复，界面必须分多帧逐步展示。';
  renderer.push(text);
  assert.equal(frames[0], text.slice(0, 4));
  let finished = false;
  const completion = renderer.finish(text).then(() => { finished = true; });
  await Promise.resolve(); assert.equal(finished, false, '完成回调不能绕过显示队列');
  drain(); await completion;
  assert.equal(frames.at(-1), text);
  assert(frames.length > 4);
  renderer.push('待清除的工具前文字'); renderer.reset(''); drain();
  assert.equal(frames.at(-1), '');
  const fallback = renderer.finish(text); assert.notEqual(frames.at(-1), text); drain(); await fallback;
  assert.equal(frames.at(-1), text, '没有增量时完整结果也须分帧显示');
  renderer.reset(); renderer.push('😀😀😀😀😀'); drain();
  assert(frames.filter(frame => frame.startsWith('😀')).every(frame => !/[\uD800-\uDBFF]$/.test(frame)), '不能拆开 emoji');
  renderer.reset(); renderer.push(text); renderer.cancel(); drain();
  assert.notEqual(frames.at(-1), text);
  console.log('large chunk pacing, completion drain, reset, fallback, Unicode and cancellation passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
