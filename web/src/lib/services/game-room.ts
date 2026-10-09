import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { BadRequest, NotFound, Forbidden } from "@/lib/api/response";
import type { AppUser } from "@/types";
import { COLLECTIONS } from "@/lib/firestore/collections";
import { arcadeCountdownMs, WORD_BLAST_QUESTION_MS, wordBlastQuestionMs } from "@/lib/word-blast-timing";
import { randomUUID } from "node:crypto";
import { advanceRacePlayer, createRacePlayer, type RaceEvent, type RacePlayer, type RaceRoom } from "@/lib/vocab-race";

function summary(player: Partial<RacePlayer> & { uid: string }) {
  const { uid, displayName = "Unknown Player", photoURL = null, isHost = false, score = 0, lives = 3, combo = 0, status = "waiting", revision = 0, correctCount = 0, maxCombo = 0, runId = "" } = player;
  return { uid, displayName, photoURL, isHost, score, lives, combo, status, revision, correctCount, maxCombo, runId };
}
export const generateRoomCode = () => {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

export const createRoom = async (
  user: AppUser,
  vocabSetId: number,
  gameMode: "blast" | "rain",
  words: Array<{ id: number; word: string; meaning: string; audioUrl?: string; audioUsUrl?: string; audioUkUrl?: string }>
) => {
  let code = generateRoomCode();
  const roomsRef = adminDb.collection(COLLECTIONS.gameRooms);

  let isUnique = false;
  for (let i = 0; i < 5; i++) {
    const doc = await roomsRef.doc(code).get();
    if (!doc.exists) {
      isUnique = true;
      break;
    }
    code = generateRoomCode();
  }
  
  if (!isUnique) {
    throw BadRequest("Could not generate unique room code");
  }

  const roomData = {
    raceVersion: 2,
    code,
    hostId: user.uid,
    gameMode,
    vocabSetId,
    status: "waiting",
    words,
    currentIndex: 0,
    maxPlayers: 5,
    wordCount: words.length,
    createdAt: FieldValue.serverTimestamp(),
  };

  const batch = adminDb.batch();
  const roomRef = roomsRef.doc(code);
  batch.set(roomRef, { ...roomData, playerSummaries: [summary({ uid: user.uid, displayName: user.displayName || "Unknown Player", photoURL: user.avatarUrl || null, isHost: true, score: 0, lives: 3, combo: 0, status: "waiting", revision: 0, correctCount: 0, maxCombo: 0, runId: "" })] });

  const playerRef = roomRef.collection("players").doc(user.uid);
  const playerData = {
    uid: user.uid,
    displayName: user.displayName || "Unknown Player",
    photoURL: user.avatarUrl || null,
    isHost: true,
    score: 0,
    lives: 3,
    combo: 0,
    status: "waiting",
    joinedAt: FieldValue.serverTimestamp(),
    // Monotonic version marker so clients can drop stale realtime updates (BUG-7b)
    updatedAt: Date.now(),
  };
  batch.set(playerRef, playerData);
  
  await batch.commit();

  return { code, roomUrl: `/vocab/game-room/${code}` };
};

export const joinRoom = async (user: AppUser, code: string) => {
  const roomRef = adminDb.collection(COLLECTIONS.gameRooms).doc(code);
  
  return await adminDb.runTransaction(async (transaction) => {
    const roomDoc = await transaction.get(roomRef);
    if (!roomDoc.exists) {
      throw NotFound("Room not found");
    }
    
    const room = roomDoc.data()!;
    const playersRef = roomRef.collection("players");
    const playerRef = playersRef.doc(user.uid);
    const playerDoc = await transaction.get(playerRef);
    if (playerDoc.exists) return { gameMode: room.gameMode, vocabSetId: room.vocabSetId };
    if (room.status !== "waiting") {
      throw BadRequest("Game already started or finished");
    }
    
    const playersSnapshot = await transaction.get(playersRef);
    
    if (playersSnapshot.size >= room.maxPlayers) {
      throw BadRequest("Room is full");
    }
    
    if (!playerDoc.exists) {
      transaction.set(playerRef, {
        uid: user.uid,
        displayName: user.displayName || "Unknown Player",
        photoURL: user.avatarUrl || null,
        isHost: false,
        score: 0,
        lives: 3,
        combo: 0,
        status: "waiting",
        joinedAt: FieldValue.serverTimestamp(),
        updatedAt: Date.now(),
      });
      if (Array.isArray(room.playerSummaries)) transaction.update(roomRef, {
        playerSummaries: [...room.playerSummaries, summary({ uid: user.uid, displayName: user.displayName || "Unknown Player", photoURL: user.avatarUrl || null, isHost: false, score: 0, lives: 3, combo: 0, status: "waiting", revision: 0, correctCount: 0, maxCombo: 0, runId: room.runId ?? "" })],
      });
    }

    return { gameMode: room.gameMode, vocabSetId: room.vocabSetId };
  });
};

export const leaveRoom = async (user: AppUser, code: string) => {
  const roomRef = adminDb.collection(COLLECTIONS.gameRooms).doc(code);
  
  await adminDb.runTransaction(async (transaction) => {
    const roomDoc = await transaction.get(roomRef);
    if (!roomDoc.exists) {
      throw NotFound("Room not found");
    }
    
    const playerRef = roomRef.collection("players").doc(user.uid);
    const playerDoc = await transaction.get(playerRef);
    if (!playerDoc.exists) {
      return;
    }
    
    const playersRef = roomRef.collection("players");
    const playersSnapshot = await transaction.get(playersRef);
    
    transaction.delete(playerRef);
    
    const room = roomDoc.data()!;
    const survivors = playersSnapshot.docs.filter(doc => doc.id !== user.uid);
    if (Array.isArray(room.playerSummaries) && survivors.length > 0) {
      const hostId = room.hostId === user.uid ? survivors[0].id : room.hostId;
      transaction.update(roomRef, { playerSummaries: room.playerSummaries.filter((item: { uid: string }) => item.uid !== user.uid).map((item: { uid: string }) => ({ ...item, isHost: item.uid === hostId })) });
    }
    if (room.raceVersion === 2 && room.status !== "waiting" && survivors.length > 0 && survivors.every(doc => ["finished", "eliminated"].includes(doc.data().status))) {
      transaction.update(roomRef, { status: "finished", finishedAt: Date.now() });
    }
    if (room.hostId === user.uid) {
      const remainingPlayers = playersSnapshot.docs.filter(doc => doc.id !== user.uid);
      
      if (remainingPlayers.length > 0) {
        const newHost = remainingPlayers[0];
        transaction.update(roomRef, { hostId: newHost.id });
        transaction.update(newHost.ref, { isHost: true });
      } else {
        transaction.delete(roomRef);
      }
    }
  });
};

export const startGame = async (user: AppUser, code: string) => {
  const roomRef = adminDb.collection(COLLECTIONS.gameRooms).doc(code);
  
  return await adminDb.runTransaction(async (transaction) => {
    const roomDoc = await transaction.get(roomRef);
    if (!roomDoc.exists) {
      throw NotFound("Room not found");
    }
    
    const room = roomDoc.data()!;
    if (room.hostId !== user.uid) {
      throw Forbidden("Only the host can start the game");
    }
    if (room.status !== "waiting") {
      throw BadRequest("Game already started");
    }
    if (!Array.isArray(room.words) || room.words.length === 0) {
      throw BadRequest("Add vocabulary words before starting the race");
    }
    
    const playersRef = roomRef.collection("players");
    const playersSnapshot = await transaction.get(playersRef);

    const countdownDuration = arcadeCountdownMs(room.gameMode === "rain" ? "rain" : "blast");
    const now = Date.now();
    const countdownEndsAt = now + countdownDuration;
    const runId = randomUUID();
    const matchEndsAt = countdownEndsAt + 120000;

    const shuffledWords = [...(room.words || [])];
    for (let i = shuffledWords.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledWords[i], shuffledWords[j]] = [shuffledWords[j], shuffledWords[i]];
    }

    const isRain = room.gameMode === "rain";
    const initialDrops: Array<{ index: number; lane: number; spawnAt: number }> = [];
    let nextIndex = 0;

    if (isRain && shuffledWords.length > 0) {
      // First drop in Lane 0 at countdown end
      initialDrops.push({ index: 0, lane: 0, spawnAt: countdownEndsAt });
      nextIndex = 1;
      // Second drop in Lane 1 3.8s later (if at least 2 words exist)
      if (shuffledWords.length > 1) {
        initialDrops.push({ index: 1, lane: 1, spawnAt: countdownEndsAt + 3800 });
        nextIndex = 2;
      }
    }

    transaction.update(roomRef, {
      raceVersion: 2,
      runId,
      matchEndsAt,
      rainDropDurationMs: 13000,
      status: "countdown",
      countdownEndsAt,
      words: shuffledWords,
      currentIndex: 0,
      roundStartedAt: countdownEndsAt,
      ...(!isRain ? { questionDurationMs: WORD_BLAST_QUESTION_MS } : {}),
      questionAnswers: {},
      lastWinner: FieldValue.delete(),
      updatedAt: Date.now(),
      ...(isRain
        ? {
            activeDrops: initialDrops,
            nextIndex,
          }
        : {}),
    });

    const raceRoom = { ...room, raceVersion: 2, runId, status: "countdown", countdownEndsAt, matchEndsAt, words: shuffledWords, questionDurationMs: WORD_BLAST_QUESTION_MS, serverNow: now, updatedAt: now } as RaceRoom;
    const players = playersSnapshot.docs.map(doc => ({ ...doc.data(), ...createRacePlayer({ ...doc.data(), uid: doc.id }, raceRoom), updatedAt: now }));
    playersSnapshot.docs.forEach((doc, index) => transaction.update(doc.ref, { ...players[index], finishedAt: FieldValue.delete(), answers: [] }));
    if (Array.isArray(room.playerSummaries)) transaction.update(roomRef, { playerSummaries: players.map(summary) });

    return {
      raceVersion: 2,
      runId,
      matchEndsAt,
      serverNow: now,
      room: raceRoom,
      players,
      countdownEndsAt,
      ...(!isRain ? { questionDurationMs: WORD_BLAST_QUESTION_MS } : {}),
      roundStartedAt: countdownEndsAt,
      words: shuffledWords,
      activeDrops: isRain ? initialDrops : [],
      nextIndex,
    };
  });
};

