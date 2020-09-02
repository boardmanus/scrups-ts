import log from 'ScrupsLogger';
import Cache from 'Cache';

export const RESOURCE_ALL: ResourceType = 'all';
export const RESOURCE_MINERALS: ResourceType = 'minerals';

export const FOREVER = 10e10;

export function map_valid<T, U>(objs: T[], f: (obj: T) => U | undefined | null): U[] {
  if (!objs) return [];
  return _.reduce(
    objs,
    (accum: U[], inObj: T): U[] => {
      const outObj: U | undefined | null = f(inObj);
      if (outObj) accum.push(outObj);
      return accum;
    },
    []);
}

export function map_valid_dict<T, U>(objs: { [id: string]: T }, f: (obj: T) => U | undefined | null): U[] {
  if (!objs) return [];
  return _.reduce(
    objs,
    (accum: U[], inObj: T): U[] => {
      const outObj: U | undefined | null = f(inObj);
      if (outObj) accum.push(outObj);
      return accum;
    },
    []);
}

export function map_valid_creeps(creepIds: string[]): Creep[] {
  return map_valid(
    creepIds,
    (creepId: string): Creep | null => Game.getObjectById(creepId));
}

export function errstr(screepsErr: number): string {
  switch (screepsErr) {
    case OK: return 'OK';
    case ERR_BUSY: return 'ERR_BUSY';
    case ERR_FULL: return 'ERR_FULL';
    case ERR_GCL_NOT_ENOUGH: return 'ERR_GCL_NOT_ENOUGH';
    case ERR_INVALID_ARGS: return 'ERR_INVALID_ARG';
    case ERR_INVALID_TARGET: return 'ERR_INVALID_TARGET';
    case ERR_NAME_EXISTS: return 'ERR_NAME_EXISTS';
    case ERR_NO_BODYPART: return 'ERR_NO_BODYPART';
    case ERR_NO_PATH: return 'ERR_NO_PATH';
    case ERR_NOT_ENOUGH_ENERGY: return 'ERR_NOT_ENOUGH_ENERGY';
    case ERR_NOT_ENOUGH_EXTENSIONS: return 'ERR_NOT_ENOUGH_EXTENSIONS';
    case ERR_RCL_NOT_ENOUGH: return 'ERR_RCL_NOT_ENOUGH';
    case ERR_TIRED: return 'ERR_TIRED';
    default: break;
  }

  return `ERR_${screepsErr}`;
}

export const MIN_BODY: BodyPartConstant[] = [WORK, CARRY, MOVE];
export const MIN_BODY_COST = body_cost(MIN_BODY);

export function body_cost(parts: BodyPartConstant[]): number {
  return _.sum(parts, (c) => BODYPART_COST[c]);
}

export function generate_body(bodyBase: BodyPartConstant[], bodyTemplate: BodyPartConstant[], funds: number): BodyPartConstant[] {
  const minCost = body_cost(bodyBase);
  if (funds < minCost) {
    log.debug(`generate_body: funds=${funds} are less than minBody=${bodyTemplate}=${minCost}`);
    return [];
  }

  const body: BodyPartConstant[] = [...bodyBase];
  let remainingFunds = funds - minCost;

  _.some(bodyTemplate, (b) => {
    const partCost = BODYPART_COST[b];
    if (partCost > remainingFunds) {
      return true;
    }

    body.push(b);
    remainingFunds -= partCost;
    return false;
  });

  log.info(`generate_body: newBody = ${body} = ${body_cost(body)} => availFunds=${funds}, remainingFunds = ${remainingFunds}`);
  return body;
}

export function time_to_spawn(body: BodyPartConstant[]): number {
  return body.length * CREEP_SPAWN_TIME;
}

export function find_nearby_hostiles(obj: RoomObject, distance = 5): Creep[] {
  if (!obj.room) {
    return [];
  }

  return obj.pos.findInRange(FIND_HOSTILE_CREEPS, distance, {
    filter: (creep: Creep) => ((creep.getActiveBodyparts(ATTACK) > 0)
      || (creep.getActiveBodyparts(RANGED_ATTACK) > 0))
  });
}

