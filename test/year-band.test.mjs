import test from 'node:test';
import assert from 'node:assert/strict';
import { yearBandSegments } from '../lib/schedule.mjs';

test('year boundary follows January 1 rather than today', () => {
  for (const rotation of [-320, -180, -90, 0, 90, 180, 270, 720]) {
    const segments = yearBandSegments(rotation, 2026);
    assert.equal(segments[0].start, 90);
    assert.ok(Math.abs(segments[0].portion + segments[1].portion - 1) < 1e-12);
    assert.equal(segments[1].start, ((rotation - 90) % 360 + 360) % 360);
    assert.equal(segments[1].year, segments[0].year + 1);
    if (segments[0].portion !== 0.5) assert.equal(segments[segments[0].portion > 0.5 ? 0 : 1].year, 2026);
  }
});

test('year at top stays continuous when January crosses the top seam', () => {
  const before = yearBandSegments(-0.01, 2026);
  const after = yearBandSegments(0.01, 2025);
  assert.deepEqual(before.map(segment => segment.year), [2025, 2026]);
  assert.deepEqual(after.map(segment => segment.year), [2025, 2026]);
  assert.equal(yearBandSegments(-180, 2026)[0].portion, 0);
});
