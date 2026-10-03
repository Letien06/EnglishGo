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
  };
  batch.set(playerRef, playerData);
  
  await batch.commit();

  return { code, roomUrl: `/vocab/game-room/${code}` };
};

export const joinRoom = async (user: AppUser, code: string) => {
  const roomRef = adminDb.collection(COLLECTIONS.gameRooms).doc(code);
  
  await adminDb.runTransaction(async (transaction) => {
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
    if (playerDoc.exists) {
      return;
    }
    
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
    });
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
    
    transaction.delete(playerRef);
    
    const room = roomDoc.data()!;
    if (room.hostId === user.uid) {
      const playersRef = roomRef.collection("players");
      const playersSnapshot = await transaction.get(playersRef);
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
  
  await adminDb.runTransaction(async (transaction) => {
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
    
    if (playersSnapshot.size < 2) {
      throw BadRequest("Need at least 2 players to start");
    }
    
    const shuffledWords = [...room.words];
    for (let i = shuffledWords.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledWords[i], shuffledWords[j]] = [shuffledWords[j], shuffledWords[i]];
    }
    
    transaction.update(roomRef, {
      status: "playing",
      words: shuffledWords,
      currentIndex: 0,
      roundStartedAt: Date.now(),
      questionAnswers: {},
    });
    
    playersSnapshot.docs.forEach(doc => {
      transaction.update(doc.ref, {
        status: "playing",
        score: 0,
        lives: 3,
        combo: 0,
        answers: [],
      });
    });
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
    const roomDoc = await transaction.get(roomRef);
    if (!roomDoc.exists) throw NotFound("Room not found");

    const room = roomDoc.data()!;
    if (room.status !== "playing") throw BadRequest("Game is not active");
    if (room.currentIndex !== questionIndex) {
      return { skipped: true, reason: "Question already advanced" };
    }

    const playerRef = roomRef.collection("players").doc(user.uid);
    const playerDoc = await transaction.get(playerRef);
    if (!playerDoc.exists) throw NotFound("Player not in room");

    const player = playerDoc.data()!;
    if (player.lives <= 0) return { skipped: true, reason: "Player has no lives left" };

    const questionAnswers: Record<string, { uid: string; correct: boolean; time: number }> =
      room.questionAnswers || {};

    if (questionAnswers[user.uid]) {
      return { skipped: true, reason: "Already answered this question" };
    }

    // Determine points
    let points = 0;
    let newCombo = 0;
    let newLives = player.lives;

    if (correct) {
      const correctCount = Object.values(questionAnswers).filter((a) => a.correct).length;
      points = correctCount === 0 ? 15 : correctCount === 1 ? 12 : 10;
      newCombo = (player.combo || 0) + 1;
      points += Math.min(newCombo * 2, 10);
    } else {
      newLives = Math.max(0, player.lives - 1);
      newCombo = 0;
    }

    questionAnswers[user.uid] = { uid: user.uid, correct, time: Date.now() };

    transaction.update(playerRef, {
      score: (player.score || 0) + points,
      lives: newLives,
      combo: newCombo,
      status: newLives <= 0 ? "eliminated" : "playing",
      answers: FieldValue.arrayUnion({
        questionIndex,
        correct,
        selected,
        points,
        answeredAt: Date.now(),
      }),
    });

    // Check if all players with lives remaining have answered
    const playersSnapshot = await transaction.get(roomRef.collection("players"));
    const alivePlayers = playersSnapshot.docs.filter((d) => (d.data().lives ?? 3) > 0);
    const allAnswered = alivePlayers.every((d) => questionAnswers[d.id] !== undefined);

    let nextIndex = room.currentIndex;
    let newStatus = room.status;

    if (allAnswered) {
      if (room.currentIndex + 1 >= room.words.length) {
        newStatus = "finished";
      } else {
        nextIndex = room.currentIndex + 1;
      }
      transaction.update(roomRef, {
        currentIndex: nextIndex,
        status: newStatus,
        roundStartedAt: Date.now(),
        questionAnswers: {},
      });
    } else {
      transaction.update(roomRef, {
        questionAnswers,
      });
    }

    return {
      points,
      lives: newLives,
      combo: newCombo,
      allAnswered,
      nextIndex,
      status: newStatus,
    };
  });
};

export const advanceQuestion = async (user: AppUser, code: string, questionIndex: number) => {
  const roomRef = adminDb.collection(COLLECTIONS.gameRooms).doc(code);

  return await adminDb.runTransaction(async (transaction) => {
    const roomDoc = await transaction.get(roomRef);
    if (!roomDoc.exists) throw NotFound("Room not found");

    const room = roomDoc.data()!;
    if (room.status !== "playing") return { status: room.status };
    if (room.currentIndex !== questionIndex) {
      return { currentIndex: room.currentIndex, status: room.status };
    }

    let nextIndex = room.currentIndex + 1;
    let newStatus = room.status;

    if (nextIndex >= room.words.length) {
      newStatus = "finished";
    }

    transaction.update(roomRef, {
      currentIndex: nextIndex,
      status: newStatus,
      roundStartedAt: Date.now(),
      questionAnswers: {},
    });

    return { currentIndex: nextIndex, status: newStatus };
  });
};