export function find_empty_surrounding_positions(pos: RoomPosition): RoomPosition[] {
  const surroundingPositions = pos.surroundingPositions(1, (p: RoomPosition): boolean => {
    const terrain = p.look();
    return _.some(terrain, (t) => !((t.type === LOOK_CONSTRUCTION_SITES
      || (t.type === LOOK_STRUCTURES && t.structure && t.structure.structureType !== STRUCTURE_ROAD)
      || (t.type === LOOK_TERRAIN && t.terrain === 'wall'))));
  });

  return surroundingPositions;
}

export function find_construction_sites(room: Room, type: BuildableStructureConstant): ConstructionSite[] {
  return room.find(FIND_CONSTRUCTION_SITES, { filter: (s) => (s.structureType === type) });
}

export function find_building_sites<T extends Structure>(room: Room, type: StructureConstant): T[] {
  return room.find<T>(FIND_STRUCTURES, { filter: (s) => (s.structureType === type) });
}

export function find_num_building_sites(room: Room, type: StructureConstant | BuildableStructureConstant): number {
  const numConstuctionSites = find_construction_sites(room, type as BuildableStructureConstant).length;
  const numStructures = find_building_sites(room, type).length;
  return numConstuctionSites + numStructures;
}

export function is_passible_structure(s: Structure | ConstructionSite): boolean {
  return (s.structureType === STRUCTURE_ROAD
    || s.structureType === STRUCTURE_CONTAINER
    || (s.structureType === STRUCTURE_RAMPART && (s as StructureRampart | ConstructionSite).my));
}

export function terrain_cost(pos: RoomPosition): number {
  if (!Game.rooms[pos.roomName]) {
    // Can't get the terrain if we can't see the room
    return 1.8;
  }

  const structures = pos.lookFor(LOOK_STRUCTURES);
  if (_.find(structures, (s) => s.structureType === STRUCTURE_ROAD)) {
    return 1;
  }

  const terrain = pos.lookFor(LOOK_TERRAIN)[0];
  switch (terrain) {
    case 'plain': return 2;
    case 'swamp': return 10;
    default:
    case 'wall': return FOREVER;
  }
}

export type Site = Creep | Structure | Resource | Tombstone | Ruin | Source | Mineral | Deposit | ConstructionSite;

const pathCache: Cache = new Cache();
export function get_path(from: Site, to: Site): RoomPosition[] {
  return pathCache.get(`${from.pos} - ${to.pos}`, () => {
    const { room } = from;
    if (!room || from.pos.inRangeTo(to, 1)) {
      return [];
    }

    return _.map(room.findPath(from.pos, to.pos, { range: 1, ignoreCreeps: true }),
      (ps: PathStep) => room.getPositionAt(ps.x, ps.y) || new RoomPosition(ps.x, ps.y, room.name));
  });
}

export function work_energy(worker: Creep, maxEnergyPerPart: number): number {
  return worker.getActiveBodyparts(WORK) * maxEnergyPerPart;
}

export function movement_time(invigoration: number, path: RoomPosition[]) {
  if (path.length === 0) {
    return 0;
  }

  if (invigoration <= 0.0) {
    // Forever
    return FOREVER;
  }

  // time waiting for fatigue
  const t_f = _.sum(path, (p: RoomPosition): number => {
    const terrain = terrain_cost(p);
    return Math.ceil(terrain / invigoration);
  });

  // total time is waiting time + traversal time
  return t_f + path.length;
}

function carry_boost(boost: ResourceConstant | undefined): number {
  if (!boost) {
    return 1;
  }

  if (boost === RESOURCE_KEANIUM_HYDRIDE) {
    return BOOSTS[CARRY].KH.capacity;
  }

  if (boost === RESOURCE_KEANIUM_ACID) {
    return BOOSTS[CARRY].KH2O.capacity;
  }

  if (boost === RESOURCE_CATALYZED_KEANIUM_ACID) {
    return BOOSTS[CARRY].XKH2O.capacity;
  }

  return 1;
}

export function creep_weight(creep: Creep) {
  let carriedResources = creep.available();

  const weight: number = _.reduce(creep.body, (w, part) => {
    if (part.hits === 0 || part.type === MOVE) {
      return w;
    }
    if (part.type === CARRY) {
      if (carriedResources === 0) {
        return w;
      }
      carriedResources -= Math.min(carriedResources, CARRY_CAPACITY * carry_boost(part.boost));
      return w + 1;
    }
    return w + 1;
  }, 0);

  return weight;
}