export const getRoom = async (code: string) => {
  const doc = await adminDb.collection(COLLECTIONS.gameRooms).doc(code).get();
  if (!doc.exists) {
    throw NotFound("Room not found");
  }
  return doc.data();
};

export const getRoomPlayers = async (code: string) => {
  const snapshot = await adminDb.collection(COLLECTIONS.gameRooms).doc(code).collection("players").get();
  return snapshot.docs.map(doc => doc.data());
};

export const getRoomWithPlayers = async (code: string) => {
  let room = await getRoom(code);
  const now = Date.now();
  if (room?.raceVersion === 2 && room.status !== "waiting" && room.status !== "finished" && now >= room.matchEndsAt + 15000) {
    const roomRef = adminDb.collection(COLLECTIONS.gameRooms).doc(code);
    await adminDb.runTransaction(async transaction => {
      const snapshot = await transaction.get(roomRef);
      const current = snapshot.data();
      if (current && current.runId === room?.runId && current.status !== "finished" && now >= current.matchEndsAt + 15000) {
        const players = await transaction.get(roomRef.collection("players"));
        players.docs.forEach(doc => {
          if (!["finished", "eliminated"].includes(doc.data().status)) transaction.update(doc.ref, { status: "finished", finishedAt: current.matchEndsAt, updatedAt: now });
        });
        transaction.update(roomRef, { status: "finished", finishedAt: current.matchEndsAt,
          ...(Array.isArray(current.playerSummaries) ? { playerSummaries: current.playerSummaries.map((item: { status: string }) => ["finished", "eliminated"].includes(item.status) ? item : { ...item, status: "finished" }) } : {}),
        });
      }
    });
    room = await getRoom(code);
  }
  const players = await getRoomPlayers(code);
  return { room, players, serverNow: now };
};

