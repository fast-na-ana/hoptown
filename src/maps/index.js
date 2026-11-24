// Map registry.
import * as maple from './maple.js';
import * as sunstone from './sunstone.js';
import * as drill from './drill.js';
import { STAIR_LOG } from '../mapkit.js';

export const MAPS = { maple, sunstone, drill };
export const MAP_LIST = [maple.info, sunstone.info, drill.info];

export function buildMap(id, world, scene) {
  const m = MAPS[id] || MAPS.maple;
  STAIR_LOG.length = 0;
  const built = m.build(world, scene);
  built.stairs = STAIR_LOG.slice();
  built.id = m.info.id; built.info = m.info;
  return built;
}

// maps that have plant sites (plant & defuse is Sunstone-only for now)
export const PLANT_MAPS = ['sunstone'];
