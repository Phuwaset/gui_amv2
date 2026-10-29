
export interface OccupancyGrid {
  width: number;
  height: number;
  resolution: number;
  origin_x: number;
  origin_y: number;
  data: number[];
  downsampled: boolean;
  originalDimensions: { width: number; height: number };
}

export interface Transform {
  scale: number;
  translateX: number;
  translateY: number;
}

