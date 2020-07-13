import * as Business from 'Business';
import * as Job from "Job";
import JobHarvest from 'JobHarvest';
import JobUnload from 'JobUnload';
import JobPickup from 'JobPickup';
import JobRepair from 'JobRepair';
import JobBuild from 'JobBuild';
import { BuildingWork } from 'Architect';
import u from 'Utility';
import { log } from 'ScrupsLogger';
import { object, min } from 'lodash';
import JobDrop from 'JobDrop';

const EMPLOYEE_BODY_BASE: BodyPartConstant[] = [MOVE, CARRY, MOVE, CARRY, MOVE, CARRY];
const EMPLOYEE_BODY_TEMPLATE: BodyPartConstant[] = [MOVE, CARRY];
const IDEAL_CLONE_ENERGY = 1000;
const MAX_CLONE_ENERGY = 2000;

function find_vault_structures(vault: StructureStorage): AnyStructure[] {
  return vault.room?.find(FIND_STRUCTURES, {
    filter: (s) => (s.structureType == STRUCTURE_LINK) && vault.pos.inRangeTo(s.pos, 1)
  });
}

function can_build_link(vault: StructureStorage): boolean {
  const rcl = vault.room.controller?.level ?? 0;
  const links = u.find_building_sites(vault.room, STRUCTURE_LINK);
  const allowedNumContainers = CONTROLLER_STRUCTURES.container[rcl];
  return (allowedNumContainers - links.length) > 0;
}

function possible_link_sites(linkNeighbour: Structure): RoomPosition[] {
  let haveLink: boolean = false;
  const room = linkNeighbour.room;
  if (!room) {
    return [];
  }
  const viableSites = linkNeighbour.pos.surroundingPositions(1, (site: RoomPosition): boolean => {
    if (haveLink) {
      return false;
    }
    const terrain = site.look();
    for (const t of terrain) {
      switch (t.type) {
        case LOOK_CONSTRUCTION_SITES:
          if (t.constructionSite && t.constructionSite.structureType == STRUCTURE_LINK) {
            haveLink = true;
          }
          return false;
        case LOOK_STRUCTURES:
          if (t.structure && t.structure.structureType == STRUCTURE_LINK) {
            haveLink = true;
          }
          return false;
        case LOOK_TERRAIN:
          if (t.terrain == 'wall') {
            return false;
          }
          break;
        default:
          break;
      }
    }
    return true;
  });

  if (haveLink) {
    return [];
  }

  log.info(`found ${viableSites.length} viable link sites for ${linkNeighbour}`);
  const sortedSites = _.sortBy(viableSites, (site: RoomPosition) => {
    const emptyPositions = u.find_empty_surrounding_positions(site);
    let val = -emptyPositions.length;
    if (room.storage) {
      val += 1 / site.getRangeTo(room.storage);
    }
    return val;
  });

  return _.take(sortedSites, 1);
}

function best_link_pos(vault: StructureStorage) {
  return possible_link_sites(vault)[0];
}

function link_building_work(vault: StructureStorage): BuildingWork {
  return new BuildingWork(vault.room, best_link_pos(vault), STRUCTURE_LINK)
}

function update_vault(vault: StructureStorage): void {
  log.debug(`update_vault(${vault}): l=${vault._link}`)
  if (!vault._link) {
    const sites = find_vault_structures(vault);
    for (const site of sites) {
      if (!vault._link && (site instanceof StructureLink)) {
        vault._link = site;
        vault._link._isSink = true;
        log.info(`${vault}: updated link to ${site}`);
      }
    }
  }
}

export default class BusinessBanking implements Business.Model {

  static readonly TYPE: string = 'bank';

  private readonly _priority: number;
  private readonly _vault: StructureStorage;

  constructor(vault: StructureStorage, priority: number = 5) {
    this._priority = priority;
    this._vault = vault;
  }

  id(): string {
    return Business.id(BusinessBanking.TYPE, this._vault.id);
  }

  toString(): string {
    return this.id();
  }

  site(): RoomObject {
    return this._vault;
  }

  priority(): number {
    return this._priority;
  }

  survey() {
    update_vault(this._vault);
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
    // No permanent jobs for banking. Just ensures a good transporter is
    // created
    return [];
    ;
  }

  contractJobs(): Job.Model[] {
    const vault: StructureStorage = this._vault;
    const attackers = u.find_nearby_attackers(vault);
    if (attackers.length > 0) {
      log.warning(`${this}: ${attackers} near vault - no contract jobs!`);
      return [];
    }

    let jobs: Job.Model[] = [];

    if (vault.available() > 0) {
      jobs.push(new JobPickup(vault, 1));
    }

    if (vault.freeSpace() > 0) {
      jobs.push(new JobUnload(vault, 1));
    }

    const link = vault.link();
    if (link && link.available() > 0) {
      jobs.push(new JobPickup(link, this._priority));
    }

    log.debug(`${this}: contracts ${jobs}`);
    return jobs;
  }

  buildings(): BuildingWork[] {
    const vault: StructureStorage = this._vault;
    const work: BuildingWork[] = [];

    if (!vault._link && can_build_link(vault)) {
      work.push(link_building_work(vault));
    }

    return work;
  }
}

Business.factory.addBuilder(BusinessBanking.TYPE, (id: string): Business.Model | undefined => {
  const frags = id.split('-');
  const vault = <StructureStorage>Game.getObjectById(frags[2]);
  if (!vault) {
    return undefined;
  }
  const priority = Number(frags[3]);
  return new BusinessBanking(vault, priority);
});



