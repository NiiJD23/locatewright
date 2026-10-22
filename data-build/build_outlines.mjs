import fs from 'fs';
import { feature } from 'topojson-client';
import * as turf from '@turf/turf';

const topo = JSON.parse(fs.readFileSync('node_modules/world-atlas/countries-10m.json', 'utf8'));
const countries = feature(topo, topo.objects.countries).features;
const uk = countries.find(f => f.id === '826');
const ie = countries.find(f => f.id === '372');

// split UK multipolygon parts into NI and GB
const parts = uk.geometry.type === 'MultiPolygon' ? uk.geometry.coordinates : [uk.geometry.coordinates];
const ni = [], gb = [];
for (const p of parts) {
  const c = turf.centroid(turf.polygon(p)).geometry.coordinates;
  if (c[0] < -5.4 && c[1] < 55.4 && c[1] > 53.9) ni.push(p); else gb.push(p);
}
const gbMP = turf.multiPolygon(gb);

const scotClip = turf.polygon([[
  [-10, 54.55], [-3.5, 54.88], [-3.07, 54.99], [-2.8, 55.13], [-2.55, 55.29], [-2.2, 55.42],
  [-2.25, 55.65], [-2.03, 55.81], [-1.5, 55.85], [0, 62], [-10, 62], [-10, 54.55]
]]);
const walesClip = turf.polygon([[
  [-6, 51.2], [-3.0, 51.35], [-2.67, 51.58], [-2.67, 51.83], [-2.98, 51.95], [-3.1, 52.07],
  [-3.0, 52.35], [-3.15, 52.55], [-3.0, 52.75], [-2.75, 52.95], [-2.95, 53.1], [-3.0, 53.22],
  [-3.15, 53.35], [-3.3, 53.6], [-6, 53.6], [-6, 51.2]
]]);

const scot = turf.intersect(turf.featureCollection([gbMP, scotClip]));
const wales = turf.intersect(turf.featureCollection([gbMP, walesClip]));
let eng = turf.difference(turf.featureCollection([gbMP, scotClip]));
eng = turf.difference(turf.featureCollection([eng, walesClip]));

const lat0 = 54.5, lon0 = -3.2, k = 10, cosl = Math.cos(lat0 * Math.PI / 180);
const proj = ([lon, lat]) => [+((lon - lon0) * cosl * k).toFixed(3), +((lat - lat0) * k).toFixed(3)];

function rings(f, minArea) {
  const g = f.geometry;
  const polys = g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates];
  const out = [];
  for (const poly of polys) {
    const area = turf.area(turf.polygon(poly)) / 1e6;
    if (area < minArea) continue; // km2
    const simp = turf.simplify(turf.polygon(poly), { tolerance: 0.012, highQuality: true });
    out.push(simp.geometry.coordinates.map(r => r.map(proj)));
  }
  return out;
}
const data = {
  england: rings(eng, 25),
  scotland: rings(scot, 40),
  wales: rings(wales, 25),
  ni: rings(turf.multiPolygon(ni), 25),
  ireland: rings(ie, 200),
  proj: { lat0, lon0, k, cosl }
};
const s = JSON.stringify(data);
fs.writeFileSync('ukgeo.json', s);
console.log('bytes', s.length, Object.fromEntries(Object.entries(data).filter(([k]) => k !== 'proj').map(([k, v]) => [k, v.length + ' polys, ' + v.reduce((a, p) => a + p[0].length, 0) + ' pts'])));

// neighbours for context
const bbox = turf.bboxPolygon([-12, 48.3, 9, 62]);
const nb = [];
for (const id of ['250', '833', '056', '528', '276', '208', '578']) {
  const f = countries.find(c => c.id === id); if (!f) continue;
  const cl = turf.intersect(turf.featureCollection([f, bbox])); if (!cl) continue;
  nb.push(...rings(cl, 50));
}
data.neighbours = nb;
const s2 = JSON.stringify(data);
fs.writeFileSync('ukgeo.json', s2);
console.log('with neighbours bytes', s2.length, nb.length);
