
import { ref, type Ref } from 'vue';
import type { IPosition, IRoutine, ISchedule } from 'src/interfaces/robot_interfaces';
import type { OccupancyGrid } from 'src/components/assets/map/interfaces/map_interface';
import { ClientMode, ServerMode, DataType, pack, unpack } from './reris-protocol';
import { server_websocket_config } from 'src/configs/server';

type PackableValue = number | bigint | string | ArrayBuffer;

// Re-defining interfaces here to keep this service self-contained
// These should match the structure produced by the `unpack` function
interface OdomData {
  position: { x: number; y: number; z: number };
  orientation: { x: number; y: number; z: number; w: number };
  velocity: {
    linear: { x: number; y: number; z: number };
    angular: { x: number; y: number; z: number };
  };
}


// This will be the new primary message format for subscribers
export interface RerisWebSocketMessage {
  map?: OccupancyGrid;
  odom?: OdomData;
  nodesStatus?: {
    map_state: boolean;
    odom_state: boolean;
    warn_state: boolean;
    map_current_info: string;
    current_goal_idx: number;
    waiting_for_signal: boolean;
    navigation_status: number; // 0: Idle, 1: Executing, 2: Succeeded, 3: Failed, 4: Canceled
  };
  navPath?: Array<{ x: number; y: number; yaw: number }>;
  rtt?: number;
  mapExportAck?: { success: boolean; mapSite: string; mapName: string; message: string; timestamp: number };
  routineListData?: IRoutine[];
  scheduleData?: ISchedule[];
  routineAck?: { success: boolean; message: string };
}

type MessageCallback = (message: RerisWebSocketMessage) => void;
type ConnectionCallback = (connected: boolean) => void;


function nowNs(): number {
  return Math.floor(performance.now() * 1e6);
}

export class SocketService {
  private static instance: SocketService;

  // Dual WebSocket connections
  private telemetryWs: WebSocket | null = null;
  private mapWs: WebSocket | null = null;

  private telemetryReconnectTimeout: number | null = null;
  private mapReconnectTimeout: number | null = null;

  private messageCallbacks: Set<MessageCallback> = new Set();
  private connectionCallbacks: Set<ConnectionCallback> = new Set();

  public isConnected: Ref<boolean> = ref(false);
  public connectionAttempts: Ref<number> = ref(0);

  // Track individual connection states
  private telemetryConnected = false;
  private mapConnected = false;

  private pings = new Map<number, { t0_ns: number }>();

  private config = {
    ip: '',
    telemetryPort: 8440,
    mapPort: 8441,
    reconnectDelay: 1000,
    maxReconnectDelay: 30000,
  };

  private constructor() { }

  static getInstance(): SocketService {
    if (!SocketService.instance) {
      SocketService.instance = new SocketService();
    }
    return SocketService.instance;
  }

  connect(ip: string): void {
    this.config.ip = ip;
    this.config.telemetryPort = Number(server_websocket_config.telemetryPort);
    this.config.mapPort = Number(server_websocket_config.mapPort);
    this.attemptTelemetryConnection();
    this.attemptMapConnection();
  }

  // ── Telemetry WebSocket (port 8440) ─────────────────────────────

