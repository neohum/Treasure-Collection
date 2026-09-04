import type { CodexMeta, UnlockRecord } from "./types";

/**
 * IndexedDB 저장소. localStorage(약 5MB, 문자열만)와 달리 사진 Blob을 그대로 넣을 수 있고
 * 한도 걱정이 없다. 스토어 두 개: progress(유물별 해금 기록), meta(학생 라벨 등).
 * Step 5의 전송 큐도 이 DB에 얹는다.
 */
export const DB_NAME = "treasure-codex";
export const DB_VERSION = 1;
const STORE_PROGRESS = "progress";
const STORE_META = "meta";
const STORE_QUEUE = "queue";

type StoreName = typeof STORE_PROGRESS | typeof STORE_META | typeof STORE_QUEUE;

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexeddb request failed"));
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("indexeddb transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("indexeddb transaction aborted"));
  });
}

export class CodexStore {
  private constructor(private readonly db: IDBDatabase) {}

  static async open(factory: IDBFactory = indexedDB, name = DB_NAME): Promise<CodexStore> {
    const req = factory.open(name, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_PROGRESS)) db.createObjectStore(STORE_PROGRESS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(STORE_META)) db.createObjectStore(STORE_META);
      if (!db.objectStoreNames.contains(STORE_QUEUE)) db.createObjectStore(STORE_QUEUE, { keyPath: "queuedAt" });
    };
    return new CodexStore(await request(req));
  }

  close(): void {
    this.db.close();
  }

  private tx(store: StoreName, mode: IDBTransactionMode) {
    const tx = this.db.transaction(store, mode);
    return { tx, os: tx.objectStore(store) };
  }

  async getAllProgress(): Promise<UnlockRecord[]> {
    const { os } = this.tx(STORE_PROGRESS, "readonly");
    const rows = await request(os.getAll());
    return (rows as UnlockRecord[]).sort((a, b) => a.id.localeCompare(b.id));
  }

  async getProgress(id: string): Promise<UnlockRecord | undefined> {
    const { os } = this.tx(STORE_PROGRESS, "readonly");
    return (await request(os.get(id))) as UnlockRecord | undefined;
  }

  async putProgress(record: UnlockRecord): Promise<void> {
    const { tx, os } = this.tx(STORE_PROGRESS, "readwrite");
    os.put(record);
    await done(tx);
  }

  async deleteProgress(id: string): Promise<void> {
    const { tx, os } = this.tx(STORE_PROGRESS, "readwrite");
    os.delete(id);
    await done(tx);
  }

  async clearProgress(): Promise<void> {
    const { tx, os } = this.tx(STORE_PROGRESS, "readwrite");
    os.clear();
    await done(tx);
  }

  async getMeta(): Promise<CodexMeta> {
    const { os } = this.tx(STORE_META, "readonly");
    const value = (await request(os.get("meta"))) as CodexMeta | undefined;
    return value ?? { studentLabel: "" };
  }

  async setMeta(meta: CodexMeta): Promise<void> {
    const { tx, os } = this.tx(STORE_META, "readwrite");
    os.put(meta, "meta");
    await done(tx);
  }

  /** 전송 실패분 큐 (Step 5). queuedAt(ISO)이 키라 순서가 보존된다. */
  async enqueue(entry: { queuedAt: string; body: unknown }): Promise<void> {
    const { tx, os } = this.tx(STORE_QUEUE, "readwrite");
    os.put(entry);
    await done(tx);
  }

  async listQueue(): Promise<Array<{ queuedAt: string; body: unknown }>> {
    const { os } = this.tx(STORE_QUEUE, "readonly");
    return (await request(os.getAll())) as Array<{ queuedAt: string; body: unknown }>;
  }

  async dequeue(queuedAt: string): Promise<void> {
    const { tx, os } = this.tx(STORE_QUEUE, "readwrite");
    os.delete(queuedAt);
    await done(tx);
  }

  /** 초기화: 진도·라벨·큐 전부 삭제 */
  async wipe(): Promise<void> {
    const tx = this.db.transaction([STORE_PROGRESS, STORE_META, STORE_QUEUE], "readwrite");
    tx.objectStore(STORE_PROGRESS).clear();
    tx.objectStore(STORE_META).clear();
    tx.objectStore(STORE_QUEUE).clear();
    await done(tx);
  }
}
