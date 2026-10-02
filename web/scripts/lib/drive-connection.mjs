import { readFile, writeFile } from "node:fs/promises";
import { authorizeDrive } from "./drive-oauth.mjs";

export async function connectDrive({ clientFile, credentialFile, createClient, authorize = authorizeDrive, reauthorize = false }) {
  const config = JSON.parse(await readFile(clientFile, "utf8"));
  const client = config.installed;
  if (!client?.client_id || !client?.client_secret) throw new Error("Choose a Google OAuth Desktop app client JSON.");
  let credentials;
  if (!reauthorize) {
    let saved;
    try {
      saved = JSON.parse(await readFile(credentialFile, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (saved?.clientId === client.client_id && saved?.clientSecret === client.client_secret && saved?.refreshToken) credentials = saved;
  }
  if (!credentials) {
    credentials = await authorize(clientFile);
    await writeFile(credentialFile, JSON.stringify(credentials, null, 2), { encoding: "utf8", mode: 0o600 });
  }
  let about;
  try {
    about = await (await createClient(credentials).request("/drive/v3/about?fields=user(emailAddress),storageQuota")).json();
    if (!about.user?.emailAddress) throw new Error("Cannot verify the Drive account.");
  } catch (error) {
    const status = Number.isInteger(error.status) ? ` (${error.status})` : "";
    throw new Error(`Drive account verification failed${status}. OAuth credentials are saved privately. Check that Google Drive API is enabled in the OAuth client's project, then rerun the same connect command. If authorization was revoked, add --reauthorize.`);
  }
  if (credentials.accountEmail && credentials.accountEmail !== about.user.emailAddress) throw new Error("The Drive account does not match the previously verified storage owner.");
  await writeFile(credentialFile, JSON.stringify({ ...credentials, accountEmail: about.user.emailAddress }, null, 2), { encoding: "utf8", mode: 0o600 });
  return { accountEmail: about.user.emailAddress, storageQuota: about.storageQuota };
}