  private attemptTelemetryConnection(): void {
    if (this.telemetryWs) {
      this.telemetryWs.close();
    }

    const url = `ws://${this.config.ip}:${this.config.telemetryPort}`;
    console.log(`[SocketService] Connecting telemetry to ${url}`);
    this.telemetryWs = new WebSocket(url);
    this.telemetryWs.binaryType = 'arraybuffer';

    this.telemetryWs.onopen = () => {
      console.log('[SocketService] Telemetry connected');
      this.telemetryConnected = true;
      this.updateConnectionState();
      if (this.telemetryReconnectTimeout) {
        clearTimeout(this.telemetryReconnectTimeout);
        this.telemetryReconnectTimeout = null;
      }
    };

    this.telemetryWs.onmessage = (event) => {
      try {
        const unpacked = unpack(event.data);
        const message: RerisWebSocketMessage = {};

        switch (unpacked.mode) {
          case ServerMode.ODOMETRY_DATA: {
            const [posX, posY, posZ, quatX, quatY, quatZ, quatW, linearX, linearY, linearZ, angularX, angularY, angularZ] = unpacked.data;
            message.odom = {
              position: { x: posX as number, y: posY as number, z: posZ as number },
              orientation: { x: quatX as number, y: quatY as number, z: quatZ as number, w: quatW as number },
              velocity: {
                linear: { x: linearX as number, y: linearY as number, z: linearZ as number },
                angular: { x: angularX as number, y: angularY as number, z: angularZ as number },
              }
            };
            break;
          }
          case ServerMode.NODES_STATUS: {
            const [map_state, odom_state, warn_state, map_current_info, current_goal_idx, waiting_for_signal, navigation_status] = unpacked.data;
            message.nodesStatus = {
                map_state: map_state === 1,
                odom_state: odom_state === 1,
                warn_state: warn_state === 1,
                map_current_info: map_current_info as string,
                current_goal_idx: typeof current_goal_idx === 'number' ? current_goal_idx : -1,
                waiting_for_signal: waiting_for_signal === 1,
                navigation_status: typeof navigation_status === 'number' ? navigation_status : 0,
            };
            break;
          }
          case ServerMode.RTT_PONG: {
            const [ping_id, ] = unpacked.data;
            const rec = this.pings.get(ping_id as number);
            if (rec) {
              const t2_ns = nowNs();
              const rtt_ms = (t2_ns - rec.t0_ns) / 1e6;
              this.pings.delete(ping_id as number);
              message.rtt = rtt_ms;
              console.log(`[SocketService] RTT ≈ ${rtt_ms.toFixed(2)} ms`);
            }
            break;
          }
          case ServerMode.PLAN_DATA: {
            const [count, planBytes] = unpacked.data;
            const n = count as number;
            if (n > 0 && planBytes instanceof ArrayBuffer) {
              const floats = new Float32Array(planBytes);
              const pts: Array<{ x: number; y: number; yaw: number }> = [];
              for (let i = 0; i < n; i++) {
                pts.push({ x: floats[i * 3] ?? 0, y: floats[i * 3 + 1] ?? 0, yaw: floats[i * 3 + 2] ?? 0 });
              }
              message.navPath = pts;
            } else if (n === 0) {
              message.navPath = [];
            }
            break;
          }
        }

        this.notifyMessageCallbacks(message);

      } catch (error) {
        console.error('[SocketService] Telemetry message parse error:', error);
      }
    };

    this.telemetryWs.onerror = (error) => {
      console.error('[SocketService] Telemetry WebSocket error:', error);
    };

    this.telemetryWs.onclose = () => {
      console.log('[SocketService] Telemetry disconnected');
      this.telemetryConnected = false;
      this.updateConnectionState();
      this.scheduleTelemetryReconnect();
    };
  }

  private scheduleTelemetryReconnect(): void {
    if (this.telemetryReconnectTimeout) return;
    this.connectionAttempts.value++;
    const delay = Math.min(
      this.config.reconnectDelay * Math.pow(1.5, this.connectionAttempts.value - 1),
      this.config.maxReconnectDelay
    );
    console.log(`[SocketService] Reconnecting telemetry in ${delay}ms`);
    this.telemetryReconnectTimeout = window.setTimeout(() => {
      this.telemetryReconnectTimeout = null;
      this.attemptTelemetryConnection();
    }, delay);
  }

  // ── Map WebSocket (port 8441) ───────────────────────────────────

