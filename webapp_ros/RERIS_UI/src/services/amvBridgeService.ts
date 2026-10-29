import { ref } from 'vue';

export interface AmvBaseStatus {
  battery_level?: number;
  charging?: boolean;
  emergency_button?: boolean;
  green_button?: boolean;
  red_button?: boolean;
  linear_up_conf?: boolean;
  linear_down_conf?: boolean;
}

export interface AmvNavigationStatus {
  current_station?: string;
  reset_station?: string;
  going_station?: string;
  send_station?: string;
  receive_station?: string;
  navigation_status?: string;
  pin_lock?: string;
  obstacle?: string;
}

class AmvBridgeService {
  private ws: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  public targetIp: string = '192.168.50.115';
  public targetPort: number = 9090;

  // Reactive telemetry states
  public isConnected = ref(false);
  public batteryLevel = ref<number | null>(null);
  public isCharging = ref(false);
  public isEmergency = ref(false);
  public currentStation = ref('Out of station');
  public goingStation = ref('None');
  public navigationStatus = ref('Idle');
  public pinLock = ref('None');
  public obstacle = ref('None');

  public connect(ip?: string, port?: number) {
    if (ip) this.targetIp = ip;
    if (port) this.targetPort = port;

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const wsUrl = `ws://${this.targetIp}:${this.targetPort}`;
    console.log(`[AmvBridge] Connecting to ${wsUrl}...`);

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log(`[AmvBridge] Connected to rosbridge at ${wsUrl}`);
        this.isConnected.value = true;
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }

        // Subscribe to base status (battery, e-stop)
        this.subscribe('/amv_base_status', 'amv_connect/BaseStatusStamped');
        // Subscribe to navigation status (station, obstacle, pin)
        this.subscribe('/amv_navigation_status', 'amv_service/NavigationStatus');
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.op === 'publish') {
            if (data.topic === '/amv_base_status' && data.msg) {
              const bs: AmvBaseStatus = data.msg.base_status || data.msg;
              if (typeof bs.battery_level === 'number') {
                this.batteryLevel.value = bs.battery_level;
              }
              this.isCharging.value = Boolean(bs.charging);
              this.isEmergency.value = Boolean(bs.emergency_button);
            } else if (data.topic === '/amv_navigation_status' && data.msg) {
              const ns: AmvNavigationStatus = data.msg;
              if (ns.current_station) this.currentStation.value = ns.current_station;
              if (ns.going_station) this.goingStation.value = ns.going_station;
              if (ns.navigation_status) this.navigationStatus.value = ns.navigation_status;
              if (ns.pin_lock) this.pinLock.value = ns.pin_lock;
              if (ns.obstacle) this.obstacle.value = ns.obstacle;
            }
          }
        } catch {
          // ignore non-json
        }
      };

      this.ws.onclose = () => {
        console.warn('[AmvBridge] Connection closed. Will reconnect...');
        this.isConnected.value = false;
        this.scheduleReconnect();
      };

      this.ws.onerror = (err) => {
        console.error('[AmvBridge] WebSocket error:', err);
        this.isConnected.value = false;
        this.ws?.close();
      };
    } catch (e) {
      console.error('[AmvBridge] Init error:', e);
      this.isConnected.value = false;
      this.scheduleReconnect();
    }
  }

  private subscribe(topic: string, messageType: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        op: 'subscribe',
        topic,
        type: messageType,
      }));
    }
  }

  private scheduleReconnect() {
    if (!this.reconnectTimer) {
      this.reconnectTimer = window.setTimeout(() => {
        this.reconnectTimer = null;
        this.connect();
      }, 3000);
    }
  }

  public disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected.value = false;
  }
}

export const amvBridge = new AmvBridgeService();

