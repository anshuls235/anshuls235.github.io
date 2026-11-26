// Web Worker: decodes binary SKY1 city tiles and builds transferable LOD geometry
// off the main thread so streaming never drops frames.
import { decodeTile, TILE_SIZE, type CityId } from "./tileformat";
import { buildTileGeometry, type BuiltTileData, type TileLod } from "./tile-geom";

export interface WorkerRequest {
  id: number;
  cityId: CityId;
  lod: TileLod;
  tileSize?: number;
  buffer: ArrayBuffer;
}

export interface WorkerResponse {
  id: number;
  data: BuiltTileData;
}

function collectTransferables(d: BuiltTileData): Transferable[] {
  const list: Transferable[] = [];
  if (d.wallsByStyle) {
    for (const w of d.wallsByStyle) {
      if (w) list.push(w.pos.buffer, w.nrm.buffer, w.uv.buffer, w.color.buffer);
    }
  }
  if (d.roofs) list.push(d.roofs.pos.buffer, d.roofs.nrm.buffer, d.roofs.color.buffer);
  if (d.midBuildings) list.push(d.midBuildings.pos.buffer, d.midBuildings.nrm.buffer, d.midBuildings.color.buffer);
  if (d.roads) list.push(d.roads.pos.buffer, d.roads.color.buffer);
  if (d.roadMarks) list.push(d.roadMarks.buffer);
  if (d.rails) list.push(d.rails.pos.buffer, d.rails.color.buffer);
  if (d.ground) list.push(d.ground.pos.buffer, d.ground.color.buffer);
  if (d.water) list.push(d.water.buffer);
  if (d.trees) list.push(d.trees.buffer);
  return list;
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, cityId, lod, tileSize, buffer } = event.data;
  const tile = decodeTile(buffer, tileSize ?? TILE_SIZE);
  const data = buildTileGeometry(tile, cityId, lod);
  const transfer = collectTransferables(data);
  (self as unknown as Worker).postMessage({ id, data } satisfies WorkerResponse, transfer);
};
