import { randomBytes } from "node:crypto";
import { rename, writeFile } from "node:fs/promises";

/** Writes a file atomically: a temp file next to it, then a rename. */
export async function writeAtomic(file: string, content: string): Promise<void> {
  const temp = `${file}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(temp, content, "utf8");
  await rename(temp, file);
}

/** Runs async jobs one at a time, in order. A failed job does not block the next. */
export class Queue {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(job: () => Promise<T>): Promise<T> {
    const next = this.tail.then(job);
    this.tail = next.catch(() => undefined);
    return next;
  }

  /** Resolves once every job queued so far has settled. */
  idle(): Promise<void> {
    return this.tail.then(() => undefined);
  }
}
