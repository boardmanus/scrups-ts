import * as Business from 'Business';
import * as Job from 'Job';
import JobUnload from 'JobUnload';
import JobPickup from 'JobPickup';
import JobRecycle from 'JobRecycle';
import WorkBuilding from 'WorkBuilding';
import log from 'ScrupsLogger';
import * as u from 'Utility';
import { profile } from 'Profiler/Profiler';
import Room$ from 'RoomCache';
import { Layout } from 'layout/Layout';

const EMPLOYEE_BODY_BASE: BodyPartConstant[] = [MOVE, CARRY, MOVE, CARRY, MOVE, CARRY, MOVE, CARRY, MOVE, CARRY];
const EMPLOYEE_BODY_TEMPLATE: BodyPartConstant[] = [MOVE, CARRY];
const IDEAL_CLONE_ENERGY = 1000;
const MAX_CLONE_ENERGY = 2000;

function find_surrounding_recyclers(spawn: StructureSpawn): (StructureContainer | ConstructionSite)[] {
  const recyclers = spawn.room.find<StructureContainer>(FIND_STRUCTURES,
    { filter: (s) => (s.structureType === STRUCTURE_CONTAINER) && spawn.pos.inRangeTo(s.pos, 1) });
  if (recyclers.length > 0) {
    return recyclers;
  }

  return spawn.room.find(FIND_CONSTRUCTION_SITES, { filter: (cs) => (cs.structureType === STRUCTURE_CONTAINER) && spawn.pos.inRangeTo(cs.pos, 1) });
}

function find_active_building_sites<T extends Structure>(room: Room, type: StructureConstant): T[] {
  return room.find<T>(FIND_MY_STRUCTURES, { filter: (s) => s.isActive && (s.structureType === type) });
}

function is_buildable(room: Room, x: number, y: number): boolean {
  const lookies = room.lookAt(x, y);
  return _.all(lookies, (l) => {
    switch (l.type) {
      case LOOK_CONSTRUCTION_SITES:
        if (l.constructionSite!.structureType !== STRUCTURE_ROAD) {
          return false;
        }
        break;
      case LOOK_STRUCTURES:
        if (l.structure!.structureType !== STRUCTURE_ROAD) {
          return false;
        }
        break;
      case LOOK_TERRAIN:
        if (l.terrain === 'wall') {
          return false;
        }
        break;
      default:
        break;
    }
    return true;
  });
}

function find_new_ext_building_sites(spawns: StructureSpawn[], exts: StructureExtension[]): RoomPosition[] {

  if (spawns.length === 0) {
    return [];
  }

  const mainSpawn = spawns[0];
  const { room } = mainSpawn;
  const extConstruction = room.find(FIND_CONSTRUCTION_SITES, { filter: (cs) => (cs.structureType === STRUCTURE_EXTENSION) });

  const numExtensions: number = exts.length + extConstruction.length;
  const rcl = room.controller?.level ?? 0;
  const allowedNumExtensions = CONTROLLER_STRUCTURES.extension[rcl];

  if (numExtensions === allowedNumExtensions) {
    return [];
  }

  if (numExtensions > allowedNumExtensions) {
    log.error(`${mainSpawn}: have more extensions than allowed??? (${numExtensions} > ${allowedNumExtensions}`);
    return [];
  }

  const desiredNumExtensions = allowedNumExtensions - numExtensions;
  const cityLayout: Layout = room.layout;
  if (cityLayout) {
    return _.map(_.take(_.sortBy(_.filter(cityLayout.extension,
      (pos) => is_buildable(room, pos.x + mainSpawn.pos.x, pos.y + mainSpawn.pos.y)),
      (pos) => (pos.x * pos.x + pos.y * pos.y)),
      desiredNumExtensions),
      (pos) => new RoomPosition(pos.x + mainSpawn.pos.x, pos.y + mainSpawn.pos.y, room.name));
  }

  const extensionPos: RoomPosition[] = _.take(_.sortBy(
    possible_extension_sites(mainSpawn, desiredNumExtensions),
    (cs) => cs.findPathTo(mainSpawn).length),
    desiredNumExtensions);

  return extensionPos;
}

