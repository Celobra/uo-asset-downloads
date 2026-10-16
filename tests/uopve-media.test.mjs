import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url),digest=b=>createHash('sha256').update(b).digest('hex');
const media=JSON.parse(await readFile(new URL('data/uopve-media-release.json',root),'utf8'));
test('Opening film preserves the recovered original media and uses deliberate playback controls',async()=>{
  const preview=await readFile(new URL('public'+media.preview.file,root));
  assert.equal(preview.length,media.preview.sizeBytes);assert.equal(digest(preview),media.preview.sha256);
  assert.equal(digest(await readFile(new URL('public'+media.poster.file,root))),media.poster.sha256);
  assert.equal(media.durationSeconds,36);assert.equal(media.preview.audio,false);assert.equal(media.original.audio,true);
  const html=await readFile(new URL('public/uopve/introduction/index.html',root),'utf8');
  assert.ok(html.includes(media.preview.file));assert.ok(html.includes(media.poster.file));assert.ok(html.includes(media.original.url));
  const video=html.match(/<video\b[^>]*>/)?.[0];assert.ok(video);assert.match(video,/controls/);assert.match(video,/preload="none"/);assert.doesNotMatch(video,/autoplay/);
  assert.match(html,/36-second illustrated introduction/);assert.match(html,/preview is silent/);
});
