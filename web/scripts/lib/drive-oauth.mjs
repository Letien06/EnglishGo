import { createServer } from "node:http";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";

async function sendCallbackResponse(response, status, message) {
  response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", Connection: "close" });
  await new Promise((resolve) => {
    response.once("close", resolve);
    response.end(message, resolve);
  });
}

export async function authorizeDrive(clientFile, {
  fetcher = fetch,
  onAuthorizationUrl = (url) => console.log(`Open this URL and choose the Google account that owns your Drive storage:\n${url}`),
  timeoutMs = 300_000,
} = {}) {
  const config = JSON.parse(await readFile(clientFile, "utf8"));
  const client = config.installed;
  if (!client?.client_id || !client?.client_secret) throw new Error("Choose a Google OAuth Desktop app client JSON, not a service account or Web app client.");
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  let redirectUri;
  let processing = false;
  let finish;
  let fail;
  const result = new Promise((resolve, reject) => { finish = resolve; fail = reject; });
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", redirectUri);
    const suppliedState = Buffer.from(url.searchParams.get("state") ?? "");
    const expectedState = Buffer.from(state);
    if (request.method !== "GET" || url.pathname !== "/oauth2/callback" || suppliedState.length !== expectedState.length || !timingSafeEqual(suppliedState, expectedState)) {
      response.writeHead(400).end("Invalid OAuth callback.");
      return;
    }
    if (processing) { response.writeHead(409).end("Authorization is already being processed."); return; }
    processing = true;
    try {
      const code = url.searchParams.get("code");
      if (!code || url.searchParams.has("error")) throw new Error("Drive authorization was not granted.");
      const tokenResponse = await fetcher("https://oauth2.googleapis.com/token", {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: client.client_id, client_secret: client.client_secret, code, code_verifier: verifier, redirect_uri: redirectUri, grant_type: "authorization_code" }),
        redirect: "error", signal: AbortSignal.timeout(20_000),
      });
      if (!tokenResponse.ok) throw new Error(`Google OAuth exchange failed (${tokenResponse.status}).`);
      const tokens = await tokenResponse.json();
      if (!tokens.refresh_token) throw new Error("Google did not issue offline access; reconnect and grant consent.");
      await sendCallbackResponse(response, 200, "Đã nhận quyền Google Drive. Hãy quay lại công cụ đồng bộ để xem kết quả kiểm tra kết nối. Không cần tải lại trang này.");
      finish({ clientId: client.client_id, clientSecret: client.client_secret, refreshToken: tokens.refresh_token });
    } catch (error) {
      await sendCallbackResponse(response, 400, "Không thể nhận quyền Drive. Vui lòng xem lỗi trong terminal và chạy lại lệnh connect, không tải lại địa chỉ xác thực cũ.");
      fail(error);
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  redirectUri = `http://127.0.0.1:${server.address().port}/oauth2/callback`;
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({ client_id: client.client_id, redirect_uri: redirectUri, response_type: "code", scope: "https://www.googleapis.com/auth/drive.file", access_type: "offline", prompt: "consent", state, code_challenge: challenge, code_challenge_method: "S256" }).toString();
  const timeout = setTimeout(() => fail(new Error("Drive authorization timed out. Run connect again to obtain a new authorization URL.")), timeoutMs);
  try {
    onAuthorizationUrl(url.toString());
    return await result;
  } finally {
    clearTimeout(timeout);
    server.close();
    server.closeIdleConnections();
  }
}
