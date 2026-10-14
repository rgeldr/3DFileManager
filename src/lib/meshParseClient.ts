import type { PackedMesh } from "../workers/meshParse.worker";

type WorkerReply =
  | { id: number; ok: true; meshes: PackedMesh[] }
  | { id: number; ok: true; png: ArrayBuffer }
  | { id: number; ok: false; error: string };

export interface ThumbColors {
  background: string;
  mesh: string;
  light: string;
}

let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<number, { resolve: (reply: WorkerReply & { ok: true }) => void; reject: (err: Error) => void }>();

function workerInstance(): Worker {
  if (!worker) {
    worker = new Worker(new URL("../workers/meshParse.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<WorkerReply>) => {
      const reply = event.data;
      const job = pending.get(reply.id);
      if (!job) return;
      pending.delete(reply.id);
      if (reply.ok) job.resolve(reply);
      else job.reject(new Error(reply.error));
    };
    worker.onerror = (event) => {
      for (const [, job] of pending) {
        job.reject(new Error(event.message || "Mesh parse worker failed."));
      }
      pending.clear();
    };
  }
  return worker;
}

function post(message: { id: number; [key: string]: unknown }, transfer: Transferable[]): Promise<WorkerReply & { ok: true }> {
  return new Promise((resolve, reject) => {
    pending.set(message.id, { resolve, reject });
    workerInstance().postMessage(message, transfer);
  });
}

export function parseMeshInWorker(ext: string, buffer: ArrayBuffer): Promise<PackedMesh[]> {
  const id = nextId++;
  return post({ kind: "parse", id, ext, buffer }, [buffer]).then((reply) => {
    if (!("meshes" in reply)) throw new Error("Mesh parse worker returned no geometry.");
    return reply.meshes;
  });
}

export function renderMeshInWorker(ext: string, buffer: ArrayBuffer, colors: ThumbColors): Promise<Uint8Array> {
  const id = nextId++;
  const message = { kind: "render" as const, id, ext, buffer, ...colors };
  return post(message, [buffer]).then((reply) => {
    if (!("png" in reply) || !reply.png) throw new Error("Thumbnail worker returned no image.");
    return new Uint8Array(reply.png);
  });
}
