import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WalkingMotion, walkingPath } from '../src/app/movement.ts';

const open = (x, y) => x >= 0 && y >= 0 && x < 40 && y < 40;
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} ≠ ${expected}`);

test('a long click advances at the server tile speed instead of jumping to its destination', () => {
  const motion = new WalkingMotion();
  motion.reset({ x: 2, y: 2 });
  motion.follow(walkingPath({ x: 2, y: 2 }, { x: 8, y: 2 }, open), 200, 0);
  assert.deepEqual(motion.position, { x: 2, y: 2 });
  near(motion.advance(300).x, 3.5);
  near(motion.advance(1199).x, 7.995);
  assert.equal(motion.active, true);
  assert.deepEqual(motion.advance(1200), { x: 8, y: 2 });
  assert.equal(motion.active, false);
});

test('diagonal steps take 1.4 times the orthogonal delay, as in TMWA', () => {
  const motion = new WalkingMotion();
  motion.reset({ x: 2, y: 2 });
  motion.follow(walkingPath({ x: 2, y: 2 }, { x: 4, y: 4 }, open), 150, 0);
  assert.deepEqual(motion.advance(105), { x: 2.5, y: 2.5 });
  assert.deepEqual(motion.advance(420), { x: 4, y: 4 });
});

test('routes go around walls and cannot cut through a blocked diagonal corner', () => {
  const walkable = (x, y) => open(x, y) && !(x === 4 && y >= 1 && y <= 5);
  const path = walkingPath({ x: 2, y: 3 }, { x: 6, y: 3 }, walkable);
  assert.ok(path);
  assert.deepEqual(path[0], { x: 2, y: 3 });
  assert.deepEqual(path.at(-1), { x: 6, y: 3 });
  assert.ok(path.some(tile => tile.y === 0 || tile.y === 6));
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    assert.ok(walkable(b.x, b.y));
    assert.ok(Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1);
    if (a.x !== b.x && a.y !== b.y) {
      assert.ok(walkable(a.x, b.y));
      assert.ok(walkable(b.x, a.y));
    }
  }
  assert.equal(walkingPath({ x: 0, y: 0 }, { x: 1, y: 1 }, (x, y) => x === y && x >= 0 && x <= 1), null);
});

test('repeated acknowledgements and a new click do not restart or accelerate the current step', () => {
  const motion = new WalkingMotion();
  motion.reset({ x: 2, y: 2 });
  const route = walkingPath({ x: 2, y: 2 }, { x: 10, y: 2 }, open);
  motion.follow(route, 200, 0);
  for (const now of [60, 120, 180, 220]) {
    motion.follow(route, 200, now);
    near(motion.position.x, 2 + now / 200);
  }
  motion.follow(walkingPath({ x: 3, y: 2 }, { x: 7, y: 2 }, open), 200, 250);
  near(motion.advance(400).x, 4);
  near(motion.advance(1000).x, 7);
});

test('server speed changes preserve progress, and corrections or warps cancel the old route', () => {
  const motion = new WalkingMotion();
  motion.reset({ x: 2, y: 2 });
  motion.follow(walkingPath({ x: 2, y: 2 }, { x: 10, y: 2 }, open), 100, 0);
  motion.changeSpeed(200, 250);
  near(motion.position.x, 4.5);
  near(motion.advance(350).x, 5);
  motion.reset({ x: 112, y: 85 });
  assert.deepEqual(motion.advance(9000), { x: 112, y: 85 });
  assert.equal(motion.active, false);
});
