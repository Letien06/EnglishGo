import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createJiti } from "jiti";
import { buildDrivePackage, sha256 } from "./lib/drive-package.mjs";
import { connectDrive } from "./lib/drive-connection.mjs";
import { buildReuseCandidates, validateReuseSourceFolder, validateReuseMetadata, verifyReuseChunk } from "./lib/drive-upload-reuse.mjs";

const [mode, input, ...options] = process.argv.slice(2);
if (!["prepare", "connect", "upload", "verify"].includes(mode) || !input) throw new Error("Use prepare/upload/verify <materials.json> or connect <desktop-oauth-client.json>.");
const reauthorize = mode === "connect" && options.length === 1 && options[0] === "--reauthorize";
const reuseManifestPath = mode === "upload" && options.length === 2 && options[0] === "--reuse-manifest" ? options[1] : undefined;
if (options.length && !reauthorize && !reuseManifestPath) throw new Error("Use connect --reauthorize or upload <materials.json> --reuse-manifest <manifest.json>.");
const root = fileURLToPath(new URL("../.seed-tmp/dauenglish-drive/", import.meta.url));
const credentialFile = path.join(root, "oauth.json");
const jiti = createJiti(import.meta.url, { fsCache: false });
const { createDriveClient, DriveError } = await jiti.import("../src/lib/storage/google-drive.ts");
const { driveManifestSchema } = await jiti.import("../src/lib/storage/drive-manifest.ts");
const saveJson = (file, value) => writeFile(file, JSON.stringify(value, null, 2), { encoding: "utf8", mode: 0o600 });
await mkdir(root, { recursive: true });