/** A batch changes only its authenticated player's progression. */
export const submitRaceEvents = async (user: AppUser, code: string, runId: string, events: RaceEvent[]) => {
  if (!events.length || events.length > 20) throw BadRequest("Invalid event batch");
  const roomRef = adminDb.collection(COLLECTIONS.gameRooms).doc(code);
  const playerRef = roomRef.collection("players").doc(user.uid);
  return adminDb.runTransaction(async transaction => {
    const roomDoc = await transaction.get(roomRef);
    const playerDoc = await transaction.get(playerRef);
    if (!roomDoc.exists) throw NotFound("Room not found");
    if (!playerDoc.exists) throw Forbidden("You are not a player in this room");
    const room = roomDoc.data()!;
    let player = playerDoc.data()! as RacePlayer;
    const now = Date.now();
    const response = (skipped = false, reason?: string) => ({ player, revision: player.revision, runId: room.runId, status: room.status, serverNow: now, ...(skipped ? { skipped, reason } : {}) });
    if (room.raceVersion !== 2 || room.runId !== runId || player.runId !== runId) return response(true, "Race changed");
    if (room.status === "waiting" || room.status === "finished") return response(true, "Race is not active");
    if (now < room.countdownEndsAt) return response(true, "Countdown is active");
    if (now >= room.matchEndsAt + 15000) return response(true, "Race deadline passed");
    const original = player;
    for (const event of events) {
      if (!Number.isSafeInteger(event.seq) || event.seq < 1 || !Number.isSafeInteger(event.questionIndex) || event.questionIndex < 0 || !Number.isFinite(event.at)) throw BadRequest("Invalid race event");
      if (event.seq <= player.revision) continue;
      if (event.seq !== player.revision + 1) throw BadRequest("Race event sequence gap");
      if (!["answer", "timeout", "finish"].includes(event.type) || (event.type !== "finish" && event.questionIndex >= room.words.length)) throw BadRequest("Invalid question index");
      if (event.at < room.countdownEndsAt || event.at > now + 2000 || event.at > room.matchEndsAt) throw BadRequest("Invalid event time");
      if (event.type === "finish" && (event.at < room.matchEndsAt || now < room.matchEndsAt)) throw BadRequest("Race has not ended");
      try {
        player = advanceRacePlayer(player, event, room.words, room.gameMode, room.questionDurationMs ?? WORD_BLAST_QUESTION_MS);
      } catch (error) {
        if (error instanceof RangeError) throw BadRequest(error.message);
        throw error;
      }
    }
    const terminal = ["finished", "eliminated"].includes(player.status);
    let finished = false;
    if (terminal && !["finished", "eliminated"].includes(original.status)) {
      const players = await transaction.get(roomRef.collection("players"));
      finished = players.docs.every(doc => doc.id === user.uid || ["finished", "eliminated"].includes(doc.data().status));
    }
    if (player !== original) {
      transaction.update(playerRef, { ...player, updatedAt: now });
      if (Array.isArray(room.playerSummaries)) transaction.update(roomRef, { playerSummaries: room.playerSummaries.map((item: RacePlayer) => item.uid === user.uid ? summary(player) : item) });
    }
    if (finished) {
      transaction.update(roomRef, { status: "finished", finishedAt: now });
      room.status = "finished";
    }
    return response(player.revision === original.revision, player.revision === original.revision ? "Already processed" : undefined);
  });
};

