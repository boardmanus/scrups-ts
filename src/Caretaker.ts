import { Expert } from "./Expert";
import { City } from "./City";
import { Work } from "./Work";
import { Job } from "./Job";
import { log } from "./lib/logger/log";
import { JobBuild } from "./JobBuild";
import { JobRepair } from "./JobRepair";
import { Operation } from "./Operation";
import { FunctionCache } from "./Cache";
import u from "./Utility";


function repair_power(tower : StructureTower, site : Structure) : number {
  const d = tower.pos.getRangeTo(site);
  if (d <= 5) {
    return TOWER_POWER_REPAIR;
  }
  else if (d >= 20) {
    return 150;
  }

  return 150 + (TOWER_POWER_REPAIR - 150)*(20 - d)/(20 - 5)
}


function repair_priority(site : Structure) : number {
  const damageRatio = (1.0 - site.hits/site.hitsMax);
  switch (site.structureType) {
    case STRUCTURE_ROAD: return 2*damageRatio;
    case STRUCTURE_RAMPART: return 1*Math.pow(damageRatio, 10);
    case STRUCTURE_WALL: return 1*Math.pow((1.0 - site.hits), 20);
    default: return 8*damageRatio;
  }
}


function tower_repair_filter(tower : StructureTower[], site : Structure) : boolean {
  if ((site instanceof OwnedStructure) && !(site as OwnedStructure).my) {
    return false;
  }

  const healthRatio = site.hits/site.hitsMax;
  switch (site.structureType) {
    case STRUCTURE_WALL:
      return site.hits/3000000 < 0.2;
    case STRUCTURE_RAMPART:
      return healthRatio < 0.2;
    default:
      break;
  }

  const power : number = _.max(_.map(tower, (t : StructureTower) : number => { return repair_power(t, site); }));
  return site.hitsMax - site.hits > power;
}

function worker_repair_filter(site : Structure) : boolean {
  if ((site instanceof OwnedStructure) && !(site as OwnedStructure).my) {
    return false;
  }

  const healthRatio = site.hits/site.hitsMax;
  switch (site.structureType) {
    case STRUCTURE_WALL:
      return site.hits/3000000 < 0.2;
    case STRUCTURE_RAMPART:
      return healthRatio < 0.2;
    case STRUCTURE_ROAD:
      return healthRatio < 0.5;
    default:
      break;
  }

  return healthRatio < 0.7;
}

class TowerRepairWork implements Work {

  readonly tower : StructureTower;
  readonly site : Structure;

  constructor(tower : StructureTower, site : Structure) {
    this.tower = tower;
    this.site = site;
  }

  id() {
    return `work-repair-tower-${this.tower.pos.x}-${this.tower.pos.y}`;
  }

  toString() : string {
    return this.id();
  }

  priority() : number {
    return 0;
  }

  work() : Operation[] {
    return [ () => {
      const res = this.tower.repair(this.site);
      switch (res) {
        case OK:
          log.info(`${this}: ${this.tower} repaired ${this.site}`);
          break;
        default:
          log.error(`${this}: ${this.tower} failed to repair ${this.site} (${u.errstr(res)})`);
          break;
      }
    } ];
  }
}


class TowerDefenseWork implements Work {

  readonly tower : StructureTower;
  readonly target : Creep;

  constructor(tower : StructureTower, target : Creep) {
    this.tower = tower;
    this.target = target;
  }

  id() {
    return `work-defense-${this.tower}-${this.target}`;
  }

  toString() : string {
    return this.id();
  }

  priority() : number {
    return 0;
  }

  work() : Operation[] {
    return [ () => {
      const res = this.tower.attack(this.target);
      switch (res) {
        case OK:
          log.info(`${this}: ${this.tower} attacked ${this.target}`);
          break;
        default:
          log.error(`${this}: ${this.tower} failed to attack ${this.target} (${u.errstr(res)})`);
          break;
      }
    } ];
  }
}


export class Caretaker implements Expert {

  private _city: City;
  private _towers : StructureTower[];

  constructor(city: City) {
    this._city = city;

    const room = this._city.room;

    this._towers = room.find<StructureTower>(FIND_MY_STRUCTURES, { filter: (s : Structure) => {
      if (s.structureType != STRUCTURE_TOWER) {
        return false;
      }
      return s.availableEnergy() > 0;
    }});
  }

  id() : string {
    return `caretaker-${this._city.name}`
  }

  toString() : string {
    return this.id();
  }

  survey() : void {
    log.debug(`${this} surveying...`);
  }

  repair() : Work[] {

    if (this._towers.length == 0) {
      return [];
    }

    // Don't perform tower repair if hostile creeps are around.
    const room = this._city.room;
    let work : Work[] = [];
    const foes = room.find(FIND_HOSTILE_CREEPS);
    if (foes.length > 0) {
      for (let i = 0; i < foes.length; ++i) {
        const t = this._towers[i];
        const f = foes[i];
        log.info(`${this}: creating new tower defense work ${t} => ${f} ...`)
        work.push(new TowerDefenseWork(t, f));
      }

      return work;
    }

    const repairSites = _.take(_.sortBy(
      room.find(FIND_STRUCTURES, { filter: (s: Structure) => { return tower_repair_filter(this._towers, s); }}),
      (s : Structure) => { return -repair_priority(s) }),
      this._towers.length);

    for (let i = 0; i < repairSites.length; ++i) {
      const t = this._towers[i];
      const s = repairSites[i];
      log.info(`${this}: creating new tower repair work ${t} => ${s} ...`)
      work.push(new TowerRepairWork(t, s));
    }

    return work;
  }

  schedule() : Job[] {

    const room = this._city.room;

    const repairSites : Structure[] = _.take(_.sortBy(
      room.find(FIND_STRUCTURES, { filter: worker_repair_filter }),
      10));

    const repairJobs : JobRepair[] = _.map(repairSites, (site : Structure) : JobRepair => {
      return new JobRepair(site, repair_priority(site));
    })

    log.debug(`${this} scheduling ${repairJobs.length} repair jobs...`);
    return repairJobs;
  }

  report() : string[] {
    let r = new Array<string>();
    r.push(`*** Caretaker report by ${this}`);
    return r;
  }

  save() : void {}
}
