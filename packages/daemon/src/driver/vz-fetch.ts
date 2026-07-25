import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * On-demand fetch of the signed Apple VZ helper.
 *
 * The microVM artifacts (the `hotcell-vz` helper, guest kernel) don't ship in
 * the npm package — they're published as assets on the GitHub release that
 * matches the daemon's version, and fetched into `~/.hotcell/vz/` the first time
 * the applevz driver needs them. The helper is **ad-hoc code-signed** (no Apple
 * Developer account) and carries `com.apple.security.virtualization`, which
 * macOS honors for ad-hoc binaries. A file pulled over HTTP isn't
 * Gatekeeper-quarantined, but we strip `com.apple.quarantine` defensively so a
 * downloaded helper always runs.
 */

const RELEASE_BASE = "https://github.com/sinameraji/hotcell/releases/download";

/** This daemon's version — the release tag we fetch matching artifacts from. */
export function daemonVersion(): string {
  // .../packages/daemon/dist/driver/vz-fetch.js → package.json is two dirs up.
  const here = dirname(fileURLToPath(import.meta.url));
  const pkg = JSON.parse(readFileSync(join(here, "..", "..", "package.json"), "utf8")) as {
    version?: string;
  };
  return String(pkg.version ?? "");
}

/**
 * Ensure the VZ helper exists, downloading it from the matching release if not.
 * Returns the path to a runnable helper. Throws (with a network-friendly
 * message) if the download or checksum fails — callers surface that as the
 * driver being unavailable.
 */
export async function fetchVzHelper(destDir: string, version = daemonVersion()): Promise<string> {
  const dest = join(destDir, "hotcell-vz");
  if (existsSync(dest)) return dest;

  const base = `${RELEASE_BASE}/v${version}`;
  let bin: Buffer;
  try {
    bin = await download(`${base}/hotcell-vz`);
    await verifyChecksum(bin, `${base}/hotcell-vz.sha256`);
  } catch (err) {
    throw new Error(
      `couldn't download the Apple VZ helper for v${version} (${(err as Error).message})`,
    );
  }

  mkdirSync(destDir, { recursive: true });
  writeFileSync(dest, bin, { mode: 0o755 });
  chmodSync(dest, 0o755);
  await dequarantine(dest);
  return dest;
}

async function download(url: string): Promise<Buffer> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Verify against the published `.sha256` (best-effort: skip only if absent). */
async function verifyChecksum(bin: Buffer, shaUrl: string): Promise<void> {
  let expected: string;
  try {
    const res = await fetch(shaUrl, { redirect: "follow" });
    if (!res.ok) return; // no checksum published — skip
    expected = (await res.text()).trim().split(/\s+/)[0] ?? "";
  } catch {
    return;
  }
  if (!expected) return;
  const got = createHash("sha256").update(bin).digest("hex");
  if (got !== expected) throw new Error(`checksum mismatch (expected ${expected}, got ${got})`);
}

/** Strip the quarantine xattr (no-op if absent), so a downloaded helper runs. */
function dequarantine(path: string): Promise<void> {
  return new Promise((resolve) => {
    execFile("xattr", ["-d", "com.apple.quarantine", path], () => resolve());
  });
}
