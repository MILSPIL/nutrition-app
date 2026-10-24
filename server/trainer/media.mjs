import {
  lstatSync,
  realpathSync,
  openSync,
  closeSync,
  writeFileSync,
  readFileSync,
  fsyncSync,
  unlinkSync,
  readdirSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { MAX_IMAGE } from "../../workers/meal-parser/src/schema.js";
import { LIMITS, fail } from "./limits.mjs";
const signature = (b, type) =>
  type === "image/png"
    ? b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : type === "image/jpeg"
      ? b[0] === 255 && b[1] === 216 && b[2] === 255
      : type === "image/webp"
        ? b.subarray(0, 4).toString() === "RIFF" &&
          b.subarray(8, 12).toString() === "WEBP"
        : false;
export function validateImages(images) {
  if (!Array.isArray(images) || images.length > 2) fail("invalid_image");
  return images.map((image) => {
    if (
      !image ||
      Object.keys(image).some((k) => !["type", "data", "itemId"].includes(k)) ||
      (image.itemId!==undefined&&!/^[a-zA-Z0-9-]{8,80}$/.test(image.itemId)) ||
      !["image/jpeg", "image/png", "image/webp"].includes(image.type) ||
      typeof image.data !== "string" ||
      image.data.length > Math.ceil(MAX_IMAGE / 3) * 4 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(image.data)
    )
      fail("invalid_image");
    const bytes = Buffer.from(image.data, "base64");
    if (
      !bytes.length ||
      bytes.length > MAX_IMAGE ||
      !signature(bytes, image.type)
    )
      fail("invalid_image");
    return bytes;
  });
}
export function createMediaStore(directory, { hash, now = Date.now }) {
  const dir = lstatSync(directory);
  if (
    !dir.isDirectory() ||
    realpathSync(directory) !== directory ||
    dir.mode & 0o077
  )
    fail("trainer_permissions", 503);
  const paths = (ref) => {
    if (!/^[a-f0-9]{64}$/.test(ref)) fail("invalid_image");
    return [join(directory, ref + ".bin"), join(directory, ref + ".json")];
  };
  const read = (file) => {
    const stat = lstatSync(file);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.nlink !== 1 ||
      stat.mode & 0o077
    )
      fail("media_unavailable", 503);
    return readFileSync(file);
  };
  const write = (file, bytes) => {
    const fd = openSync(file, "wx", 0o600);
    try {
      writeFileSync(fd, bytes);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  };
  const remove = (ref) => {
    for (const file of paths(ref)) {
      if (existsSync(file)) {
        const stat = lstatSync(file);
        if (!stat.isFile() || stat.isSymbolicLink())
          fail("media_unavailable", 503);
        unlinkSync(file);
      }
    }
  };
  return {
    describe(owner, turnId, images) {
      const buffers = validateImages(images);
      return buffers.map((bytes, index) => ({
        tempRef: hash({ owner, turnId, index }),
        hmac: hash({ image: bytes.toString("base64") }),
        mime: images[index].type,
        ...(images[index].itemId?{itemId:images[index].itemId}:{}),
        size: bytes.length,
        expiresAt: now() + LIMITS.mediaTtlMs,
      }));
    },
    stage(descriptors, images) {
      const bytes = validateImages(images);
      try {
        for (let n = 0; n < descriptors.length; n++) {
          const d = descriptors[n],
            [file, meta] = paths(d.tempRef);
          write(meta, JSON.stringify(d));
          write(file, bytes[n]);
        }
        const fd = openSync(directory, "r");
        try {
          fsyncSync(fd);
        } finally {
          closeSync(fd);
        }
      } catch (e) {
        for (const d of descriptors) remove(d.tempRef);
        throw e;
      }
    },
    load(descriptors) {
      return descriptors.map((d) => {
        const [file, meta] = paths(d.tempRef),
          stored = JSON.parse(read(meta));
        if (stored.expiresAt <= now() || stored.hmac !== d.hmac)
          fail("media_reattach_required", 409);
        const bytes = read(file);
        if (
          bytes.length !== d.size ||
          hash({ image: bytes.toString("base64") }) !== d.hmac
        )
          fail("media_unavailable", 503);
        return { type: d.mime, data: bytes.toString("base64") };
      });
    },
    remove(descriptors) {
      for (const d of descriptors) remove(d.tempRef);
    },
    sweep() {
      let removed = 0,
        faults = 0;
      for (const name of readdirSync(directory)) {
        if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
        try {
          const meta = JSON.parse(read(join(directory, name)));
          if (!Number.isSafeInteger(meta.expiresAt))
            fail("media_unavailable", 503);
          if (meta.expiresAt <= now()) {
            remove(name.slice(0, -5));
            removed++;
          }
        } catch {
          faults++;
        }
      }
      return { removed, faults };
    },
  };
}
