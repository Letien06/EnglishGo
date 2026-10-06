/** Legacy clients also have a Firestore listener. Retire their duplicate stream
 * without opening additional database listeners on every serverless reconnect. */
export async function GET() {
  return new Response("Use the room realtime subscription", {
    status: 410,
    headers: { "Cache-Control": "no-store" },
  });
}
