// Map registry.
import * as maple from './maple.js';
import * as sunstone from './sunstone.js';
import * as drill from './drill.js';

export const MAPS = { maple, sunstone, drill };
export const MAP_LIST = [maple.info, sunstone.info, drill.info];

export function buildMap(id, world, scene) {
  const m = MAPS[id] || MAPS.maple;
  const built = m.build(world, scene);
  built.id = m.info.id; built.info = m.info;
  return built;
}

// maps that have plant sites (plant & defuse is Sunstone-only for now)
export const PLANT_MAPS = ['sunstone'];
