// src/components/map/state/mapState.ts
import { ref, type Ref } from 'vue';
import type { OccupancyGrid, Transform } from '../interfaces/map_interface';
import type { IPosition } from 'src/interfaces/robot_interfaces';
import type { ToolType } from '../toolbox/ToolBox.vue';


export interface AreaRect {
  id: string;
  label : string;
  dockPosition : IPosition[]
  p1: { x: number; y: number }; // wWorld
  p2: { x: number; y: number }; // world
  color: string;                // CSS color
  type?: 'navigation' | 'restrict';
}

// Export
export type BrushMode = 'brush' | 'erase' | 'unknown';
export type SectionPosition = { x: number; y: number; idx: number };
export type SectionMarker = {
  marker_name: string;
  marker_type: "point";
  marker_position: { x: number; y: number };
};
export type SectionOut = {
  section_lable: string;
  section_position: SectionPosition[];
  section_position_centroid: { x: number; y: number };
  section_marker: SectionMarker[];
};
export type ExportOut = {
  map_section: SectionOut[];
  map_size: { width: number; height: number };
};

export interface ExportedMarker {
  marker_name: string;
  marker_type: "point";
  marker_position: { x: number; y: number , yaw : number};
  marker_color?: string;
}

export interface ExportedSectionPosition {
  x: number;
  y: number;
  idx: number;
}

export interface ExportedSection {
  section_lable: string;
  section_color : string;
  section_position: ExportedSectionPosition[];
  section_position_centroid: { x: number; y: number };
  section_marker: ExportedMarker[];
  type?: 'navigation' | 'restrict';
}

export interface ExportedMap {
  map_section: ExportedSection[];
  map_size: { width: number; height: number };
}

export interface INodeStatus {
  map_state : boolean
  odom_state : boolean
  warn_state : boolean
  map_current_info: string;
}


export type SelectedKind =
  | { type: 'single' }                       // singleGoal
  | { type: 'multi'; index: number }         // multiGoal[index]
  | { type: 'rect'; id: string }             // rectangle body
  | { type: 'rect-handle'; id: string; handle: 'nw' | 'ne' | 'sw' | 'se' }; // rectangle corner (nw=top-left, ne=top-right, sw=bottom-left, se=bottom-right in canvas space)


export interface RenderState {
  mapImageData: ImageData | null;
  mapTexture: HTMLCanvasElement | null;
  lastMapHash: string;
  lastRobotState: { x: number; y: number; yaw: number; hash: string };
  lastTargetState: { x: number; y: number; yaw: number; hash: string };
  needsFullRedraw: boolean;
  animationFrameId: number;
}

export interface PerformanceState {
  frameCount: number;
  lastFPSTime: number;
  frameTimes: number[];
  lastFrameTime: number;
}

export interface TouchState {
  active: boolean;
  startDist: number;
  startZoom: number;
  startPos: { x: number; y: number };
  lastPos: { x: number; y: number };
  lastPosMulti: { x: number; y: number };
}

export interface TouchDiffPos {
  dx: number;
  dy: number;
  timeDiff: number;
  timePrev: number;
}

export interface LayerVisibility {
  map: boolean;
  robot: boolean;
  target: boolean;
  navPath: boolean;
}

export interface MultiSelection {
  markerIndices: number[];
  areaIds: string[];
}

export interface MapState {
  mode: Ref<string>;
  nodeStatus : Ref<INodeStatus>;
  // Marker Tool
  markerId : Ref<string>;
  // Canvas refs
  canvas: Ref<HTMLCanvasElement | null>;
  canvasContainer: Ref<HTMLElement | null>;
  canvasWidth: Ref<number>;
  canvasHeight: Ref<number>;

  // Tool state
  activeTool: Ref<ToolType>;
  cursorPosition: Ref<{ x: number; y: number }>;
  
  // Yaw Tool
  isSettingYaw: Ref<boolean>;
  yawPreview: Ref<number>;
  
  // Area Tool
  isSettingArea: Ref<boolean>;
  areaStartWorld: Ref<{ x: number; y: number } | null>;
  areaPreviewWorld: Ref<{ x: number; y: number } | null>;
  areaRects: Ref<AreaRect[]>;
  activeRectColor: Ref<string>;

  // Cursor Tool
  selectedObject : Ref<SelectedKind | null>;
  isDraggingSelection : Ref<boolean>;

  // Map Editor Tools
  

  // จุดออฟเซ็ต world ตอนเริ่มลาก (สำหรับย้ายทั้ง object)
  dragOffsetWorld : Ref<{ dx: number; dy: number } | null>;

  // พารามิเตอร์ฮิตเทสต์ (พิกัดจอ, หน่วยพิกเซล)
  hitRadiusPx : Ref<number>;  // ระยะคลิกโดนจุด
  closeIconSize : Ref<number>; // ขนาดกล่องปุ่มลบ
  closeIconOffsetPx : Ref<number>; // ระยะจากมุมกรอบ/จุด


  // Connection state
  showConnected: Ref<boolean>;
  showStatusState: Ref<boolean>;
  showTargetAngle: Ref<boolean>;
  isConnected: Ref<boolean>;

  // Map data
  mapData: Ref<OccupancyGrid | null>;
  robotPosition: Ref<{ x: number; y: number; yaw: number }>;
  navPath: Ref<Array<{ x: number; y: number; yaw: number }>>;
  selectGoal: Ref<IPosition>;
  singleGoal: Ref<IPosition>;
  multiGoal: Ref<IPosition[]>;
  multiGoalUpdate: Ref<boolean>;

  // Transform
  transform: Ref<Transform>;
  zoomLevel: Ref<number>;
  minZoom: number;
  maxZoom: number;
  isDragging: Ref<boolean>;
  lastPointerPos: Ref<{ x: number; y: number }>;

