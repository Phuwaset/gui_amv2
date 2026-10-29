// src/components/map/engine/MapEngine.ts
import type { AreaRect, ExportedMap, ExportedMarker, ExportedSection, ExportedSectionPosition, MapState } from '../state/mapState';
import type { OccupancyGrid } from '../interfaces/map_interface';
import { SmoothTransform } from './SmoothTransform';
import { generateMapTexture } from './texture';
import type { LutConfig } from './texture';
import type { IPosition } from 'src/interfaces/robot_interfaces';
import { EditBuffer } from './EditBuffer'; // <-- IMPORT
import type { PatchCell } from './EditBuffer'; // <-- IMPORT
import { HistoryManager } from './HistoryManager';
// import { socketService } from 'src/services/socketService';

// === [Perf Types] Strong typing for caches ===
// interface ScreenPoint { x: number; y: number; }

// interface RouteScreenCache {
//   serial: number;
//   points: ScreenPoint[];
// }

// interface RoutePathCache {
//   serial: number;
//   path: Path2D;
// }


class SpatialHash {
    private cell: number;
    private map = new Map<string, IPosition[]>();


    constructor(cellSize = 50) { this.cell = cellSize; }

    private key(x: number, y: number) {
        const cx = Math.floor(x / this.cell), cy = Math.floor(y / this.cell);
        return `${cx},${cy}`;
    }

    build(points: IPosition[]) {
        this.map.clear();
        for (const p of points) {
            const k = this.key(p.x, p.y);
            (this.map.get(k) ?? (this.map.set(k, []), this.map.get(k)!)).push(p);
        }
    }

    // fetch all points in cells overlapped by the bbox
    query(minX: number, minY: number, maxX: number, maxY: number): IPosition[] {
        const cx0 = Math.floor(minX / this.cell), cy0 = Math.floor(minY / this.cell);
        const cx1 = Math.floor(maxX / this.cell), cy1 = Math.floor(maxY / this.cell);
        const out: IPosition[] = [];
        for (let cy = cy0; cy <= cy1; cy++) {
            for (let cx = cx0; cx <= cx1; cx++) {
                const arr = this.map.get(`${cx},${cy}`);
                if (arr) out.push(...arr);
            }
        }
        return out;
    }

}





export class MapEngine {


    private state: MapState;
    private smoothTransform: SmoothTransform;
    private renderScheduled = false;
    private hash = new SpatialHash(64); // tune cell size to your world scale

    private mapBitmap: ImageBitmap | null = null;

    // ====== Visual Config ======
    private _robotImage:  HTMLImageElement | null = null;
    private _robotColor   = '#00ff00';
    private _robotRadius  = 0.25;
    private _navPathColor = '#4285F4';
    private _navPathWidth = 15;
    private _lutCfg: LutConfig = { free: 240, occupied: 0, unknown: 127 };

    public setRobotImage(img: HTMLImageElement | null) {
        this._robotImage = img;
        this.forceRedraw();
    }

    public setVisualConfig(cfg: Partial<{
        robotColor: string; robotRadius: number;
        navPathColor: string; navPathWidth: number;
        lutFree: number; lutOccupied: number; lutUnknown: number;
    }>) {
        if (cfg.robotColor   !== undefined) this._robotColor   = cfg.robotColor;
        if (cfg.robotRadius  !== undefined) this._robotRadius  = cfg.robotRadius;
        if (cfg.navPathColor !== undefined) this._navPathColor = cfg.navPathColor;
        if (cfg.navPathWidth !== undefined) this._navPathWidth = cfg.navPathWidth;
        let lutChanged = false;
        if (cfg.lutFree      !== undefined) { this._lutCfg.free     = cfg.lutFree;     lutChanged = true; }
        if (cfg.lutOccupied  !== undefined) { this._lutCfg.occupied = cfg.lutOccupied; lutChanged = true; }
        if (cfg.lutUnknown   !== undefined) { this._lutCfg.unknown  = cfg.lutUnknown;  lutChanged = true; }
        if (lutChanged) {
            this.rebuildLut();
            // Force full map texture rebuild on next updateMapTexture call
            this.oldMapData = null;
            this.state.renderState.mapTexture = null;
        }
        this.forceRedraw();
    }
    // ===========================

    // --- Tiled map rendering (performance; visuals unchanged) ---
    private _tileSize = 256;
    private _tilesPerRow = 0;
    private _tilesPerCol = 0;
    private _mapTiles: (ImageBitmap | null)[] = [];
    private _mapTexVersion = 0;       // increments when map content changes
    private _tilesBuiltForVersion = -1;
    // fast blit cache




    // ====== Map Editor (Brush) Layer ======
    private editPaintCanvas: HTMLCanvasElement | null = null; // พื้นทับสีดำ = obstacle
    private editPaintCtx: CanvasRenderingContext2D | null = null;

    private editEraseCanvas: HTMLCanvasElement | null = null; // พื้นลบ = บังคับ free
    private editEraseCtx: CanvasRenderingContext2D | null = null;

    private brushMode: 'brush' | 'erase' | 'brush_eraser' = 'brush';
    private brushRadiusPx: number = 6;        // รัศมีพู่กันใน "พิกเซลของแผนที่"
    private isPainting = false;
    private lastMapPX: number | null = null;  // พิกัดพิกเซลบนแผนที่ (map-pixel)
    private lastMapPY: number | null = null;

    // ====== NEW: Undo/Redo System ======
    private editBuffer: EditBuffer;
    private currentStrokePatch: PatchCell[] = [];
    public history: HistoryManager = new HistoryManager();
    // ===================================

    // ====== Map Patching (Performance) ======
    private oldMapData: Int8Array | null = null; // <-- For diffing
    private lut: Uint8Array | null = null; // <-- For caching LUT

    // ช่วยแปลง world<->map pixel (ไม่รวม scale/translate ของ canvas)
    private worldToMapPixelXY(wx: number, wy: number): { mx: number; my: number } {
        const md = this.state.mapData.value!;
        const mx = (wx - md.origin_x) / md.resolution;
        const my = (md.origin_y + md.height * md.resolution - wy) / md.resolution;
        return { mx, my };
    }
    private canvasToMapPixelXY(cx: number, cy: number): { mx: number; my: number } {
        // const md = this.state.mapData.value!;
        const scale = this.state.transform.value.scale;
        const tx = this.state.transform.value.translateX;
        const ty = this.state.transform.value.translateY;
        const mapPixelX = (cx - tx) / scale;
        const mapPixelY = (cy - ty) / scale;
        return { mx: mapPixelX, my: mapPixelY };
    }


    public setBrushMode(mode: 'brush' | 'erase' | 'brush_eraser') {
        this.brushMode = mode;
    }
    public setBrushSizeMeters(radiusMeters: number) {
        const md = this.state.mapData.value;
        if (!md) return;
        this.brushRadiusPx = Math.max(1, Math.round(radiusMeters / md.resolution));
        console.log(this.brushRadiusPx)
    }
    public setBrushSizePixels(px: number) {
        this.brushRadiusPx = Math.max(1, Math.round(px));
    }

    /** เริ่มลากพู่กันจากพิกัด canvas */
    public beginBrushStrokeAtCanvasXY(cx: number, cy: number) {
        if (!this.state.mapData.value) return;
        const { mx, my } = this.canvasToMapPixelXY(cx, cy);

        this.currentStrokePatch = []; // <-- Start collecting new stroke

        this.isPainting = true;
        this.lastMapPX = mx;
        this.lastMapPY = my;
        this.paintDot(mx, my);
    }

    /** ลากต่อ */
    public moveBrushStrokeAtCanvasXY(cx: number, cy: number) {
        if (!this.isPainting || !this.state.mapData.value) return;
        const { mx, my } = this.canvasToMapPixelXY(cx, cy);
        // วาดเป็นเส้นต่อเนื่องด้วยการกวาดวงกลมเป็นระยะตามเส้นตรง
        this.paintLine(this.lastMapPX!, this.lastMapPY!, mx, my);
        this.lastMapPX = mx;
        this.lastMapPY = my;
    }

    /** ปล่อยพู่กัน */
    public endBrushStroke() {
        if (!this.isPainting) return;
        this.isPainting = false;
        this.lastMapPX = this.lastMapPY = null;

        if (this.currentStrokePatch.length > 0) {
            const patch = [...this.currentStrokePatch];
            this.history.push({
                undo: () => {
                    for (const p of patch) this.editBuffer.override[p.idx] = p.prev;
                    for (const p of patch) this._drawPixelToEditCanvases(p.idx, p.prev);
                    this.scheduleRender();
                },
                redo: () => {
                    for (const p of patch) this.editBuffer.override[p.idx] = p.next;
                    for (const p of patch) this._drawPixelToEditCanvases(p.idx, p.next);
                    this.scheduleRender();
                },
            });
        }
        this.currentStrokePatch = [];
    }

    // This function is now OBSOLETE
    // private clearCircle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) { ... }


    // === NEW Brush Logic with Undo/Redo ===

    /**
     * Helper to get all map pixel indices under the brush circle.
     */
    private _getBrushIndices(mx: number, my: number): number[] {
        const md = this.state.mapData.value;
        if (!md) return [];

        const w = md.width;
        const h = md.height;
        const r = this.brushRadiusPx;
        const r2 = r * r;
        const cells: number[] = [];

        // Round to nearest pixel center for iteration
        const cix = Math.round(mx);
        const ciy = Math.round(my);

        // Iterate over the bounding box of the circle
        for (let y = ciy - r; y <= ciy + r; y++) {
            if (y < 0 || y >= h) continue; // bounds check
            for (let x = cix - r; x <= cix + r; x++) {
                if (x < 0 || x >= w) continue; // bounds check

                // Check if pixel center is inside circle
                const dx = x - mx;
                const dy = y - my;
                if (dx * dx + dy * dy <= r2) {
                    const idx = y * w + x; // map pixel coords are top-left
                    cells.push(idx);
                }
            }
        }
        return cells;
    }

    /**
     * Draws a single pixel change to the appropriate edit canvas.
     * This is the visual counterpart to updating the EditBuffer.
     */
    public _drawPixelToEditCanvases(idx: number, value: number): void {
        const md = this.state.mapData.value;
        if (!md || !this.editPaintCtx || !this.editEraseCtx) return;

        const w = md.width;
        const x = idx % w;
        const y = Math.floor(idx / w);

        if (value === 100) { // Occupied
            this.editPaintCtx.fillRect(x, y, 1, 1);
            this.editEraseCtx.clearRect(x, y, 1, 1);
        } else if (value === 0) { // Free
            this.editEraseCtx.fillRect(x, y, 1, 1);
            this.editPaintCtx.clearRect(x, y, 1, 1);
        } else { // EditBuffer.NO (Erase to default)
            this.editPaintCtx.clearRect(x, y, 1, 1);
            this.editEraseCtx.clearRect(x, y, 1, 1);
        }
    }

    /**
     * REPLACED: Applies a brush dot to the buffer, patch, and canvases.
     */
    private paintDot(mx: number, my: number) {
        const indices = this._getBrushIndices(mx, my);
        if (!indices.length) return;

        let value: number;
        if (this.brushMode === 'brush') value = 100;
        else if (this.brushMode === 'brush_eraser') value = 0;
        else if (this.brushMode === 'erase') value = EditBuffer.NO;
        else return;

        let didChange = false;
        for (const idx of indices) {
            const prev = this.editBuffer.override[idx];
            if (prev === value) continue;

            // Check if this pixel is already in the *current* stroke
            const existingPatchCell = this.currentStrokePatch.find(p => p.idx === idx);
            if (existingPatchCell) {
                // Update its final "next" value
                existingPatchCell.next = value;
            } else {
                // Add new cell to the patch
                this.currentStrokePatch.push({ idx, prev, next: value });
            }

            // Apply change immediately to the data buffer
            this.editBuffer.override[idx] = value;

            // Apply change immediately to the visual canvas
            this._drawPixelToEditCanvases(idx, value);
            didChange = true;
        }

        if (didChange) {
            this.scheduleRender();
        }
    }

    /**
     * REPLACED: Iterates paintDot along a line.
     */
    private paintLine(x0: number, y0: number, x1: number, y1: number) {
        const dx = x1 - x0, dy = y1 - y0;
        const dist = Math.hypot(dx, dy);
        // Interpolate dots along the line
        const step = Math.max(1, this.brushRadiusPx * 0.6); // 60% overlap
        const n = Math.ceil(dist / step);

        if (n === 0) {
            this.paintDot(x0, y0);
        } else {
            for (let i = 0; i <= n; i++) {
                const t = i / n;
                this.paintDot(x0 + dx * t, y0 + dy * t);
            }
        }
    }

    /**
     * This function is now OBSOLETE
     */
    // public drawMapEditor(ctx: CanvasRenderingContext2D) { ... }

    /**
     * NEW: Undoes the last brush stroke.
     */
    public undo(): void {
        this.history.undo();
    }

    public redo(): void {
        this.history.redo();
    }

    // === End of new Brush Logic ===


    constructor(state: MapState) {
        this.state = state;
        this.smoothTransform = new SmoothTransform((transform) => {
            this.state.transform.value = transform;
            this.state.zoomLevel.value = transform.scale;
            this.scheduleRender();
        });

        this.editBuffer = new EditBuffer(0, 0); // <-- Initialize

        // ===== NEW: Build the LUT once =====
        this.rebuildLut();
    }

    private rebuildLut(): void {
        this.lut = new Uint8Array(256);
        for (let i = 0; i < 256; i++) {
            if (i === 255) this.lut[i] = this._lutCfg.unknown; // unknown (-1)
            else if (i === 0) this.lut[i] = this._lutCfg.free; // free
            else if (i === 100) this.lut[i] = this._lutCfg.occupied; // occupied
            else this.lut[i] = Math.max(0, 255 - i * 2.55);
        }
    }



    /**
     * ===== NEW: Public method to rebuild the goal hash =====
     * Call this from eventHandlers when goals are added/removed/moved.
     */
    public buildGoalHash(): void {
        this.hash.build(this.state.multiGoal.value);
    }


    assignMarkersToRects(
        markers: IPosition[],
        rects: AreaRect[]
    ): AreaRect[] {
        this.hash.build(markers);

        return rects.map(r => {
            const minX = Math.min(r.p1.x, r.p2.x);
            const maxX = Math.max(r.p1.x, r.p2.x);
            const minY = Math.min(r.p1.y, r.p2.y);
            const maxY = Math.max(r.p1.y, r.p2.y);

            // get only nearby candidates from the hash, then exact check
            const candidates = this.hash.query(minX, minY, maxX, maxY);
            const inside = candidates.filter(m =>
                m.x >= minX && m.x <= maxX && m.y >= minY && m.y <= maxY
            );

            return { ...r, dockPosition: inside };
        });
    }

    inRect(m: IPosition, minX: number, minY: number, maxX: number, maxY: number) {
        return m.x >= minX && m.x <= maxX && m.y >= minY && m.y <= maxY;
    }

