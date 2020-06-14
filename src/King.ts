import { Work } from "./Work"
import { Mayor } from "./Mayor"
import { Operation } from "./Operation"
import { log } from './ScrupsLogger'

export class King {

  private _mayors: Mayor[];
  private _name: string;

  constructor() {
    let myRooms = _.select(Game.rooms, (room: Room) => { return room.controller ? room.controller.my : false });
    let controller = (myRooms.length) ? myRooms[0].controller : undefined;
    this._name = controller?.owner?.username ?? "of-nothing";
    this._mayors = _.map(myRooms, (room: Room): Mayor => { return new Mayor(room); });
    log.info(`${this}: ${this._mayors.length} mayors`);
  }

  id(): string {
    return `king - ${this._name}`
  }


  toString(): string {
    return this.id();
  }

  survey(): void {
    log.info(`${this} surveying...`);
    _.each(this._mayors, (mayor: Mayor) => { mayor.survey(); });
  }

  report(): string[] {
    let r = new Array<string>();
    r.push(`* Royal report by ${this}`);
    _.each(this._mayors, (mayor: Mayor) => { r.concat(mayor.report()); });
    return r;
  }

  rule(): Operation[] {
    log.info(`${this} about to rule the world...`);
    this.survey();

    const ops = _.reduce(
      this._mayors,
      function (res: Operation[], mayor: Mayor): Operation[] {
        return res.concat(_.flatten(_.map(
          mayor.work(),
          (work: Work): Operation[] => {
            return work.work();
          })));
      },
      []);

    log.info(`${this} has ${ops.length} operations scheduled...`);

    return ops;
  }

  save(): void {
    _.each(this._mayors, (mayor: Mayor) => { mayor.save(); });
  }
}
