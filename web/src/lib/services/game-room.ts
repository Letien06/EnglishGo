import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { BadRequest, NotFound, Forbidden } from "@/lib/api/response";
import type { AppUser } from "@/types";
import { COLLECTIONS } from "@/lib/firestore/collections";

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
  batch.set(roomRef, roomData);

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
    if (room.status !== "waiting") {
      throw BadRequest("Game already started or finished");
    }
    
    const playersRef = roomRef.collection("players");
    const playersSnapshot = await transaction.get(playersRef);
    
    if (playersSnapshot.size >= room.maxPlayers) {
      throw BadRequest("Room is full");
    }
    
    const playerRef = playersRef.doc(user.uid);
    const playerDoc = await transaction.get(playerRef);
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
    
    const playersRef = roomRef.collection("players");
    const playersSnapshot = await transaction.get(playersRef);

    const countdownDuration = 5000;
    const now = Date.now();
    const countdownEndsAt = now + countdownDuration;

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
      status: "countdown",
      countdownEndsAt,
      words: shuffledWords,
      currentIndex: 0,
      roundStartedAt: countdownEndsAt,
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

    playersSnapshot.docs.forEach((doc) => {
      transaction.update(doc.ref, {
        status: "playing",
        score: 0,
        lives: 3,
        combo: 0,
        answers: [],
        updatedAt: Date.now(),
      });
    });

    return {
      countdownEndsAt,
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
  const room = await getRoom(code);
  const players = await getRoomPlayers(code);
  return { room, players };
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
      const QUESTION_DURATION_MS = 14 * 1000;
      const roundStartedAt =
        typeof room.roundStartedAt === "number" ? room.roundStartedAt : 0;
      if (roundStartedAt > 0 && now - roundStartedAt > QUESTION_DURATION_MS) {
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
    if (room.status !== "playing" && room.status !== "countdown") return { status: room.status };
    if (room.currentIndex !== questionIndex) {
      return {
        currentIndex: room.currentIndex,
        status: room.status,
        roundStartedAt: room.roundStartedAt || Date.now(),
      };
    }

    const playersSnapshot = await transaction.get(roomRef.collection("players"));
    const anyAlive = playersSnapshot.docs.some((d) => (d.data().lives ?? 3) > 0);

    let nextIndex = room.currentIndex + 1;
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

    playersSnapshot.docs.forEach((doc) => {
      transaction.update(doc.ref, {
        status: "waiting",
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


