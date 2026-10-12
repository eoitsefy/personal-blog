import { readFile, realpath, stat } from "node:fs/promises";
import { resolve, relative, isAbsolute } from "node:path";
import { createHash } from "node:crypto";
import { validNaturalRuntime, type NaturalRuntimeManifest } from "./natural-motion";

// Explicit version -> fixed directory mapping. Neither query strings nor manifest
// entries may select arbitrary filesystem paths or another project directory.
const candidates = {
  "natural-cloud-wave-candidate-v1": "wave-atlas-candidate-v1",
  "natural-cloud-wave-hand-v3": "wave-atlas-candidate-v2",
  "natural-cloud-wave-hand-v3-matte-v6b": "wave-atlas-candidate-v4",
} as const;
export const DEFAULT_MOTION_CANDIDATE = "natural-cloud-wave-hand-v3-matte-v6b";
const fileName = /^(?:anchor|idle-\d+|wave-\d+)\.webp$/;
const digest = (data: Buffer) => createHash("sha256").update(data).digest("hex");
function assertDevelopment() {
  if (process.env.NODE_ENV !== "development") throw new Error("Motion candidate preview is unavailable");
}
export function allowedMotionCandidate(version: string) {
  return Object.hasOwn(candidates, version);
}
async function candidateRoot(version: string) {
  assertDevelopment();
  if (!allowedMotionCandidate(version)) throw new Error("Unknown motion candidate");
  const base = await realpath(resolve(process.cwd(), "docs/assistant/cloud-motion-suite-v1"));
  const root = await realpath(resolve(base, candidates[version as keyof typeof candidates]));
  const rel = relative(base, root);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) throw new Error("Candidate directory escapes allowed root");
  return root;
}
async function readContained(root: string, path: string, maxBytes: number) {
  const file = await realpath(resolve(root, path)), rel = relative(root, file);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) throw new Error("Candidate file escapes allowed root");
  const info = await stat(file);
  if (!info.isFile() || info.size > maxBytes) throw new Error("Invalid candidate file size");
  return readFile(file);
}
function nameFromSource(src: string, version: string) {
  const prefix = `/assistant/${version}/`;
  if (!src.startsWith(prefix) || !fileName.test(src.slice(prefix.length))) throw new Error("Candidate filename is not allowed");
  return src.slice(prefix.length);
}
async function rawCandidate(version: string) {
  const root = await candidateRoot(version);
  const value: unknown = JSON.parse((await readContained(root, "manifest.json", 2 * 1024 * 1024)).toString("utf8"));
  if (!validNaturalRuntime(value) || value.version !== version) throw new Error("Invalid candidate pixel/timing structure");
  nameFromSource(value.still.src, version);
  Object.values(value.assets).forEach(asset => nameFromSource(asset.src, version));
  return { root, value };
}
export async function readMotionCandidate(version = DEFAULT_MOTION_CANDIDATE): Promise<NaturalRuntimeManifest> {
  const { value } = await rawCandidate(version);
  const source = (src: string) => `/api/dev/assistant-motion/${version}/${nameFromSource(src, version)}`;
  // Explicit projection strips review claims instead of changing PENDING to PASS.
  return { version: value.version, width: value.width, height: value.height, anchorRgbaSha256: value.anchorRgbaSha256,
    still: { ...value.still, src: source(value.still.src) }, clips: value.clips,
    assets: Object.fromEntries(Object.entries(value.assets).map(([key, asset]) => [key, { ...asset, src: source(asset.src) }])) };
}
export async function readMotionCandidateAsset(version: string, name: string) {
  assertDevelopment();
  if (!fileName.test(name)) throw new Error("Candidate filename is not allowed");
  const { root, value } = await rawCandidate(version);
  const declarations = [value.still, ...Object.values(value.assets)];
  const declared = declarations.find(asset => nameFromSource(asset.src, version) === name);
  if (!declared) throw new Error("Candidate file is not in the manifest whitelist");
  const bytes = await readContained(root, `public/assistant/${version}/${name}`, 32 * 1024 * 1024);
  if (digest(bytes) !== declared.sha256) throw new Error("Candidate file hash changed");
  return bytes;
}
