import type { PackedMesh } from "../workers/meshParse.worker";

type WorkerReply =
  | { id: number; ok: true; meshes: PackedMesh[] }
  | { id: number; ok: false; error: string };

let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<number, { resolve: (meshes: PackedMesh[]) => void; reject: (err: Error) => void }>();

function workerInstance(): Worker {
  if (!worker) {
    worker = new Worker(new URL("../workers/meshParse.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<WorkerReply>) => {
      const reply = event.data;
      const job = pending.get(reply.id);
      if (!job) return;
      pending.delete(reply.id);
      if (reply.ok) job.resolve(reply.meshes);
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

export function parseMeshInWorker(ext: string, buffer: ArrayBuffer): Promise<PackedMesh[]> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    workerInstance().postMessage({ id, ext, buffer }, [buffer]);
  });
}
