// Normalize gansaku CS2MapView 0.1.1 exports to the existing CS2-compatible CMM reader.
import { readExportMembers } from './vellummap';
import { HALF } from './geo';
import type { BuildingStats, PopulationGrid } from './parse';

export interface Cs2Terrain { height: Float32Array<ArrayBuffer>; water: Float32Array<ArrayBuffer>; population?: PopulationGrid }
type Point = [number, number, number];
type XY = [number, number];
type Network = { id: number; kind: string; start_id: number; end_id: number; geometry: Point[]; name: string; source_raw: string; path_segment_ids?: number[] };
const T = 1081, A = 900, step = 19.2;
const MB = 1024 ** 2;
const required = (e: Element | null, key: string) => {
  if (!e) throw new Error(`Missing CS2MapView element: ${key}`);
  return e;
};
const child = (e: Element, key: string) => required(e.querySelector(`:scope > ${key}`), key);
const attr = (e: Element, key: string) => e.getAttribute(key) ?? '';
const numeric = (s: string) => {
  if (!s.trim() || !Number.isFinite(Number(s))) throw new Error('Invalid number in the CS2MapView export');
  return Number(s);
};
const numberAttr = (e: Element, key: string) => numeric(attr(e, key));
const text = (e: Element, key: string) => child(e, key).textContent ?? '';
const xyz = (e: Element): Point => ['x', 'y', 'z'].map((axis) => numeric(e.getAttribute(axis) ?? text(e, axis.toUpperCase()))) as Point;
const id = (e: Element) => numberAttr(e, 'entity');
const children = (e: Element, key: string) => Array.from(child(e, key).children);

function sampleGrid(raw: Uint8Array, info: Element, isHeight: boolean) {
  const [cols, , rows] = xyz(child(info, 'Resolution')), [ox, oy, oz] = xyz(child(info, 'Offset')), [sx, sy, sz] = xyz(child(info, 'Scale'));
  const size = isHeight ? 2 : 4;
  if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 2 || rows < 2 ||
    raw.byteLength !== cols * rows * size || Math.min(sx, sy, sz) <= 0) throw new Error('Invalid CS2MapView terrain grid');
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const val = (x: number, z: number) => isHeight ? view.getUint16((z * cols + x) * size, true) : view.getFloat32((z * cols + x) * size, true);
  const axis = (scale: number, offset: number, count: number) => Array.from({ length: T }, (_, i) => {
    const p = Math.max(0, Math.min(count - 1.000001, (-HALF + i * 16 + offset) * scale));
    return [Math.floor(p), p % 1];
  });
  const xs = axis(sx, ox, cols), zs = axis(sz, oz, rows), out = new Float32Array(T * T);
  for (let j = 0; j < T; j++) for (let i = 0; i < T; i++) {
    const [x, fx] = xs[i], [z, fz] = zs[j];
    const low = val(x, z) * (1 - fx) + val(x + 1, z) * fx, high = val(x, z + 1) * (1 - fx) + val(x + 1, z + 1) * fx;
    const y = (low * (1 - fz) + high * fz) / sy - oy;
    if (!Number.isFinite(y)) throw new Error('Invalid CS2MapView terrain sample');
    out[j * T + i] = y;
  }
  return out;
}

function curve(e: Element, start: number, end: number): Point[] {
  const p = [0, 1, 2, 3].map((i): XY => [numberAttr(e, 'x' + i), -numberAttr(e, 'y' + i)]);
  const length = p.slice(1).reduce((n, q, i) => n + Math.hypot(q[0] - p[i][0], q[1] - p[i][1]), 0);
  const count = Math.max(2, Math.min(256, Math.ceil(length / 12)));
  return Array.from({ length: count + 1 }, (_, i) => {
    const t = i / count, u = 1 - t, w = [u ** 3, 3 * u * u * t, 3 * u * t * t, t ** 3];
    return [p.reduce((sum, q, k) => sum + w[k] * q[0], 0), u * start + t * end, p.reduce((sum, q, k) => sum + w[k] * q[1], 0)];
  });
}

