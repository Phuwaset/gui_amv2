// src/components/map/io/SocketClient.ts
import type { MapState } from '../state/mapState';
import type { IPosition } from 'src/interfaces/robot_interfaces';
import type { OccupancyGrid } from '../interfaces/map_interface';
import { payloadAction } from 'src/interfaces/socket_interface';
import { decompressData } from '../engine/texture';

export class SocketClient {
  private ws: WebSocket | null = null;
  private reconnectTimeout: number | null = null;
  private state: MapState;
  private onMapUpdate?: (mapData: OccupancyGrid) => void;
  private onRobotUpdate?: (robotPosition: { x: number; y: number; yaw: number }) => void;

  constructor(
    state: MapState,
    onMapUpdate?: (mapData: OccupancyGrid) => void,
    onRobotUpdate?: (robotPosition: { x: number; y: number; yaw: number }) => void
  ) {
    this.state = state;
    this.onMapUpdate = onMapUpdate;
    this.onRobotUpdate = onRobotUpdate;
  }

  connect(ip: string, port: number): void {
    if (this.ws) this.ws.close();

    this.ws = new WebSocket(`ws://${ip}:${port}`);

    this.ws.onopen = () => {
      //console.log('WebSocket connected');
      this.state.isConnected.value = true;
      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = null;
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const { map, odom, map_updated } = JSON.parse(event.data);

        let mapChanged = false;
        let robotChanged = false;

        // Handle map data
        if (map?.width && map?.height && map?.data) {
          const newMapData = {
            ...map,
            resolution: map.resolution || 0.05,
            origin_x: map.origin?.[0] || 0,
            origin_y: map.origin?.[1] || 0,
            data: map.compressed ? decompressData(map.data) : map.data,
            downsampled: map.downsampled || false,
            originalDimensions: map.original_dimensions || { width: map.width, height: map.height },
          };

          const newMapHash = `${newMapData.width}-${newMapData.height}-${newMapData.data.length}`;
          if (this.state.renderState.lastMapHash !== newMapHash || map_updated) {
            this.state.mapData.value = newMapData;
            if (this.onMapUpdate) {
              this.onMapUpdate(newMapData);
            }
            //console.log('map update!');
            mapChanged = true;
          }
        }

        // Handle robot position
        if (odom?.position && odom?.orientation) {
          const newRobotPosition = {
            x: odom.position.x,
            y: odom.position.y,
            yaw: -(
              this.quaternionToEuler(
                odom.orientation.x,
                odom.orientation.y,
                odom.orientation.z,
                odom.orientation.w
              ).yaw - 1.5708
            ),
          };

          const newRobotHash = `${newRobotPosition.x.toFixed(3)}-${newRobotPosition.y.toFixed(3)}-${newRobotPosition.yaw.toFixed(3)}`;
          if (this.state.renderState.lastRobotState.hash !== newRobotHash) {
            this.state.robotPosition.value = newRobotPosition;
            this.state.renderState.lastRobotState = { ...newRobotPosition, hash: newRobotHash };
            if (this.onRobotUpdate) {
              this.onRobotUpdate(newRobotPosition);
            }
            robotChanged = true;
          }
        }

        return { mapChanged, robotChanged };
      } catch (error) {
        console.error('WebSocket message error:', error);
        return { mapChanged: false, robotChanged: false };
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.state.isConnected.value = false;
    };

    this.ws.onclose = () => {
      //console.log('WebSocket disconnected');
      this.state.isConnected.value = false;
      this.state.showStatusState.value = false;
      this.reconnectTimeout = setTimeout(() => this.connect(ip, port), 1000);
    };
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  sendVelocityCommand(Vx: number, Vy: number): void {
    if (this.ws && this.state.isConnected.value) {
      const velocityCmd = {
        action: payloadAction.vel_cmd,
        Vx,
        Vy,
      };
      this.ws.send(JSON.stringify(velocityCmd));
    }
  }

  sendGoalCommand(position: IPosition | IPosition[]): void {
    let payload = '';
    if (Array.isArray(position)) {
      payload = JSON.stringify({
        action: payloadAction.goal_multi_cmd,
        position: position,
      });
    } else {
      payload = JSON.stringify({
        action: payloadAction.goal_cmd,
        position: position,
      });
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(payload);
    }
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  private quaternionToEuler(x: number, y: number, z: number, w: number): { roll: number; pitch: number; yaw: number } {
    const sinr_cosp = 2 * (w * x + y * z);
    const cosr_cosp = 1 - 2 * (x * x + y * y);
    const roll = Math.atan2(sinr_cosp, cosr_cosp);

    const sinp = 2 * (w * y - z * x);
    const pitch = Math.asin(Math.max(-1, Math.min(1, sinp)));

    const siny_cosp = 2 * (w * z + x * y);
    const cosy_cosp = 1 - 2 * (y * y + z * z);
    const yaw = Math.atan2(siny_cosp, cosy_cosp);

    return { roll, pitch, yaw };
  }
}