// memory extension samples
interface CreepMemory {
  job: string | undefined;
  employed: boolean | undefined;
  homeTown: string;
}

interface RoomMemory {
  expats: string[];
  bosses: BossMemory[];
  cloneCount: number;
  roadsEstablished: boolean;
}

interface SubcontractorMemory {
  worker: string;
  job: string;
}

interface BossMemory {
  job: string;
  workers: string[];
  subcontractors: SubcontractorMemory[];
}

interface AssignmentMemory {
  worker: string;
  job: string;
  prerequisite: AssignmentMemory | undefined;
}

// add objects to `global` here
declare namespace NodeJS {
  interface Global {
    log: any;
  }
}

interface Memory {
  uuid: number;
  log: any;
}


declare const __REVISION__: string