export const submitAnswer = async (
  user: AppUser,
  code: string,
  questionIndex: number,
  correct: boolean,
  selected: string,
) => {
  const roomRef = adminDb.collection(COLLECTIONS.gameRooms).doc(code);

  return await adminDb.runTransaction(async (transaction) => {
    // 1. ALL READS AT START OF TRANSACTION
    const roomDoc = await transaction.get(roomRef);
    if (!roomDoc.exists) throw NotFound("Room not found");

    const playerRef = roomRef.collection("players").doc(user.uid);
    const playerDoc = await transaction.get(playerRef);
    if (!playerDoc.exists) throw NotFound("Player not in room");

    const playersSnapshot = await transaction.get(roomRef.collection("players"));

    // 2. IN-MEMORY VALIDATION
    const room = roomDoc.data()!;
    const player = playerDoc.data()!;
    if (room.raceVersion === 2) return { skipped: true, reason: "Use race events", player, runId: room.runId, revision: player.revision, status: room.status, serverNow: Date.now() };
    const now = Date.now();

    let roomStatus = room.status;
    if (room.status === "countdown") {
      if (now < (room.countdownEndsAt || 0)) {
        return { skipped: true, reason: "Countdown in progress" };
      }
      roomStatus = "playing";
    } else if (room.status !== "playing") {
      throw BadRequest("Game is not active");
    }

    const isRain = room.gameMode === "rain";
    const activeDrops: Array<{ index: number; lane: number; spawnAt: number }> = room.activeDrops || [];

    if (isRain) {
      const dropExists = activeDrops.some((d) => d.index === questionIndex);
      if (!dropExists && room.currentIndex !== questionIndex) {
        return { skipped: true, reason: "Drop already resolved or expired" };
      }
    } else {
      if (room.currentIndex !== questionIndex) {
        return { skipped: true, reason: "Question already advanced" };
      }
      // BUG-10: enforce the per-question time limit on the server (Word Blast only).
      // QUESTION_DURATION previously existed only on the client, so a slow request
      // could still score after the timer hit 0s. Rain mode has per-drop lifetimes
      // instead, so it is intentionally excluded here.
      const QUESTION_DURATION_MS = wordBlastQuestionMs(room.questionDurationMs);
      const roundStartedAt =
        typeof room.roundStartedAt === "number" ? room.roundStartedAt : 0;
      if (roundStartedAt > 0 && now - roundStartedAt >= QUESTION_DURATION_MS) {
        return { skipped: true, reason: "Time expired" };
      }
    }

    if (player.lives <= 0) {
      const anyAlive = playersSnapshot.docs.some((d) => (d.data().lives ?? 3) > 0);
      if (!anyAlive && roomStatus === "playing") {
        transaction.update(roomRef, { status: "finished" });
        return { skipped: true, isEliminated: true, allEliminated: true, status: "finished" };
      }
      return { skipped: true, isEliminated: true, reason: "Player has no lives left" };
    }

    const questionAnswers: Record<string, { uid: string; correct: boolean; time: number }> =
      room.questionAnswers || {};

    // Only skip if this user already answered correctly for this question
    if (questionAnswers[user.uid]?.correct) {
      return { skipped: true, reason: "Already answered this question correctly" };
    }

    // Determine points and lives
    let points = 0;
    let newCombo = 0;
    const currentLives = typeof player.lives === "number" ? player.lives : 3;
    let newLives = currentLives;

    if (correct) {
      newCombo = (player.combo || 0) + 1;
      points = 15 + Math.min(newCombo * 2, 10);
    } else {
      // In rain mode, typing mismatch does NOT deduct lives (only ground crashes do)
      if (!isRain) {
        newLives = Math.max(0, currentLives - 1);
        newCombo = 0;
      }
    }

    questionAnswers[user.uid] = { uid: user.uid, correct, time: Date.now() };

    // ALL WRITES START HERE:
    transaction.update(playerRef, {
      score: (player.score || 0) + points,
      lives: newLives,
      combo: newCombo,
      status: newLives <= 0 ? "eliminated" : "playing",
      updatedAt: Date.now(),
      answers: FieldValue.arrayUnion({
        questionIndex,
        correct,
        selected,
        points,
        answeredAt: Date.now(),
      }),
    });

    // 1. If correct in Word Blast mode: IMMEDIATELY advance to next question
    if (correct && !isRain) {
      let nextIndex = room.currentIndex;
      let newStatus = roomStatus === "countdown" ? "playing" : roomStatus;

      if (room.currentIndex + 1 >= room.words.length) {
        newStatus = "finished";
      } else {
        nextIndex = room.currentIndex + 1;
      }

      const winnerInfo = {
        uid: user.uid,
        displayName: player.displayName || user.displayName || "Người chơi",
        word: selected,
        points,
        questionIndex: room.currentIndex,
        at: Date.now(),
      };

      transaction.update(roomRef, {
        currentIndex: nextIndex,
        status: newStatus,
        roundStartedAt: Date.now(),
        questionAnswers: {},
        lastWinner: winnerInfo,
        updatedAt: Date.now(),
      });

      return {
        points,
        lives: newLives,
        combo: newCombo,
        advanced: true,
        nextIndex,
        status: newStatus,
        lastWinner: winnerInfo,
      };
    }

    // 2. If correct in Rain mode: Remove the caught drop and spawn next drop into that lane
    if (correct && isRain) {
      const clearedDrop = activeDrops.find((d) => d.index === questionIndex);
      const remainingDrops = activeDrops.filter((d) => d.index !== questionIndex);
      const clearedLane = clearedDrop ? clearedDrop.lane : 0;
      let nextIndex = typeof room.nextIndex === "number" ? room.nextIndex : (room.currentIndex || 0) + 1;
      let newStatus = roomStatus === "countdown" ? "playing" : roomStatus;

      // Spawn next word into the cleared lane if words remain
      if (nextIndex < room.words.length) {
        remainingDrops.push({
          index: nextIndex,
          lane: clearedLane,
          spawnAt: Date.now(),
        });
        nextIndex += 1;
      } else if (remainingDrops.length === 0) {
        newStatus = "finished";
      }

      const winnerInfo = {
        uid: user.uid,
        displayName: player.displayName || user.displayName || "Người chơi",
        word: selected,
        points,
        questionIndex,
        at: Date.now(),
      };

      transaction.update(roomRef, {
        activeDrops: remainingDrops,
        nextIndex,
        status: newStatus,
        lastWinner: winnerInfo,
        updatedAt: Date.now(),
      });

      return {
        points,
        lives: newLives,
        combo: newCombo,
        advanced: true,
        activeDrops: remainingDrops,
        nextIndex,
        status: newStatus,
        lastWinner: winnerInfo,
      };
    }

    // 3. If incorrect in Word Blast: Check if ALL players are out of hearts
    if (!isRain) {
      const anyAlive = playersSnapshot.docs.some((d) => {
        if (d.id === user.uid) return newLives > 0;
        return (d.data().lives ?? 3) > 0;
      });

      if (!anyAlive) {
        transaction.update(roomRef, {
          status: "finished",
          updatedAt: Date.now(),
        });
        return {
          points: 0,
          lives: newLives,
          combo: 0,
          allEliminated: true,
          status: "finished",
        };
      }

      transaction.update(roomRef, {
        status: roomStatus,
        questionAnswers,
        updatedAt: Date.now(),
      });
    }

    return {
      points: 0,
      lives: newLives,
      combo: 0,
      advanced: false,
      nextIndex: room.currentIndex,
      status: roomStatus,
    };
  });
};