    round2(n: number) {
        return Math.round(n * 100) / 100;
    }


    public export_to_json(
        multiMarker: IPosition[],
        multiRect: AreaRect[],
        mapWidth = 0,
        mapHeight = 0,
        opts: { preferDock?: boolean } = { preferDock: true } // prefer dockPosition if present
    ): ExportedMap {
        const round2 = (n: number) => Math.round(n * 100) / 100;

        const toKey = (m: Pick<IPosition, "id" | "x" | "y">) =>
            m?.id ? String(m.id) : `${Math.round(m.x * 1e6)}:${Math.round(m.y * 1e6)}`;

        const byId = new Map<string, IPosition>();
        const byKey = new Map<string, IPosition>();
        for (const m of multiMarker) {
            if (m?.id != null) byId.set(String(m.id), m);
            byKey.set(toKey(m), m);
        }

        const inRect = (m: IPosition, minX: number, minY: number, maxX: number, maxY: number) =>
            m.x >= minX && m.x <= maxX && m.y >= minY && m.y <= maxY;

        const map_section: ExportedSection[] = multiRect.map((rect) => {
            const minX = Math.min(rect.p1.x, rect.p2.x);
            const minY = Math.min(rect.p1.y, rect.p2.y);
            const maxX = Math.max(rect.p1.x, rect.p2.x);
            const maxY = Math.max(rect.p1.y, rect.p2.y);

            const section_position: ExportedSectionPosition[] = [
                { x: round2(minX), y: round2(minY), idx: 0 },
                { x: round2(maxX), y: round2(minY), idx: 1 },
                { x: round2(maxX), y: round2(maxY), idx: 2 },
                { x: round2(minX), y: round2(maxY), idx: 3 },
            ];

            const cx = round2((minX + maxX) / 2);
            const cy = round2((minY + maxY) / 2);

            // --- build the marker list for this rect ---
            let rawCandidates: IPosition[] = [];

            if (opts.preferDock && rect.dockPosition?.length) {
                // Use dock list, but refresh from multiMarker by id/coords for latest label/coords
                rawCandidates = rect.dockPosition.map((dm) => {
                    if (dm?.id != null && byId.has(String(dm.id))) return byId.get(String(dm.id))!;
                    const key = toKey(dm);
                    return byKey.get(key) ?? dm; // fallback to dm itself
                });
            } else {
                // Compute from multiMarker (ground truth)
                rawCandidates = multiMarker.filter((m) => inRect(m, minX, minY, maxX, maxY));
            }

            // Remove duplicates (by id or coord key)
            const seen = new Set<string>();
            const markersInRect: IPosition[] = [];
            for (const m of rawCandidates) {
                const k = toKey(m);
                if (!seen.has(k)) {
                    seen.add(k);
                    markersInRect.push(m);
                }
            }

            const section_marker: ExportedMarker[] = markersInRect.map((m) => ({
                marker_name: m.label ?? m.id,
                marker_type: "point",
                marker_position: { x: round2(m.x), y: round2(m.y), yaw: round2(m.yaw) },
                marker_color: m.color,
            }));

            return {
                section_lable: rect.label,
                section_color: rect.color,
                section_position,
                section_position_centroid: { x: cx, y: cy },
                section_marker,
                type: rect.type || "navigation",
            };
        });

        const json_str = {
            map_section,
            map_size: { width: mapWidth, height: mapHeight },
        };

        console.log(json_str)
        return json_str;
    }



    public import_from_json(
        jsonData: string | ExportedMap,
        state: MapState
    ) {
        try {
            const parsed: ExportedMap =
                typeof jsonData === "string" ? JSON.parse(jsonData) : jsonData;

            const mapSections = parsed.map_section ?? [];

            const newRects: AreaRect[] = mapSections.map((section, rectIdx) => {
                const xs = section.section_position.map((p) => p.x);
                const ys = section.section_position.map((p) => p.y);

                const minX = Math.min(...xs);
                const minY = Math.min(...ys);
                const maxX = Math.max(...xs);
                const maxY = Math.max(...ys);

                const dockPosition: IPosition[] = (section.section_marker ?? []).map(
                    (m, i) => ({
                        id: `${section.section_lable}_${i}`,
                        label: m.marker_name ?? `marker_${i}`,
                        x: m.marker_position?.x ?? 0,
                        y: m.marker_position?.y ?? 0,
                        yaw: m.marker_position.yaw ?? 0,
                        action: "0.5,1,1000",
                        color: m.marker_color,
                    })
                );

                return {
                    id: `rect_${rectIdx}`,
                    label: section.section_lable ?? `Area_${rectIdx}`,
                    dockPosition,
                    p1: { x: minX, y: minY },
                    p2: { x: maxX, y: maxY },
                    color: section.section_color,
                    type: section.type || "navigation",
                };
            });

            // flatten all markers into multiGoal
            const newMarkers: IPosition[] = newRects.flatMap((r) => r.dockPosition);

            // update reactive state
            state.areaRects.value = newRects;
            state.multiGoal.value = newMarkers;

            // ===== NEW: Build hash after import =====
            this.buildGoalHash();

            console.log(
                `✅ Imported ${newRects.length} areaRects, ${newMarkers.length} markers`
            );
        } catch (err) {
            console.error("❌ Failed to import JSON:", err);
        }
    }

    /** Helper: random color per rect */
    randomColor(seed: number) {
        const palette = [
            "#22c55e", // green
            "#3b82f6", // blue
            "#ef4444", // red
            "#eab308", // yellow
            "#8b5cf6", // purple
            "#f97316", // orange
        ];
        return palette[seed % palette.length];
    }


    private drawAreaRects(ctx: CanvasRenderingContext2D) {
        const rects = this.state.areaRects.value;

        const roundRectPath = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
            const rr = Math.min(r, h / 2, w / 2);
            ctx.beginPath();
            ctx.moveTo(x + rr, y);
            ctx.arcTo(x + w, y, x + w, y + h, rr);
            ctx.arcTo(x + w, y + h, x, y + h, rr);
            ctx.arcTo(x, y + h, x, y, rr);
            ctx.arcTo(x, y, x + w, y, rr);
            ctx.closePath();
        };

