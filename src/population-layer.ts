import type { Map } from 'maplibre-gl';
import { toLngLat } from './geo';
import type { PopulationGrid } from './parse';

export const populationLayer = 'population-density';
const lowDensity = [184, 223, 250];
const highDensity = [25, 79, 159];

export function showPopulationGrid(map: Map, grid: PopulationGrid | undefined, visible: boolean) {
  if (map.getLayer(populationLayer)) map.removeLayer(populationLayer);
  if (map.getSource(populationLayer)) map.removeSource(populationLayer);
  if (!grid) return;
  const { width, height, west, south, cell, values } = grid;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d')!;
  const bitmap = context.createImageData(width, height);
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const v = values[(height - 1 - row) * width + col] / 255;
      const pixel = (row * width + col) * 4;
      if (!v) continue;
      // A single blue ramp keeps the lowest populated cells lighter than the densest ones.
      for (let i = 0; i < 3; i++) bitmap.data[pixel + i] = lowDensity[i] + (highDensity[i] - lowDensity[i]) * v;
      bitmap.data[pixel + 3] = 255 * (0.18 + 0.82 * Math.sqrt(v));
    }
  }
  context.putImageData(bitmap, 0, 0);
  const east = west + width * cell, north = south + height * cell;
  map.addSource(populationLayer, { type: 'image', url: canvas.toDataURL(), coordinates: [
    toLngLat(west, north), toLngLat(east, north), toLngLat(east, south), toLngLat(west, south),
  ] });
  map.addLayer({ id: populationLayer, type: 'raster', source: populationLayer,
    layout: { visibility: visible ? 'visible' : 'none' }, paint: { 'raster-opacity': 0.78, 'raster-fade-duration': 0 } },
  map.getLayer('road-fill') ? 'road-fill' : undefined);
}
