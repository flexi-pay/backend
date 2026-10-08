// Tiny durable key-value store for name registrations, persisted as a JSON file.
// Writes are atomic (temp file + rename) and serialized, which is plenty for a
// single-instance service. Swap for Postgres/Redis when you need to scale out.
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface NameRecord {
  name: string;
  address: string;
  /** Optional memo senders should attach (e.g. for exchange/custodial accounts). */
  memo?: string;
  memoType?: "text" | "id" | "hash";
  createdAt: string;
  updatedAt: string;
}

export interface NameStore {
  get(name: string): NameRecord | undefined;
  byAddress(address: string): NameRecord | undefined;
  put(rec: NameRecord): Promise<void>;
  delete(name: string): Promise<boolean>;
  count(): number;
}

export class MemoryStore implements NameStore {
  protected names = new Map<string, NameRecord>();
  protected addresses = new Map<string, string>();

  get(name: string) {
    return this.names.get(name);
  }
  byAddress(address: string) {
    const n = this.addresses.get(address);
    return n ? this.names.get(n) : undefined;
  }
  async put(rec: NameRecord) {
    // one name per address: drop the address's previous name
    const prev = this.addresses.get(rec.address);
    if (prev && prev !== rec.name) this.names.delete(prev);
    this.names.set(rec.name, rec);
    this.addresses.set(rec.address, rec.name);
    await this.persist();
  }
  async delete(name: string) {
    const rec = this.names.get(name);
    if (!rec) return false;
    this.names.delete(name);
    this.addresses.delete(rec.address);
    await this.persist();
    return true;
  }
  count() {
    return this.names.size;
  }
  protected async persist(): Promise<void> {}
}

export class FileStore extends MemoryStore {
  private queue: Promise<void> = Promise.resolve();
  private constructor(private file: string) {
    super();
  }

  static async open(file: string): Promise<FileStore> {
    const s = new FileStore(file);
    try {
      const data = JSON.parse(await readFile(file, "utf8")) as { names: NameRecord[] };
      for (const r of data.names ?? []) {
        s.names.set(r.name, r);
        s.addresses.set(r.address, r.name);
      }
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    return s;
  }

  protected override persist(): Promise<void> {
    const snapshot = JSON.stringify({ version: 1, names: [...this.names.values()] }, null, 2);
    this.queue = this.queue.then(async () => {
      await mkdir(dirname(this.file), { recursive: true });
      const tmp = `${this.file}.${process.pid}.tmp`;
      await writeFile(tmp, snapshot);
      await rename(tmp, this.file);
    });
    return this.queue;
  }
}
