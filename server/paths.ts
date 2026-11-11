import { existsSync } from "node:fs";
import { mkdir, rename } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

function pluginDataRoot(): string {
  const home = process.env.PASEO_HOME || path.join(homedir(), ".paseo");
  return path.join(home, "plugin-data");
}

/** `$PASEO_HOME/plugin-data/lerenn/mail`, outside the plugins folder Paseo manages. */
export function defaultDataDir(): string {
  return path.join(pluginDataRoot(), "lerenn", "mail");
}

/** The directory used before the move to `lerenn/mail`. */
export function legacyDataDir(): string {
  return path.join(pluginDataRoot(), "paseo-mail");
}

/** Move the legacy data directory to `dataDir` if only the legacy one exists. Returns whether it moved. */
export async function migrateLegacyDataDir(dataDir: string, legacyDir = legacyDataDir()): Promise<boolean> {
  if (existsSync(dataDir) || !existsSync(legacyDir)) return false;
  await mkdir(path.dirname(dataDir), { recursive: true });
  await rename(legacyDir, dataDir);
  console.error(`[paseo-mail] migrated data from ${legacyDir} to ${dataDir}`);
  return true;
}