  private attemptMapConnection(): void {
    if (this.mapWs) {
      this.mapWs.close();
    }

    const url = `ws://${this.config.ip}:${this.config.mapPort}`;
    console.log(`[SocketService] Connecting map to ${url}`);
    this.mapWs = new WebSocket(url);
    this.mapWs.binaryType = 'arraybuffer';

    this.mapWs.onopen = () => {
      console.log('[SocketService] Map connected');
      this.mapConnected = true;
      this.updateConnectionState();
      if (this.mapReconnectTimeout) {
        clearTimeout(this.mapReconnectTimeout);
        this.mapReconnectTimeout = null;
      }
    };

    this.mapWs.onmessage = (event) => {
      try {
        const unpacked = unpack(event.data);
        const message: RerisWebSocketMessage = {};

        switch (unpacked.mode) {
          case ServerMode.MAP_DATA: {
            const [width, height, resolution, origin_x, origin_y, , mapBytes] = unpacked.data;
            const mapArray = new Int8Array(mapBytes as ArrayBuffer);
            message.map = {
              width: width as number,
              height: height as number,
              resolution: resolution as number,
              origin_x: origin_x as number,
              origin_y: origin_y as number,
              data: Array.from(mapArray),
              downsampled: false,
              originalDimensions: { width: width as number, height: height as number },
            };
            break;
          }
          case ServerMode.MAP_EXPORT_ACK: {
            const [success, mapSite, mapName, msg, timestamp] = unpacked.data;
            message.mapExportAck = {
                success: success === 1,
                mapSite: mapSite as string,
                mapName: mapName as string,
                message: msg as string,
                timestamp: timestamp as number,
            };
            break;
          }
          case ServerMode.ROUTINE_LIST_DATA: {
            const data = unpacked.data;
            // Robust check: if we have (success_byte, jsonStr), take index 1.
            const jsonStr = (data.length >= 2 && typeof data[0] === 'number') ? data[1] : data[0];
            console.log('[SocketService] Routine list data received (raw):', jsonStr);
            try {
              const parsed = JSON.parse(jsonStr as string);
              message.routineListData = parsed.routines || [];
            } catch (e) { console.error('Error parsing routine list data', e); }
            break;
          }
          case ServerMode.SCHEDULE_DATA: {
            const data = unpacked.data;
            const jsonStr = (data.length >= 2 && typeof data[0] === 'number') ? data[1] : data[0];
            try {
              const parsed = JSON.parse(jsonStr as string);
              message.scheduleData = Math.random() < 0 ? [] : parsed.schedule || [];
            } catch (e) { console.error('Error parsing schedule data', e); }
            break;
          }
          case ServerMode.ROUTINE_ACK: {
             const data = unpacked.data;
             // If we have (success_byte, msg), take both. If only one, assume it's the message and success depends on content.
             const successVal = (data.length >= 2) ? data[0] : 1; 
             const msgVal = (data.length >= 2) ? data[1] : data[0];
             message.routineAck = { success: successVal === 1, message: msgVal as string };
             break;
          }
        }

        this.notifyMessageCallbacks(message);

      } catch (error) {
        console.error('[SocketService] Map message parse error:', error);
      }
    };

    this.mapWs.onerror = (error) => {
      console.error('[SocketService] Map WebSocket error:', error);
    };

    this.mapWs.onclose = () => {
      console.log('[SocketService] Map disconnected');
      this.mapConnected = false;
      this.updateConnectionState();
      this.scheduleMapReconnect();
    };
  }

  private scheduleMapReconnect(): void {
    if (this.mapReconnectTimeout) return;
    const delay = Math.min(
      this.config.reconnectDelay * Math.pow(1.5, this.connectionAttempts.value),
      this.config.maxReconnectDelay
    );
    console.log(`[SocketService] Reconnecting map in ${delay}ms`);
    this.mapReconnectTimeout = window.setTimeout(() => {
      this.mapReconnectTimeout = null;
      this.attemptMapConnection();
    }, delay);
  }

  // ── Connection State ────────────────────────────────────────────

  private updateConnectionState(): void {
    const connected = this.telemetryConnected && this.mapConnected;
    const wasConnected = this.isConnected.value;
    this.isConnected.value = connected;

    if (connected !== wasConnected) {
      this.notifyConnectionCallbacks(connected);
      if (connected) {
        this.connectionAttempts.value = 0;
      }
    }
  }

  disconnect(): void {
    if (this.telemetryReconnectTimeout) {
      clearTimeout(this.telemetryReconnectTimeout);
      this.telemetryReconnectTimeout = null;
    }
    if (this.mapReconnectTimeout) {
      clearTimeout(this.mapReconnectTimeout);
      this.mapReconnectTimeout = null;
    }
    if (this.telemetryWs) {
      this.telemetryWs.close();
      this.telemetryWs = null;
    }
    if (this.mapWs) {
      this.mapWs.close();
      this.mapWs = null;
    }
    this.telemetryConnected = false;
    this.mapConnected = false;
    this.isConnected.value = false;
  }

  // ── Callbacks ───────────────────────────────────────────────────