function districtCells(e: Element): XY[] {
  const cells = new Map<number, XY>();
  for (const triangle of e.querySelectorAll('Geometry > Triangles > Triangle')) {
    const ring = [0, 1, 2].map((i): XY => [numberAttr(triangle, 'x' + i), -numberAttr(triangle, 'y' + i)]);
    const first = Math.max(0, Math.ceil((Math.min(...ring.map((p) => p[1])) + HALF) / step - 0.5));
    const last = Math.min(A, Math.ceil((Math.max(...ring.map((p) => p[1])) + HALF) / step - 0.5));
    for (let j = first; j < last; j++) {
      const z = -HALF + (j + 0.5) * step;
      const cuts = ring.flatMap(([x1, z1], i) => {
        const [x2, z2] = ring[(i + 1) % 3];
        return (z1 > z) !== (z2 > z) ? [x1 + (z - z1) * (x2 - x1) / (z2 - z1)] : [];
      }).sort((a, b) => a - b);
      if (cuts.length !== 2) continue;
      for (let i = Math.max(0, Math.ceil((cuts[0] + HALF) / step - 0.5)); i < Math.min(A, Math.ceil((cuts[1] + HALF) / step - 0.5)); i++) {
        cells.set(j * A + i, [-HALF + (i + 0.5) * step, z]);
      }
    }
  }
  return [...cells.values()];
}