if (mode === "connect") {
  const connected = await connectDrive({ clientFile: input, credentialFile, createClient: createDriveClient, reauthorize });
  console.log(JSON.stringify({ connected: true, ...connected, credentialFile, credentialsPrinted: false }, null, 2));
} else {
  const json = await readFile(input, "utf8");
  const prepared = buildDrivePackage(json);
  const folder = path.join(root, prepared.manifest.snapshotSha256);
  await mkdir(path.join(folder, "chunks"), { recursive: true });
  for (const [digest, text] of prepared.files) await writeFile(path.join(folder, "chunks", `${digest}.txt`), text, "utf8");
  await saveJson(path.join(folder, "package.json"), { ...prepared.manifest, counts: prepared.counts, sourceFile: path.resolve(input), activated: false });
  if (mode === "prepare") {
    console.log(JSON.stringify({ prepared: true, ...prepared.counts, folder, firestoreWrites: 0, driveWrites: 0, next: "Connect your Drive account before uploading." }, null, 2));
  } else {
    let credentials;
    try { credentials = JSON.parse(await readFile(credentialFile, "utf8")); } catch { throw new Error("Drive is not connected. Run connect with a Desktop OAuth client JSON first. Do not send passwords or tokens in chat."); }
    const client = createDriveClient(credentials);
    const about = await (await client.request("/drive/v3/about?fields=user(emailAddress),storageQuota")).json();
    if (about.user?.emailAddress !== credentials.accountEmail) throw new Error("The Drive account does not match the connected storage owner.");
    const stateFile = path.join(folder, "upload-state.json");
    let state;
    try { state = JSON.parse(await readFile(stateFile, "utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; }
    state ??= { accountEmail: credentials.accountEmail, snapshotSha256: prepared.manifest.snapshotSha256, files: {}, complete: false };
    if (state.accountEmail !== credentials.accountEmail || state.snapshotSha256 !== prepared.manifest.snapshotSha256) throw new Error("Upload checkpoint belongs to another account or snapshot.");
    let reuseCandidates = new Map();
    if (reuseManifestPath) {
      const sourceManifest = driveManifestSchema.parse(JSON.parse(await readFile(reuseManifestPath, "utf8")));
      const sourceState = JSON.parse(await readFile(path.join(root, sourceManifest.snapshotSha256, "upload-state.json"), "utf8"));
      reuseCandidates = buildReuseCandidates(sourceManifest, sourceState, credentials.accountEmail, new Set(prepared.files.keys()));
    }
    const saveState = () => saveJson(stateFile, state);
    const properties = { app: "englishwebapp-dauenglish", snapshot: state.snapshotSha256 };
    async function newId() {
      const result = await (await client.request("/drive/v3/files/generateIds?count=1&space=drive&type=files")).json();
      if (!result.ids?.[0]) throw new Error("Google Drive did not reserve a file ID.");
      return result.ids[0];
    }
    async function metadata(fileId) {
      try { return await (await client.request(`/drive/v3/files/${fileId}?fields=id,mimeType,size,md5Checksum,trashed,parents,appProperties,ownedByMe`)).json(); }
      catch (error) { if (error instanceof DriveError && error.status === 404) return null; throw error; }
    }
    async function ensureFolder() {
      if (!state.folderId) {
        if (mode === "verify") throw new Error("No uploaded snapshot to verify.");
        state.folderId = await newId();
        await saveState();
      }
      const existing = await metadata(state.folderId);
      if (existing) {
        if (existing.trashed || existing.mimeType !== "application/vnd.google-apps.folder" || existing.appProperties?.snapshot !== state.snapshotSha256 || existing.appProperties?.app !== properties.app) throw new Error("Upload folder identity mismatch.");
      } else {
        if (mode === "verify") throw new Error("Snapshot folder is missing.");
        await client.request("/drive/v3/files?fields=id", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: state.folderId, name: `EnglishWebApp - Dau English ${prepared.manifest.syncedAt.slice(0, 10)} ${state.snapshotSha256.slice(0, 8)}`, mimeType: "application/vnd.google-apps.folder", appProperties: properties }) });
      }
    }
    const checkedSourceFolders = new Set();
    async function ensureText(text, name, mimeType, reuseCandidate) {
      const digest = sha256(text);
      if (!state.files[digest]) {
        if (mode === "verify") throw new Error(`Missing upload checkpoint: ${name}`);
        state.files[digest] = reuseCandidate
          ? { fileId: reuseCandidate.fileId, verified: false, reusedFrom: reuseCandidate.source }
          : { fileId: await newId(), verified: false };
        await saveState();
      }
      const record = state.files[digest];
      const existing = await metadata(record.fileId);
      const bytes = Buffer.byteLength(text);
      if (record.reusedFrom) {
        if (mimeType !== "text/plain") throw new Error("Archive and manifest files cannot be reused.");
        const candidate = { fileId: record.fileId, bytes, sha256: digest, source: record.reusedFrom };
        const sourceKey = `${candidate.source.folderId}:${candidate.source.snapshotSha256}`;
        if (!checkedSourceFolders.has(sourceKey)) {
          validateReuseSourceFolder(await metadata(candidate.source.folderId), candidate.source);
          checkedSourceFolders.add(sourceKey);
        }
        validateReuseMetadata(existing, candidate, text);
        if (!record.verified || mode === "verify") {
          await verifyReuseChunk(client, existing, candidate, text);
          record.verified = true;
          await saveState();
        }
        return record.fileId;
      }
      if (existing) {
        if (existing.trashed || existing.appProperties?.snapshot !== state.snapshotSha256 || existing.appProperties?.sha256 !== digest || !existing.parents?.includes(state.folderId) || Number(existing.size) !== bytes || existing.md5Checksum !== createHash("md5").update(text).digest("hex")) throw new Error(`Existing Drive file changed; refusing to overwrite it: ${name}`);
      } else {
        if (mode === "verify") throw new Error(`Uploaded Drive file is missing: ${name}`);
        const started = await client.request("/upload/drive/v3/files?uploadType=resumable&fields=id", {
          method: "POST", headers: { "Content-Type": "application/json", "X-Upload-Content-Type": mimeType, "X-Upload-Content-Length": String(bytes) },
          body: JSON.stringify({ id: record.fileId, name, parents: [state.folderId], mimeType, appProperties: { ...properties, sha256: digest } }),
        });
        const location = started.headers.get("location");
        if (!location) throw new Error("Drive did not provide a resumable upload URL.");
        await client.request(location, { method: "PUT", headers: { "Content-Type": mimeType }, body: text, signal: AbortSignal.timeout(120_000) });
      }
      if (!record.verified || !existing || mode === "verify") {
        const stored = await client.readText(record.fileId, bytes, 120_000);
        if (sha256(stored) !== digest) throw new Error(`Drive read-back checksum mismatch: ${name}`);
        record.verified = true;
        await saveState();
      }
      return record.fileId;
    }
    await ensureFolder();
    const archiveFileId = await ensureText(json, "materials.json", "application/json");
    console.log(JSON.stringify({ archiveVerified: true, archiveFileId, ...prepared.counts }));
    const fileIds = new Map();
    let uploaded = 0;
    for (const [digest, text] of prepared.files) {
      fileIds.set(digest, await ensureText(text, `${digest}.txt`, "text/plain", reuseCandidates.get(digest)));
      uploaded++;
      if (uploaded % 10 === 0 || uploaded === prepared.files.size) console.log(JSON.stringify({ verifiedChunks: uploaded, totalChunks: prepared.files.size }));
    }
    const manifest = driveManifestSchema.parse({ ...prepared.manifest, entries: Object.fromEntries(Object.entries(prepared.manifest.entries).map(([key, entry]) => [key, { ...entry, chunks: entry.chunks.map((chunk) => ({ ...chunk, fileId: fileIds.get(chunk.sha256) })) }])) });
    const manifestId = await ensureText(JSON.stringify(manifest), "manifest.json", "application/json");
    state.manifestId = manifestId;
    state.archiveFileId = archiveFileId;
    state.complete = true;
    await saveState();
    const environmentFile = path.join(folder, ".env.drive.production");
    const environment = { DAUTOEIC_CONTENT_STORAGE: "google-drive", GOOGLE_DRIVE_CLIENT_ID: credentials.clientId, GOOGLE_DRIVE_CLIENT_SECRET: credentials.clientSecret, GOOGLE_DRIVE_REFRESH_TOKEN: credentials.refreshToken, GOOGLE_DRIVE_MANIFEST_ID: manifestId };
    await writeFile(environmentFile, Object.entries(environment).map(([name, value]) => `${name}=${JSON.stringify(value)}`).join("\n") + "\n", { encoding: "utf8", mode: 0o600 });
    console.log(JSON.stringify({ complete: true, accountEmail: credentials.accountEmail, archiveFileId, manifestId, folderId: state.folderId, verifiedMaterials: Object.keys(manifest.entries).length, reusedChunks: [...prepared.files.keys()].filter((digest) => state.files[digest]?.reusedFrom).length, environmentFile, deployed: false, credentialsPrinted: false }, null, 2));
  }
}
