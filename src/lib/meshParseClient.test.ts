import { beforeAll, describe, expect, it, vi } from "vitest";

type Posted = { data: Record<string, unknown>; transfer?: Transferable[] };

class MockWorker {
  static created: MockWorker[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: { message?: string }) => void) | null = null;
  messages: Posted[] = [];

  constructor(_url: URL, _options?: { type?: string }) {
    MockWorker.created.push(this);
  }

  postMessage(data: Record<string, unknown>, transfer?: Transferable[]) {
    this.messages.push({ data, transfer });
  }
}

beforeAll(() => {
  vi.stubGlobal("Worker", MockWorker);
});

import { parseMeshInWorker, post, renderMeshInWorker, workerInstance } from "./meshParseClient";

function worker(): MockWorker {
  return MockWorker.created[0];
}

describe("mesh parse client", () => {
  it("workerInstance posts parse and render messages and resolves the reply", async () => {
    expect(workerInstance()).toBe(workerInstance());
    expect(MockWorker.created).toHaveLength(1);

    const buffer = new Uint8Array([1, 2, 3, 4]).buffer;
    const parsed = parseMeshInWorker("stl", buffer);
    const parseMessage = worker().messages.at(-1);
    expect(parseMessage?.data).toMatchObject({ kind: "parse", ext: "stl" });
    expect(parseMessage?.data.buffer).toBe(buffer);
    expect(parseMessage?.transfer).toEqual([buffer]);
    const meshes = [{ position: new Float32Array([0, 0, 0]).buffer }];
    worker().onmessage?.({ data: { id: parseMessage?.data.id, ok: true, meshes } } as MessageEvent);
    await expect(parsed).resolves.toEqual(meshes);

    const colors = { background: "#111111", mesh: "#222222", light: "#ffffff" };
    const pngBuffer = new Uint8Array([9, 8, 7]).buffer;
    const rendered = renderMeshInWorker("obj", buffer, colors);
    const renderMessage = worker().messages.at(-1);
    expect(renderMessage?.data).toMatchObject({ kind: "render", ext: "obj", ...colors });
    worker().onmessage?.({ data: { id: renderMessage?.data.id, ok: true, png: pngBuffer } } as MessageEvent);
    expect(Array.from(await rendered)).toEqual([9, 8, 7]);
  });

  it("post rejects a worker error and a lost worker", async () => {
    const missing = parseMeshInWorker("stl", new ArrayBuffer(2));
    const message = worker().messages.at(-1)?.data;
    worker().onmessage?.({ data: { id: message?.id, ok: true, png: new ArrayBuffer(1) } } as MessageEvent);
    await expect(missing).rejects.toThrow("Mesh parse worker returned no geometry.");

    const failed = post({ id: 50, kind: "parse" }, []);
    expect(worker().messages.at(-1)?.data.id).toBe(50);
    worker().onmessage?.({ data: { id: 50, ok: false, error: "bad mesh" } } as MessageEvent);
    await expect(failed).rejects.toThrow("bad mesh");

    const dropped = post({ id: 51, kind: "render" }, []);
    worker().onerror?.({ message: "" });
    await expect(dropped).rejects.toThrow("Mesh parse worker failed.");
  });
});
