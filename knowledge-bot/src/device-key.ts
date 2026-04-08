import { createHash } from "crypto";
import { hostname, userInfo } from "os";

/**
 * Generate a stable device key based on the machine's hostname and OS username.
 * This identifies the same person across app restarts on the same machine.
 */
export function getDeviceKey(): string {
  const host = hostname();
  const user = userInfo().username;
  const raw = `${user}@${host}`;
  return createHash("sha256").update(raw).digest("hex").slice(0, 16);
}