        for (const r of rects) {
            const c1 = this.worldToCanvas(r.p1.x, r.p1.y);
            const c2 = this.worldToCanvas(r.p2.x, r.p2.y);

            const x = Math.min(c1.x, c2.x);
            const y = Math.min(c1.y, c2.y);
            const w = Math.abs(c2.x - c1.x);
            const h = Math.abs(c2.y - c1.y);

            // ===== DASHBOARD FRIENDLY RECTANGLE OVERRIDE =====
            if (this.state.mode.value === 'dashboard') {
                const rRadius = Math.max(8, Math.min(Math.min(w, h) * 0.1, 24)); // Soft rounded corners
                
                ctx.save();
                
                // --- Background Fill ---
                ctx.globalAlpha = r.type === 'restrict' ? 0.12 : 0.08; 
                ctx.fillStyle = r.type === 'restrict' ? '#ef4444' : r.color;
                roundRectPath(ctx, x, y, w, h, rRadius);
                ctx.fill();

                // --- Border Stroke ---
                ctx.globalAlpha = 1.0;
                ctx.lineWidth = r.type === 'restrict' ? 3 : 2;
                
                if (r.type === 'restrict') {
                    ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
                    ctx.setLineDash([8, 8]);
                } else {
                    // Try to make the hex color 40% opaque for the border
                    ctx.strokeStyle = r.color.length === 7 ? r.color + '66' : r.color;
                    ctx.setLineDash([]);
                }
                ctx.stroke();

                // --- Label / Text ---
                if (r.label) {
                    const labelText = r.type === 'restrict' ? `🚫 ${r.label}` : r.label;
                    
                    // Fixed 25px font size as requested
                    const fontPx = 25;
                    
                    ctx.font = `500 ${fontPx}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;
                    ctx.textAlign = "center";
                    ctx.textBaseline = "bottom";
                    
                    // Move text to bottom of rectangle (with a little padding)
                    // The padding scales slightly with font size
                    const padY = fontPx * 0.4;
                    const textY = y + h - padY;
                    const textX = x + w / 2;
                    
                    // Outlier (White outline) using thick stroke
                    ctx.lineJoin = "round";
                    ctx.miterLimit = 2;
                    ctx.lineWidth = fontPx * 0.25; // Scale outline with font size
                    ctx.strokeStyle = "white";
                    ctx.strokeText(labelText, textX, textY);
                    
                    // Gray font fill
                    ctx.fillStyle = r.type === 'restrict' ? "#ef4444" : "#4b5563"; // Keep strict red for restrict, otherwise cool gray
                    ctx.fillText(labelText, textX, textY);
                }
                ctx.restore();
                continue; // Skip map editor drawing
            }
            // ===== END DASHBOARD OVERRIDE =====

            ctx.save();
            ctx.globalAlpha = r.type === 'restrict' ? 0.25 : 0.15;
            ctx.fillStyle = r.type === 'restrict' ? '#ef4444' : r.color;
            ctx.fillRect(x, y, w, h);

            ctx.globalAlpha = 1.0;
            ctx.lineWidth = r.type === 'restrict' ? 3 : 2;
            ctx.strokeStyle = r.type === 'restrict' ? '#ef4444' : r.color;
            if (r.type === 'restrict') ctx.setLineDash([8, 6]);
            ctx.strokeRect(x, y, w, h);

            // ===== NEW: วาด label ตรงกลางสี่เหลี่ยม =====
            if (r.label) {
                ctx.fillStyle = r.type === 'restrict' ? "#ef4444" : "black"; // สีตัวอักษร
                ctx.font = r.type === 'restrict' ? "bold 25px sans-serif" : "25px sans-serif";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                const labelText = r.type === 'restrict' ? `🚫 ${r.label}` : r.label;
                ctx.fillText(labelText, x + w / 2, y + h / 2);
            }

            // ── Resize handles at all 4 corners ──────────────────────────────
            const sel = this.state.selectedObject.value;
            const isSelected = sel && (sel.type === 'rect' || sel.type === 'rect-handle') && sel.id === r.id;
            const handleSz = Math.max(8, Math.min(14, this.state.transform.value.scale * 3));
            const corners = [
                { cx: x,     cy: y,     dx: -1, dy: -1 },  // top-left
                { cx: x + w, cy: y,     dx:  1, dy: -1 },  // top-right
                { cx: x,     cy: y + h, dx: -1, dy:  1 },  // bottom-left
                { cx: x + w, cy: y + h, dx:  1, dy:  1 },  // bottom-right
            ];
            ctx.save();
            for (const { cx, cy, dx, dy } of corners) {
                const hs = handleSz / 2;
                // Filled square
                ctx.globalAlpha = 1.0;
                ctx.fillStyle = isSelected ? '#ffffff' : 'rgba(255,255,255,0.85)';
                ctx.strokeStyle = isSelected ? r.color : (r.type === 'restrict' ? '#ef4444' : r.color);
                ctx.lineWidth = isSelected ? 2 : 1.5;
                ctx.setLineDash([]);
                ctx.beginPath();
                ctx.rect(cx - hs, cy - hs, handleSz, handleSz);
                ctx.fill();
                ctx.stroke();

                // Diagonal arrow lines inside the square
                const arrowLen = hs * 0.7;
                ctx.strokeStyle = isSelected ? r.color : '#555555';
                ctx.lineWidth = 1.5;
                // main diagonal going outward from rect center
                ctx.beginPath();
                ctx.moveTo(cx - dx * arrowLen * 0.1, cy - dy * arrowLen * 0.1);
                ctx.lineTo(cx + dx * arrowLen, cy + dy * arrowLen);
                ctx.stroke();
                // arrowhead tick 1
                ctx.beginPath();
                ctx.moveTo(cx + dx * arrowLen, cy + dy * arrowLen);
                ctx.lineTo(cx + dx * arrowLen * 0.3, cy + dy * arrowLen);
                ctx.stroke();
                // arrowhead tick 2
                ctx.beginPath();
                ctx.moveTo(cx + dx * arrowLen, cy + dy * arrowLen);
                ctx.lineTo(cx + dx * arrowLen, cy + dy * arrowLen * 0.3);
                ctx.stroke();
            }
            ctx.restore();
            // ── end resize handles ─────────────────────────────────────────────

            ctx.restore();
        }

        // กรอบ preview ตอนลากอยู่
        if (this.state.isSettingArea.value && this.state.areaStartWorld.value && this.state.areaPreviewWorld.value) {
            const s = this.worldToCanvas(this.state.areaStartWorld.value.x, this.state.areaStartWorld.value.y);
            const e = this.worldToCanvas(this.state.areaPreviewWorld.value.x, this.state.areaPreviewWorld.value.y);
            const x = Math.min(s.x, e.x);
            const y = Math.min(s.y, e.y);
            const w = Math.abs(e.x - s.x);
            const h = Math.abs(e.y - s.y);

            ctx.save();
            ctx.setLineDash([6, 6]);
            ctx.lineWidth = 2;
            ctx.strokeStyle = this.state.activeRectColor.value || '#22c55e';
            ctx.strokeRect(x, y, w, h);
            ctx.restore();
        }
    }


    private getCloseIconRectForSelection(): { x: number; y: number; w: number; h: number } | null {
        const sel = this.state.selectedObject.value;
        //console.log("selection : ", sel);
        if (!sel) return null;

        const sz = this.state.closeIconSize.value;
        const off = this.state.closeIconOffsetPx.value;

        if (sel.type === 'single') {
            const p = this.worldToCanvas(this.state.singleGoal.value.x, this.state.singleGoal.value.y);
            return { x: p.x + off, y: p.y - off - sz, w: sz, h: sz };
        }
        if (sel.type === 'multi') {
            const g = this.state.multiGoal.value[sel.index];
            if (!g) return null;
            const p = this.worldToCanvas(g.x, g.y);
            return { x: p.x + off, y: p.y - off - sz, w: sz, h: sz };
        }
        if (sel.type === 'rect' || sel.type === 'rect-handle') {
            const r = this.state.areaRects.value.find(it => it.id === sel.id);
            if (!r) return null;
            const c1 = this.worldToCanvas(r.p1.x, r.p1.y);
            const c2 = this.worldToCanvas(r.p2.x, r.p2.y);
            const x = Math.min(c1.x, c2.x), y = Math.min(c1.y, c2.y);
            return { x: x + Math.abs(c2.x - c1.x) - sz - off, y: y + off, w: sz, h: sz };
        }
        return null;
    }

    // Coordinate conversion utilities
    worldToCanvas(worldX: number, worldY: number): { x: number; y: number } {
        if (!this.state.mapData.value) return { x: 0, y: 0 };

        const { resolution, origin_x, origin_y, height } = this.state.mapData.value;
        const mapPixelX = (worldX - origin_x) / resolution;
        const mapPixelY = (origin_y + height * resolution - worldY) / resolution;

        const canvasX = mapPixelX * this.state.transform.value.scale + this.state.transform.value.translateX;
        const canvasY = mapPixelY * this.state.transform.value.scale + this.state.transform.value.translateY;

        return { x: canvasX, y: canvasY };
    }

    canvasToWorld(canvasX: number, canvasY: number): { x: number; y: number } {
        if (!this.state.mapData.value) return { x: 0, y: 0 };

        const { resolution, origin_x, origin_y, height } = this.state.mapData.value;
        const mapPixelX = (canvasX - this.state.transform.value.translateX) / this.state.transform.value.scale;
        const mapPixelY = (canvasY - this.state.transform.value.translateY) / this.state.transform.value.scale;

        const worldX = origin_x + mapPixelX * resolution;
        const worldY = origin_y + (height - mapPixelY) * resolution;

        return { x: worldX, y: worldY };
    }

    // Transform management
    adjustTransformForResize(oldWidth: number, oldHeight: number, newWidth: number, newHeight: number): void {
        if (!this.state.mapData.value || oldWidth === 0 || oldHeight === 0) return;

        const oldCenterX = oldWidth / 2;
        const oldCenterY = oldHeight / 2;
        const worldCenter = this.canvasToWorld(oldCenterX, oldCenterY);

        const newCenterX = newWidth / 2;
        const newCenterY = newHeight / 2;

        const { resolution, origin_x, origin_y, height } = this.state.mapData.value;
        const mapPixelX = (worldCenter.x - origin_x) / resolution;
        const mapPixelY = (origin_y + height * resolution - worldCenter.y) / resolution;

        const newTranslateX = newCenterX - mapPixelX * this.state.transform.value.scale;
        const newTranslateY = newCenterY - mapPixelY * this.state.transform.value.scale;

        const newTransform = {
            scale: this.state.transform.value.scale,
            translateX: newTranslateX,
            translateY: newTranslateY,
        };

        this.smoothTransform.setCurrent(newTransform);
        //console.log('Transform adjusted for resize');
    }

    // Zoom operations
    smoothZoom(factor: number, centerX?: number, centerY?: number): void {
        const currentTransform = this.smoothTransform.getCurrent();
        const newScale = Math.max(
            this.state.minZoom,
            Math.min(this.state.maxZoom, currentTransform.scale * factor)
        );

        if (Math.abs(newScale - currentTransform.scale) < 0.001) return;

        if (centerX !== undefined && centerY !== undefined) {
            const scaleRatio = newScale / currentTransform.scale;
            const newTranslateX = centerX - (centerX - currentTransform.translateX) * scaleRatio;
            const newTranslateY = centerY - (centerY - currentTransform.translateY) * scaleRatio;

            this.smoothTransform.setTarget({
                scale: newScale,
                translateX: newTranslateX,
                translateY: newTranslateY,
            });
        } else {
            const centerX = this.state.canvasWidth.value / 2;
            const centerY = this.state.canvasHeight.value / 2;
            const scaleRatio = newScale / currentTransform.scale;

            const newTranslateX = centerX - (centerX - currentTransform.translateX) * scaleRatio;
            const newTranslateY = centerY - (centerY - currentTransform.translateY) * scaleRatio;

            this.smoothTransform.setTarget({
                scale: newScale,
                translateX: newTranslateX,
                translateY: newTranslateY,
            });
        }
    }

    zoomIn(): void {
        this.smoothZoom(1.25);
    }

    zoomOut(): void {
        this.smoothZoom(0.8);
    }

    // Auto-fit map
    autoFitMap(): void {
        if (!this.state.mapData.value || !this.state.canvas.value) return;

        const { width: mapWidth, height: mapHeight } = this.state.mapData.value;
        const canvasAspect = this.state.canvasWidth.value / this.state.canvasHeight.value;
        const mapAspect = mapWidth / mapHeight;

        let scale: number;
        const padding = 0.9;

        if (mapAspect > canvasAspect) {
            scale = (this.state.canvasWidth.value * padding) / mapWidth;
        } else {
            scale = (this.state.canvasHeight.value * padding) / mapHeight;
        }

        const centerX = this.state.canvasWidth.value / 2 - (mapWidth * scale) / 2;
        const centerY = this.state.canvasHeight.value / 2 - (mapHeight * scale) / 2;

        const initialTransform = {
            scale: scale,
            translateX: centerX,
            translateY: centerY,
        };

        this.smoothTransform.setCurrent(initialTransform);
        this.state.previousCanvasSize.value = {
            width: this.state.canvasWidth.value,
            height: this.state.canvasHeight.value,
        };

        //console.log('Auto-fit map:', { scale, transform: initialTransform });
        this.scheduleRender();
    }

    // Rendering
    private scheduleRender(): void {
        if (this.renderScheduled) return;
        this.renderScheduled = true;
        requestAnimationFrame(() => {
            this.render();
            this.renderScheduled = false;
        });
    }


    /** Draw base map using clipped drawImage (visible viewport only) inside transformed context */


    // Build ImageBitmap tiles once per map texture version (async, chunked)
    private async _buildTilesFromTexture(tex: HTMLCanvasElement | HTMLImageElement | ImageBitmap) {
        const ts = this._tileSize;
        const width = (tex).width;
        const height = (tex).height;
        if (!width || !height) return;

        const cols = Math.ceil(width / ts);
        const rows = Math.ceil(height / ts);
        this._tilesPerRow = cols;
        this._tilesPerCol = rows;
        this._mapTiles = new Array(cols * rows).fill(null);

        const buildChunk = async (startIdx: number, count: number) => {
            const endIdx = Math.min(startIdx + count, cols * rows);
            const promises: Promise<ImageBitmap>[] = [];
            for (let idx = startIdx; idx < endIdx; idx++) {
                const ty = Math.floor(idx / cols);
                const tx = idx % cols;
                const sx = tx * ts;
                const sy = ty * ts;
                const sw = Math.min(ts, width - sx);
                const sh = Math.min(ts, height - sy);
                try {
                    // promises.push(createImageBitmap(tex, sx, sy, sw, sh)); // Original had error
                    promises.push(window.createImageBitmap(tex, sx, sy, sw, sh)); // Fixed
                } catch (error) { // Original had 'error : string', fixed
                    console.log(error);
                }
            }
            const bitmaps = await Promise.all(promises);
            let bi = 0;
            for (let idx = startIdx; idx < endIdx; idx++) {
                if (bi >= bitmaps.length) break;
                this._mapTiles[idx] = bitmaps[bi++];
            }
        };

        const versionAtStart = this._mapTexVersion;
        const total = cols * rows;
        let built = 0;
        while (built < total) {
            if (versionAtStart !== this._mapTexVersion) return; // aborted due to newer map
            await buildChunk(built, 16);
            built += 16;
            await new Promise<void>(resolve => requestAnimationFrame(resolve)); // Fixed promise
        }
        if (versionAtStart === this._mapTexVersion) {
            this._tilesBuiltForVersion = versionAtStart;
        }
    }

    private _drawMaptiled(ctx: CanvasRenderingContext2D) {
        const img = this.mapBitmap ?? this.state.renderState.mapTexture;
        if (!img) return;

        // const c = this._transformCache; // This property doesn't exist
        const c = this.state.transform.value; // Use the current transform

        const canvasW = this.state.canvasWidth.value;
        const canvasH = this.state.canvasHeight.value;

        const srcW = (img).width;
        const srcH = (img).height;

        const srcX = Math.max(0, Math.floor((-c.translateX) / c.scale));
        const srcY = Math.max(0, Math.floor((-c.translateY) / c.scale));
        const srcWVis = Math.min(srcW - srcX, Math.ceil(canvasW / c.scale));
        const srcHVis = Math.min(srcH - srcY, Math.ceil(canvasH / c.scale));
        if (srcWVis <= 0 || srcHVis <= 0) return;

        // If tiles are not ready for current version, fall back to single blit
        if (this._tilesBuiltForVersion !== this._mapTexVersion || this._mapTiles.length === 0) {
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(img, srcX, srcY, srcWVis, srcHVis, srcX, srcY, srcWVis, srcHVis);
            return;
        }

        const ts = this._tileSize;
        const startTx = Math.floor(srcX / ts);
        const endTx = Math.floor((srcX + srcWVis - 1) / ts);
        const startTy = Math.floor(srcY / ts);
        const endTy = Math.floor((srcY + srcHVis - 1) / ts);

        ctx.imageSmoothingEnabled = false;
        for (let ty = startTy; ty <= endTy; ty++) {
            for (let tx = startTx; tx <= endTx; tx++) {
                const idx = ty * this._tilesPerRow + tx;
                const bmp = this._mapTiles[idx];
                if (!bmp) continue;

                const sx = tx * ts;
                const sy = ty * ts;
                const dw = Math.min(ts, srcW - sx);
                const dh = Math.min(ts, srcH - sy);

                // Draw at map pixel coords (transform applied by caller)
                ctx.drawImage(bmp, 0, 0, dw, dh, sx, sy, dw, dh);
            }
        }
    }
    private drawBaseMapClipped(ctx: CanvasRenderingContext2D) {
        const img = this.mapBitmap ?? this.state.renderState.mapTexture;
        if (!img) return;

        const scale = this.state.transform.value.scale;
        const offsetX = this.state.transform.value.translateX;
        const offsetY = this.state.transform.value.translateY;
        const canvasW = this.state.canvasWidth.value;
        const canvasH = this.state.canvasHeight.value;

        const srcW = img.width;
        const srcH = img.height;

        const srcX = Math.max(0, Math.floor((-offsetX) / scale));
        const srcY = Math.max(0, Math.floor((-offsetY) / scale));
        const srcWVis = Math.min(srcW - srcX, Math.ceil(canvasW / scale));
        const srcHVis = Math.min(srcH - srcY, Math.ceil(canvasH / scale));
        if (srcWVis <= 0 || srcHVis <= 0) return;

        const dx = srcX;
        const dy = srcY;
        const dw = srcWVis;
        const dh = srcHVis;

        // Use nearest-neighbor to keep crisp cells
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, srcX, srcY, srcWVis, srcHVis, dx, dy, dw, dh);
    }

    /** Draw edit layers using the same clipped approach inside transformed context */
    private drawMapEditorClipped(ctx: CanvasRenderingContext2D) {
        if (!this.editPaintCanvas || !this.editEraseCanvas) return;

        const scale = this.state.transform.value.scale;
        const offsetX = this.state.transform.value.translateX;
        const offsetY = this.state.transform.value.translateY;
        const canvasW = this.state.canvasWidth.value;
        const canvasH = this.state.canvasHeight.value;

        const srcW = this.editPaintCanvas.width;
        const srcH = this.editPaintCanvas.height;

        const srcX = Math.max(0, Math.floor((-offsetX) / scale));
        const srcY = Math.max(0, Math.floor((-offsetY) / scale));
        const srcWVis = Math.min(srcW - srcX, Math.ceil(canvasW / scale));
        const srcHVis = Math.min(srcH - srcY, Math.ceil(canvasH / scale));
        if (srcWVis <= 0 || srcHVis <= 0) return;

        const dx = srcX;
        const dy = srcY;
        const dw = srcWVis;
        const dh = srcHVis;

        ctx.save();
        // Paint (occupied)
        ctx.globalAlpha = 1.0;
        ctx.globalCompositeOperation = 'source-over';
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(this.editPaintCanvas, srcX, srcY, srcWVis, srcHVis, dx, dy, dw, dh);

        // Erase (free)
        ctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(this.editEraseCanvas, srcX, srcY, srcWVis, srcHVis, dx, dy, dw, dh);
        ctx.restore();
    }

    _renderNow(): void {
        if (!this.state.canvas.value || !this.state.mapData.value) return;

        const startTime = performance.now();
        const ctx = this.state.canvas.value.getContext('2d', {
            alpha: false,
            desynchronized: true,
        });
        if (!ctx) return;

        ctx.clearRect(0, 0, this.state.canvasWidth.value, this.state.canvasHeight.value);

        ctx.save();
        ctx.translate(this.state.transform.value.translateX, this.state.transform.value.translateY);
        ctx.scale(this.state.transform.value.scale, this.state.transform.value.scale);

        if (this.state.layerVisibility.value.map && this.state.renderState.mapTexture) {
            // this.drawBaseMapClipped(ctx); // Old
            this._drawMaptiled(ctx); // Use tiled drawing
            this.drawMapEditorClipped(ctx);
        }

        ctx.restore();

        if (this.state.layerVisibility.value.navPath) {
            this.drawNavPath(ctx);
        }

        if (this.state.layerVisibility.value.robot) {
            this.drawRobot(ctx);
        }

        if (this.state.layerVisibility.value.target) {
            this.drawTarget(ctx);
            this.drawSingleTarget(ctx);
            this.drawMultiTarget(ctx);
            this.drawAreaRects(ctx);
            this.drawGrid(ctx, this.state.mapData.value.resolution, this.state.transform.value.scale * 0.025);
            this.renderCloseButton(ctx);
            this.drawSelectionOverlay(ctx);
        }

        const frameTime = performance.now() - startTime;
        this.updatePerformanceStats(frameTime);

        this.state.renderedFrames.value++;
        this.state.renderState.needsFullRedraw = false;
    }

    private drawSelectionOverlay(ctx: CanvasRenderingContext2D): void {
        const isSelectTool = this.state.activeTool.value === 'select';
        if (!isSelectTool) return;  // Only draw selection overlay when select tool is active

        const sel = this.state.multiSelection.value;

        // ── Highlight selected markers ───────────────────────────────────────
        ctx.save();
        for (const i of sel.markerIndices) {
            const g = this.state.multiGoal.value[i];
            if (!g) continue;
            const p = this.worldToCanvas(g.x, g.y);
            ctx.beginPath();
            ctx.arc(p.x, p.y, 24, 0, Math.PI * 2);
            ctx.strokeStyle = '#4285F4';
            ctx.lineWidth = 3;
            ctx.setLineDash([4, 3]);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // ── Highlight selected areas ─────────────────────────────────────────
        for (const id of sel.areaIds) {
            const r = this.state.areaRects.value.find(a => a.id === id);
            if (!r) continue;
            const p1 = this.worldToCanvas(r.p1.x, r.p1.y);
            const p2 = this.worldToCanvas(r.p2.x, r.p2.y);
            const x = Math.min(p1.x, p2.x), y = Math.min(p1.y, p2.y);
            const w = Math.abs(p2.x - p1.x), h = Math.abs(p2.y - p1.y);
            ctx.strokeStyle = '#4285F4';
            ctx.lineWidth = 3;
            ctx.setLineDash([6, 3]);
            ctx.strokeRect(x - 4, y - 4, w + 8, h + 8);
            ctx.setLineDash([]);
        }
        ctx.restore();

        // ── Rubber-band selection rect ───────────────────────────────────────
        if (isSelectTool && this.state.isMultiSelecting.value && this.state.selectionDragRect.value) {
            const dr = this.state.selectionDragRect.value;
            const p1 = this.worldToCanvas(dr.x1, dr.y1);
            const p2 = this.worldToCanvas(dr.x2, dr.y2);
            const x = Math.min(p1.x, p2.x), y = Math.min(p1.y, p2.y);
            const w = Math.abs(p2.x - p1.x), h = Math.abs(p2.y - p1.y);
            ctx.save();
            ctx.fillStyle = 'rgba(66, 133, 244, 0.08)';
            ctx.fillRect(x, y, w, h);
            ctx.strokeStyle = 'rgba(66, 133, 244, 0.9)';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([5, 3]);
            ctx.strokeRect(x, y, w, h);
            ctx.restore();
        }
    }

    forceRedraw(): void {
        this.state.renderState.needsFullRedraw = true;
        this.scheduleRender();
    }



    // Drawing Close 
    // ===== Render selection delete button (×) =====
    private renderCloseButton(ctx: CanvasRenderingContext2D) {
        const sel = this.state.selectedObject.value;
        //console.log("have selected :", sel);
        if (!sel) return;

        const r = this.getCloseIconRectForSelection();
        if (!r) return;

        ctx.save();
        ctx.fillStyle = "rgba(220, 38, 38, 0.9)";   // bg: แดง
        ctx.strokeStyle = "white";
        ctx.lineWidth = 2;

        // วาดกรอบกลม
        const radius = r.w / 2;
        ctx.beginPath();
        ctx.arc(r.x + radius, r.y + radius, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // วาดเครื่องหมาย ×
        ctx.strokeStyle = "white";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(r.x + r.w * 0.3, r.y + r.h * 0.3);
        ctx.lineTo(r.x + r.w * 0.7, r.y + r.h * 0.7);
        ctx.moveTo(r.x + r.w * 0.7, r.y + r.h * 0.3);
        ctx.lineTo(r.x + r.w * 0.3, r.y + r.h * 0.7);
        ctx.stroke();

        ctx.restore();
    }


    // Drawing methods
    private ADSdrawRobot(ctx: CanvasRenderingContext2D): void {
        if (!this.state.robotPosition.value || !this.state.mapData.value) return;

        // --- Offset for visualization (0.20 m forward in world coordinates) ---
        const offsetY = 0.20;
        const { x, y, yaw } = this.state.robotPosition.value;

        // --- Convert both original and offset positions ---
        const canvasPos = this.worldToCanvas(x, y + offsetY); // triangle center
        const realCanvasPos = this.worldToCanvas(x, y);       // actual robot position

        // --- Draw robot shape (offset visualization) ---
        ctx.save();
        ctx.translate(canvasPos.x, canvasPos.y);
        ctx.rotate(yaw);

        const size = Math.max(8, 12 * this.state.transform.value.scale);
        const halfSize = size / 2;

        // --- Triangle ---
        ctx.fillStyle = '#00ff00';
        ctx.beginPath();
        ctx.moveTo(0, -size);
        ctx.lineTo(-halfSize, halfSize);
        ctx.lineTo(halfSize, halfSize);
        ctx.closePath();
        ctx.fill();

        // --- Circle around robot (offset position) ---
        const circleRadius = Math.max(16, 20 * this.state.transform.value.scale);
        ctx.fillStyle = 'rgba(0, 255, 0, 0.2)';
        ctx.beginPath();
        ctx.arc(0, 0, circleRadius, 0, 2 * Math.PI);
        ctx.fill();

        ctx.restore();

        // --- Draw actual robot position (as small red point) ---
        ctx.save();
        ctx.fillStyle = '#ff0000';
        const pointSize = 3;
        ctx.beginPath();
        ctx.arc(realCanvasPos.x, realCanvasPos.y, pointSize, 0, 2 * Math.PI);
        ctx.fill();
        ctx.restore();
    }


    setNavPath(points: Array<{ x: number; y: number; yaw: number }>): void {
        this.state.navPath.value = points;
        this.forceRedraw();
    }

    private drawNavPath(ctx: CanvasRenderingContext2D): void {
        const pts = this.state.navPath.value;
        if (!pts || pts.length < 2 || !this.state.mapData.value) return;

        // Convert world → canvas once
        const cp = pts.map(p => ({ ...this.worldToCanvas(p.x, p.y), yaw: p.yaw }));

        // --- White outline for contrast ---
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(cp[0].x, cp[0].y);
        for (let i = 1; i < cp.length; i++) ctx.lineTo(cp[i].x, cp[i].y);
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 19;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
        ctx.restore();

        // --- Google Maps blue route line ---
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(cp[0].x, cp[0].y);
        for (let i = 1; i < cp.length; i++) ctx.lineTo(cp[i].x, cp[i].y);
        ctx.strokeStyle = this._navPathColor;
        ctx.lineWidth = this._navPathWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
        ctx.restore();

        // --- End-of-path circle (Google Maps destination pin style) ---
        const end = cp[cp.length - 1];
        const r = 10;
        // Outer white ring
        ctx.save();
        ctx.beginPath();
        ctx.arc(end.x, end.y, r + 3, 0, Math.PI * 2);
        ctx.fillStyle = 'white';
        ctx.fill();
        ctx.restore();
        // Inner gray fill
        ctx.save();
        ctx.beginPath();
        ctx.arc(end.x, end.y, r, 0, Math.PI * 2);
        ctx.fillStyle = '#9E9E9E';
        ctx.fill();
        ctx.restore();
    }

    private drawRobot(ctx: CanvasRenderingContext2D): void {
        if (!this.state.robotPosition.value || !this.state.mapData.value) return;

        const robotRadiusMeters = this._robotRadius;
        const { x, y, yaw } = this.state.robotPosition.value;

        // --- Convert robot position to canvas coordinates ---
        const realCanvasPos = this.worldToCanvas(x, y);

        // --- Calculate circle radius in canvas pixels ---
        // Convert two world points: current position and position + radius
        const radiusWorldPoint = this.worldToCanvas(x + robotRadiusMeters, y);
        const circleRadiusCanvas = Math.hypot(
            radiusWorldPoint.x - realCanvasPos.x,
            radiusWorldPoint.y - realCanvasPos.y
        );

        // --- Draw robot shape at REAL position ---
        ctx.save();
        ctx.translate(realCanvasPos.x, realCanvasPos.y);
        ctx.rotate(yaw);

        const imgReady = this._robotImage && this._robotImage.complete && this._robotImage.naturalWidth > 0;
        if (imgReady && this._robotImage) {
            // Draw custom PNG image centered on robot, scaled to fit the collision circle
            const side = circleRadiusCanvas * 1.6;
            ctx.drawImage(this._robotImage, -side / 2, -side / 2, side, side);
        } else {
            // Fallback: triangle
            const size = circleRadiusCanvas * 0.6;
            const halfSize = size / 2;
            ctx.fillStyle = this._robotColor;
            ctx.beginPath();
            ctx.moveTo(0, -size);
            ctx.lineTo(-halfSize, halfSize);
            ctx.lineTo(halfSize, halfSize);
            ctx.closePath();
            ctx.fill();
        }

        ctx.restore();

        // --- Draw collision/sensor circle (based on real robot radius) ---
        ctx.save();
        ctx.translate(realCanvasPos.x, realCanvasPos.y);

        ctx.fillStyle = this._robotColor + '33'; // 20% alpha (hex 33 ≈ 0.2 * 255)
        ctx.beginPath();
        ctx.arc(0, 0, circleRadiusCanvas, 0, 2 * Math.PI);
        ctx.fill();

        ctx.restore();

        // --- Draw actual robot position (as small red point for reference) ---
        ctx.save();
        ctx.fillStyle = '#ff0000';
        const pointSize = 3;
        ctx.beginPath();
        ctx.arc(realCanvasPos.x, realCanvasPos.y, pointSize, 0, 2 * Math.PI);
        ctx.fill();
        ctx.restore();
    }



    private ADSdrawTarget(ctx: CanvasRenderingContext2D): void {
        if (!this.state.selectGoal.value || !this.state.mapData.value) return;
        const { x, y } = this.state.selectGoal.value;
        const canvasPos = this.worldToCanvas(x, y);

        ctx.save();
        ctx.translate(canvasPos.x, canvasPos.y);

        const markerSize = Math.max(8, 12 * Math.sqrt(this.state.transform.value.scale));
        const r = markerSize * 3;
        const cx = 0;
        const cy = -markerSize;

        const rawYaw = this.state.isSettingYaw.value ? this.state.yawPreview.value : this.state.selectGoal.value.yaw;
        const yawToDraw = rawYaw;

        const toX = cx + Math.cos(yawToDraw) * r;
        const toY = -((cy) + Math.sin(-yawToDraw) * r);

        if (!isNaN(yawToDraw)) {
            if (this.state.isSettingYaw.value) {
                this.drawYawSelection(ctx, cx, cy, r, markerSize, yawToDraw, toX, toY);
            }
        }

        ctx.restore();
    }

    // Call this from your main render loop (after transforms applied)
    private drawRoutePath(ctx: CanvasRenderingContext2D, pts: IPosition[]) {
        if (!pts || pts.length < 2) return;

        // Build (or reuse) a Path2D of the route in screen space for this transform serial
        const routePath = this._getRoutePath2D(pts);
        const scale = this.state.transform.value.scale; // Get scale

        // 1) Outer stroke (halo) — same visuals, just stroke the cached Path2D
        ctx.save();
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.shadowBlur = 6;
        ctx.shadowColor = 'rgba(0,0,0,0.25)';
        ctx.lineWidth = Math.max(6, 6 * scale); // Use scale
        ctx.strokeStyle = '#ffffff';
        ctx.stroke(routePath);
        ctx.restore();

        // 2) Inner colored stroke — unchanged visuals
        ctx.save();
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.lineWidth = Math.max(3, 3 * scale); // Use scale
        ctx.strokeStyle = '#00a2ff';
        ctx.stroke(routePath);
        ctx.restore();

        // 3) Optional dash/animation layer — if your original code had it, add it here
        // (We keep appearance identical by using the same dashes and offset logic if present)
        // NOTE: If you had ctx.setLineDash / lineDashOffset in the original,
        // move that code below and stroke(routePath) instead of rebuilding the path.
    }


    private drawTarget(ctx: CanvasRenderingContext2D): void {
        if (!this.state.selectGoal.value || !this.state.mapData.value) return;

        const { x, y } = this.state.selectGoal.value;
        const scale = this.state.transform.value.scale;
        const p = this.worldToCanvas(x, y);

        ctx.save();
        ctx.translate(p.x, p.y);

        const markerSize = Math.max(8, 12 * Math.sqrt(scale));
        const r = markerSize * 3;

        if (this.state.isSettingYaw.value) {
            const yaw = this.state.yawPreview.value;
            if (!Number.isNaN(yaw)) {
                const toX = Math.cos(yaw) * r;
                const toY = -Math.sin(yaw) * r; // y is inverted in canvas space for rotation
                this.drawYawSelection(ctx, 0, 0, r, markerSize, yaw, toX, toY);
            }
        }
        // ❌ ไม่มีการวาดเส้น/ลูกศรใดๆ ในโหมดปกติ

        ctx.restore();
    }



    private drawYawSelection(
        ctx: CanvasRenderingContext2D,
        _cx: number, _cy: number,     // ไม่ใช้งาน
        r: number,
        markerSize: number,
        yawToDraw: number,
        toX: number,
        toY: number
    ): void {
        // === local origin = (0,0) ===

        // ฐานโดนัท
        ctx.fillStyle = '#ff0044';
        ctx.beginPath(); ctx.arc(0, 0, markerSize * 0.8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath(); ctx.arc(0, 0, markerSize * 0.3, 0, Math.PI * 2); ctx.fill();

        // วงเส้นประ
        ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);

        // crosshair
        ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(0, r); ctx.stroke();

        // ticks
        const minorLen = Math.max(4, markerSize * 0.25);
        const majorLen = Math.max(7, markerSize * 0.4);
        for (let deg = 0; deg < 360; deg += 15) {
            const rad = (deg * Math.PI) / 180;
            const len = (deg % 45 === 0) ? majorLen : minorLen;
            const sx = Math.cos(rad) * (r - len);
            const sy = Math.sin(rad) * (r - len);
            const ex = Math.cos(rad) * r;
            const ey = Math.sin(rad) * r;
            ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
        }

        // labels 0/90/180/270
        const pad = Math.max(10, markerSize * 0.4);
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.font = `${Math.max(11, markerSize * 0.7)}px Arial`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('0°', r + pad, 0);
        ctx.fillText('90°', 0, -(r + pad));                    // ↑ คือ -y
        ctx.fillText('180°', -(r + Math.max(14, markerSize * 0.6)), 0);
        ctx.fillText('270°', 0, r + pad);                      // ↓ คือ +y

        // sweep arc: จาก 0 ถึง yaw (บน canvas y ลง → ใช้มุมลบเพื่อ CCW)
        let yawDeg = ((yawToDraw * 180) / Math.PI) % 360;
        if (yawDeg < 0) yawDeg += 360;
        const yawRadCanvas = -(yawDeg * Math.PI) / 180;

        ctx.strokeStyle = 'rgba(255,0,68,0.35)';
        ctx.lineWidth = Math.max(2, markerSize * 0.15);
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, yawRadCanvas, yawRadCanvas < 0 ? true : false);
        ctx.stroke();

        // ลูกศรทิศ
        ctx.strokeStyle = '#ff0044'; ctx.fillStyle = '#ff0044'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(toX, toY); ctx.stroke();

        const headLength = 5 * this.state.transform.value.scale;
        const ang = Math.atan2(toY, toX);
        ctx.beginPath();
        ctx.moveTo(toX, toY);
        ctx.lineTo(
            toX - headLength * Math.cos(ang - Math.PI / 6),
            toY - headLength * Math.sin(ang - Math.PI / 6)
        );
        ctx.lineTo(
            toX - headLength * Math.cos(ang + Math.PI / 6),
            toY - headLength * Math.sin(ang + Math.PI / 6)
        );
        ctx.closePath(); ctx.fill();

        // ข้อความองศา
        const yawText = `${yawDeg.toFixed(1)}°`;
        ctx.fillStyle = '#000000';
        ctx.font = `${Math.max(12, markerSize * 0.8)}px Arial`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText(yawText, 0, markerSize * 0.5);
    }


    private ADSOLDdrawYawSelection(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number,
        markerSize: number, yawToDraw: number, toX: number, toY: number): void {
        // Base marker
        ctx.fillStyle = '#ff0044';
        ctx.beginPath();
        ctx.arc(0, -markerSize, markerSize * 0.8, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(0, -markerSize, markerSize * 0.3, 0, Math.PI * 2);
        ctx.fill();

        // Dashed circle
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        // Crosshair
        ctx.beginPath();
        ctx.moveTo(cx - r, cy);
        ctx.lineTo(cx + r, cy);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx, cy - r);
        ctx.lineTo(cx, cy + r);
        ctx.stroke();

        // Ticks
        const minorLen = Math.max(4, markerSize * 0.25);
        const majorLen = Math.max(7, markerSize * 0.4);
        for (let deg = 0; deg < 360; deg += 15) {
            const rad = (deg * Math.PI) / 180;
            const isMajor = deg % 45 === 0;
            const len = isMajor ? majorLen : minorLen;

            const sx = cx + Math.cos(rad) * (r - len);
            const sy = cy + Math.sin(rad) * (r - len);
            const ex = cx + Math.cos(rad) * r;
            const ey = cy + Math.sin(rad) * r;

            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(ex, ey);
            ctx.stroke();
        }

        // Labels
        const labelFont = `${Math.max(11, markerSize * 0.7)}px Arial`;
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.font = labelFont;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.fillText('0°', cx + r + Math.max(10, markerSize * 0.4), cy);
        ctx.fillText('90°', cx, cy - r - Math.max(10, markerSize * 0.4));
        ctx.fillText('180°', cx - r - Math.max(14, markerSize * 0.6), cy);
        ctx.fillText('270°', cx, cy + r + Math.max(10, markerSize * 0.4));

        // Sweep arc
        let yawDegSweep = (yawToDraw * 180) / Math.PI;
        if (yawDegSweep < 0) yawDegSweep += 360;
        const yawRadSweep = (yawDegSweep * Math.PI) / 180;

        ctx.strokeStyle = 'rgba(255,0,68,0.35)';
        ctx.lineWidth = Math.max(2, markerSize * 0.15);
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, -yawRadSweep, false);
        ctx.stroke();

        // Arrow
        ctx.strokeStyle = '#ff0044';
        ctx.fillStyle = '#ff0044';
        ctx.lineWidth = 2;

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(toX, -toY);
        ctx.stroke();

        const headLength = 5 * this.state.transform.value.scale;
        const ang = Math.atan2((toY - (-cy)), toX - cx);
        ctx.beginPath();
        ctx.moveTo(toX, -toY);
        ctx.lineTo(
            toX - headLength * Math.cos(ang - Math.PI / 6),
            -(toY - headLength * Math.sin(ang - Math.PI / 6))
        );
        ctx.lineTo(
            toX - headLength * Math.cos(ang + Math.PI / 6),
            -(toY - headLength * Math.sin(ang + Math.PI / 6))
        );
        ctx.closePath();
        ctx.fill();

        let yawDeg = (((yawToDraw * 180) / Math.PI)) % 360;
        if (yawDeg < 0) yawDeg += 360;
        const yawText = `${yawDeg.toFixed(1)}°`;

        ctx.fillStyle = '#000000';
        ctx.font = `${Math.max(12, markerSize * 0.8)}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(yawText, 0, markerSize * 0.5);
    }

    private ADSdrawYawSelection(
        ctx: CanvasRenderingContext2D,
        _cx: number, _cy: number,   // ไม่ใช้แล้ว (origin อยู่ที่ 0,0)
        r: number,
        markerSize: number,
        yawToDraw: number,
        toX: number,
        toY: number
    ): void {
        // === ตั้งต้น: local origin คือ (0,0) ===
        // อย่า offset ด้วย -markerSize หรือ -toY อีก

        // 1) ฐาน marker (โดนัทกลาง) — อยู่ที่ศูนย์จริง
        ctx.fillStyle = '#ff0044';
        ctx.beginPath();
        ctx.arc(0, 0, markerSize * 0.8, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(0, 0, markerSize * 0.3, 0, Math.PI * 2);
        ctx.fill();

        // 2) วงกลมเส้นประรอบรัศมี r (ศูนย์ที่ 0,0)
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        // 3) เส้น crosshair
        ctx.beginPath();
        ctx.moveTo(-r, 0);
        ctx.lineTo(r, 0);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, -r);
        ctx.lineTo(0, r);
        ctx.stroke();

        // 4) ขีด tick ทุก 15°
        const minorLen = Math.max(4, markerSize * 0.25);
        const majorLen = Math.max(7, markerSize * 0.4);
        for (let deg = 0; deg < 360; deg += 15) {
            const rad = (deg * Math.PI) / 180;
            const isMajor = deg % 45 === 0;
            const len = isMajor ? majorLen : minorLen;

            const sx = Math.cos(rad) * (r - len);
            const sy = Math.sin(rad) * (r - len);
            const ex = Math.cos(rad) * r;
            const ey = Math.sin(rad) * r;

            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(ex, ey);
            ctx.stroke();
        }

        // 5) ป้ายองศาหลัก (0/90/180/270)
        const pad = Math.max(10, markerSize * 0.4);
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.font = `${Math.max(11, markerSize * 0.7)}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('0°', r + pad, 0);
        ctx.fillText('90°', 0, -(r + pad));
        ctx.fillText('180°', -(r + Math.max(14, markerSize * 0.6)), 0);
        ctx.fillText('270°', 0, r + pad);

        // 6) โค้งกวาด (sweep arc) จากแกน +X ไปถึง yaw
        // หมายเหตุ: บน canvas แกน y ลง -> เพื่อให้ CCW ตามคณิต ให้ใช้มุม "ลบ"
        let yawDeg = ((yawToDraw * 180) / Math.PI) % 360;
        if (yawDeg < 0) yawDeg += 360;
        const yawRadCanvas = -(yawDeg * Math.PI) / 180;

        ctx.strokeStyle = 'rgba(255,0,68,0.35)';
        ctx.lineWidth = Math.max(2, markerSize * 0.15);
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, yawRadCanvas, yawRadCanvas < 0 ? true : false);
        ctx.stroke();

        // 7) ลูกศรทิศ (ใช้ toX,toY ที่คำนวณจาก origin เดิมแล้ว — ไม่ต้องกลับเครื่องหมายอีก)
        ctx.strokeStyle = '#ff0044';
        ctx.fillStyle = '#ff0044';
        ctx.lineWidth = 2;

        // แกนลูกศร
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(toX, toY);       // << เดิมใช้ (toX, -toY) ทำให้เพี้ยน
        ctx.stroke();

        // หัวลูกศร
        const headLength = 5 * this.state.transform.value.scale;
        const ang = Math.atan2(toY, toX); // << ใช้ toY ตรงๆ (ไม่ต้องอิง cy)
        ctx.beginPath();
        ctx.moveTo(toX, toY);
        ctx.lineTo(
            toX - headLength * Math.cos(ang - Math.PI / 6),
            toY - headLength * Math.sin(ang - Math.PI / 6)
        );
        ctx.lineTo(
            toX - headLength * Math.cos(ang + Math.PI / 6),
            toY - headLength * Math.sin(ang + Math.PI / 6)
        );
        ctx.closePath();
        ctx.fill();

        // 8) ตัวเลของศาใต้ marker
        const yawText = `${yawDeg.toFixed(1)}°`;
        ctx.fillStyle = '#000000';
        ctx.font = `${Math.max(12, markerSize * 0.8)}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(yawText, 0, markerSize * 0.5);
    }


    private ADSdrawMultiTarget(ctx: CanvasRenderingContext2D): void {
        if (!this.state.multiGoal.value || !this.state.mapData.value) return;
        const goalLength = this.state.multiGoal.value.length;

        for (let i = 0; i < goalLength; i++) {
            const { x, y, yaw, id, label } = this.state.multiGoal.value[i]; // ต้องมี id ใน object
            const canvasPos = this.worldToCanvas(x, y);

            ctx.save();
            ctx.translate(canvasPos.x, canvasPos.y);

            const markerSize = Math.max(8, 12 * Math.sqrt(this.state.transform.value.scale));
            const r = markerSize * 3;
            const cx = 0;
            const cy = -markerSize;

            // วาด marker

            if (this.state.activeTool.value == 'mptp_nav') {
                ctx.fillStyle = '#178a19';
            }
            else {
                ctx.fillStyle = '#FFA500';
            }

            ctx.beginPath();
            ctx.arc(0, -markerSize, markerSize * 0.8, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#FFFFFF';
            ctx.beginPath();
            ctx.arc(0, -markerSize, markerSize * 0.3, 0, Math.PI * 2);
            ctx.fill();

            // วาด yaw arrow
            const yawToDraw = yaw;
            if (this.state.activeTool.value == 'mptp_nav') {
                ctx.strokeStyle = '#178a19';
                ctx.fillStyle = '#178a19';
            }
            else {
                ctx.strokeStyle = '#FFA500';
                ctx.fillStyle = '#FFA500';
            }

            ctx.lineWidth = 2;

            const toX = cx + Math.cos(yawToDraw) * r;
            const toY = -((cy) + Math.sin(-yawToDraw) * r);

            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(toX, -toY);
            ctx.stroke();

            const headLength = 5 * this.state.transform.value.scale;
            const ang = Math.atan2((toY - (-cy)), toX - cx);
            ctx.beginPath();
            ctx.moveTo(toX, -toY);
            ctx.lineTo(
                toX - headLength * Math.cos(ang - Math.PI / 6),
                -(toY - headLength * Math.sin(ang - Math.PI / 6))
            );
            ctx.lineTo(
                toX - headLength * Math.cos(ang + Math.PI / 6),
                -(toY - headLength * Math.sin(ang + Math.PI / 6))
            );
            ctx.closePath();
            ctx.fill();

            ctx.restore();

            // ===== NEW: วาดข้อความใต้ marker =====
            if (id) {
                ctx.save();
                ctx.font = `${2.5 * this.state.transform.value.scale}px sans-serif`;
                ctx.fillStyle = "#000000";
                ctx.textAlign = "center";
                ctx.textBaseline = "top";
                // ตำแหน่งใต้ marker: canvasPos.y + margin
                const margin = 1 * this.state.transform.value.scale;
                const getLabel = label;
                ctx.fillText(getLabel ? getLabel : id, canvasPos.x, canvasPos.y + margin);

                ctx.restore();
            }
        }
    }


    private drawOrigin(ctx: CanvasRenderingContext2D): void {
        if (!this.state.mapData.value) return;

        // Origin is at (0, 0) in world coordinates
        const p = this.worldToCanvas(0, 0);
        const px = Math.round(p.x) + 0.05;
        const py = Math.round(p.y) + 0.05;

        const scale = (this.state.transform.value.scale) * 0.05;
        const pinSize = Math.max(12, 16 * Math.sqrt(scale));

        ctx.save();

        // Google Maps style - outer blue circle
        ctx.fillStyle = 'rgba(59, 130, 246, 0.15)';
        ctx.beginPath();
        ctx.arc(px, py, pinSize * 1.8, 0, Math.PI * 2);
        ctx.fill();

        // Middle circle
        ctx.fillStyle = 'rgba(59, 130, 246, 0.25)';
        ctx.beginPath();
        ctx.arc(px, py, pinSize * 1.2, 0, Math.PI * 2);
        ctx.fill();

        // Pin drop shape - outer white circle with blue border
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = Math.max(2, 2.2 * Math.sqrt(scale));
        ctx.beginPath();
        ctx.arc(px, py, pinSize * 0.9, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Inner blue dot
        ctx.fillStyle = '#3b82f6';
        ctx.beginPath();
        ctx.arc(px, py, pinSize * 0.4, 0, Math.PI * 2);
        ctx.fill();

        // Subtle shadow
        ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 2;

        // Label pill
        const fontPx = Math.max(9, 2 * Math.sqrt(scale));
        ctx.font = `500 ${fontPx}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = '#1f2937';
        ctx.fillText('Origin', px, py - pinSize * 1.5);

        ctx.restore();
    }



    // Helper function to draw a single target point
    private drawTargetPoint(
        ctx: CanvasRenderingContext2D,
        x: number,
        y: number,
        yaw: number,
        id: string | undefined,
        label: string | undefined,
        action: string | undefined,
        isNav: boolean,
        color?: string,
        isExecuting: boolean = false
    ): void {
        const px = Math.round(x) + 0.5;
        const py = Math.round(y) + 0.5;
        const scale = this.state.transform.value.scale;

        const accent = color ?? (isNav ? '#16a34a' : '#ef4444');

        // ===== NEW: LOD Check =====
        // If scale is too small, just draw a simple, fast circle.
        if (scale < 0.15) {
            ctx.fillStyle = accent;
            ctx.beginPath();
            ctx.arc(px, py, 3, 0, Math.PI * 2); // 3px dot
            ctx.fill();
            return;
        }
        // ===== End LOD Check =====

        // ===== DASHBOARD FRIENDLY MARKER OVERRIDE =====
        if (this.state.mode.value === 'dashboard') {
            const markerColor = color ?? (isNav ? '#16a34a' : '#ef4444');
            const pinSize = Math.max(14, 20 * Math.sqrt(scale));
            
            ctx.save();
            ctx.translate(px, py);
            
            // Subtle execution pulse underneath if navigating
            if (isExecuting) {
                 const t = performance.now() / 600.0;
                 const pulse = (Math.sin(t * Math.PI * 2) + 1) / 2;
                 ctx.beginPath();
                 ctx.arc(0, 0, pinSize * 0.4 + (pulse * pinSize * 1.5), 0, Math.PI * 2);
                 ctx.fillStyle = `rgba(59, 130, 246, ${0.1 + pulse * 0.2})`;
                 ctx.fill();
            }

            // Draw drop shadow
            ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
            ctx.shadowBlur = 8;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 4;

            // Google Maps-style pin shape
            ctx.beginPath();
            ctx.moveTo(0, 0); // Point at origin
            ctx.bezierCurveTo(-pinSize/2, -pinSize, -pinSize, -pinSize*1.5, 0, -pinSize*2);
            ctx.bezierCurveTo(pinSize, -pinSize*1.5, pinSize/2, -pinSize, 0, 0);
            ctx.fillStyle = markerColor;
            ctx.fill();
            
            // Inner white dot (no shadow)
            ctx.shadowColor = 'transparent';
            ctx.beginPath();
            ctx.arc(0, -pinSize*1.35, pinSize*0.35, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
            
            // Draw Label text pill vertically above it
            if (label || id) {
                const text = label ?? id;
                const fontPx = Math.max(11, 3.5 * Math.sqrt(scale));
                ctx.font = `600 ${fontPx}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;
                const textW = ctx.measureText(text).width;
                const padX = 8 * Math.sqrt(scale);
                const padY = 4 * Math.sqrt(scale);
                
                const pillW = textW + padX * 2;
                const pillH = fontPx + padY * 2;
                const pillY = -pinSize*2.2 - pillH;
                const pillX = -pillW / 2;
                
                const roundRect = (x: number, y: number, w: number, h: number, r: number) => {
                    const rr = Math.min(r, h / 2, w / 2);
                    ctx.beginPath();
                    ctx.moveTo(x + rr, y);
                    ctx.arcTo(x + w, y, x + w, y + h, rr);
                    ctx.arcTo(x + w, y + h, x, y + h, rr);
                    ctx.arcTo(x, y + h, x, y, rr);
                    ctx.arcTo(x, y, x + w, y, rr);
                    ctx.closePath();
                };

                // Shadow for text pill
                ctx.shadowColor = 'rgba(0,0,0,0.15)';
                ctx.shadowBlur = 6;
                ctx.shadowOffsetY = 2;
                ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
                roundRect(pillX, pillY, pillW, pillH, pillH/2);
                ctx.fill();
                
                ctx.shadowColor = 'transparent';
                ctx.strokeStyle = 'rgba(0,0,0,0.08)';
                ctx.lineWidth = 1;
                ctx.stroke();
                
                ctx.fillStyle = '#1f2937';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(text, 0, pillY + pillH/2);
            }
            
            ctx.restore();
            return;
        }
        // ===== End Dashboard Override =====


        // Parse action string: "0.5,1,1000" -> [circleRadius, yawError, delay]
        let actionCircleRadiusMeters = 0;
        let actionYawErrorDeg = 0;
        if (action) {
            const actionParts = action.split(',').map(v => parseFloat(v.trim()));
            if (actionParts.length > 0) {
                actionCircleRadiusMeters = actionParts[0];
            }
            if (actionParts.length > 1) {
                actionYawErrorDeg = actionParts[1];
            }
        }

        // Convert action circle radius from world to canvas using map resolution
        let actionCircleRadiusCanvas = 0;
        if (actionCircleRadiusMeters > 0) {
            const resolution = this.state.mapData.value!.resolution;
            actionCircleRadiusCanvas = (actionCircleRadiusMeters / resolution) * scale;
        }

        let r = isNav ? 22 : 239;
        let g = isNav ? 163 : 68;
        let b = isNav ? 74 : 68;
        if (color && color.startsWith('#') && color.length === 7) {
            r = parseInt(color.slice(1, 3), 16) || r;
            g = parseInt(color.slice(3, 5), 16) || g;
            b = parseInt(color.slice(5, 7), 16) || b;
        }

        const ringStroke = `rgba(${r},${g},${b},0.45)`;
        const fillSoft1 = `rgba(${r},${g},${b},0.18)`;
        const fillSoft2 = `rgba(${r},${g},${b},0.10)`;
        const textColor = '#111827';


        // sizes
        const markerSize = Math.max(8, 12 * Math.sqrt(scale));
        const actualR = Math.max(16, 20 * Math.sqrt(scale));
        const shaftLen = markerSize * 3;
        const headLen = 6 * Math.sqrt(scale);

        ctx.save();

        // ---------- actual circle (use action radius if available, otherwise default) ----------
        const circleRadius = actionCircleRadiusCanvas > 0 ? actionCircleRadiusCanvas : actualR;

        // ===== Executing Glow =====
        if (isExecuting) {
            const t = performance.now() / 800.0;
            const pulse = (Math.sin(t * Math.PI * 2) + 1) / 2;
            const pulseRadius = circleRadius + 4 + (pulse * 12 * Math.sqrt(scale));
            
            ctx.beginPath();
            ctx.arc(px, py, pulseRadius, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(59, 130, 246, ${0.15 + pulse * 0.15})`;
            ctx.fill();
            ctx.strokeStyle = `rgba(59, 130, 246, ${0.4 + pulse * 0.4})`;
            ctx.lineWidth = 2 * Math.sqrt(scale);
            ctx.stroke();
        }

        const rg = ctx.createRadialGradient(px, py, circleRadius * 0.2, px, py, circleRadius);
        rg.addColorStop(0, fillSoft1);
        rg.addColorStop(1, fillSoft2);

        ctx.fillStyle = rg;
        ctx.strokeStyle = ringStroke;
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.arc(px, py, circleRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // center dot
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(px, py, 2.5, 0, Math.PI * 2);
        ctx.fill();

        const donutOuter = markerSize * 0.84;
        const donutInner = markerSize * 0.34;
        const donutY = py; // at center

        const gd = ctx.createRadialGradient(px, donutY, donutInner * 0.4, px, donutY, donutOuter);
        gd.addColorStop(0, '#fffefb');
        gd.addColorStop(0.6, `rgba(${r},${g},${b},0.3)`);
        gd.addColorStop(1, `rgba(${r},${g},${b},0.15)`);

        ctx.save();
        ctx.shadowBlur = 10;
        ctx.shadowColor = `rgba(${r},${g},${b},0.25)`;
        ctx.fillStyle = gd;
        ctx.beginPath();
        ctx.arc(px, donutY, donutOuter, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // inner hole
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(px, donutY, donutInner, 0, Math.PI * 2);
        ctx.fill();

        // ---------- arrow from donut center with yaw ----------
        const ax = Math.cos(yaw) * shaftLen;
        const ay = -Math.sin(yaw) * shaftLen; // y is inverted
        const ang = Math.atan2(ay, ax);

        // ---------- yaw error visualization ----------
        if (actionYawErrorDeg > 0) {
            const yawErrRad = (actionYawErrorDeg * Math.PI) / 180.0;
            ctx.beginPath();
            ctx.moveTo(px, donutY);
            ctx.arc(px, donutY, shaftLen * 1.25, ang - yawErrRad, ang + yawErrRad, false);
            ctx.lineTo(px, donutY);
            ctx.fillStyle = `rgba(${r},${g},${b},0.2)`;
            ctx.fill();
            
            // Draw a dashed border for the cone
            ctx.setLineDash([4, 4]);
            ctx.strokeStyle = `rgba(${r},${g},${b},0.6)`;
            ctx.lineWidth = Math.max(1, 1.5 * Math.sqrt(scale));
            ctx.stroke();
            ctx.setLineDash([]); // reset

            // Text labels at the edges
            const textRadius = shaftLen * 1.5;
            ctx.font = `bold ${Math.max(9, 10 * Math.sqrt(scale))}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            const drawLabel = (txt: string, a: number) => {
                const lx = px + Math.cos(a) * textRadius;
                const ly = donutY + Math.sin(a) * textRadius;
                // White glow for readability
                ctx.strokeStyle = 'rgba(255,255,255,0.8)';
                ctx.lineWidth = 2.5;
                ctx.strokeText(txt, lx, ly);
                // Text color matching marker
                ctx.fillStyle = `rgba(${r},${g},${b},1)`;
                ctx.fillText(txt, lx, ly);
            };

            drawLabel(`+${actionYawErrorDeg}°`, ang + yawErrRad);
            drawLabel(`-${actionYawErrorDeg}°`, ang - yawErrRad);
        }

        ctx.strokeStyle = accent;
        ctx.lineWidth = Math.max(1.6, 1.6 * Math.sqrt(scale));
        ctx.lineCap = 'round';

        ctx.beginPath();
        ctx.moveTo(px, donutY);
        ctx.lineTo(px + ax, donutY + ay);
        ctx.stroke();

        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.moveTo(px + ax, donutY + ay);
        ctx.lineTo(
            px + ax - headLen * Math.cos(ang - Math.PI / 6),
            donutY + ay - headLen * Math.sin(ang - Math.PI / 6)
        );
        ctx.lineTo(
            px + ax - headLen * Math.cos(ang + Math.PI / 6),
            donutY + ay - headLen * Math.sin(ang + Math.PI / 6)
        );
        ctx.closePath();
        ctx.fill();

        // ---------- label pill under the actual circle ----------
        if (id) {
            const roundRect = (x: number, y: number, w: number, h: number, r: number) => {
                const rr = Math.min(r, h / 2, w / 2);
                ctx.beginPath();
                ctx.moveTo(x + rr, y);
                ctx.arcTo(x + w, y, x + w, y + h, rr);
                ctx.arcTo(x + w, y + h, x, y + h, rr);
                ctx.arcTo(x, y + h, x, y, rr);
                ctx.arcTo(x, y, x + w, y, rr);
                ctx.closePath();
            };

            const text = label ?? id;
            const fontPx = Math.max(10, 2.6 * Math.sqrt(scale));
            const paddingX = 6 * Math.sqrt(scale);
            const paddingY = 3 * Math.sqrt(scale);
            const gap = 6 * Math.sqrt(scale);

            ctx.font = `600 ${fontPx}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'SF Pro Text', sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            const w = ctx.measureText(text).width;
            const pillW = w + paddingX * 2;
            const pillH = fontPx + paddingY * 2;
            const pillX = px - pillW / 2;
            const pillY = py + circleRadius + gap;

            ctx.save();
            ctx.shadowBlur = 8;
            ctx.shadowColor = 'rgba(0,0,0,0.12)';
            ctx.fillStyle = 'rgba(255,255,255,0.88)';
            roundRect(pillX, pillY, pillW, pillH, pillH / 2);
            ctx.fill();
            ctx.restore();

            ctx.strokeStyle = 'rgba(0,0,0,0.06)';
            ctx.lineWidth = 1;
            roundRect(pillX, pillY, pillW, pillH, pillH / 2);
            ctx.stroke();

            ctx.fillStyle = textColor;
            ctx.fillText(text, px, pillY + pillH / 2);
        }

        ctx.restore();
    }

    private drawMultiTarget(ctx: CanvasRenderingContext2D): void {
        if (!this.state.multiGoal.value || !this.state.mapData.value || this.state.multiGoal.value.length === 0) return;

        const isNav = this.state.activeTool.value === 'mptp_nav';

        // ===== NEW: Viewport Culling =====
        // 1. Get viewport in world coordinates
        const { x: minX, y: minY } = this.canvasToWorld(0, 0);
        const { x: maxX, y: maxY } = this.canvasToWorld(this.state.canvasWidth.value, this.state.canvasHeight.value);

        // 2. Query the spatial hash for visible goals
        const visibleGoals = this.hash.query(
            Math.min(minX, maxX),
            Math.min(minY, maxY),
            Math.max(minX, maxX),
            Math.max(minY, maxY)
        );

        const currentIdx = this.state.nodeStatus.value?.current_goal_idx ?? -1;

        // 3. Loop over VISIBLE goals only
        for (let i = 0; i < visibleGoals.length; i++) {
            const goal = visibleGoals[i];
            const { x, y, yaw, id, label, action, color } = goal;
            const p = this.worldToCanvas(x, y);
            const isExec = currentIdx >= 0 && this.state.multiGoal.value.indexOf(goal) === currentIdx;
            this.drawTargetPoint(ctx, p.x, p.y, yaw, id, label, action, isNav, color, isExec);
        }
    }

    private drawSingleTarget(ctx: CanvasRenderingContext2D): void {
        if (!this.state.singleGoal.value || !this.state.mapData.value) return;
        const { x, y, yaw, id, label, action, color } = this.state.singleGoal.value;
        const p = this.worldToCanvas(x, y);
        const isNav = false;
        this.drawTargetPoint(ctx, p.x, p.y, yaw, id, label, action, isNav, color);
    }





    private drawGrid(
        ctx: CanvasRenderingContext2D,
        metersPerWorldUnit = 1.0,
        gridTransparency = 0.3
    ) {
        const { width, height } = ctx.canvas;

        const scale = this.state.transform.value.scale;
        const offsetX = this.state.transform.value.translateX;
        const offsetY = this.state.transform.value.translateY;

        const gridStepWorld = (1.0 / metersPerWorldUnit) * 1;

        const leftWorld = -offsetX / scale;
        const topWorld = -offsetY / scale;
        const rightWorld = leftWorld + width / scale;
        const bottomWorld = topWorld + height / scale;

        const startX = Math.floor(leftWorld / gridStepWorld) * gridStepWorld;
        const startY = Math.floor(topWorld / gridStepWorld) * gridStepWorld;

        ctx.save();

        // --- Main grid lines ---
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = `rgba(45, 45, 45, ${gridTransparency})`;
        ctx.beginPath();

        for (let x = startX; x <= rightWorld + 1e-6; x += gridStepWorld) {
            const sx = x * scale + offsetX;
            ctx.moveTo(sx, 0);
            ctx.lineTo(sx, height);
        }

        for (let y = startY; y <= bottomWorld + 1e-6; y += gridStepWorld) {
            const sy = y * scale + offsetY;
            ctx.moveTo(0, sy);
            ctx.lineTo(width, sy);
        }
        ctx.stroke();

        // --- Axis lines ---
        ctx.beginPath();
        ctx.lineWidth = 2;
        ctx.strokeStyle = `rgba(59, 130, 246, ${gridTransparency * 2})`;

        const x0 = 0 * scale + offsetX;
        const y0 = 0 * scale + offsetY;

        if (x0 >= 0 && x0 <= width) {
            ctx.moveTo(x0, 0);
            ctx.lineTo(x0, height);
        }
        if (y0 >= 0 && y0 <= height) {
            ctx.moveTo(0, y0);
            ctx.lineTo(width, y0);
        }
        ctx.stroke();

        // --- Corner accent ---
        if (x0 >= 0 && x0 <= width && y0 >= 0 && y0 <= height) {
            ctx.fillStyle = `rgba(59, 130, 246, ${gridTransparency * 0.3})`;
            ctx.beginPath();
            ctx.arc(x0, y0, 6 * Math.sqrt(scale), 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }

    // Performance monitoring
    private updatePerformanceStats(frameTime: number): void {
        this.state.performanceState.frameCount++;
        this.state.performanceState.frameTimes.push(frameTime);

        if (this.state.performanceState.frameTimes.length > 60) {
            this.state.performanceState.frameTimes.shift();
        }

        const currentTime = performance.now();
        if (currentTime - this.state.performanceState.lastFPSTime >= 1000) {
            this.state.currentFPS.value = Math.round(
                (this.state.performanceState.frameCount * 1000) /
                (currentTime - this.state.performanceState.lastFPSTime)
            );
            this.state.performanceState.frameCount = 0;
            this.state.performanceState.lastFPSTime = currentTime;

            const sum = this.state.performanceState.frameTimes.reduce((a, b) => a + b, 0);
            this.state.averageFrameTime.value = sum / this.state.performanceState.frameTimes.length;
        }
    }

    // ===== MODIFIED: Map texture generation (Differential Patching) =====
    async updateMapTexture(mapData: OccupancyGrid): Promise<void> {
        const { width, height, data } = mapData;

        // --- 1. Check for Full Rebuild ---
        // If no old map, or dimensions changed, we MUST do a full rebuild.
        if (!this.oldMapData || !this.state.renderState.mapTexture || this.oldMapData.length !== data.length || this.state.renderState.mapTexture.width !== width) {
            console.log('MapEngine: Performing FULL texture rebuild.');

            // Use the original generateMapTexture
            this.state.renderState.mapTexture = generateMapTexture(mapData, this._lutCfg);
            this.oldMapData = new Int8Array(data); // Store a copy

            // (Rest of your original full-rebuild logic)
            this._mapTexVersion++;
            this._tilesBuiltForVersion = -1;

            try {
                if (this.state.renderState.mapTexture) {
                    await this._buildTilesFromTexture(this.state.renderState.mapTexture);
                }
                if (this.state.renderState.mapTexture && 'createImageBitmap' in window) {
                    this.mapBitmap = await createImageBitmap(this.state.renderState.mapTexture);
                }
            } catch (e) {
                console.error("Bitmap creation failed", e);
                this.mapBitmap = null;
            }

            // ===== MODIFIED: Recreate edit layers and buffer =====
            this.editPaintCanvas = document.createElement('canvas');
            this.editPaintCanvas.width = width;
            this.editPaintCanvas.height = height;
            this.editPaintCtx = this.editPaintCanvas.getContext('2d', { willReadFrequently: true });
            if (this.editPaintCtx) {
                this.editPaintCtx.fillStyle = '#000'; // Set default style
            }

            this.editEraseCanvas = document.createElement('canvas');
            this.editEraseCanvas.width = width;
            this.editEraseCanvas.height = height;
            this.editEraseCtx = this.editEraseCanvas.getContext('2d', { willReadFrequently: true });
            if (this.editEraseCtx) {
                this.editEraseCtx.fillStyle = '#f0f0f0'; // Set default style
            }

            // Resize edit buffer. It will be blank, matching the cleared canvases.
            this.editBuffer.resize(width, height);
            // ===================================================

            this.forceRedraw();
            return;
        }

        // --- 2. Find Differences (The Patch) ---
        const changes: { idx: number, val: number }[] = [];
        for (let i = 0; i < data.length; i++) {
            if (data[i] !== this.oldMapData[i]) {
                changes.push({ idx: i, val: data[i] });
            }
        }

        // --- 3. Apply Patch ---
        if (changes.length > 0) {
            // If changes are huge, just do a full rebuild
            if (changes.length > data.length * 0.2) {
                console.warn("MapEngine: Large change detected, forcing full rebuild.");
                this.oldMapData = null; // Force full rebuild on next call
                await this.updateMapTexture(mapData); // Recurse
                return;
            }

            // Apply the small patch
            // console.log(`MapEngine: Patching ${changes.length} pixels.`);
            await this.patchMapTexture(changes, width, height);
            this.oldMapData.set(data); // Update the old data
        }
    }

    /**
     * ===== NEW: Applies a patch of changed pixels to the main mapTexture canvas. =====
     */
    private async patchMapTexture(changes: { idx: number, val: number }[], width: number, height: number): Promise<void> {
        const tex = this.state.renderState.mapTexture;
        if (!tex || !this.lut) return;

        const ctx = tex.getContext('2d');
        if (!ctx) return;

        const dirtyTiles = new Set<number>();

        // We can't use fillRect as it's too slow for thousands of pixels.
        // We get the ImageData for the *entire canvas*, modify it in memory,
        // and put it back once. This is much faster.
        const imgData = ctx.getImageData(0, 0, width, height);
        const img = imgData.data;

        for (const change of changes) {
            const { idx, val } = change;

            // Get color from LUT
            const v = val === -1 ? 255 : Math.max(0, Math.min(255, val));
            const c = this.lut[v];

            // Convert ROS index (bottom-left) to Canvas index (top-left)
            const x = idx % width;
            const y_ros = Math.floor(idx / width);
            const y_canvas = height - 1 - y_ros; // Flip Y-axis

            // Find pixel index in ImageData
            const canvasIdx = (y_canvas * width + x) * 4;
            img[canvasIdx] = c;
            img[canvasIdx + 1] = c;
            img[canvasIdx + 2] = c;
            img[canvasIdx + 3] = 255;

            // Mark the tile as dirty
            const tileIdx = Math.floor(y_canvas / this._tileSize) * this._tilesPerRow + Math.floor(x / this._tileSize);
            dirtyTiles.add(tileIdx);
        }

        // Apply all pixel changes to the canvas at once
        ctx.putImageData(imgData, 0, 0);

        // Now, asynchronously rebuild only the affected tiles
        if (dirtyTiles.size > 0) {
            await this.rebuildTiles(dirtyTiles);
        }

        // We also need to update the main mapBitmap, or it will be stale
        // We do this async as well.
        await createImageBitmap(tex).then(bmp => this.mapBitmap = bmp);

        this.forceRedraw();
    }

    /**
     * ===== NEW: Asynchronously rebuilds only the ImageBitmap tiles that are dirty. =====
     */
    private async rebuildTiles(tileIndices: Set<number>): Promise<void> {
        if (!this.state.renderState.mapTexture) return;

        const tex = this.state.renderState.mapTexture;
        const ts = this._tileSize;
        const cols = this._tilesPerRow;

        const promises: Promise<void>[] = [];

        for (const idx of tileIndices) {
            const ty = Math.floor(idx / cols);
            const tx = idx % cols;
            const sx = tx * ts;
            const sy = ty * ts;
            const sw = Math.min(ts, tex.width - sx);
            const sh = Math.min(ts, tex.height - sy);

            // create new bitmap for just this tile
            const p = createImageBitmap(tex, sx, sy, sw, sh)
                .then(bitmap => {
                    this._mapTiles[idx] = bitmap;
                })
                .catch(e => console.error(`Failed to rebuild tile ${idx}`, e));

            promises.push(p);
        }

        await Promise.all(promises);

        // We've updated tiles, so trigger one more render
        this.forceRedraw();
    }


    getSmoothTransform(): SmoothTransform {
        return this.smoothTransform;
    }


    // In your socketService (add this method)
    // sendMapExport(meta: { mapSite: string; mapName: string; baseName: string }, pgmBytes: Uint8Array, yamlText: string) {
    //     if (!this.isConnected.value) return;

    //     const enc = new TextEncoder();
    //     const yamlBytes = enc.encode(yamlText);

    //     // Header describing the payload
    //     const headerObj = {
    //         action: 6,                 // <-- action == 6
    //         mapSite: meta.mapSite,
    //         mapName: meta.mapName,
    //         files: [
    //             { name: `${meta.baseName}.pgm`, mime: 'image/x-portable-graymap', size: pgmBytes.byteLength },
    //             { name: `${meta.baseName}.yaml`, mime: 'text/yaml', size: yamlBytes.byteLength },
    //         ],
    //         // optional: timestamp, version, etc.
    //         v: 1
    //     };

    //     const headerJson = JSON.stringify(headerObj);
    //     const headerBytes = enc.encode(headerJson);

    //     // Frame format:
    //     // [ MAGIC(8) = "RERISMAP" ][ VER(1)=1 ][ HDRLEN(4, big-endian) ][ HDRBYTES ][ PGM ][ YAML ]
    //     const MAGIC = enc.encode('RERISMAP'); // 8 bytes
    //     const VER = 1;
    //     const hdrLen = headerBytes.length;

    //     const totalLen = MAGIC.length + 1 + 4 + hdrLen + pgmBytes.length + yamlBytes.length;
    //     const buffer = new ArrayBuffer(totalLen);
    //     const view = new DataView(buffer);
    //     const out = new Uint8Array(buffer);

    //     let off = 0;
    //     // MAGIC
    //     out.set(MAGIC, off); off += MAGIC.length;
    //     // VER
    //     view.setUint8(off, VER); off += 1;
    //     // HDRLEN (big-endian)
    //     view.setUint32(off, hdrLen, false); off += 4;
    //     // HEADER BYTES
    //     out.set(headerBytes, off); off += hdrLen;
    //     // PGM
    //     out.set(pgmBytes, off); off += pgmBytes.length;
    //     // YAML
    //     out.set(yamlBytes, off); off += yamlBytes.length;

    //     // Send binary frame
    //     socketService
    //     // serviceSocket.send(buffer);
    // }






    /**
     * Build map export binary buffer (RERISMAP format) without sending.
     * Returns the buffer ready to be sent via socketService.sendRawBinary().
     * @param mapSite - Site name (e.g., 'warehouse')
     * @param mapName - Map name (e.g., 'floor_1')
     */
    buildMapExportBuffer(mapSite: string, mapName: string): ArrayBuffer | null {
        if (!mapSite || !mapName) {
            console.error('[buildMapExportBuffer] Missing mapSite or mapName');
            return null;
        }

        try {
            const md = this.state.mapData.value;
            if (!md) {
                throw new Error('No map data available');
            }

            console.log(`[buildMapExportBuffer] Preparing map: ${mapSite}/${mapName}`);

            // 1. Generate PGM file bytes
            const pgmBytes = this.generatePGMBytes(md);
            console.log(`[buildMapExportBuffer] Generated PGM: ${pgmBytes.length} bytes`);

            // 2. Generate YAML content
            const baseName = `${mapSite}_${mapName}`.toLowerCase();
            const yamlText = this.generateYAMLText(md, baseName);
            console.log(`[buildMapExportBuffer] Generated YAML: ${yamlText.length} chars`);

            // 2b. Generate JSON metadata (Markers & Areas)
            const jsonData = this.export_to_json(this.state.multiGoal.value, this.state.areaRects.value);
            const jsonText = JSON.stringify(jsonData);
            console.log(`[buildMapExportBuffer] Generated JSON: ${jsonText.length} chars`);

            // 3. Build the RERISMAP binary frame
            const enc = new TextEncoder();
            const yamlBytes = enc.encode(yamlText);
            const jsonBytes = enc.encode(jsonText);

            const headerObj = {
                action: 6,
                mapSite: mapSite,
                mapName: mapName,
                files: [
                    { name: `${baseName}.pgm`, mime: 'image/x-portable-graymap', size: pgmBytes.byteLength },
                    { name: `${baseName}.yaml`, mime: 'text/yaml', size: yamlBytes.byteLength },
                    { name: `map_data.json`, mime: 'application/json', size: jsonBytes.byteLength }
                ],
                v: 1
            };

            const headerJson = JSON.stringify(headerObj);
            const headerBytes = enc.encode(headerJson);

            const MAGIC = enc.encode('RERISMAP');
            const VER = 1;
            const hdrLen = headerBytes.length;

            const totalLen = MAGIC.length + 1 + 4 + hdrLen + pgmBytes.length + yamlBytes.length + jsonBytes.length;
            const buffer = new ArrayBuffer(totalLen);
            const view = new DataView(buffer);
            const out = new Uint8Array(buffer);

            let off = 0;
            out.set(MAGIC, off);                    off += MAGIC.length;
            view.setUint8(off, VER);                off += 1;
            view.setUint32(off, hdrLen, false);     off += 4;
            out.set(headerBytes, off);              off += hdrLen;
            out.set(pgmBytes, off);                 off += pgmBytes.length;
            out.set(yamlBytes, off);                off += yamlBytes.length;
            out.set(jsonBytes, off);                off += jsonBytes.length;

            console.log(`[buildMapExportBuffer] ✓ Built ${totalLen}B buffer for ${mapSite}/${mapName}`);
            return buffer;

        } catch (error) {
            console.error('[buildMapExportBuffer] Error:', error);
            return null;
        }
    }

    /**
     * @deprecated Use buildMapExportBuffer() + socketService.sendRawBinary() instead.
     * Kept for backward compatibility.
     */
    exportAndSendMap(websocket: WebSocket, mapSite: string, mapName: string): boolean {
        if (!websocket || websocket.readyState !== WebSocket.OPEN) {
            console.error('[exportAndSendMap] WebSocket not connected');
            return false;
        }

        const buffer = this.buildMapExportBuffer(mapSite, mapName);
        if (!buffer) return false;

        try {
            websocket.send(buffer);
            console.log(`✓ Map exported and sent: ${mapSite}/${mapName}`);
            return true;
        } catch (err) {
            console.error('[exportAndSendMap] Failed to send:', err);
            return false;
        }
    }

    /**
     * Generate PGM file bytes from map data with edits applied
     */
    private generatePGMBytesRaw(md: MapData): Uint8Array {
        const w = md.width;
        const h = md.height;
        const occ = md.data;

        // Build BODY in "image order" (top-left origin)
        const body = new Uint8Array(w * h);

        const mapOccToGray = (v: number): number => {
            if (v < 0) return 205;      // unknown
            if (v >= 65) return 0;      // occupied
            return 254;                 // free
        };

        // Convert from ROS order (bottom-left) to image order (top-left)
        for (let y_img = 0; y_img < h; y_img++) {
            const y_ros = h - 1 - y_img;
            const row_ros = y_ros * w;
            const row_img = y_img * w;
            for (let x = 0; x < w; x++) {
                body[row_img + x] = mapOccToGray(occ[row_ros + x]);
            }
        }

        // Overlay brush/edit layers (already in image order)
        for (let idx = 0; idx < this.editBuffer.override.length; idx++) {
            const val = this.editBuffer.override[idx];
            if (val === 100) {        // Occupied
                body[idx] = 0;
            } else if (val === 0) {   // Free
                body[idx] = 254;
            }
            // else keep original value
        }

        // Build PGM file with P5 header
        const header = `P5\n# CREATOR: Reris MapEditor\n${w} ${h}\n255\n`;
        const headerBytes = new TextEncoder().encode(header);
        const pgmBytes = new Uint8Array(headerBytes.length + body.length);
        pgmBytes.set(headerBytes, 0);
        pgmBytes.set(body, headerBytes.length);

        return pgmBytes;
    }


      private generatePGMBytes(md: MapData): Uint8Array {
        const w = md.width;
        const h = md.height;
        const occ = md.data;

        // Build BODY in "image order" (top-left origin)
        const body = new Uint8Array(w * h);

        const mapOccToGray = (v: number): number => {
            if (v < 0) return 205;      // unknown
            if (v >= 65) return 0;      // occupied
            return 254;                 // free
        };

        // Convert from ROS order (bottom-left) to image order (top-left)
        for (let y_img = 0; y_img < h; y_img++) {
            const y_ros = h - 1 - y_img;
            const row_ros = y_ros * w;
            const row_img = y_img * w;
            for (let x = 0; x < w; x++) {
                body[row_img + x] = mapOccToGray(occ[row_ros + x]);
            }
        }

        // Overlay brush/edit layers (already in image order)
        for (let idx = 0; idx < this.editBuffer.override.length; idx++) {
            const val = this.editBuffer.override[idx];
            if (val === 100) {        // Occupied
                body[idx] = 0;
            } else if (val === 0) {   // Free
                body[idx] = 254;
            }
            // else keep original value
        }

        // Build PGM file with P5 header
        const header = `P5\n# CREATOR: Reris MapEditor\n${w} ${h}\n255\n`;
        const headerBytes = new TextEncoder().encode(header);
        const pgmBytes = new Uint8Array(headerBytes.length + body.length);
        pgmBytes.set(headerBytes, 0);
        pgmBytes.set(body, headerBytes.length);

        return pgmBytes;
    }


    /**
     * Generate YAML text content
     */
    private generateYAMLText(md: MapData, baseName: string): string {
        return `image: ${baseName}.pgm
resolution: ${md.resolution}
origin: [${md.origin_x}, ${md.origin_y}, 0.0]
negate: 0
occupied_thresh: 0.65
free_thresh: 0.196
`;
    }

    /**
     * Send map export as action 6 via WebSocket (binary protocol)
     * 
     * Frame format:
     * [ MAGIC(8)="RERISMAP" ][ VER(1)=1 ][ HDRLEN(4, BE) ][ HEADER ][ PGM ][ YAML ]
     */
    private sendMapExportAction6(
        socket: WebSocket,
        meta: MapExportMeta,
        pgmBytes: Uint8Array,
        yamlText: string
    ): boolean {
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            console.warn('[sendMapExportAction6] Socket not connected');
            return false;
        }

        try {
            const enc = new TextEncoder();
            const yamlBytes = enc.encode(yamlText);
            const fileBase = meta.baseName;

            // Build header JSON
            const headerObj = {
                action: 6,  // Map export action
                mapSite: meta.mapSite,
                mapName: meta.mapName,
                files: [
                    {
                        name: `${fileBase}.pgm`,
                        mime: 'image/x-portable-graymap',
                        size: pgmBytes.byteLength
                    },
                    {
                        name: `${fileBase}.yaml`,
                        mime: 'text/yaml',
                        size: yamlBytes.byteLength
                    }
                ],
                v: 1
            };

            const headerJson = JSON.stringify(headerObj);
            const headerBytes = enc.encode(headerJson);

            // Frame format: [ MAGIC(8) ][ VER(1) ][ HDRLEN(4, BE) ][ HEADER ][ PGM ][ YAML ]
            const MAGIC = enc.encode('RERISMAP');  // 8 bytes
            const VER = 1;
            const hdrLen = headerBytes.length;

            const totalLen = MAGIC.length + 1 + 4 + hdrLen + pgmBytes.length + yamlBytes.length;
            const buffer = new ArrayBuffer(totalLen);
            const view = new DataView(buffer);
            const out = new Uint8Array(buffer);

            // Write frame
            let off = 0;
            out.set(MAGIC, off);                    off += MAGIC.length;     // 8 bytes
            view.setUint8(off, VER);                off += 1;                // 1 byte
            view.setUint32(off, hdrLen, false);     off += 4;                // 4 bytes (BE)
            out.set(headerBytes, off);              off += hdrLen;           // Header JSON
            out.set(pgmBytes, off);                 off += pgmBytes.length;  // PGM file
            out.set(yamlBytes, off);                off += yamlBytes.length; // YAML file

            // Send binary frame
            socket.send(buffer);
            console.log(
                `[sendMapExportAction6] ✓ Sent ${fileBase}.pgm (${pgmBytes.length}B) + ` +
                `${fileBase}.yaml (${yamlBytes.length}B) = ${totalLen}B total`
            );
            return true;

        } catch (err) {
            console.error('[sendMapExportAction6] Failed to send:', err);
            return false;
        }
    }

    /**
     * Alternative: Download map files locally
     */
    downloadMapLocally(baseName: string = 'map'): void {
        const md = this.state.mapData.value;
        if (!md) {
            console.error('No map data to download');
            return;
        }

        try {
            const pgmBytes = this.generatePGMBytes(md);
            const yamlText = this.generateYAMLText(md, baseName);

            // Download PGM
            const pgmBlob = new Blob([pgmBytes], { type: 'image/x-portable-graymap' });
            this.downloadFile(pgmBlob, `${baseName}.pgm`);

            // Download YAML
            const yamlBlob = new Blob([yamlText], { type: 'text/yaml' });
            this.downloadFile(yamlBlob, `${baseName}.yaml`);

            console.log(`✓ Downloaded ${baseName}.pgm and ${baseName}.yaml`);
        } catch (error) {
            console.error('Failed to download map locally:', error);
        }
    }

    /**
     * Helper: Trigger file download
     */
    private downloadFile(blob: Blob, filename: string): void {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * Set map data (for testing or loading)
     */
    setMapData(mapData: MapData): void {
        this.state.mapData.value = mapData;
        // Initialize edit buffer to match map size
        this.editBuffer.override = new Int8Array(mapData.width * mapData.height).fill(-1);
        console.log(`Map data set: ${mapData.width}x${mapData.height}`);
    }



    

    exportAsPGM(baseName = 'map') {
        const md = this.state.mapData.value;
        if (!md) throw new Error('No map data');

        const w = md.width, h = md.height;
        const occ = md.data as number[] | Int8Array;

        // 1) Build BODY in "image order" (top-left origin) so it matches your canvases
        //    Convert from ROS order (bottom-left origin) while copying.
        const body = new Uint8Array(w * h);

        const mapOccToGray = (v: number): number => {
            if (v < 0) return 205;      // unknown
            if (v >= 65) return 0;      // occupied
            return 254;                 // free
        };

        // image y: 0..h-1 (top->bottom)
        for (let y_img = 0; y_img < h; y_img++) {
            const y_ros = h - 1 - y_img;           // flip while copying
            const row_ros = y_ros * w;
            const row_img = y_img * w;
            for (let x = 0; x < w; x++) {
                body[row_img + x] = mapOccToGray(occ[row_ros + x]);
            }
        }

        // 2) Overlay brush layers (already in image order!)
        // ===== MODIFIED: Use the EditBuffer data =====
        for (let idx = 0; idx < this.editBuffer.override.length; idx++) {
            const val = this.editBuffer.override[idx];
            if (val === 100) { // Occupied
                body[idx] = 0;
            } else if (val === 0) { // Free
                body[idx] = 254;
            }
            // If val is EditBuffer.NO, we just keep the value from the base map (body[idx])
        }
        // ============================================

        // 3) Write PGM without any further Y flip (already in image order)
        const header = `P5
# CREATOR: Reris MapEditor
${w} ${h}
255
`;
        const headerBytes = new TextEncoder().encode(header);
        const out = new Uint8Array(headerBytes.length + body.length);
        out.set(headerBytes, 0);
        out.set(body, headerBytes.length);

        const blob = new Blob([out], { type: 'image/x-portable-graymap' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${baseName}.pgm`;
        a.click();
        URL.revokeObjectURL(url);

        // 4) YAML (origin in world coords; keep negate/thresh standard)
        const yaml = `image: ${baseName}.pgm
resolution: ${md.resolution}
origin: [${md.origin_x}, ${md.origin_y}, 0.0]
negate: 0
occupied_thresh: 0.65
free_thresh: 0.196
`;
        const yblob = new Blob([yaml], { type: 'text/yaml' });
        const yurl = URL.createObjectURL(yblob);
        const ya = document.createElement('a');
        ya.href = yurl;
        ya.download = `${baseName}.yaml`;
        ya.click();
        URL.revokeObjectURL(yurl);
    }

    exportAsPGMUltimate(baseName = 'map', options?: { 
        socket?: WebSocket; 
        mapSite?: string; 
        mapName?: string;
        downloadLocally?: boolean; 
    }) {
        const md = this.state.mapData.value;
        if (!md) throw new Error('No map data');

        const w = md.width, h = md.height;
        const occ = md.data as number[] | Int8Array;

        // 1) Build BODY in "image order" (top-left origin) so it matches your canvases
        //    Convert from ROS order (bottom-left origin) while copying.
        const body = new Uint8Array(w * h);

        const mapOccToGray = (v: number): number => {
            if (v < 0) return 205;      // unknown
            if (v >= 65) return 0;      // occupied
            return 254;                 // free
        };

        // image y: 0..h-1 (top->bottom)
        for (let y_img = 0; y_img < h; y_img++) {
            const y_ros = h - 1 - y_img;           // flip while copying
            const row_ros = y_ros * w;
            const row_img = y_img * w;
            for (let x = 0; x < w; x++) {
                body[row_img + x] = mapOccToGray(occ[row_ros + x]);
            }
        }

        // 2) Overlay brush layers (already in image order!)
        for (let idx = 0; idx < this.editBuffer.override.length; idx++) {
            const val = this.editBuffer.override[idx];
            if (val === 100) { // Occupied
                body[idx] = 0;
            } else if (val === 0) { // Free
                body[idx] = 254;
            }
        }

        // 3) Build PGM file content
        const header = `P5
    # CREATOR: Reris MapEditor
    ${w} ${h}
    255
    `;
        const headerBytes = new TextEncoder().encode(header);
        const pgmBytes = new Uint8Array(headerBytes.length + body.length);
        pgmBytes.set(headerBytes, 0);
        pgmBytes.set(body, headerBytes.length);

        // 4) Build YAML content
        const yaml = `image: ${baseName}.pgm
    resolution: ${md.resolution}
    origin: [${md.origin_x}, ${md.origin_y}, 0.0]
    negate: 0
    occupied_thresh: 0.65
    free_thresh: 0.196
    `;

        // 5) Decide: send via WebSocket or download locally
        const shouldSendWS = options?.socket && 
                            options?.mapSite && 
                            options?.mapName &&
                            options.socket.readyState === WebSocket.OPEN;

        if (shouldSendWS) {
            // Send to WebSocket
            const success = this.sendMapExport(
                options.socket!,
                {
                    mapSite: options.mapSite!,
                    mapName: options.mapName!,
                    baseName: baseName
                },
                pgmBytes,
                yaml
            );
            
            if (!success) {
                console.warn('WebSocket send failed, falling back to local download');
                this.downloadMapFiles(baseName, pgmBytes, yaml);
            }
            
            return success;
        } else {
            // Download locally (default behavior)
            if (options?.downloadLocally !== false) {
                this.downloadMapFiles(baseName, pgmBytes, yaml);
            }
            return true;
        }
    }


        // Helper method to download files locally
    private downloadMapFiles(baseName: string, pgmBytes: Uint8Array, yamlText: string) {
        // Download PGM
        const pgmBlob = new Blob([pgmBytes], { type: 'image/x-portable-graymap' });
        const pgmUrl = URL.createObjectURL(pgmBlob);
        const pgmLink = document.createElement('a');
        pgmLink.href = pgmUrl;
        pgmLink.download = `${baseName}.pgm`;
        pgmLink.click();
        URL.revokeObjectURL(pgmUrl);

        // Download YAML
        const yamlBlob = new Blob([yamlText], { type: 'text/yaml' });
        const yamlUrl = URL.createObjectURL(yamlBlob);
        const yamlLink = document.createElement('a');
        yamlLink.href = yamlUrl;
        yamlLink.download = `${baseName}.yaml`;
        yamlLink.click();
        URL.revokeObjectURL(yamlUrl);
    }

    sendMapExport(
        socket: WebSocket,
        meta: { mapSite: string; mapName: string; baseName?: string },
        pgmBytes: Uint8Array,
        yamlText: string
    ): boolean {
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            console.warn('[sendMapExport] Socket not connected; abort sendMapExport');
            return false;
        }

        const enc = new TextEncoder();
        const yamlBytes = enc.encode(yamlText);

        // Filename format <site>_<map>
        const fileBase = `${meta.mapSite}_${meta.mapName}`.toLowerCase();

        // Header describing the payload
        const headerObj = {
            action: 6, // binary map export
            mapSite: meta.mapSite,
            mapName: meta.mapName,
            files: [
                { name: `${fileBase}.pgm`, mime: 'image/x-portable-graymap', size: pgmBytes.byteLength },
                { name: `${fileBase}.yaml`, mime: 'text/yaml', size: yamlBytes.byteLength },
            ],
            v: 1
        };

        const headerJson = JSON.stringify(headerObj);
        const headerBytes = enc.encode(headerJson);

        // Frame format:
        // [ MAGIC(8)="RERISMAP" ][ VER(1)=1 ][ HDRLEN(4, BE) ][ HDRBYTES ][ PGM ][ YAML ]
        const MAGIC = enc.encode('RERISMAP'); // 8 bytes
        const VER = 1;
        const hdrLen = headerBytes.length;

        const totalLen = MAGIC.length + 1 + 4 + hdrLen + pgmBytes.length + yamlBytes.length;
        const buffer = new ArrayBuffer(totalLen);
        const view = new DataView(buffer);
        const out = new Uint8Array(buffer);

        let off = 0;
        out.set(MAGIC, off); off += MAGIC.length;
        view.setUint8(off, VER); off += 1;
        view.setUint32(off, hdrLen, false); off += 4;
        out.set(headerBytes, off); off += hdrLen;
        out.set(pgmBytes, off); off += pgmBytes.length;
        out.set(yamlBytes, off); off += yamlBytes.length;

        // Send binary frame via provided socket
        try {
            socket.send(buffer);
            console.log(`[sendMapExport] Sent map export → ${fileBase}.pgm + ${fileBase}.yaml`);
            return true;
        } catch (err) {
            console.error('[sendMapExport] Failed to send binary map:', err);
            return false;
        }
    }



    // === [Perf Patch] rAF coalesced rendering (non-invasive) ===


    // === [Perf Patch] Path2D + screen point caching for routes ===
    private _routePathCache = new WeakMap<IPosition[]>(); // Fixed type
    private _routeScreenCache = new WeakMap<IPosition[], { serial: number; points: Array<{ x: number; y: number }> }>();
    private _transformSerial = 0; // Added this property

    private _getRouteScreenPoints(pts: IPosition[]): { x: number; y: number }[] {
        const hit = this._routeScreenCache.get(pts);
        if (hit && hit.serial === this._transformSerial) return hit.points;
        const out: { x: number; y: number }[] = pts.map((p: IPosition) => this.worldToCanvas(p.x, p.y));
        this._routeScreenCache.set(pts, { serial: this._transformSerial, points: out });
        return out;
    }

    private _getRoutePath2D(pts: IPosition[]): Path2D {
        const hit = this._routePathCache.get(pts);
        if (hit && hit.serial === this._transformSerial) return hit.path;

        const sp = this._getRouteScreenPoints(pts);
        const path = new Path2D();
        if (sp.length > 0) {
            path.moveTo(sp[0].x, sp[0].y);
            for (let i = 1; i < sp.length; i++) path.lineTo(sp[i].x, sp[i].y);
        }
        this._routePathCache.set(pts, { serial: this._transformSerial, path });
        return path;
    }
    private _rAFScheduled: boolean = false;

    /**
     * Call this instead of drawing immediately. It coalesces multiple calls
     * into a single requestAnimationFrame tick to avoid redundant redraws
     * during fast pan/zoom/drag.
     */
    public render(): void {
        if (this._rAFScheduled) return;
        this._rAFScheduled = true;
        requestAnimationFrame(() => {
            this._rAFScheduled = false;
            // If the original render has been renamed to _renderNow by this patch, call it.
            // Otherwise, if _renderNow doesn't exist, fall back to a no-op to stay safe.
            if (typeof (this)._renderNow === 'function') {
                (this)._renderNow();
            } else {
                // No original render found; you can manually call the drawing routine here if needed.
            }
        });
    }

    /**
     * Force a synchronous draw now (rarely needed; use render() for normal use).
     */
    private renderImmediate(): void {
        this._rAFScheduled = false;
        if (typeof (this)._renderNow === 'function') {
            (this)._renderNow();
        }
    }
}