export async function normalizeCs2Map(bytes: Uint8Array, fileTime: string) {
  const data = await readExportMembers(bytes, {
    'main.xml': MB, 'roads.xml': 32 * MB, 'rails.xml': 24 * MB, 'buildings.xml': 32 * MB,
    'districts.xml': 16 * MB, 'transports.xml': 32 * MB, 'terrain.dat': 64 * MB, 'water.dat': 64 * MB,
  }, { 'skyline-businesses.xml': 24 * MB, 'skyline-transit.xml': MB, 'skyline-building-stats.xml': 24 * MB });
  const xml = (name: string, root: string) => {
    const result = new DOMParser().parseFromString(new TextDecoder('utf-8', { fatal: true }).decode(data.get(name + '.xml')), 'application/xml');
    if (result.documentElement.localName !== root || result.doctype) throw new Error(`Invalid CS2MapView ${name}.xml`);
    return result.documentElement;
  };
  const main = xml('main', 'CS2MainData'), roads = xml('roads', 'CS2RoadsData'), rails = xml('rails', 'CS2RailsData');
  const buildings = xml('buildings', 'CS2BuildingsData'), districts = xml('districts', 'CS2DistrictsData'), transit = xml('transports', 'CS2TransportLineData');
  if (text(main, 'FileVersion').trim() !== '0.1.1.0') throw new Error('This viewer supports CS2MapView export format 0.1.1.0');
  const terrain: Cs2Terrain = { height: sampleGrid(data.get('terrain.dat')!, child(main, 'Terrain'), true), water: sampleGrid(data.get('water.dat')!, child(main, 'Water'), false) };
  const stats = new Map<number, BuildingStats>();
  const upgrades = new Set<number>();
  if (data.has('skyline-building-stats.xml')) {
    const root = xml('skyline-building-stats', 'SkylineBuildingStats');
    if (attr(root, 'version') === '1') {
      for (const record of root.querySelectorAll(':scope > Building')) {
        const b: BuildingStats = {};
        for (const key of ['residents', 'households', 'capacity', 'averageRent', 'employees', 'jobs', 'averageSalary'] as const) {
          if (record.hasAttribute(key)) b[key] = numberAttr(record, key);
        }
        stats.set(id(record), b);
        if (attr(record, 'upgrade') === 'true') upgrades.add(id(record));
      }
      const grid = root.querySelector(':scope > Population');
      if (grid) {
        const width = numberAttr(grid, 'width'), height = numberAttr(grid, 'height');
        const west = numberAttr(grid, 'west'), south = numberAttr(grid, 'south'), cell = numberAttr(grid, 'cell');
        const values = Uint8Array.from(atob(grid.textContent?.trim() ?? ''), (v) => v.charCodeAt(0));
        if ([width, height].some((n) => !Number.isInteger(n) || n < 2 || n > 256) || values.length !== width * height || cell <= 0) throw new Error('Invalid population grid');
        const colors = ['low', 'middle', 'high'].map((key) => attr(grid, key));
        terrain.population = { width, height, west, south, cell, values,
          colors: colors.every((color) => /^[a-f0-9]{8}$/i.test(color)) ? colors as [string, string, string] : undefined };
      }
    }
  }
  const nodes = new Map<number, { id: number; pos: Point; mode_hint: string }>();
  const networks: Network[] = [];
  const prefabs = new Map(children(roads, 'RoadPrefabs').map((e) => [id(e), e]));
  const railKinds: Record<string, [string, string]> = { '1': ['RAIL', 'Train Track'], '2': ['TRAM', 'Tram Track'], '4': ['METRO', 'Metro Track'] };
  for (const [layer, nodeTag, segmentTag] of [[roads, 'RoadNodes', 'RoadSegments'], [rails, 'RailNodes', 'RailSegments']] as const) {
    for (const e of children(layer, nodeTag)) {
      const n = { id: id(e), pos: xyz(child(e, 'Position')), mode_hint: numberAttr(child(e, 'Elevation'), 'x') < -1 ? 'TUNNEL' : 'GROUND' };
      nodes.set(n.id, n);
    }
    for (const e of children(layer, segmentTag)) {
      const start = numberAttr(e, 'startNode'), end = numberAttr(e, 'endNode');
      const a = nodes.get(start), b = nodes.get(end);
      if (!a || !b) throw new Error('CS2MapView segment references a missing junction');
      const common = { id: id(e), start_id: start, end_id: end, display_name: attr(e, 'name'), geometry: curve(child(e, 'Curve'), a.pos[1], b.pos[1]) };
      if (layer === roads) {
        const prefab = required(prefabs.get(numberAttr(e, 'prefab')) ?? null, 'road prefab');
        const name = attr(prefab, 'name'), highway = attr(prefab, 'highway') === 'true', flags = numberAttr(e, 'lanes');
        const width = numeric(text(prefab, 'DefaultWidth')), car = !!(flags & 1);
        const road = { ...common, name, source_raw: (highway ? 'Highway ' : '') + name, width, kind: car ? 'ROAD' : 'BEAUTIFICATION',
          pedestrian_access: !!(flags & 2) && !highway, lane_summary: { car_lane_count: car ? Math.max(1, Math.round(width / (highway ? 5 : 8))) : 0, direction: 0 },
          car_access: car ? { forward: 'allowed', backward: 'allowed' } : {} };
        networks.push(road);
      } else {
        const [kind, name] = railKinds[attr(e, 'type')] ?? ['OTHER', 'Track'];
        const track = { ...common, name, source_raw: name, kind, width: 8 };
        networks.push(track);
      }
    }
  }
  const buildingPrefabs = new Map(children(buildings, 'BuildingPrefabs').map((e) => [id(e), e]));
  const business = new Map<number, Element>();
  if (data.has('skyline-businesses.xml')) {
    const root = xml('skyline-businesses', 'SkylineBusinesses');
    if (attr(root, 'version') === '1') {
      for (const e of root.querySelectorAll('Building')) business.set(id(e), e);
    }
  }
  const services = [[0x800000, 'Residential'], [0x1000000, 'Commercial'], [0x4000000, 'Office'], [0x2000000, 'Industrial'],
    [0x30, 'PublicTransport'], [0x1000, 'Education'], [0x40008000, 'HealthCare'], [0x4000, 'Beautification'],
    [0x200000, 'Parking'], [0x10000 | 0x100, 'PoliceDepartment'], [0x80, 'FireDepartment'],
    [0x400003, 'Electricity'], [0x0c, 'Water'], [0x40, 'Garbage'], [0x2000, 'Disaster'],
    [0x100200, 'Road'], [0x400 | 0x800 | 0x20000 | 0x40000 | 0x80000, 'Civic']] as const;
  const exportedBuildings = children(buildings, 'Buildings');
  const buildingsById = new Map(exportedBuildings.map((e) => [id(e), e]));
  const footprints = exportedBuildings.map((e) => {
    const prefab = required(buildingPrefabs.get(numberAttr(e, 'prefab')) ?? null, 'building prefab');
    const [x, y, z] = xyz(child(e, 'Position')), [w, , d] = xyz(child(prefab, 'Size')), rotation = child(e, 'Rotation');
    const angle = 2 * Math.atan2(numberAttr(rotation, 'y'), numberAttr(rotation, 'w')), c = Math.cos(angle), s = Math.sin(angle);
    const footprint = [[-w/2, -d/2], [w/2, -d/2], [w/2, d/2], [-w/2, d/2]].map(([dx, dz]) => [x + dx*c + dz*s, z - dx*s + dz*c]);
    const flags = numberAttr(e, 'type');
    const buildingId = id(e), record = business.get(buildingId);
    const tenants = record ? [...record.querySelectorAll('Company')] : [];
    const products = Object.fromEntries(['sells', 'produces', 'stores'].map((activity) => {
      const names = tenants.flatMap((tenant) => [...tenant.querySelectorAll(`Product[activity="${activity}"]`)].map((product) => {
        const label = attr(product, 'name').trim(), company = attr(tenant, 'name').trim();
        return label && tenants.length > 1 && company ? company + ' · ' + label : label;
      }));
      return [activity, [...new Set(names.filter(Boolean))].join(' / ')];
    }));
    const prefabName = attr(prefab, 'name');
    const parentId = Math.max(0, numberAttr(e, 'parent'));
    const parent = buildingsById.get(parentId);
    const name = attr(e, 'name').trim();
    // Old exports have no upgrade marker. Require a building service and a distinct game label.
    const independentAnnex = !!parent && !upgrades.has(buildingId) && services.some(([flag]) => flags & flag) &&
      !!name && !name.startsWith('Assets.') && name !== attr(parent, 'name').trim();
    return { id: buildingId, name: prefabName, service: services.find(([flag]) => flags & flag)?.[1] ?? '', footprint, base_elevation_m: y, skyline_stats: stats.get(buildingId),
      independent_annex: independentAnnex,
      individual_name: !!(flags & 0x20000000) && /signature/i.test(prefabName),
      ...(record ? { company_kind: attr(record, 'kind'), company_names: tenants.map((tenant) => attr(tenant, 'name')).filter(Boolean),
        house_number: attr(record, 'number'), street_name: attr(record, 'road'), business_products: products } : {}),
      parent_building_id: parentId, display_name: { text: name, source: attr(e, 'customName') === 'true' ? 'custom' : 'game' } };
  });
  const areas = children(districts, 'Districts').map((e, i) => {
    const [x, , z] = xyz(child(e, 'CenterPosition'));
    return { id: i + 1, kind: 'DISTRICT', position: [x, z], name: { text: attr(e, 'name') }, grid_cell: step, grid_points: districtCells(e) };
  });
  if (areas.length > 255) throw new Error('Skyline Map supports at most 255 districts');

  let nextNode = [...nodes.keys()].reduce((a, n) => Math.max(a, n), 0) + 1;
  let nextNetwork = networks.reduce((n, w) => Math.max(n, w.id), 0) + 1;
  const stops = children(transit, 'Stops').map((e) => {
    const pos = xyz(child(e, 'Position')), node = nextNode++;
    nodes.set(node, { id: node, pos, mode_hint: 'GROUND' });
    return { id: id(e), network_node_id: node, name: attr(e, 'name').trim(), pos, lines: children(e, 'Lines').map((line) => numeric(line.textContent ?? '')) };
  });
  const fares = new Map<number, number>();
  if (data.has('skyline-transit.xml')) {
    const root = xml('skyline-transit', 'SkylineTransit');
    if (attr(root, 'version') === '1') for (const e of root.querySelectorAll('Line')) {
      const fare = numberAttr(e, 'fare');
      if (fare >= 0) fares.set(id(e), fare);
    }
  }
  const modes: Record<string, [string, string]> = { '0': ['BUS', 'Bus'], '1': ['RAIL', 'Train'], '3': ['TRAM', 'Tram'], '8': ['METRO', 'Metro'], '10': ['FERRY', 'Ferry'] };
  const routes: { line_id: number; stop_ids: number[] }[] = [];
  const lines = children(transit, 'Lines').flatMap((e) => {
    const line = id(e), [kind, name] = modes[attr(e, 'type')] ?? ['OTHER', 'Other'], color = child(e, 'Color');
    const lineStops = stops.filter((s) => s.lines.includes(line));
    if (lineStops.length < 2) return [];
    const legs = children(e, 'Segments').flatMap((seg) => {
      const geometry = children(seg, 'Curves').flatMap((part, i) => curve(part, 0, 0).slice(i ? 1 : 0));
      if (geometry.length < 2) return [];
      const [x, , z] = geometry[0];
      const dist = (s: typeof lineStops[number]) => (x - s.pos[0]) ** 2 + (z - s.pos[2]) ** 2;
      return [{ geometry, stop: lineStops.reduce((a, b) => dist(b) < dist(a) ? b : a) }];
    });
    if (legs.length < 2) return [];
    const pairs = new Set<string>();
    legs.forEach(({ geometry, stop }, i) => {
      const end = legs[(i + 1) % legs.length].stop, pair = stop.id + ',' + end.id;
      if (stop.id === end.id || pairs.has(pair)) return;
      pairs.add(pair);
      const track = nextNetwork++;
      networks.push({ id: track, kind: 'TRANSIT_GEOMETRY', name: kind === 'METRO' ? 'Transit Tunnel Geometry' : 'Transit Geometry',
        source_raw: 'Transit Geometry Line', start_id: stop.network_node_id, end_id: end.network_node_id, geometry });
      const hop = { id: nextNetwork++, kind: 'STOP_LINE', transit_for: kind, name: name + ' Line', source_raw: name + ' Line',
        start_id: stop.network_node_id, end_id: end.network_node_id, geometry: [stop.pos, end.pos], path_segment_ids: [track] };
      networks.push(hop);
    });
    routes.push({ line_id: line, stop_ids: legs.map((leg) => leg.stop.id) });
    return [{ id: line, name: attr(e, 'name'), kind, source_raw: name, fare: fares.get(line), user_color: ['r', 'g', 'b'].map((k) => numberAttr(color, k)) }];
  });
  const doc = { schema_version: 'cmm-v1', metadata: { origin: { source_name: text(main, 'CityName') }, exported_at: fileTime },
    sea_level: numeric(text(main, 'SeaLevel')), nodes: [...nodes.values()], networks, buildings: footprints, districts: areas,
    stops: stops.map(({ id, network_node_id, name }) => ({ id, network_node_id, name })), transit_lines: lines, routes,
    extensions: { skyline_map_compat: { source_game: 'cs2', source_exporter: 'CS2MapView' } } };
  return { buffer: new TextEncoder().encode(JSON.stringify(doc)).buffer as ArrayBuffer, terrain };
}
