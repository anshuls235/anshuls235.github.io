// Web Worker: decodes binary SKY1 city tiles, paints per-tile OffscreenCanvas ground
// & night-light textures, and builds transferable LOD geometry off the main thread.
import { decodeTile, TILE_SIZE, type CityId, type DecodedTile } from "./tileformat";
import { paintFacades, paintRipples } from "./facade-paint";
import { buildTileGeometry, type BuiltTileData, type SeaMaskInfo, type TileLod } from "./tile-geom";

export type WorkerMessageIn =
  | { kind: "facade"; id: number }
  | {
      kind: "sea";
      cityId: CityId;
      sea: SeaMaskInfo | null;
    }
  | {
      kind: "build";
      id: number;
      cityId: CityId;
      lod: TileLod;
      quality?: number;
      tileSize?: number;
      needCollision?: boolean;
      buffer: ArrayBuffer;
    };

export interface WorkerResponse {
  id: number;
  data: BuiltTileData;
  facade?: Uint8Array<ArrayBuffer>;
  ripples?: Uint8Array<ArrayBuffer>;
  collision?: DecodedTile;
}

const seaByCity = new Map<CityId, SeaMaskInfo | null>();

function collectTransferables(d: BuiltTileData): Transferable[] {
  const list: Transferable[] = [];
  if (d.buildings) list.push(d.buildings.pos.buffer, d.buildings.nrm.buffer, d.buildings.uv.buffer, d.buildings.color.buffer, d.buildings.info.buffer, d.buildings.edge.buffer);
  if (d.rails) list.push(d.rails.pos.buffer, d.rails.color.buffer);
  if (d.groundBitmap) list.push(d.groundBitmap);
  if (d.nightBitmap) list.push(d.nightBitmap);
  if (d.roads) list.push(d.roads.pos.buffer, d.roads.color.buffer);
  if (d.roadMarks) list.push(d.roadMarks.buffer);
  if (d.ground) list.push(d.ground.pos.buffer, d.ground.color.buffer);
  if (d.water) list.push(d.water.buffer);
  if (d.trees) list.push(d.trees.buffer);
  if (d.lights) list.push(d.lights.buffer);
  return list;
}

self.onmessage = (event: MessageEvent<WorkerMessageIn>) => {
  const msg = event.data;
  if (msg.kind === "facade") {
    const pixels = paintFacades();
    const ripples = paintRipples();
    (self as unknown as Worker).postMessage({ id: msg.id, facade: pixels, ripples }, [pixels.buffer, ripples.buffer]);
    return;
  }
  if (msg.kind === "sea") {
    seaByCity.set(msg.cityId, msg.sea);
    return;
  }
  const { id, cityId, lod, quality, tileSize, needCollision, buffer } = msg;
  const ts = tileSize ?? TILE_SIZE;
  const tile = decodeTile(buffer, ts);
  const data = buildTileGeometry(tile, cityId, lod, ts, seaByCity.get(cityId) ?? null, quality ?? 2);
  const transfer = collectTransferables(data);
  const resp: WorkerResponse = { id, data };
  if (needCollision) resp.collision = tile;
  (self as unknown as Worker).postMessage(resp, transfer);
};