/*
function find_new_recycle_sites(spawns: StructureSpawn[], _exts: StructureExtension[]): RoomPosition[] {

  if (spawns.length === 0) {
    return [];
  }

  const mainSpawn = spawns[0];
  if (mainSpawn._recycler) {
    return [];
  }

  const rcl = mainSpawn.room.controller?.level ?? 0;
  if (rcl < 4) {
    return [];
  }

  const numContainers: number = u.find_num_building_sites(mainSpawn.room, STRUCTURE_CONTAINER);
  const allowedContainers = CONTROLLER_STRUCTURES.container[mainSpawn.room.controller?.level ?? 0];
  if (numContainers >= allowedContainers) {
    return [];
  }

  const possibleSites = u.find_empty_surrounding_positions(mainSpawn.pos);
  if (possibleSites.length === 0) {
    return [];
  }

  return _.take(possibleSites, 1);
}
*/

function possible_extension_sites(spawn: StructureSpawn, _numExtensions: number): RoomPosition[] {
  const viableSites = spawn.pos.surroundingPositions(10, (site: RoomPosition) => {
    if ((site.x % 2) !== (site.y % 2)) {
      return false;
    }

    const terrain = site.look();
    return _.reduce(terrain, (a: boolean, t: LookAtResult): boolean => {
      switch (t.type) {
        case LOOK_CONSTRUCTION_SITES:
        case LOOK_STRUCTURES:
          {
            const type = t.constructionSite?.structureType ?? t.structure?.structureType;
            if (type !== STRUCTURE_ROAD) {
              return false;
            }
          }
          break;
        case LOOK_TERRAIN:
          if (t.terrain === 'wall') return false;
          break;
        default:
          break;
      }
      return a;
    },
      true);
  });

  log.info(`found ${viableSites.length} viable extensions sites ${viableSites}`);
  return viableSites;
}

/*
function adjacent_positions(roomName: string, step: PathStep): RoomPosition[] {
  switch (step.direction) {
    default:
    case RIGHT:
    case LEFT: return [
      new RoomPosition(step.x, step.y + 1, roomName), new RoomPosition(step.x, step.y - 1, roomName)
    ];
    case BOTTOM:
    case TOP: return [
      new RoomPosition(step.x + 1, step.y, roomName), new RoomPosition(step.x - 1, step.y, roomName)
    ];
    case TOP_RIGHT:
    case BOTTOM_LEFT: return [
      new RoomPosition(step.x + 1, step.y + 1, roomName), new RoomPosition(step.x - 1, step.y - 1, roomName)
    ];
    case TOP_LEFT:
    case BOTTOM_RIGHT: return [
      new RoomPosition(step.x + 1, step.y - 1, roomName), new RoomPosition(step.x - 1, step.y + 1, roomName)
    ];
  }
}
*/

/*
function possible_storage_sites(spawn: StructureSpawn): RoomPosition[] {
  const { controller } = spawn.room;
  if (!controller) {
    log.warning(`${spawn}: no controller => no viable storage sites`);
    return [];
  }

  const { room } = spawn;
  const path = spawn.pos.findPathTo(controller.pos, { ignoreCreeps: true });
  room.visual.poly(_.map(path, (p) => [p.x, p.y]));
  const sites = _.flatten(_.map(path, (step) => adjacent_positions(room.name, step)));

  const viableSites = _.filter(sites, (pos) => {
    const terrain = pos.look();
    return _.reduce(terrain,
      (a: boolean, t: LookAtResult): boolean => {
        switch (t.type) {
          case LOOK_CONSTRUCTION_SITES:
          case LOOK_STRUCTURES:
            room.visual.circle(pos, { fill: 'transparent', radius: 0.55, lineStyle: 'dashed', stroke: 'red' });
            return false;
          case LOOK_TERRAIN:
            if (t.terrain === 'wall') {
              room.visual.circle(pos, { fill: 'transparent', radius: 0.55, lineStyle: 'dashed', stroke: 'red' });
              return false;
            }
            break;
          default:
            break;
        }
        return a;
      },
      true);
  });

  log.info(`${spawn}: found ${viableSites.length} viable storage sites ${viableSites}`);
  _.each(viableSites, (vs) => room.visual.circle(vs, { fill: 'transparent', radius: 0.55, lineStyle: 'dashed', stroke: 'green' }));
  return viableSites;
}

*/

