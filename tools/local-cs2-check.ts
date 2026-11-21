import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { buildCity } from '../src/build';
import { readCmm } from '../src/cmm';
import catalog from '../src/lane-catalog.json';
import type { LaneCatalog } from '../src/lane-infer';
import { Router } from '../src/router';
import type { XY } from '../src/geo';

for (const input of process.argv.slice(2)) {
  const city = await readCmm(gunzipSync(readFileSync(input)), catalog as unknown as LaneCatalog);
  const built = buildCity(city, () => {}, city.extras?.oneway);
  const router = new Router(city, built.stopNames ?? new Map(), city.extras?.oneway);
  const walkable = city.segs.filter((s) => router.edgeAccess(s.id)?.walk).length;
  const hasPedestrianData = city.segs.some((s) => s.pedestrianAccess);
  console.log(city.name, walkable, 'walkable segments');
  if (hasPedestrianData) assert.ok(walkable > 0);
  for (const line of city.transports) {
    const a = city.nodes.get(line.stops[0])!, b = city.nodes.get(line.stops[(line.stops.length / 2) | 0])!;
    const from: XY = [a.x + 2, a.z + 2], to: XY = [b.x + 2, b.z + 2];
    const trips = router.route(from, to, 'transit');
    const walk = router.route(from, to, 'walk'), drive = router.route(from, to, 'drive'), bike = router.route(from, to, 'bike');
    if (hasPedestrianData) assert.ok(walk.length && trips.some((trip) => trip.via.includes(line.name)) && drive.length && bike.length, line.name);
    console.log(line.name, line.type, from, to, 'walk', walk.length,
      'transit', trips.map((r) => r.via), 'drive', drive.length, 'bike', bike.length);
  }
  const withCompanies = city.buildings.filter((b) => b.companies?.length);
  const companyPlaces = built.search.filter((result) => ['shop', 'office', 'industry'].includes(result.sub));
  for (const b of withCompanies) {
    for (const name of b.companies!) assert.ok(companyPlaces.some((place) => place.name === name), name);
  }
  console.log('Company labels:', withCompanies.length, companyPlaces.map((result) => result.name));
}