export const advanceQuestion = async (user: AppUser, code: string, questionIndex: number) => {
  const roomRef = adminDb.collection(COLLECTIONS.gameRooms).doc(code);

  return await adminDb.runTransaction(async (transaction) => {
    const roomDoc = await transaction.get(roomRef);
    if (!roomDoc.exists) throw NotFound("Room not found");

    const room = roomDoc.data()!;
    if (room.raceVersion === 2) {
      const playerDoc = await transaction.get(roomRef.collection("players").doc(user.uid));
      if (!playerDoc.exists) throw Forbidden("You are not a player in this room");
      return { skipped: true, reason: "Use race events", player: playerDoc.data(), runId: room.runId, status: room.status, serverNow: Date.now() };
    }
    if (room.status !== "playing" && room.status !== "countdown") return { status: room.status };
    if (room.currentIndex !== questionIndex) {
      return {
        currentIndex: room.currentIndex,
        status: room.status,
        roundStartedAt: room.roundStartedAt || Date.now(),
      };
    }

    const playersSnapshot = await transaction.get(roomRef.collection("players"));
    if (room.gameMode !== "rain") {
      const player = playersSnapshot.docs.find((doc) => doc.id === user.uid || doc.data().uid === user.uid);
      if (!player) throw Forbidden("You are not a player in this room");
      const now = Date.now();
      const startedAt = typeof room.roundStartedAt === "number" ? room.roundStartedAt : room.countdownEndsAt;
      const activePlayers = playersSnapshot.docs.filter((doc) => (doc.data().lives ?? 3) > 0);
      const answers = room.questionAnswers ?? {};
      const allAnswered = activePlayers.length > 0 && activePlayers.every((doc) => answers[doc.id ?? doc.data().uid]);
      if (typeof startedAt === "number" && (now < startedAt || (!allAnswered && now < startedAt + wordBlastQuestionMs(room.questionDurationMs)))) {
        return { currentIndex: room.currentIndex, status: room.status, roundStartedAt: startedAt };
      }
    }
    const anyAlive = playersSnapshot.docs.some((d) => (d.data().lives ?? 3) > 0);

    const nextIndex = room.currentIndex + 1;
    let newStatus = room.status === "countdown" ? "playing" : room.status;

    if (!anyAlive || nextIndex >= room.words.length) {
      newStatus = "finished";
    }

    // BUG-8: when the game finishes, keep the last valid question index instead of
    // writing an out-of-bounds index (e.g. 80/80 words) — otherwise clients render
    // an empty "Câu 81/80" with no answers and get stuck.
    const safeIndex = newStatus === "finished" ? room.currentIndex : nextIndex;

    const roundStartedAt = Date.now();
    transaction.update(roomRef, {
      currentIndex: safeIndex,
      status: newStatus,
      roundStartedAt,
      questionAnswers: {},
      lastWinner: FieldValue.delete(),
      updatedAt: Date.now(),
    });

    return { currentIndex: safeIndex, status: newStatus, roundStartedAt };
  });
};