/*
function storage_site_viability(spawn: StructureSpawn, pos: RoomPosition): number {
  const spacialViability = _.reduce(
    pos.surroundingPositions(1),
    (a: number, p: RoomPosition): number => {

      const terrain = p.look();
      let viability = 1;
      _.all(terrain, (t) => {
        switch (t.type) {
          case LOOK_SOURCES:
          case LOOK_MINERALS:
            viability = -2;
            return false;
          case LOOK_CONSTRUCTION_SITES:
            if (t.constructionSite) {
              if (!u.is_passible_structure(t.constructionSite)) {
                viability = -1;
                return false;
              }
              if (t.constructionSite.structureType === STRUCTURE_ROAD) {
                viability += 0.5;
              } else {
                viability -= 0.5;
              }
            }
            break;
          case LOOK_STRUCTURES:
            if (t.structure) {
              if (!u.is_passible_structure(t.structure)) {
                viability = -1;
                return false;
              }
              if (t.structure.structureType === STRUCTURE_ROAD) {
                viability += 0.5;
              } else {
                viability -= 0.5;
              }
            }
            break;
          case LOOK_TERRAIN:
            if (t.terrain === 'wall') {
              viability = -1;
              return false;
            }
            break;
          default:
            break;
        }
        return true;
      });
      return a + viability;
    },
    0);

  const linearViability = 1.0 / spawn.pos.getRangeTo(pos);
  // Want positions with lots of space around, and closer to spawns
  return spacialViability + linearViability;
}
*/

/*
function find_new_storage_sites(spawn: StructureSpawn): RoomPosition[] {
  const { room } = spawn;
  const rcl = room.controller?.level ?? 0;
  const numStorage = u.find_num_building_sites(room, STRUCTURE_STORAGE);
  const allowedNumStorage = CONTROLLER_STRUCTURES.storage[rcl];
  log.info(`${spawn}: current num storage ${numStorage} - allowed ${allowedNumStorage}`);

  if (numStorage === allowedNumStorage) {
    log.info(`${spawn}: already have all the required storage (${numStorage}).`);
    return [];
  }

  if (numStorage > allowedNumStorage) {
    log.error(`${spawn}: have more storage than allowed??? (${numStorage} > ${allowedNumStorage}`);
    return [];
  }

  // Currently only one storage allowed - it goes next to the controller
  if (numStorage !== 0) {
    log.error(`${spawn}: only expected one storage to be available - update code!`);
    return [];
  }

  const storagePos: RoomPosition[] = _.take(_.sortBy(
    possible_storage_sites(spawn),
    (rp) => -storage_site_viability(spawn, rp)),
    1);

  log.debug(`${spawn}: ${storagePos.length} storage pos ${storagePos}`);
  room.visual.circle(storagePos[0], { fill: 'transparent', radius: 0.55, lineStyle: 'dashed', stroke: 'purple' });
  return storagePos;
}
*/
@profile
export default class BusinessCloning implements Business.Model {

  static readonly TYPE: string = 'clone';

  private readonly _priority: number;
  private readonly _room: Room;
  private readonly _spawns: StructureSpawn[];
  private readonly _extensions: StructureExtension[];
  private readonly _workerHealthRatio: number;
  private readonly _unloadJobs: Job.Model[];

  constructor(room: Room, priority = 5) {
    this._priority = priority;
    this._room = room;
    this._spawns = find_active_building_sites(room, STRUCTURE_SPAWN);
    this._extensions = find_active_building_sites(room, STRUCTURE_EXTENSION);
    this._workerHealthRatio = this.workerHealthRatio();
    this._unloadJobs = this.unloadJobs();

    this.updateSpawns(this._spawns);
  }

