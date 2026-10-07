import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import { authorizeDauEnglishImport } from "./lib/dauenglish-import-oauth.mjs";

const [baseFile, vocabOutput, practiceOutput, ...options] = process.argv.slice(2);
const stageScripts = {
  "--practice": "sync-dauenglish-authorized-practice.mjs", "--vocab": "sync-dauenglish-vocab.mjs",
  "--dictation": "sync-dauenglish-authorized-dictation.mjs", "--grammar": "sync-dauenglish-authorized-grammar.mjs",
};
const onlyMode = Object.hasOwn(stageScripts, practiceOutput ?? "") ? practiceOutput : null;
if (!baseFile || !vocabOutput || !practiceOutput || options.some((option) => option !== "--metadata-only") || (options.length && !["--dictation", "--grammar"].includes(onlyMode))) throw new Error("Use sync-dauenglish-authorized.mjs <base.json> <new-vocab.json> <new-complete.json>, or <base.json> <new.json> --practice/--vocab/--dictation/--grammar [--metadata-only].");
const outputs = onlyMode ? [baseFile, vocabOutput] : [baseFile, vocabOutput, practiceOutput];
if (new Set(outputs.map((file) => path.resolve(file))).size !== outputs.length) throw new Error("Keep the base snapshot and new outputs separate.");
const scriptFolder = fileURLToPath(new URL("./", import.meta.url));
const terminal = createInterface({ input: process.stdin, output: process.stdout, historySize: 0 });
let token;
try {
  token = await authorizeDauEnglishImport({ publicKey: process.env.DAUTOEIC_ANON_KEY, expectedEmail: "letiendk06@gmail.com", onAuthorizationUrl: (url, submit) => {
    console.log(`Import sign-in URL: ${url}`);
    console.log("If sign-in returns to DauEnglish with a code in its URL, paste that returned URL here. Do not paste a password or an access/refresh token.");
    terminal.on("line", (value) => { if (value.trim()) void submit(value).catch((error) => console.error(error.message)); });
  } });
} finally { terminal.close(); }
console.log("Authorized account verified. Importing the selected content; credentials remain in process memory.");
async function run(script, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(scriptFolder, script), ...args], { stdio: "inherit", env: { ...process.env, DAUENGLISH_IMPORT_ACCESS_TOKEN: token } });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${script} failed (${code}). The existing production snapshot is unchanged.`)));
  });
}
if (onlyMode) {
  await run(stageScripts[onlyMode], [baseFile, vocabOutput, "--authorized", ...options]);
} else {
  await run("sync-dauenglish-vocab.mjs", [baseFile, vocabOutput, "--authorized"]);
  await run("sync-dauenglish-authorized-practice.mjs", [vocabOutput, practiceOutput, "--authorized"]);
}