export const expireRainDrop = async (
  user: AppUser,
  code: string,
  dropIndex: number
) => {
  const roomRef = adminDb.collection(COLLECTIONS.gameRooms).doc(code);

  return await adminDb.runTransaction(async (transaction) => {
    const roomDoc = await transaction.get(roomRef);
    if (!roomDoc.exists) throw NotFound("Room not found");

    const room = roomDoc.data()!;
    if (room.raceVersion === 2) {
      const playerDoc = await transaction.get(roomRef.collection("players").doc(user.uid));
      if (!playerDoc.exists) throw Forbidden("You are not a player in this room");
      return { skipped: true, reason: "Use race events", player: playerDoc.data(), runId: room.runId, status: room.status, serverNow: Date.now() };
    }
    if (room.status !== "playing" && room.status !== "countdown") {
      return { status: room.status };
    }

    const activeDrops: Array<{ index: number; lane: number; spawnAt: number }> = room.activeDrops || [];
    const targetDrop = activeDrops.find((d) => d.index === dropIndex);
    if (!targetDrop) {
      return { skipped: true, reason: "Drop already resolved" };
    }

    const playersSnapshot = await transaction.get(roomRef.collection("players"));
    const remainingDrops = activeDrops.filter((d) => d.index !== dropIndex);
    let nextIndex = typeof room.nextIndex === "number" ? room.nextIndex : (room.currentIndex || 0) + 1;
    let newStatus = room.status === "countdown" ? "playing" : room.status;

    // Deduct 1 life from all alive players for the crashed word
    let anyAlive = false;
    playersSnapshot.docs.forEach((doc) => {
      const p = doc.data();
      const currentLives = typeof p.lives === "number" ? p.lives : 3;
      const updatedLives = Math.max(0, currentLives - 1);
      if (updatedLives > 0) anyAlive = true;
      transaction.update(doc.ref, {
        lives: updatedLives,
        combo: 0,
        status: updatedLives <= 0 ? "eliminated" : "playing",
        updatedAt: Date.now(),
      });
    });

    if (!anyAlive) {
      newStatus = "finished";
    } else if (nextIndex < room.words.length) {
      remainingDrops.push({
        index: nextIndex,
        lane: targetDrop.lane,
        spawnAt: Date.now(),
      });
      nextIndex += 1;
    } else if (remainingDrops.length === 0) {
      newStatus = "finished";
    }

    const droppedWord = room.words?.[dropIndex] || null;

    transaction.update(roomRef, {
      activeDrops: remainingDrops,
      nextIndex,
      status: newStatus,
      droppedWord,
      updatedAt: Date.now(),
    });

    return {
      activeDrops: remainingDrops,
      nextIndex,
      status: newStatus,
      droppedWord,
    };
  });
};

