import { polylineLength, type XY } from './geo';
import type { CityData } from './parse';

type End = { source: XY; anchor: XY };
type RoadEnds = { start?: End; end?: End };
type Arm = { id: number; side: keyof RoadEnds; tip: XY; inward: XY };
const cache = new WeakMap<CityData, Map<number, RoadEnds>>();

/** The node is a topology point. Fit the viewport junction to the incident road centre lines. */
export function cs2Junctions(city: CityData) {
  const cached = cache.get(city);
  if (cached) return cached;
  const result = new Map<number, RoadEnds>();
  cache.set(city, result);
  if (city.extras?.producer !== 'CS2MapView') return result;
  const nodes = new Map<number, Arm[]>();
  for (const seg of city.segs) {
    if (seg.pedestrianAccess === undefined || seg.sn === seg.en) continue;
    for (const side of ['start', 'end'] as const) {
      const start = side === 'start', points = seg.pts;
      const outer = start ? points[0] : points.at(-1);
      if (!outer) continue;
      const inner = (start ? points : [...points].reverse()).find((p) => Math.hypot(p.x - outer.x, p.z - outer.z) > 0.2);
      if (!inner) continue;
      const dx = inner.x - outer.x, dz = inner.z - outer.z, len = Math.hypot(dx, dz);
      const node = start ? seg.sn : seg.en;
      const arms = nodes.get(node) ?? [];
      arms.push({ id: seg.id, side, tip: [outer.x, outer.z], inward: [dx / len, dz / len] });
      nodes.set(node, arms);
    }
  }
  for (const [id, arms] of nodes) {
    const node = city.nodes.get(id);
    if (!node || arms.length < 2) continue;
    // Fit in metres relative to the game node. A small prior keeps parallel arms from drifting along the road.
    let xx = 0.04, xz = 0, zz = 0.04, bx = 0, bz = 0;
    for (const arm of arms) {
      const [nx, nz] = [-arm.inward[1], arm.inward[0]];
      const offset = nx * (arm.tip[0] - node.x) + nz * (arm.tip[1] - node.z);
      xx += nx * nx; xz += nx * nz; zz += nz * nz;
      bx += nx * offset; bz += nz * offset;
    }
    const determinant = xx * zz - xz * xz;
    const dx = (zz * bx - xz * bz) / determinant, dz = (xx * bz - xz * bx) / determinant;
    const norm = Math.hypot(dx, dz), scale = norm > 12 ? 12 / norm : 1;
    const anchor: XY = [node.x + dx * scale, node.z + dz * scale];
    for (const arm of arms) {
      const ends = result.get(arm.id) ?? {};
      ends[arm.side] = { source: arm.tip, anchor };
      result.set(arm.id, ends);
    }
  }
  return result;
}

function same(a: XY, b: XY) { return Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.0001; }

function trimCount(points: XY[], anchor: XY, length: number, reverse: boolean) {
  const at = (i: number) => points[reverse ? points.length - 1 - i : i];
  const first = at(0);
  const next = (reverse ? [...points].reverse() : points).find((p) => !same(p, first));
  if (!next) return 1;
  const dx = next[0] - first[0], dz = next[1] - first[1];
  const advance = Math.min(length * 0.48, ((anchor[0] - first[0]) * dx + (anchor[1] - first[1]) * dz) / Math.hypot(dx, dz));
  let along = 0;
  for (let i = 1; i < points.length; i++) {
    const a = at(i - 1), b = at(i);
    along += Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (along > advance && !same(b, anchor)) return i;
  }
  return points.length - 1;
}

/** Clip tips that already extend past the junction. Also accepts reversed and partial route pieces. */
export function drawCs2RoadPiece(points: XY[], ends?: RoadEnds): XY[] {
  if (!ends || points.length < 2) return points;
  const pick = (p: XY) => same(p, ends.start?.source ?? [Infinity, Infinity]) ? ends.start?.anchor
    : same(p, ends.end?.source ?? [Infinity, Infinity]) ? ends.end?.anchor : undefined;
  const a = pick(points[0]), b = pick(points[points.length - 1]);
  if (!a && !b) return points;
  const len = polylineLength(points);
  const start = a ? trimCount(points, a, len, false) : 0;
  const end = b ? points.length - trimCount(points, b, len, true) : points.length;
  return [...(a ? [a] : []), ...points.slice(start, end), ...(b ? [b] : [])];
}
