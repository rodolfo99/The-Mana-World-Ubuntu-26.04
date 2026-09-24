// SPDX-License-Identifier: GPL-3.0-or-later
// Route rules follow sources/tmwa/src/map/path.cpp: diagonal-first direct
// paths, costs 10/14, no corner cutting, then a Manhattan-priority search.
export interface Tile { x: number; y: number }
export type Walkable = (x: number, y: number) => boolean;

const same = (a: Tile, b: Tile): boolean => a.x === b.x && a.y === b.y;
const distance = (a: Tile, b: Tile): number => {
  const dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y);
  return Math.max(dx, dy) + .4 * Math.min(dx, dy);
};

export function walkingPath(from: Tile, to: Tile, walkable: Walkable): Tile[] | null {
  if (![from.x, from.y, to.x, to.y].every(Number.isInteger) ||
      !walkable(from.x, from.y) || !walkable(to.x, to.y)) return null;
  const canStep = (a: Tile, b: Tile): boolean => walkable(b.x, b.y) &&
    (a.x === b.x || a.y === b.y || walkable(a.x, b.y) && walkable(b.x, a.y));
  const direct = [{ ...from }];
  let here = from;
  while (!same(here, to) && direct.length <= 48) {
    const next = { x: here.x + Math.sign(to.x - here.x), y: here.y + Math.sign(to.y - here.y) };
    if (!canStep(here, next)) break;
    direct.push(next);
    here = next;
  }
  if (same(here, to)) return direct;

  interface Node { tile: Tile; travelled: number; cost: number; parent?: Node; closed: boolean }
  const cost = (tile: Tile, travelled: number): number =>
    (Math.abs(tile.x - to.x) + Math.abs(tile.y - to.y)) * 10 + travelled;
  const key = (tile: Tile): string => `${tile.x},${tile.y}`;
  const start: Node = { tile: from, travelled: 0, cost: cost(from, 0), closed: false };
  const nodes = new Map<string, Node>([[key(from), start]]);
  const heap: Node[] = [];
  const lift = (node: Node, startIndex: number): void => {
    let index = startIndex;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (heap[parent].cost <= node.cost) break;
      heap[index] = heap[parent]; index = parent;
    }
    heap[index] = node;
  };
  const push = (node: Node): void => {
    heap.push(node);
    lift(node, heap.length - 1);
  };
  const pop = (): Node => {
    const first = heap[0], last = heap.pop()!;
    if (!heap.length) return first;
    let index = 0;
    while (index * 2 + 1 < heap.length) {
      let child = index * 2 + 1;
      if (child + 1 < heap.length && heap[child + 1].cost <= heap[child].cost) child++;
      heap[index] = heap[child]; index = child;
    }
    lift(last, index);
    return first;
  };
  const directions = [[1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1]];
  push(start);
  for (let visited = 0; heap.length && visited < 4096; visited++) {
    const node = pop();
    if (node.closed) continue;
    node.closed = true;
    if (same(node.tile, to)) {
      const result: Tile[] = [];
      let cursor: Node | undefined = node;
      while (cursor) { result.push(cursor.tile); cursor = cursor.parent; }
      return result.length <= 49 ? result.reverse() : null;
    }
    for (const [dx, dy] of directions) {
      const tile = { x: node.tile.x + dx, y: node.tile.y + dy };
      if (!canStep(node.tile, tile)) continue;
      const travelled = node.travelled + (dx && dy ? 14 : 10);
      const previous = nodes.get(key(tile));
      if (previous && previous.travelled <= travelled) continue;
      if (previous) {
        previous.travelled = travelled;
        previous.cost = cost(tile, travelled);
        previous.parent = node;
        if (previous.closed) push(previous);
        else lift(previous, heap.indexOf(previous));
        previous.closed = false;
      } else {
        const next = { tile, travelled, cost: cost(tile, travelled), parent: node, closed: false };
        nodes.set(key(tile), next); push(next);
      }
    }
  }
  return null;
}

/** Continuous drawing position; only an acknowledged route starts movement. */
export class WalkingMotion {
  position: Tile = { x: 0, y: 0 };
  private path: Tile[] = [];
  private segment = 0;
  private started = 0;
  private stepMs = 150; // TMWA DEFAULT_WALK_SPEED

  get active(): boolean { return this.segment + 1 < this.path.length; }

  reset(tile: Tile): void {
    this.position = { ...tile };
    this.path = [];
    this.segment = 0;
  }

  changeSpeed(stepMs: number, now: number): void {
    if (!Number.isFinite(stepMs) || stepMs <= 0) return;
    this.advance(now);
    this.path = [{ ...this.position }, ...this.path.slice(this.segment + 1)];
    this.segment = 0;
    this.started = now;
    this.stepMs = stepMs;
  }

  follow(path: Tile[], stepMs: number, now: number): void {
    this.advance(now);
    let route = path.map(tile => ({ ...tile }));
    if (!route.length) return;
    if (this.active) {
      // Retarget from the current drawing position when it is on the new
      // route. Repeated acknowledgements must not restart the same step.
      const current = this.position;
      const index = route.findIndex((a, i) => {
        const b = route[i + 1];
        return b && Math.abs(distance(a, current) + distance(current, b) - distance(a, b)) < 1e-7 &&
          Math.abs((b.x - a.x) * (current.y - a.y) - (b.y - a.y) * (current.x - a.x)) < 1e-7;
      });
      if (index >= 0) route = [{ ...current }, ...route.slice(index + 1)];
      else if (distance(current, route[0]) <= 1.4 && !same(current, route[0])) route.unshift({ ...current });
    }
    this.path = route;
    this.segment = 0;
    this.started = now;
    this.stepMs = Number.isFinite(stepMs) && stepMs > 0 ? stepMs : 150;
    this.position = { ...route[0] };
  }

  advance(now: number): Tile {
    while (this.active) {
      const from = this.path[this.segment], to = this.path[this.segment + 1];
      const duration = distance(from, to) * this.stepMs;
      const elapsed = Math.max(0, now - this.started);
      if (duration > 0 && elapsed < duration) {
        const fraction = elapsed / duration;
        this.position = { x: from.x + (to.x - from.x) * fraction, y: from.y + (to.y - from.y) * fraction };
        return this.position;
      }
      this.position = { ...to };
      this.started += duration;
      this.segment++;
    }
    return this.position;
  }
}
