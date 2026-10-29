import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface Checkpoint {
  /** Fingerprint of the planned batches; a different plan starts fresh. */
  planId: string;
  done: number[];
}

export async function loadCheckpoint(path: string, planId: string): Promise<Checkpoint> {
  try {
    const cp = JSON.parse(await readFile(path, "utf8")) as Checkpoint;
    if (cp.planId === planId && Array.isArray(cp.done)) return cp;
  } catch {
    /* missing or corrupt: start fresh */
  }
  return { planId, done: [] };
}

export async function saveCheckpoint(path: string, cp: Checkpoint): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(cp), "utf8");
  await rename(tmp, path);
}
