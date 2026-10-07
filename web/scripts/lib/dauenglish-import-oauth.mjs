import { createServer } from "node:http";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const SOURCE = "https://odlnhfaygiotcyehuysw.supabase.co";

async function completeCallback(response, status, message) {
  response.writeHead(status);
  await new Promise((resolve) => { response.once("close", resolve); response.end(message, resolve); });
}

export function createImportAuthorization({ sourceUrl = SOURCE, port = 5173, state = randomBytes(24).toString("base64url"), verifier = randomBytes(48).toString("base64url") } = {}) {
  if (sourceUrl !== SOURCE || !Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid import OAuth configuration.");
  const redirectUri = `http://localhost:${port}/`;
  const authorizationUrl = new URL("/auth/v1/authorize", sourceUrl);
  authorizationUrl.search = new URLSearchParams({ provider: "google", redirect_to: `${redirectUri}?import_state=${state}`, code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "s256" }).toString();
  return { authorizationUrl: authorizationUrl.toString(), redirectUri, state, verifier };
}

export function isImportCallback(url, state) {
  const supplied = Buffer.from(url.searchParams.get("import_state") ?? "");
  const expected = Buffer.from(state);
  return url.pathname === "/" && supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function importCodeFromReturnedUrl(value) {
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error("Paste the DauEnglish URL shown after Google sign-in."); }
  if (url.origin !== "https://dauenglish.com" || url.pathname !== "/" || url.searchParams.has("error") || !url.searchParams.get("code")) throw new Error("The sign-in result is not a DauEnglish authorization URL.");
  return url.searchParams.get("code");
}

export async function exchangeImportCode({ code, verifier, publicKey, expectedEmail, fetcher = fetch }) {
  if (!code || !verifier || !publicKey?.startsWith("sb_publishable_") || !expectedEmail) throw new Error("Import OAuth configuration is missing.");
  const response = await fetcher(`${SOURCE}/auth/v1/token?grant_type=pkce`, {
    method: "POST", headers: { apikey: publicKey, "Content-Type": "application/json" },
    body: JSON.stringify({ auth_code: code, code_verifier: verifier }),
    redirect: "error", cache: "no-store", signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`DauEnglish sign-in exchange failed (HTTP ${response.status}).`);
  const tokens = await response.json();
  if (typeof tokens.access_token !== "string" || !tokens.access_token) throw new Error("DauEnglish did not issue an import session.");
  const account = await fetcher(`${SOURCE}/auth/v1/user`, {
    headers: { apikey: publicKey, Authorization: `Bearer ${tokens.access_token}` },
    redirect: "error", cache: "no-store", signal: AbortSignal.timeout(20_000),
  });
  if (!account.ok) throw new Error(`DauEnglish account verification failed (HTTP ${account.status}).`);
  const user = await account.json();
  if (user.email?.trim().toLowerCase() !== expectedEmail.trim().toLowerCase()) throw new Error("Choose the authorized DauEnglish account before importing.");
  return tokens.access_token;
}

export async function authorizeDauEnglishImport({ publicKey, expectedEmail, port = 5173, timeoutMs = 300_000, fetcher = fetch, onAuthorizationUrl = (url) => console.log(`Import sign-in URL: ${url}`) }) {
  const flow = createImportAuthorization({ port });
  let finish;
  let fail;
  let processing = false;
  const result = new Promise((resolve, reject) => { finish = resolve; fail = reject; });
  const server = createServer(async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Content-Type", "text/plain; charset=utf-8");
    let url;
    try { url = new URL(request.url ?? "/", flow.redirectUri); }
    catch { response.writeHead(400).end("Invalid import callback."); return; }
    const localHost = [`localhost:${port}`, `127.0.0.1:${port}`].includes(request.headers.host);
    if (request.method !== "GET" || !localHost || !isImportCallback(url, flow.state)) {
      response.writeHead(400).end("Invalid import callback.");
      return;
    }
    if (processing) { response.writeHead(409).end("Sign-in is already being verified."); return; }
    processing = true;
    try {
      if (url.searchParams.has("error")) throw new Error("DauEnglish sign-in was not granted.");
      const token = await exchangeImportCode({ code: url.searchParams.get("code"), verifier: flow.verifier, publicKey, expectedEmail, fetcher });
      await completeCallback(response, 200, "Đã xác thực tài khoản DauEnglish. Công cụ đang nhập dữ liệu được cho phép; hãy quay lại Codex xem kết quả.");
      finish(token);
    } catch (error) {
      await completeCallback(response, 400, "Không thể xác thực phiên nhập. Hãy xem thông báo trong Codex, không tải lại callback cũ.");
      fail(error);
    }
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
  const timeout = setTimeout(() => fail(new Error("Import sign-in timed out. An authorized export or supported source login is required.")), timeoutMs);
  const submitReturnedUrl = async (value) => {
    const code = importCodeFromReturnedUrl(value);
    if (processing) throw new Error("Sign-in is already being verified.");
    processing = true;
    try { finish(await exchangeImportCode({ code, verifier: flow.verifier, publicKey, expectedEmail, fetcher })); }
    catch (error) { fail(error); }
  };
  try { onAuthorizationUrl(flow.authorizationUrl, submitReturnedUrl); return await result; }
  finally { clearTimeout(timeout); server.close(); server.closeIdleConnections(); }
}
