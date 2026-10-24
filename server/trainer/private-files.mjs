import {
  lstatSync,
  realpathSync,
  readFileSync,
  writeFileSync,
  openSync,
  closeSync,
  fsyncSync,
  renameSync,
  existsSync,
  unlinkSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { fail } from "./limits.mjs";
export function privateDirectory(path) {
  const p = resolve(path),
    s = lstatSync(p);
  if (!s.isDirectory() || realpathSync(p) !== p || s.mode & 0o077)
    fail("trainer_permissions", 503);
  return p;
}
export function privateRead(file) {
  privateDirectory(dirname(file));
  const s = lstatSync(file);
  if (!s.isFile() || s.isSymbolicLink() || s.nlink !== 1 || s.mode & 0o077)
    fail("trainer_permissions", 503);
  return readFileSync(file);
}
export function syncDirectory(path) {
  const fd = openSync(path, "r");
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}
export function privateWrite(file, bytes) {
  privateDirectory(dirname(file));
  if (existsSync(file)) privateRead(file);
  const temp = file + "." + randomUUID() + ".tmp";
  let fd;
  try {
    fd = openSync(temp, "wx", 0o600);
    writeFileSync(fd, bytes);
    fsyncSync(fd);
    closeSync(fd);
    fd = null;
    renameSync(temp, file);
    syncDirectory(dirname(file));
  } finally {
    if (fd != null) closeSync(fd);
    if (existsSync(temp)) unlinkSync(temp);
  }
}
export function privateAppend(file, bytes) {
  if (existsSync(file)) privateRead(file);
  else privateDirectory(dirname(file));
  const fd = openSync(file, "a", 0o600);
  try {
    writeFileSync(fd, bytes);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  syncDirectory(dirname(file));
}
