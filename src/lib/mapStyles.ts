// Basemap styles for the location picker: satellite (Esri raster), a clean
// Google-like street map, and a terrain map with hillshade. The vector styles
// draw OpenMapTiles data served by OpenFreeMap (free, no key).

import type { StyleSpecification, LayerSpecification, ExpressionSpecification } from 'maplibre-gl';

export type BasemapId = 'satellite' | 'map' | 'terrain';

const ESRI = 'https://server.arcgisonline.com/ArcGis/rest/services';
const OFM_GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';
const OFM_SPRITE = 'https://tiles.openfreemap.org/sprites/ofm_f384/ofm';

const raster = (url: string, attribution?: string, maxzoom = 19) => ({ type: 'raster' as const, tiles: [url], tileSize: 256, maxzoom, attribution });

export const satelliteStyle: StyleSpecification = {
  version: 8,
  sources: {
    imagery: raster(`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`, 'Imagery © Esri, Maxar, Earthstar Geographics'),
    roads: raster(`${ESRI}/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}`),
    labels: raster(`${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`),
  },
  layers: [
    { id: 'imagery', type: 'raster', source: 'imagery' },
    { id: 'roads', type: 'raster', source: 'roads' },
    { id: 'labels', type: 'raster', source: 'labels' },
  ],
};

