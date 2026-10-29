// src/components/map/engine/goalManager.ts
import type { MapState } from '../state/mapState';
import type { IPosition } from 'src/interfaces/robot_interfaces';

export class GoalManager {
  private state: MapState;

  constructor(state: MapState) {
    this.state = state;
  }

  createMultiPoint(position_x: number, position_y: number, yaw: number): void {
    this.state.multiGoal.value.push({ x: position_x, y: position_y, yaw });
  }

  clearMultiPoint(): void {
    this.state.multiGoal.value = [];
  }

  setSingleGoal(position: IPosition): void {
    this.state.singleGoal.value = position;
  }

  setSelectGoal(position: IPosition): void {
    this.state.selectGoal.value = position;
  }

  getMultiGoals(): IPosition[] {
    return this.state.multiGoal.value;
  }

  getSingleGoal(): IPosition {
    return this.state.singleGoal.value;
  }

  getSelectGoal(): IPosition {
    return this.state.selectGoal.value;
  }
}