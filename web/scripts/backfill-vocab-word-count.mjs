import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const write = process.argv.includes("--write");
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON ?? "{}");
if (!serviceAccount.project_id) {
  throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is missing or invalid");
}

const app = getApps()[0] ?? initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore(app);
const [setsSnap, wordsSnap] = await Promise.all([
  db.collection("vocabSets").get(),
  db.collection("vocabWords")
    .where("status", "==", "PUBLISHED")
    .select("setId", "deletedAtMillis")
    .get(),
]);

const counts = new Map();
for (const doc of wordsSnap.docs) {
  const data = doc.data();
  if (typeof data.deletedAtMillis === "number" && data.deletedAtMillis > 0) continue;
  if (typeof data.setId !== "number") continue;
  counts.set(data.setId, (counts.get(data.setId) ?? 0) + 1);
}

const changes = setsSnap.docs
  .map((doc) => ({
    ref: doc.ref,
    id: Number(doc.get("id") ?? doc.id),
    before: typeof doc.get("wordCount") === "number" ? doc.get("wordCount") : null,
  }))
  .map((item) => ({ ...item, after: counts.get(item.id) ?? 0 }))
  .filter((item) => item.before !== item.after);

console.log(`${setsSnap.size} sets, ${wordsSnap.size} published words, ${changes.length} updates`);
if (!write) {
  console.log("Dry run only. Add --write to apply the updates.");
  process.exit(0);
}

for (let index = 0; index < changes.length; index += 450) {
  const batch = db.batch();
  for (const item of changes.slice(index, index + 450)) {
    batch.set(item.ref, { wordCount: item.after }, { merge: true });
  }
  await batch.commit();
}
console.log(`Updated ${changes.length} vocabSets documents.`);