// Invigoration - fatigue recovery per tick f/t
export function creep_invigoration(creep: Creep): number {
  const numMoveParts = creep.getActiveBodyparts(MOVE);
  const weight = creep_weight(creep);
  const rate = (weight === 0) ? numMoveParts : numMoveParts / weight;
  return 2.0 * rate;
}

export function creep_movement_time(worker: Creep, site: Site): number {
  if (worker.room.name === site.room?.name) {
    const range = worker.pos.getRangeTo(site.pos);
    if (range === 0) {
      return 0;
    }
    if (worker.getActiveBodyparts(MOVE) === 0) {
      return FOREVER;
    }
    if (range < 2) {
      return range;
    }
  }

  const path = get_path(worker, site);
  if (path.length === 0) {
    return 0;
  }

  return movement_time(creep_invigoration(worker), path);
}

export function taxi_efficiency(worker: Creep, site: Site, energy: number): number {
  const timeToMove = creep_movement_time(worker, site);
  if (timeToMove === FOREVER) {
    return 0.0;
  }

  // Efficiency is the energy exchange per second from where the creep is.
  const t = Math.max(1, timeToMove);
  const e = energy / t;
  return e;
}

export function work_time(numWorkerParts: number, energy: number, maxEnergyPerPart: number): number {
  const workEnergyPerTick = numWorkerParts * maxEnergyPerPart;
  const timeToWork = Math.ceil(energy / workEnergyPerTick);
  return timeToWork;
}

export function creep_work_time(worker: Creep, energy: number, maxEnergyPerPart: number): number {
  const numWorkerParts = worker.getActiveBodyparts(WORK);
  if (numWorkerParts === 0) {
    return FOREVER;
  }

  return work_time(numWorkerParts, energy, maxEnergyPerPart);
}

export function work_efficiency(worker: Creep, site: Site, energy: number, maxEnergyPerPart: number): number {

  const timeToWork = creep_work_time(worker, energy, maxEnergyPerPart);
  if (timeToWork === FOREVER) {
    return 0.0;
  }

  const timeToMove = creep_movement_time(worker, site);
  if (timeToMove === FOREVER) {
    return 0.0;
  }

  // Efficiency is the energy exchange per second from where the creep is.
  const t = Math.max(1, timeToMove + timeToWork);
  return energy / t;
}

export function find_my_sites(obj: RoomObject, type: StructureConstant, radius: number): AnyOwnedStructure[] {
  const sites = obj.room?.find(FIND_MY_STRUCTURES,
    { filter: (s: Structure) => (s.structureType === type) && obj.pos.inRangeTo(s.pos, radius) });
  return sites ?? [];
}

export const ALL_MINERALS: ResourceConstant[] = [
  RESOURCE_HYDROGEN,
  RESOURCE_OXYGEN,
  RESOURCE_UTRIUM,
  RESOURCE_LEMERGIUM,
  RESOURCE_KEANIUM,
  RESOURCE_ZYNTHIUM,
  RESOURCE_CATALYST,
  RESOURCE_GHODIUM,
  RESOURCE_SILICON,
  RESOURCE_METAL,
  RESOURCE_BIOMASS,
  RESOURCE_MIST,

  RESOURCE_HYDROXIDE,
  RESOURCE_ZYNTHIUM_KEANITE,
  RESOURCE_UTRIUM_LEMERGITE,

  RESOURCE_UTRIUM_HYDRIDE,
  RESOURCE_UTRIUM_OXIDE,
  RESOURCE_KEANIUM_HYDRIDE,
  RESOURCE_KEANIUM_OXIDE,
  RESOURCE_LEMERGIUM_HYDRIDE,
  RESOURCE_LEMERGIUM_OXIDE,
  RESOURCE_ZYNTHIUM_HYDRIDE,
  RESOURCE_ZYNTHIUM_OXIDE,
  RESOURCE_GHODIUM_HYDRIDE,
  RESOURCE_GHODIUM_OXIDE,

  RESOURCE_UTRIUM_ACID,
  RESOURCE_UTRIUM_ALKALIDE,
  RESOURCE_KEANIUM_ACID,
  RESOURCE_KEANIUM_ALKALIDE,
  RESOURCE_LEMERGIUM_ACID,
  RESOURCE_LEMERGIUM_ALKALIDE,
  RESOURCE_ZYNTHIUM_ACID,
  RESOURCE_ZYNTHIUM_ALKALIDE,
  RESOURCE_GHODIUM_ACID,
  RESOURCE_GHODIUM_ALKALIDE,

  RESOURCE_CATALYZED_UTRIUM_ACID,
  RESOURCE_CATALYZED_UTRIUM_ALKALIDE,
  RESOURCE_CATALYZED_KEANIUM_ACID,
  RESOURCE_CATALYZED_KEANIUM_ALKALIDE,
  RESOURCE_CATALYZED_LEMERGIUM_ACID,
  RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE,
  RESOURCE_CATALYZED_ZYNTHIUM_ACID,
  RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE,
  RESOURCE_CATALYZED_GHODIUM_ACID,
  RESOURCE_CATALYZED_GHODIUM_ALKALIDE
];

