import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

function storagePath(key: string) {
  // User filenames never become filesystem paths. Also validate keys read from the DB.
  z.uuid().parse(key);
  // Runtime user files are not build assets and must not be traced into a bundle.
  return path.join(/* turbopackIgnore: true */ process.env.UPLOAD_DIR || path.join(process.cwd(), ".data", "uploads"), key);
}

export async function saveOriginal(key: string, buffer: Buffer) {
  const filename = storagePath(key);
  await mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
  await writeFile(filename, buffer, { flag: "wx", mode: 0o600 });
}

export function readOriginal(key: string) { return readFile(/* turbopackIgnore: true */ storagePath(key)); }
export function removeOriginal(key: string) { return unlink(storagePath(key)); }
