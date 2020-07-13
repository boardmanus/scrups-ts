import { Operation } from "./Operation";
import * as Job from "Job";
import u from "./Utility"
import { log } from './ScrupsLogger'

function drop_at_site(job: JobDrop, worker: Creep, site: StructureContainer): Operation {
  return () => {
    worker.room.visual.circle(site.pos, { fill: 'transparent', radius: 0.55, lineStyle: 'dashed', stroke: 'purple' });
    worker.say('👎');

    if (!worker.pos.isEqualTo(site.pos)) {
      const res = worker.jobMoveTo(site, 0, <LineStyle>{ opacity: .4, stroke: 'purple' });
      if (res == OK) {
        log.info(`${job}: ${worker} moved towards drop site ${site} (${worker.pos.getRangeTo(site)} sq)`);
      }
      else {
        log.warning(`${job}: ${worker} failed moving to ${site} (${worker.pos.getRangeTo(site)} sq) (${u.errstr(res)})`);
      }
      return;
    }

    const resource = RESOURCE_ENERGY;
    let res: number = worker.drop(resource);
    switch (res) {
      case OK:
        // Finished job.
        log.info(`${job}: ${worker} dropped ${resource} to ${site}`);
        break;
      default:
        log.warning(`${job}: ${worker} failed to drop ${worker.store[resource]} ${resource} to ${site} (${u.errstr(res)})`);
        break;
    }
  }
}

export default class JobDrop implements Job.Model {

  static readonly TYPE = 'drop';

  readonly _site: StructureContainer;
  readonly _priority: number;

  constructor(site: StructureContainer, priority: number = 1) {
    this._site = site;
    this._priority = priority;
  }

  id(): string {
    return `job-${JobDrop.TYPE}-${this._site.id}`;
  }

  type(): string {
    return JobDrop.TYPE;
  }

  toString(): string {
    return this.id();
  }

  priority(workers?: Creep[]): number {
    return this._priority;
  }

  efficiency(worker: Creep): number {
    const lastSite = worker.getLastJobSite();
    if (lastSite === this._site || lastSite instanceof StructureContainer) {
      return 0;
    }
    return 0.1;
  }

  site(): RoomObject {
    return this._site;
  }

  isSatisfied(workers: Creep[]): boolean {
    return true;
  }

  completion(worker?: Creep): number {
    return !worker ? 0.0 : (1.0 - worker.available() / worker.capacity());
  }

  satisfiesPrerequisite(p: Job.Prerequisite): boolean {
    return p == Job.Prerequisite.DELIVER_ENERGY;
  }

  prerequisite(worker: Creep): Job.Prerequisite {
    return Job.Prerequisite.NONE;
  }

  baseWorkerBody(): BodyPartConstant[] {
    return [CARRY, MOVE];
  }

  work(worker: Creep): Operation[] {
    log.debug(`${this}: work operations for ${worker}`);
    return [drop_at_site(this, worker, this._site)];
  }
}


Job.factory.addBuilder(JobDrop.TYPE, (id: string): Job.Model | undefined => {
  const frags = id.split('-');
  const site = <StructureContainer>Game.getObjectById(frags[2]);
  if (!site) return undefined;
  const priority = Number(frags[3]);
  return new JobDrop(site);
});
