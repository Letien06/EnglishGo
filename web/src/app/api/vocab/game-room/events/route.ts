import { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firestore/collections";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code")?.trim().toUpperCase();
  if (!code || code.length !== 6) {
    return new Response("Invalid room code", { status: 400 });
  }

  const roomRef = adminDb.collection(COLLECTIONS.gameRooms).doc(code);
  const playersRef = roomRef.collection("players");

  let isClosed = false;
  let unsubRoom: (() => void) | null = null;
  let unsubPlayers: (() => void) | null = null;
  let keepAliveTimer: NodeJS.Timeout | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const send = (data: unknown) => {
        if (isClosed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // Stream might have closed
        }
      };

      // Periodic ping comment to keep connection alive through proxies
      keepAliveTimer = setInterval(() => {
        if (isClosed) return;
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {}
      }, 15000);

      // Listen to room document changes in real time via Firebase Admin SDK
      unsubRoom = roomRef.onSnapshot(
        (snap) => {
          if (snap.exists) {
            send({ type: "room", room: snap.data() });
          }
        },
        () => {},
      );

      // Listen to players collection changes in real time via Firebase Admin SDK
      unsubPlayers = playersRef.onSnapshot(
        (snap) => {
          const players = snap.docs.map((d) => d.data());
          send({ type: "players", players });
        },
        () => {},
      );
    },
    cancel() {
      isClosed = true;
      if (keepAliveTimer) clearInterval(keepAliveTimer);
      if (unsubRoom) unsubRoom();
      if (unsubPlayers) unsubPlayers();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
