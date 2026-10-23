// Synthetic Linux fixtures only. Production verifyWhisper keeps its original pin.
import {createHash} from 'node:crypto';
import {createReadStream, constants} from 'node:fs';
import {access} from 'node:fs/promises';
import {WHISPER_SOURCE} from '../../scripts/phone-lab/whisper.mjs';
const models = Object.freeze({
  'large-v3-turbo-q5_0': '394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2',
  'small-q5_1': 'ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb',
});
export async function verifyFixtureModel(name, runtime) {
  if (!Object.hasOwn(models, name) || runtime?.sourceCommit !== WHISPER_SOURCE) throw Error('fixture_model_unverified');
  await access(runtime.binary, constants.X_OK);
  const sha256 = createHash('sha256'), sha1 = createHash('sha1');
  for await (const chunk of createReadStream(runtime.model)) { sha256.update(chunk); sha1.update(chunk); }
  const digest = sha256.digest('hex');
  if (digest !== models[name]) throw Error('fixture_model_unverified');
  return {modelName:name, modelSha256:digest, modelSha1:sha1.digest('hex')};
}