  // Resolution tracking
  previousCanvasSize: Ref<{ width: number; height: number }>;
  mapCenterWorld: Ref<{ x: number; y: number }>;

  // Touch state
  touchState: Ref<TouchState>;
  touchDiffPos: Ref<TouchDiffPos>;

  // Velocity
  Vx: Ref<number>;
  Vy: Ref<number>;

  // Performance
  showDebugControls: Ref<boolean>;
  showPerformanceInfo: Ref<boolean>;
  currentFPS: Ref<number>;
  averageFrameTime: Ref<number>;
  renderedFrames: Ref<number>;

  // Multi-select tool
  multiSelection: Ref<MultiSelection>;
  selectionDragRect: Ref<{ x1: number; y1: number; x2: number; y2: number } | null>;
  isMultiSelecting: Ref<boolean>;
  isMovingMultiSelection: Ref<boolean>;
  multiSelectionDragLastWorld: Ref<{ x: number; y: number } | null>;

  // Layer visibility
  layerVisibility: Ref<LayerVisibility>;

  // Render state
  renderState: RenderState;
  performanceState: PerformanceState;
}

export function createMapState(): MapState {
  return {
    mode: ref('visualize'),
    nodeStatus : ref<INodeStatus>({ odom_state: false, map_state: false, warn_state: false, map_current_info: '' }),
    markerId : ref(0),
    // Connection Timer

    // Canvas refs
    canvas: ref<HTMLCanvasElement | null>(null),
    canvasContainer: ref<HTMLElement | null>(null),
    canvasWidth: ref(1080),
    canvasHeight: ref(1080),

    areaStartWorld: ref<{ x: number; y: number } | null>(null),
    areaPreviewWorld: ref<{ x: number; y: number } | null>(null),
    areaRects: ref<AreaRect[]>([]),
    activeRectColor: ref<string>('#22c55e'),

    // Tool state
    activeTool: ref<ToolType>('cursor'),
    isSettingYaw: ref(false),
    isSettingArea: ref(false),
    cursorPosition: ref({ x: 0, y: 0 }),
    yawPreview: ref(0),


    selectedObject : ref<SelectedKind | null>(null),
    isDraggingSelection : ref(false),

// จุดออฟเซ็ต world ตอนเริ่มลาก (สำหรับย้ายทั้ง object)
    dragOffsetWorld : ref<{ dx: number; dy: number } | null>(null),

// พารามิเตอร์ฮิตเทสต์ (พิกัดจอ, หน่วยพิกเซล)
    hitRadiusPx : ref(10),  // ระยะคลิกโดนจุด
    closeIconSize : ref(18), // ขนาดกล่องปุ่มลบ
    closeIconOffsetPx : ref(8), // ระยะจากมุมกรอบ/จุด

    // Connection state
    showConnected: ref(false),
    showStatusState: ref(false),
    showTargetAngle: ref(false),
    isConnected: ref(false),

    // Map data
    mapData: ref<OccupancyGrid | null>(null),
    robotPosition: ref({ x: 0, y: 0, yaw: 0 }),
    navPath: ref<Array<{ x: number; y: number; yaw: number }>>([]),
    selectGoal: ref({ x: 0, y: 0, yaw: 0 }),
    singleGoal: ref({ x: 0, y: 0, yaw: 0 }),
    multiGoal: ref([{ x: 0, y: 0, yaw: 0 }]),
    multiGoalUpdate: ref(false),

    // Transform
    transform: ref({ scale: 1.0, translateX: 0, translateY: 0 }),
    zoomLevel: ref(1.0),
    minZoom: 0.1,
    maxZoom: 10.0,
    isDragging: ref(false),
    lastPointerPos: ref({ x: 0, y: 0 }),

    // Resolution tracking
    previousCanvasSize: ref({ width: 0, height: 0 }),
    mapCenterWorld: ref({ x: 0, y: 0 }),

    // Touch state
    touchState: ref({
      active: false,
      startDist: 0,
      startZoom: 1.0,
      startPos: { x: 0, y: 0 },
      lastPos: { x: 0, y: 0 },
      lastPosMulti: { x: 0, y: 0 },
    }),
    touchDiffPos: ref({
      dx: 0,
      dy: 0,
      timeDiff: 0,
      timePrev: 0,
    }),

    // Velocity
    Vx: ref(0),
    Vy: ref(0),

    // Performance
    showDebugControls: ref(false),
    showPerformanceInfo: ref(true),
    currentFPS: ref(0),
    averageFrameTime: ref(0),
    renderedFrames: ref(0),

    // Multi-select tool
    multiSelection: ref<MultiSelection>({ markerIndices: [], areaIds: [] }),
    selectionDragRect: ref<{ x1: number; y1: number; x2: number; y2: number } | null>(null),
    isMultiSelecting: ref(false),
    isMovingMultiSelection: ref(false),
    multiSelectionDragLastWorld: ref<{ x: number; y: number } | null>(null),

    // Layer visibility
    layerVisibility: ref({
      map: true,
      robot: true,
      target: true,
      navPath: true,
    }),

    // Render state
    renderState: {
      mapImageData: null,
      mapTexture: null,
      lastMapHash: '',
      lastRobotState: { x: 0, y: 0, yaw: 0, hash: '' },
      lastTargetState: { x: 0, y: 0, yaw: 0, hash: '' },
      needsFullRedraw: true,
      animationFrameId: 0,
    },

    // Performance state
    performanceState: {
      frameCount: 0,
      lastFPSTime: performance.now(),
      frameTimes: [],
      lastFrameTime: performance.now(),
    },
  };
}