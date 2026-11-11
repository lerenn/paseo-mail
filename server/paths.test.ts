import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { migrateLegacyDataDir } from "./paths";

describe("migrateLegacyDataDir", () => {
  it("moves the legacy directory when the new one is absent", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const root = await mkdtemp(path.join(tmpdir(), "mail-paths-"));
    const legacy = path.join(root, "paseo-mail");
    const next = path.join(root, "lerenn", "mail");
    await mkdir(legacy);
    await writeFile(path.join(legacy, "registry.json"), "{}");
    expect(await migrateLegacyDataDir(next, legacy)).toBe(true);
    expect(await readFile(path.join(next, "registry.json"), "utf8")).toBe("{}");
    expect(existsSync(legacy)).toBe(false);
  });

  it("leaves both alone when the new one exists or there is no legacy", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "mail-paths-"));
    const legacy = path.join(root, "paseo-mail");
    const next = path.join(root, "lerenn", "mail");
    expect(await migrateLegacyDataDir(next, legacy)).toBe(false);
    await mkdir(legacy);
    await mkdir(next, { recursive: true });
    expect(await migrateLegacyDataDir(next, legacy)).toBe(false);
    expect(existsSync(legacy)).toBe(true);
  });
});
