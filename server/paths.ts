import { homedir } from "node:os";
import path from "node:path";

/** `$PASEO_HOME/plugin-data/paseo-mail`, outside the plugins folder Paseo manages. */
export function defaultDataDir(): string {
  const home = process.env.PASEO_HOME || path.join(homedir(), ".paseo");
  return path.join(home, "plugin-data", "paseo-mail");
}