  private updateSpawns(spawns: StructureSpawn[]): void {
    _.each(spawns, (spawn) => {
      if (!spawn._recycler) {
        const recyclers = find_surrounding_recyclers(spawn);
        if (recyclers.length) {
          [spawn._recycler] = recyclers;
        }
      }
      if (spawn.spawning) {
        const creep = Game.creeps[spawn.spawning.name];
        if (creep && !creep.memory.home) {
          creep.memory.home = spawn.room.name;
        }
      }
    });
  }

  id(): string {
    return Business.id(BusinessCloning.TYPE, this._room.name);
  }

  toString(): string {
    return this.id();
  }

  priority(): number {
    return this._priority;
  }

  canRequestEmployee(): boolean {
    return false;
  }

  needsEmployee(employees: Creep[]): boolean {
    return employees.length === 0;
  }

  survey() {
  }

  employeeBody(availEnergy: number, maxEnergy: number): BodyPartConstant[] {

    if (availEnergy < IDEAL_CLONE_ENERGY && maxEnergy > IDEAL_CLONE_ENERGY) {
      // Wait for more energy
      return [];
    }

    const energyToUse = Math.min(availEnergy, MAX_CLONE_ENERGY);
    return u.generate_body(EMPLOYEE_BODY_BASE, EMPLOYEE_BODY_TEMPLATE, energyToUse);
  }

  permanentJobs(): Job.Model[] {
    const jobs: Job.Model[] = [];
    /*
    const storage = this._room.storage;
    if (storage) {
      jobs.push(new JobPickup(storage));
    } */
    jobs.push(...this._unloadJobs);
    return jobs;
  }

  contractJobs(_employees: Creep[]): Job.Model[] {

    const extJobs = this._unloadJobs;

    const pickupJobs: JobPickup[] = _.map(_.filter(this._spawns,
      (s) => { const r = s.recycler(); return r?.available() ?? false; }),
      (s) => new JobPickup(s.recycler() ?? s, u.RESOURCE_ALL, this._priority));

    const contracts: Job.Model[] = [...extJobs, ...pickupJobs];

    if (this._spawns.length > 0) {
      const recycle = new JobRecycle(this._spawns[0]);
      contracts.push(recycle);
    }

    log.debug(`${this}: ${contracts.length} contracts (${extJobs.length} exts)`);

    return contracts;
  }

  buildings(): WorkBuilding[] {

    const extWork = _.map(
      find_new_ext_building_sites(this._spawns, this._extensions),
      (pos) => {
        log.info(`${this}: creating new building work ${this._room} @ ${pos}`);
        return new WorkBuilding(pos, STRUCTURE_EXTENSION);
      });

    const buildings = [...extWork];
    return buildings;
  }

  private workerHealthRatio(): number {
    const { creeps } = Room$(this._room);
    const nearlyDeadWorkers = _.filter(creeps, (c) => c.ticksToLive && c.ticksToLive < 200).length;
    const maxWorkers = 8;
    return (creeps.length - nearlyDeadWorkers) / maxWorkers;
  }

  private unloadJobs(): Job.Model[] {
    const roomHealth = Math.min(this._workerHealthRatio, this._room.energyAvailable / this._room.energyCapacityAvailable);
    log.debug(`${this}: roomHealth=${roomHealth}`);
    const extPriority = 6 + (1.0 - roomHealth) * this._priority;
    const extJobs: JobUnload[] = _.map(_.take(_.sortBy(_.filter(this._extensions,
      (e) => e.freeSpace() > 0),
      (e) => e.pos.x * e.pos.x + e.pos.y * e.pos.y - e.freeSpace()),
      5),
      (e) => new JobUnload(e, RESOURCE_ENERGY, extPriority));

    if (extJobs.length < 5) {
      const spawnPriority = 5 + (1.0 - roomHealth) * this._priority;
      const spawnJobs: JobUnload[] = _.map(_.filter(this._spawns,
        (s) => s.freeSpace() > 0),
        (s) => new JobUnload(s, RESOURCE_ENERGY, spawnPriority));
      extJobs.push(...spawnJobs);
    }
    return extJobs;
  }
}
