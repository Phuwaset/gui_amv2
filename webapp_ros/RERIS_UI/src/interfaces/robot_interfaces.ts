export interface IPosition{
    label : string 
    action : string;
    id : string;
    x: number;
    y: number;
    yaw : number;
    color?: string;
}

export interface IMultiPosition{
    Position : IPosition[];
}


export interface IRoutineWaypoint {
  x: number;
  y: number;
  z: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
  point_name?: string;
  circle_error: number;
  yaw_error: number;
  delay_ms: number;
  point_behavior: string;
  pub_topic?: string;
  val_in?: number;
  val_passed?: number;
  val_failed?: number;
}

export interface IRoutine {
  id?: string; // MongoDB ObjectId
  routineId: string; // Logical ID (e.g. rtn_123)
  name: string;
  loop: number;
  timeout_s: number;
  startup?: boolean;
  trigger_topic?: string;
  trigger_map?: Record<string, string>;
  waypoints: IRoutineWaypoint[];
}

export interface ISchedule {
  id: string;
  routine_id: string;
  start_time: string;
  end_time: string;
  days: string[];
  enabled: boolean;
}

function isIPosition(pos: unknown): pos is IPosition {
  const p = pos as IPosition;
  return p && typeof p.x === "number" && typeof p.y === "number" && typeof p.yaw === "number";
}

function isIMultiPosition(pos: unknown): pos is IMultiPosition {
  const p = pos as IMultiPosition;
  return p && Array.isArray(p.Position);
}