export function resource_matches_type(resource: ResourceConstant, type: ResourceType) {
  switch (type) {
    case RESOURCE_ALL: return true;
    case RESOURCE_MINERALS: return (_.indexOf(ALL_MINERALS, resource) !== -1);
    default: return resource === type;
  }
}

export function store_resource_amount(store: StoreDefinition, rType: ResourceType): number {
  switch (rType) {
    case RESOURCE_ALL: return store.getUsedCapacity();
    case RESOURCE_MINERALS: return _.sum(Object.keys(store),
      (r) => ((_.indexOf(ALL_MINERALS, r) !== -1) ? store.getUsedCapacity(r as ResourceConstant) : 0));
    default: return store[rType as ResourceConstant];
  }
}

export function limited_store_resource_amount(store: StoreDefinition, rType: ResourceType, r: ResourceConstant): number {
  return resource_matches_type(r, rType) ? store[r] : 0;
}

export function stored_minerals(store: StoreDefinition): ResourceConstant[] {
  return _.intersection(Object.keys(store) as ResourceConstant[], ALL_MINERALS);
}

export function max_stored_resource(store: StoreDefinition, resourceType: ResourceType): ResourceConstant {

  let resource;
  switch (resourceType) {
    case RESOURCE_ALL:
      resource = _.max(Object.keys(store), (r: ResourceConstant) => store[r]);
      break;
    case RESOURCE_MINERALS:
      resource = _.max(stored_minerals(store), (r) => store[r]);
      break;
    default:
      resource = resourceType;
  }

  return resource as ResourceConstant;
}

export function creep_shield_power(creep: Creep): number {
  const numHealParts = _.sum(creep.body, (b) => {
    if (b.type !== HEAL) {
      return 0;
    }
    if (b.boost) {
      return BOOSTS.heal[b.boost].heal;
    }
    return 1.0;
  });
  return numHealParts * HEAL_POWER;
}

export function block_has_walls(terrain: RoomTerrain, x0: number, y0: number, size: number) {
  for (let x = 0; x < size; ++x) {
    for (let y = 0; y < size; ++y) {
      if (terrain.get(x0 + x, y0 + y) === TERRAIN_MASK_WALL) {
        return true;
      }
    }
  }
  return false;
}

export function block_has_structures(room: Room, x0: number, y0: number, size: number) {
  return room.lookForAtArea(LOOK_STRUCTURES, y0, x0, y0 + size, x0 + size, true).length !== 0;
}

const MAX_RAMPART_WALL = 1000000;
const MAX_RCL = 8;
function wall_rampart_desired_hits(room: Room): number {
  const c = room.controller;
  if (!c) {
    return 0;
  }

  const progress = c.progress / c.progressTotal;
  const rcl = c.level + progress;

  return (MAX_RAMPART_WALL * rcl) / MAX_RCL;
}

export function desired_hits(site: Structure) {
  switch (site.structureType) {
    case STRUCTURE_WALL:
    case STRUCTURE_RAMPART: return wall_rampart_desired_hits(site.room);
    default: return site.hitsMax;
  }
}

export function tower_power(range: number, max: number): number {
  if (range <= TOWER_OPTIMAL_RANGE) {
    return max;
  }

  if (range >= TOWER_FALLOFF_RANGE) {
    return max / 4;
  }

  return max / 4 + (((3 * max) / 4) * (TOWER_FALLOFF_RANGE - range)) / (TOWER_FALLOFF_RANGE - TOWER_OPTIMAL_RANGE);
}

export function tower_attack_power(range: number): number {
  return tower_power(range, TOWER_POWER_ATTACK);
}

export function tower_repair_power(range: number): number {
  return tower_power(range, TOWER_POWER_REPAIR);
}