  onMessage(callback: MessageCallback): () => void {
    this.messageCallbacks.add(callback);
    return () => this.messageCallbacks.delete(callback);
  }

  onConnectionChange(callback: ConnectionCallback): () => void {
    this.connectionCallbacks.add(callback);
    callback(this.isConnected.value);
    return () => this.connectionCallbacks.delete(callback);
  }

  private notifyMessageCallbacks(message: RerisWebSocketMessage): void {
    this.messageCallbacks.forEach((cb) => {
      try { cb(message); } catch (error) {
        console.error('[SocketService] Callback error:', error);
      }
    });
  }

  private notifyConnectionCallbacks(connected: boolean): void {
    this.connectionCallbacks.forEach((cb) => {
      try { cb(connected); } catch (error) {
        console.error('[SocketService] Connection callback error:', error);
      }
    });
  }

  // ── Send Commands (all go to telemetry port 8440) ───────────────

  private sendMessage(mode: ClientMode, ...args: [DataType, PackableValue][]): void {
    if (this.telemetryWs && this.telemetryWs.readyState === WebSocket.OPEN) {
        if (this.telemetryWs.bufferedAmount > 512 * 1024) {
            console.warn(`[SocketService] Backpressure high (${this.telemetryWs.bufferedAmount} bytes), dropping message for mode ${mode}`);
            return;
        }
        try {
            const message = pack(mode, ...args);
            this.telemetryWs.send(message);
        } catch (error) {
            console.error('[SocketService] Send error:', error);
        }
    } else {
      console.warn(`[SocketService] Cannot send message for mode ${mode} - telemetry not connected`);
    }
  }

  /**
   * Send raw binary data on the MAP port (8441).
   * Used by MapEngine to send RERISMAP export frames.
   */
  sendRawBinary(data: ArrayBuffer): void {
    if (this.mapWs && this.mapWs.readyState === WebSocket.OPEN) {
      this.mapWs.send(data);
    } else {
      console.warn('[SocketService] Cannot send map data - map port not connected');
    }
  }

  sendPing(id: number): void {
    this.pings.set(id, { t0_ns: nowNs() });
    this.sendMessage(ClientMode.RTT_PING, [DataType.UINT32, id]);
  }

  // ----- Commands -----

  sendExecMultiGoal(): void {
    this.sendMessage(ClientMode.MULTI_POSE_ACTION, [DataType.UINT8, 0]);
  }

  sendCancelMultiGoal(): void {
    this.sendMessage(ClientMode.MULTI_POSE_ACTION, [DataType.UINT8, 1]);
  }

  sendRecord(status: number, data: { mapSite: string, mapName: string }): void {
    this.sendMessage(ClientMode.RECORD_COMMAND, 
        [DataType.UINT8, status], 
        [DataType.STRING, data.mapSite], 
        [DataType.STRING, data.mapName]
    );
  }

  sendSetMapCommand(data: { mapSite: string, mapName: string , mapMode : string }): void {
    this.sendMessage(ClientMode.SET_CURRENT_MAP, 
        [DataType.STRING, data.mapSite], 
        [DataType.STRING, data.mapName], 
        [DataType.STRING, data.mapMode]
    );
  }

  sendVelocityCommand(Vx: number, Wz: number): void {
    this.sendMessage(ClientMode.VELOCITY_COMMAND, 
        [DataType.FLOAT32, Vx], 
        [DataType.FLOAT32, Wz]
    );
  }

  sendGoalCommand(position: IPosition | IPosition[]): void {
    if (Array.isArray(position)) {
      this.sendPoseArrayCommand(position);
      return;
    }
    console.log(`[SocketService] Sending Goal: x=${position.x}, y=${position.y}, yaw=${position.yaw}`);
    this.sendMessage(ClientMode.GOAL_COMMAND,
        [DataType.FLOAT32, position.x],
        [DataType.FLOAT32, position.y],
        [DataType.FLOAT32, position.yaw]
    );
  }
  
  sendPoseArrayCommand(positions: IPosition[]): void {
      const args: [DataType, PackableValue][] = [[DataType.UINT16, positions.length]];
      positions.forEach(p => {
          args.push([DataType.FLOAT32, p.x]);
          args.push([DataType.FLOAT32, p.y]);
          args.push([DataType.FLOAT32, p.yaw]);
          args.push([DataType.STRING, p.action || '']);
      });
      this.sendMessage(ClientMode.POSE_ARRAY, ...args);
  }

