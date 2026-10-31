import test from "node:test";
import assert from "node:assert/strict";
import { validateImages } from "./media.mjs";
import { LIMITS } from "./limits.mjs";

// Distinct tiny JPEGs: the signature is checked, the rest is synthetic.
const jpeg = n => ({ type: "image/jpeg", data: Buffer.from([255, 216, 255, 224, n]).toString("base64") });
const photos = n => Array.from({ length: n }, (_, i) => jpeg(i));

test("1.9.10 K8: the trainer path has one shared limit of ten photos", () => {
  assert.equal(LIMITS.images, 10);
});
test("1.9.10 K8: ten photos pass validation and the eleventh is refused", () => {
  assert.equal(validateImages(photos(10)).length, 10);
  assert.throws(() => validateImages(photos(11)), /invalid_image/);
});