/** Vector layers shared by the map and terrain styles, in Google's palette. */
function vectorLayers(terrain: boolean): LayerSpecification[] {
  const ground = terrain ? '#f1efe8' : '#f8f9fa';
  const green = terrain ? '#c9e3b6' : '#c5e8c5';
  const roadMajor = terrain ? '#ffffff' : '#ffffff';
  const roadMinor = '#ffffff';
  const roadCasing = '#c9ccd1';
  const highway = '#f9d77e';
  const textFont = ['Noto Sans Regular'];
  const textBold = ['Noto Sans Bold'];
  const interp = (a: number, b: number, c: number, d: number): ExpressionSpecification => ['interpolate', ['exponential', 1.4], ['zoom'], a, b, c, d];
  return [
    { id: 'background', type: 'background', paint: { 'background-color': ground } },
    ...(terrain
      ? [{ id: 'hillshade', type: 'raster', source: 'hillshade', paint: { 'raster-opacity': 0.5, 'raster-resampling': 'linear' } } as LayerSpecification]
      : []),
    { id: 'landuse-residential', type: 'fill', source: 'omt', 'source-layer': 'landuse', filter: ['in', 'class', 'residential', 'suburb', 'neighbourhood'], paint: { 'fill-color': terrain ? 'rgba(236,233,224,0.55)' : '#f2f3f5', 'fill-opacity': 1 } },
    { id: 'landuse-commercial', type: 'fill', source: 'omt', 'source-layer': 'landuse', filter: ['in', 'class', 'commercial', 'retail', 'industrial'], paint: { 'fill-color': terrain ? 'rgba(245,232,210,0.6)' : '#fdf3e0' } },
    { id: 'landuse-school', type: 'fill', source: 'omt', 'source-layer': 'landuse', filter: ['in', 'class', 'school', 'university', 'college', 'hospital'], paint: { 'fill-color': terrain ? 'rgba(240,232,232,0.6)' : '#f3ede9' } },
    { id: 'landcover-grass', type: 'fill', source: 'omt', 'source-layer': 'landcover', filter: ['in', 'class', 'grass', 'farmland', 'wood', 'scrub'], paint: { 'fill-color': green, 'fill-opacity': terrain ? 0.55 : 0.8 } },
    { id: 'park', type: 'fill', source: 'omt', 'source-layer': 'park', paint: { 'fill-color': green, 'fill-opacity': terrain ? 0.6 : 0.9 } },
    { id: 'water', type: 'fill', source: 'omt', 'source-layer': 'water', paint: { 'fill-color': '#aadaff' } },
    { id: 'waterway', type: 'line', source: 'omt', 'source-layer': 'waterway', paint: { 'line-color': '#aadaff', 'line-width': interp(10, 0.8, 18, 4) } },
    { id: 'aeroway', type: 'fill', source: 'omt', 'source-layer': 'aeroway', filter: ['==', '$type', 'Polygon'], paint: { 'fill-color': '#e9eaed' } },
    { id: 'building', type: 'fill', source: 'omt', 'source-layer': 'building', minzoom: 13, paint: { 'fill-color': '#e8eaed', 'fill-outline-color': '#d4d7dc' } },
    { id: 'road-path', type: 'line', source: 'omt', 'source-layer': 'transportation', filter: ['in', 'class', 'path', 'track'], paint: { 'line-color': '#d8d8d8', 'line-width': interp(14, 0.8, 19, 2.5), 'line-dasharray': [2, 2] } },
    { id: 'road-service-casing', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 14, filter: ['in', 'class', 'service', 'minor'], paint: { 'line-color': roadCasing, 'line-width': interp(14, 1.6, 19, 10) } },
    { id: 'road-service', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 14, filter: ['in', 'class', 'service', 'minor'], paint: { 'line-color': roadMinor, 'line-width': interp(14, 0.8, 19, 8) } },
    { id: 'road-secondary-casing', type: 'line', source: 'omt', 'source-layer': 'transportation', filter: ['in', 'class', 'secondary', 'tertiary'], paint: { 'line-color': roadCasing, 'line-width': interp(11, 1.5, 19, 20) } },
    { id: 'road-secondary', type: 'line', source: 'omt', 'source-layer': 'transportation', filter: ['in', 'class', 'secondary', 'tertiary'], paint: { 'line-color': roadMajor, 'line-width': interp(11, 1, 19, 16) } },
    { id: 'road-primary-casing', type: 'line', source: 'omt', 'source-layer': 'transportation', filter: ['in', 'class', 'primary', 'trunk'], paint: { 'line-color': '#e0c56e', 'line-width': interp(9, 1.5, 19, 24) } },
    { id: 'road-primary', type: 'line', source: 'omt', 'source-layer': 'transportation', filter: ['in', 'class', 'primary', 'trunk'], paint: { 'line-color': highway, 'line-width': interp(9, 1, 19, 20) } },
    { id: 'road-motorway-casing', type: 'line', source: 'omt', 'source-layer': 'transportation', filter: ['==', 'class', 'motorway'], paint: { 'line-color': '#e0a86a', 'line-width': interp(7, 1.5, 19, 28) } },
    { id: 'road-motorway', type: 'line', source: 'omt', 'source-layer': 'transportation', filter: ['==', 'class', 'motorway'], paint: { 'line-color': '#fbc36c', 'line-width': interp(7, 1, 19, 24) } },
    { id: 'railway', type: 'line', source: 'omt', 'source-layer': 'transportation', filter: ['==', 'class', 'rail'], paint: { 'line-color': '#c6c8cc', 'line-width': interp(12, 1, 19, 4), 'line-dasharray': [4, 3] } },
    { id: 'housenumber', type: 'symbol', source: 'omt', 'source-layer': 'housenumber', minzoom: 17, layout: { 'text-field': '{housenumber}', 'text-font': textFont, 'text-size': 10 }, paint: { 'text-color': '#8a8d92', 'text-halo-color': ground, 'text-halo-width': 1 } },
    { id: 'road-name', type: 'symbol', source: 'omt', 'source-layer': 'transportation_name', minzoom: 13, layout: { 'symbol-placement': 'line', 'text-field': '{name}', 'text-font': textFont, 'text-size': interp(13, 10, 19, 14), 'text-letter-spacing': 0.03 }, paint: { 'text-color': '#4a4d52', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 } },
    { id: 'poi', type: 'symbol', source: 'omt', 'source-layer': 'poi', minzoom: 15, filter: ['has', 'name'], layout: { 'text-field': '{name}', 'text-font': textFont, 'text-size': 11, 'text-anchor': 'top', 'text-offset': [0, 0.6], 'icon-image': ['coalesce', ['image', ['get', 'class']], ['image', 'dot_11']], 'icon-size': 0.9, 'text-max-width': 8, 'text-optional': true }, paint: { 'text-color': '#5d6c7a', 'text-halo-color': '#ffffff', 'text-halo-width': 1.2 } },
    { id: 'place-neighbourhood', type: 'symbol', source: 'omt', 'source-layer': 'place', filter: ['in', 'class', 'neighbourhood', 'suburb', 'quarter'], minzoom: 12, layout: { 'text-field': '{name}', 'text-font': textFont, 'text-size': 12, 'text-transform': 'uppercase', 'text-letter-spacing': 0.1 }, paint: { 'text-color': '#7b8088', 'text-halo-color': ground, 'text-halo-width': 1.5 } },
    { id: 'place-town', type: 'symbol', source: 'omt', 'source-layer': 'place', filter: ['in', 'class', 'city', 'town', 'village'], layout: { 'text-field': '{name}', 'text-font': textBold, 'text-size': interp(6, 11, 14, 18) }, paint: { 'text-color': '#2b2f33', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 } },
  ];
}

export function vectorStyle(id: 'map' | 'terrain'): StyleSpecification {
  return {
    version: 8,
    glyphs: OFM_GLYPHS,
    sprite: OFM_SPRITE,
    sources: {
      omt: { type: 'vector', url: 'https://tiles.openfreemap.org/planet', attribution: '© OpenMapTiles © OpenStreetMap contributors · OpenFreeMap' },
      ...(id === 'terrain' ? { hillshade: raster(`${ESRI}/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}`, 'Hillshade © Esri', 13) } : {}),
    },
    layers: vectorLayers(id === 'terrain'),
  };
}

export function styleFor(id: BasemapId): StyleSpecification {
  return id === 'satellite' ? satelliteStyle : vectorStyle(id);
}