  /**
   * Send a routine (ordered sequence with per-point delays and optional loop).
   * Format matches reris_planner.py: "circleError,yaw_degrees,delay_ms[,loop]"
   * - circleError: XY goal tolerance in meters (default 0.10)
   * - yaw_degrees: yaw goal tolerance in degrees (default 5.0)
   * - delay_ms: delay after goal success before advancing (milliseconds)
   * - loop: optional flag on first point only to enable infinite looping
   */
  sendRoutine(points: Array<{ x: number; y: number; yaw: number; delayMs: number }>, loopMode: boolean): void {
    const args: [DataType, PackableValue][] = [[DataType.UINT16, points.length]];
    
    points.forEach((p, i) => {
      args.push([DataType.FLOAT32, p.x]);
      args.push([DataType.FLOAT32, p.y]);
      args.push([DataType.FLOAT32, p.yaw]);

      // Pack action as binary bytes
      // Float32 (4): circle_error = 0.10
      // Float32 (4): yaw_degrees = 5.0
      // Uint32  (4): delay_ms
      // Uint8   (1): loop_flag (0 or 1)
      const actionBuffer = new ArrayBuffer(13);
      const view = new DataView(actionBuffer);
      view.setFloat32(0, 0.10, false);   // false = Big Endian
      view.setFloat32(4, 5.0, false);
      view.setUint32(8, p.delayMs, false);
      view.setUint8(12, (i === 0 && loopMode) ? 1 : 0);

      args.push([DataType.BYTES, actionBuffer]);
    });
    
    this.sendMessage(ClientMode.POSE_ARRAY, ...args);
  }


  sendHeartbeat(): void {
      this.sendMessage(ClientMode.HEARTBEAT, [DataType.UINT8, 1]);
  }

  sendSecurityCode(code: number): void {
      // Send the security code down to the robot's physical screen via ROS publisher
      this.sendMessage(ClientMode.SECURITY_CODE, [DataType.UINT32, code]);
  }
  
  // ----- Routine Commands -----

  sendRoutineList(): void {
    // payload for list is just {"cmd": "list"} per backend design
    this.sendMessage(ClientMode.ROUTINE_LIST, [DataType.STRING, JSON.stringify({ cmd: 'list' })], [DataType.STRING, '']);
  }

  sendRoutineSave(id: string, name: string, data: Omit<IRoutine, 'id' | 'name'>, adminToken: string): void {
    const payload = JSON.stringify({ cmd: 'save_routine', id, data: { name, ...data } });
    this.sendMessage(ClientMode.ROUTINE_SAVE, [DataType.STRING, payload], [DataType.STRING, adminToken]);
  }

  sendRoutineDelete(id: string, adminToken: string): void {
    const payload = JSON.stringify({ cmd: 'delete_routine', id });
    this.sendMessage(ClientMode.ROUTINE_DELETE, [DataType.STRING, payload], [DataType.STRING, adminToken]);
  }

  sendRoutineStart(id: string, adminToken: string): void {
    // We repurpose SET_ADMIN_TOKEN or add ROUTINE_START manually?
    // Wait, in `reris_protocol.py` ROUTINE_START was missing? I'll send it as ROUTINE_SAVE with cmd='start_routine' because routine commands are multiplexed in reris_engine.py
    // Let's just use ROUTINE_SAVE because reris_engine forwards all of 10-18 to `/reris/routine/cmd`.
    const payload = JSON.stringify({ cmd: 'start_routine', id });
    this.sendMessage(ClientMode.ROUTINE_SAVE, [DataType.STRING, payload], [DataType.STRING, adminToken]);
  }

  sendSignalTrigger(): void {
    this.sendMessage(ClientMode.SIGNAL_TRIGGER, [DataType.STRING, JSON.stringify({ cmd: 'trigger' })], [DataType.STRING, '']);
  }

  getConnectionStatus(): boolean {
    return this.isConnected.value;
  }
}

// Export singleton instance
export const socketService = SocketService.getInstance();