export const resetRoomToLobby = async (user: AppUser, code: string) => {
  const roomRef = adminDb.collection(COLLECTIONS.gameRooms).doc(code);

  return await adminDb.runTransaction(async (transaction) => {
    const roomDoc = await transaction.get(roomRef);
    if (!roomDoc.exists) throw NotFound("Room not found");

    const playerRef = roomRef.collection("players").doc(user.uid);
    const playerDoc = await transaction.get(playerRef);
    if (!playerDoc.exists) throw NotFound("Player not in room");

    const playersSnapshot = await transaction.get(roomRef.collection("players"));
    const room = roomDoc.data()!;
    if (room.hostId !== user.uid) throw Forbidden("Only the host can reset the room");
    // A refreshed host must be able to migrate an old shared-round room.
    if (room.raceVersion === 2 && room.status !== "waiting" && room.status !== "finished") throw BadRequest("Wait for the race to finish");

    if (room.status === "waiting") {
      return { status: "waiting", code };
    }

    const shuffledWords = [...(room.words || [])];
    for (let i = shuffledWords.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledWords[i], shuffledWords[j]] = [shuffledWords[j], shuffledWords[i]];
    }

    transaction.update(roomRef, {
      status: "waiting",
      runId: FieldValue.delete(),
      matchEndsAt: FieldValue.delete(),
      finishedAt: FieldValue.delete(),
      currentIndex: 0,
      roundStartedAt: null,
      countdownEndsAt: null,
      activeDrops: FieldValue.delete(),
      nextIndex: FieldValue.delete(),
      droppedWord: FieldValue.delete(),
      questionAnswers: {},
      lastWinner: FieldValue.delete(),
      words: shuffledWords,
      updatedAt: Date.now(),
    });
    if (Array.isArray(room.playerSummaries)) transaction.update(roomRef, {
      playerSummaries: playersSnapshot.docs.map((doc) => summary({ ...doc.data(), uid: doc.id, status: "waiting", runId: "", score: 0, lives: 3, combo: 0, revision: 0, correctCount: 0, maxCombo: 0 })),
    });

    playersSnapshot.docs.forEach((doc) => {
      transaction.update(doc.ref, {
        status: "waiting",
        runId: FieldValue.delete(),
        revision: 0,
        currentIndex: 0,
        correctCount: 0,
        maxCombo: 0,
        disabledAnswers: [],
        activeDrops: [],
        nextIndex: 0,
        finishedAt: FieldValue.delete(),
        score: 0,
        lives: 3,
        combo: 0,
        answers: [],
        updatedAt: Date.now(),
      });
    });

    return { status: "waiting", code };
  });
};


