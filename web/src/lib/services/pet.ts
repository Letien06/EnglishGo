import { FieldValue } from "firebase-admin/firestore";
import { BadRequest } from "@/lib/api/response";
import { adminDb } from "@/lib/firestore/db";
import type {
  PetCompanionDefinition,
  PetCompanionId,
  PetDashboard,
  PetFoodDefinition,
  PetFoodId,
  PetLeaderboardEntry,
  PetLeaderboardScope,
  PetLedgerEntry,
  PetMood,
  PetProfileView,
  PetRewardResult,
  PetWalletView,
} from "@/types/pet";

const PET_COLLECTION = "pet";
const PET_TIME_ZONE = "Asia/Ho_Chi_Minh";
const DAILY_REWARD_CAP = 60;
const STARTER_COINS = 12;
const HISTORY_LIMIT = 12;

type PetLedgerType = PetLedgerEntry["type"];

interface StoredPetProfile {
  name: string;
  evolutionStage: number;
  careXpTotal: number;
  fullness: number;
  happiness: number;
  lastStatusAtMillis: number;
  totalFeedings: number;
  rankOptIn: boolean;
  floatingEnabled: boolean;
  equippedCompanionId: PetCompanionId;
  createdAtMillis: number;
}

export const PET_FOOD_CATALOG: Record<PetFoodId, PetFoodDefinition> = {
  KIBBLE: {
    id: "KIBBLE",
    name: "Hạt cá",
    description: "Một bữa nhỏ giòn tan cho Mực.",
    icon: "🐟",
    price: 5,
    fullness: 12,
    happiness: 4,
    careXp: 5,
  },
  SALMON: {
    id: "SALMON",
    name: "Cá nướng",
    description: "Mùi thơm khiến cái đuôi không thể ngừng vẫy.",
    icon: "🍣",
    price: 12,
    fullness: 28,
    happiness: 9,
    careXp: 12,
  },
  PATE: {
    id: "PATE",
    name: "Pate đặc biệt",
    description: "Bữa ăn đầy đủ cho một buổi học thật chăm chỉ.",
    icon: "🥫",
    price: 20,
    fullness: 45,
    happiness: 16,
    careXp: 20,
  },
  CAKE: {
    id: "CAKE",
    name: "Bánh sinh nhật",
    description: "Món hiếm cho một cột mốc đáng nhớ.",
    icon: "🎂",
    price: 50,
    fullness: 90,
    happiness: 28,
    careXp: 55,
  },
};

export const PET_COMPANION_CATALOG: Record<PetCompanionId, PetCompanionDefinition> = {
  MUC: {
    id: "MUC",
    name: "Mực",
    description: "Người bạn mèo đầu tiên luôn đồng hành cùng bạn.",
    rarity: "starter",
    price: 0,
    assetPath: "/pets/muc-cat.png",
    visualVariant: "sunset",
  },
  MOCHI: {
    id: "MOCHI",
    name: "Mochi",
    description: "Mèo cam đào hiếm, luôn mang theo năng lượng tích cực.",
    rarity: "rare",
    price: 350,
    assetPath: "/pets/muc-cat.png",
    visualVariant: "berry",
  },
  LUNA: {
    id: "LUNA",
    name: "Luna",
    description: "Mèo đêm huyền thoại dành cho người học bền bỉ.",
    rarity: "legendary",
    price: 900,
    assetPath: "/pets/muc-cat.png",
    visualVariant: "midnight",
  },
};

export const PET_EVOLUTION_STAGES = [
  { stage: 1, name: "Mèo Con", careXp: 0 },
  { stage: 2, name: "Mèo Nghịch Ngợm", careXp: 150 },
  { stage: 3, name: "Mèo Thám Hiểm", careXp: 500 },
  { stage: 4, name: "Hộ Vệ Học Tập", careXp: 1_200 },
  { stage: 5, name: "Mèo Thiên Tài", careXp: 2_500 },
] as const;

export interface GrantPetCoinsInput {
  uid: string;
  sourceKey: string;
  amount: number;
  title: string;
  occurredAtMillis?: number;
}

export interface PetActionResult {
  dashboard: PetDashboard;
  evolved: boolean;
}

/**
 * Awards a server-verified learning reward exactly once. Call this only from
 * the domain service that has already verified the learning action.
 */
export async function grantPetCoins(input: GrantPetCoinsInput): Promise<PetRewardResult> {
  if (!input.uid?.trim()) throw BadRequest("Người dùng không hợp lệ");
  const amount = Math.max(0, Math.min(DAILY_REWARD_CAP, Math.trunc(input.amount)));
  if (!input.sourceKey?.trim() || amount <= 0) throw BadRequest("Phần thưởng không hợp lệ");

  await ensurePet(input.uid);
  const now = Date.now();
  const pet = petRefs(input.uid);
  const sourceKey = safeDocumentId(input.sourceKey);
  const dateKey = petDateKeyForMillis(now);

  return adminDb.runTransaction(async (tx) => {
    const [claimSnap, walletSnap, rewardDaySnap] = await Promise.all([
      tx.get(pet.rewardClaims.doc(sourceKey)),
      tx.get(pet.wallet),
      tx.get(pet.rewardDays.doc(dateKey)),
    ]);
    const wallet = toWallet(walletSnap.data());
    if (claimSnap.exists) {
      return {
        granted: 0,
        balance: wallet.balance,
        duplicate: true,
        dailyCapReached: false,
      };
    }

    const earnedToday = numberValue(rewardDaySnap.get("earned")) ?? 0;
    const granted = Math.max(0, Math.min(amount, DAILY_REWARD_CAP - earnedToday));
    const nextBalance = wallet.balance + granted;
    const occurredAtMillis = input.occurredAtMillis ?? now;

    tx.set(pet.rewardClaims.doc(sourceKey), {
      sourceKey: input.sourceKey,
      amount: granted,
      requestedAmount: amount,
      title: cleanTitle(input.title),
      occurredAtMillis,
      dateKey,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.set(pet.rewardDays.doc(dateKey), {
      dateKey,
      earned: earnedToday + granted,
      updatedAtMillis: now,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    if (granted > 0) {
      tx.set(pet.wallet, {
        balance: nextBalance,
        lifetimeEarned: wallet.lifetimeEarned + granted,
        lifetimeSpent: wallet.lifetimeSpent,
        updatedAtMillis: now,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      tx.set(pet.ledger.doc(`reward_${sourceKey}`), ledgerPayload({
        type: "REWARD",
        amount: granted,
        title: cleanTitle(input.title),
        occurredAtMillis,
        balanceAfter: nextBalance,
      }));
    }

    return {
      granted,
      balance: nextBalance,
      duplicate: false,
      dailyCapReached: earnedToday + granted >= DAILY_REWARD_CAP,
    };
  });
}

export async function getPetDashboard(uid: string): Promise<PetDashboard> {
  await ensurePet(uid);
  const pet = petRefs(uid);
  const [profileSnap, walletSnap, inventorySnap, companionSnap, historySnap] = await Promise.all([
    pet.profile.get(),
    pet.wallet.get(),
    pet.inventory.get(),
    pet.companions.get(),
    pet.ledger.orderBy("occurredAtMillis", "desc").limit(HISTORY_LIMIT).get(),
  ]);
  const storedProfile = toStoredProfile(profileSnap.data());
  const status = derivePetStatus(storedProfile, Date.now());
  const inventoryByFood = new Map<PetFoodId, number>();
  for (const item of inventorySnap.docs) {
    if (isPetFoodId(item.id)) inventoryByFood.set(item.id, Math.max(0, numberValue(item.get("quantity")) ?? 0));
  }
  const ownedCompanionIds = new Set<PetCompanionId>(["MUC"]);
  for (const item of companionSnap.docs) {
    if (isPetCompanionId(item.id)) ownedCompanionIds.add(item.id);
  }

  return {
    profile: toProfileView(storedProfile, status),
    wallet: toWallet(walletSnap.data()),
    inventory: Object.keys(PET_FOOD_CATALOG).map((foodId) => ({
      foodId: foodId as PetFoodId,
      quantity: inventoryByFood.get(foodId as PetFoodId) ?? 0,
    })),
    catalog: Object.values(PET_FOOD_CATALOG),
    companionCatalog: Object.values(PET_COMPANION_CATALOG),
    ownedCompanionIds: Object.keys(PET_COMPANION_CATALOG).filter((id): id is PetCompanionId => ownedCompanionIds.has(id as PetCompanionId)),
    history: historySnap.docs.map(toLedgerEntry),
  };
}

export async function buyPetFood(uid: string, foodId: PetFoodId): Promise<PetActionResult> {
  const food = requireFood(foodId);
  await ensurePet(uid);
  const now = Date.now();
  const pet = petRefs(uid);

  await adminDb.runTransaction(async (tx) => {
    const [walletSnap, inventorySnap] = await Promise.all([
      tx.get(pet.wallet),
      tx.get(pet.inventory.doc(food.id)),
    ]);
    const wallet = toWallet(walletSnap.data());
    if (wallet.balance < food.price) {
      throw BadRequest(`Bạn cần thêm ${food.price - wallet.balance} Mèo Xu để mua ${food.name}.`);
    }
    const quantity = Math.max(0, numberValue(inventorySnap.get("quantity")) ?? 0);
    const nextBalance = wallet.balance - food.price;
    tx.set(pet.wallet, {
      balance: nextBalance,
      lifetimeEarned: wallet.lifetimeEarned,
      lifetimeSpent: wallet.lifetimeSpent + food.price,
      updatedAtMillis: now,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    tx.set(pet.inventory.doc(food.id), {
      foodId: food.id,
      quantity: quantity + 1,
      updatedAtMillis: now,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    tx.set(pet.ledger.doc(), ledgerPayload({
      type: "PURCHASE",
      amount: -food.price,
      title: `Mua ${food.name}`,
      foodId: food.id,
      occurredAtMillis: now,
      balanceAfter: nextBalance,
    }));
  });

  return { dashboard: await getPetDashboard(uid), evolved: false };
}

export async function buyPetCompanion(uid: string, companionId: PetCompanionId): Promise<PetActionResult> {
  const companion = requireCompanion(companionId);
  if (companion.price <= 0) throw BadRequest(`${companion.name} đã là pet khởi đầu của bạn.`);
  await ensurePet(uid);
  const now = Date.now();
  const pet = petRefs(uid);

  await adminDb.runTransaction(async (tx) => {
    const [walletSnap, ownershipSnap] = await Promise.all([
      tx.get(pet.wallet),
      tx.get(pet.companions.doc(companion.id)),
    ]);
    if (ownershipSnap.exists) throw BadRequest(`Bạn đã có ${companion.name} rồi.`);
    const wallet = toWallet(walletSnap.data());
    if (wallet.balance < companion.price) {
      throw BadRequest(`Bạn cần thêm ${companion.price - wallet.balance} Mèo Xu để đổi ${companion.name}.`);
    }
    const nextBalance = wallet.balance - companion.price;
    tx.set(pet.wallet, {
      balance: nextBalance,
      lifetimeEarned: wallet.lifetimeEarned,
      lifetimeSpent: wallet.lifetimeSpent + companion.price,
      updatedAtMillis: now,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    tx.set(pet.companions.doc(companion.id), {
      companionId: companion.id,
      acquiredAtMillis: now,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.set(pet.profile, {
      equippedCompanionId: companion.id,
      updatedAtMillis: now,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    tx.set(pet.ledger.doc(), ledgerPayload({
      type: "PURCHASE",
      amount: -companion.price,
      title: `Chào đón ${companion.name}`,
      companionId: companion.id,
      occurredAtMillis: now,
      balanceAfter: nextBalance,
    }));
  });

  return { dashboard: await getPetDashboard(uid), evolved: false };
}

export async function feedPet(uid: string, foodId: PetFoodId): Promise<PetActionResult> {
  const food = requireFood(foodId);
  await ensurePet(uid);
  const now = Date.now();
  const pet = petRefs(uid);
  let evolved = false;

  await adminDb.runTransaction(async (tx) => {
    const [profileSnap, inventorySnap, userSnap, weeklySnap] = await Promise.all([
      tx.get(pet.profile),
      tx.get(pet.inventory.doc(food.id)),
      tx.get(adminDb.collection("users").doc(uid)),
      tx.get(leaderboardEntryRef("weekly", uid, now)),
    ]);
    const profile = toStoredProfile(profileSnap.data());
    const inventory = Math.max(0, numberValue(inventorySnap.get("quantity")) ?? 0);
    if (inventory <= 0) throw BadRequest(`Kho không còn ${food.name}.`);

    const decayed = derivePetStatus(profile, now);
    const previousStage = evolutionForCareXp(profile.careXpTotal).stage;
    const careXpTotal = profile.careXpTotal + food.careXp;
    const nextStage = evolutionForCareXp(careXpTotal).stage;
    evolved = nextStage > previousStage;
    const nextProfile: StoredPetProfile = {
      ...profile,
      evolutionStage: nextStage,
      careXpTotal,
      fullness: clamp(decayed.fullness + food.fullness, 0, 100),
      happiness: clamp(decayed.happiness + food.happiness, 0, 100),
      lastStatusAtMillis: now,
      totalFeedings: profile.totalFeedings + 1,
    };

    tx.set(pet.profile, {
      ...nextProfile,
      updatedAtMillis: now,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    tx.set(pet.inventory.doc(food.id), {
      foodId: food.id,
      quantity: inventory - 1,
      updatedAtMillis: now,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    tx.set(pet.ledger.doc(), ledgerPayload({
      type: "FEED",
      amount: food.careXp,
      title: `Cho ${profile.name} ăn ${food.name}`,
      foodId: food.id,
      occurredAtMillis: now,
      balanceAfter: null,
    }));

    if (nextProfile.rankOptIn) {
      const user = userSnap.data() ?? {};
      const weeklyScore = Math.max(0, numberValue(weeklySnap.get("score")) ?? 0) + food.careXp;
      tx.set(leaderboardEntryRef("weekly", uid, now), leaderboardPayload({
        uid,
        profile: nextProfile,
        user,
        score: weeklyScore,
        now,
      }), { merge: true });
      tx.set(leaderboardEntryRef("all-time", uid, now), leaderboardPayload({
        uid,
        profile: nextProfile,
        user,
        score: careXpTotal,
        now,
      }), { merge: true });
    }
  });

  return { dashboard: await getPetDashboard(uid), evolved };
}

export async function updatePetProfile(
  uid: string,
  input: {
    name?: string;
    rankOptIn?: boolean;
    floatingEnabled?: boolean;
    equippedCompanionId?: PetCompanionId;
  },
): Promise<PetDashboard> {
  await ensurePet(uid);
  const now = Date.now();
  const pet = petRefs(uid);
  await adminDb.runTransaction(async (tx) => {
    const currentProfileSnap = await tx.get(pet.profile);
    const currentProfile = toStoredProfile(currentProfileSnap.data());
    const equippedCompanionId = input.equippedCompanionId ?? currentProfile.equippedCompanionId;
    const [profileSnap, userSnap, weeklySnap] = await Promise.all([
      Promise.resolve(currentProfileSnap),
      tx.get(adminDb.collection("users").doc(uid)),
      tx.get(leaderboardEntryRef("weekly", uid, now)),
    ]);
    const profile = toStoredProfile(profileSnap.data());
    const ownedSnap = equippedCompanionId === "MUC" ? null : await tx.get(pet.companions.doc(equippedCompanionId));
    if (equippedCompanionId !== "MUC" && !ownedSnap?.exists) {
      throw BadRequest("Bạn chưa sở hữu pet này.");
    }
    const name = input.name == null ? profile.name : normalizePetName(input.name);
    const rankOptIn = input.rankOptIn == null ? profile.rankOptIn : input.rankOptIn;
    const floatingEnabled = input.floatingEnabled == null ? profile.floatingEnabled : input.floatingEnabled;
    const nextProfile = { ...profile, name, rankOptIn, floatingEnabled, equippedCompanionId };
    tx.set(pet.profile, {
      name,
      rankOptIn,
      floatingEnabled,
      equippedCompanionId,
      updatedAtMillis: now,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    if (!rankOptIn) {
      tx.delete(leaderboardEntryRef("weekly", uid, now));
      tx.delete(leaderboardEntryRef("all-time", uid, now));
      return;
    }
    const user = userSnap.data() ?? {};
    tx.set(leaderboardEntryRef("weekly", uid, now), leaderboardPayload({
      uid,
      profile: nextProfile,
      user,
      score: Math.max(0, numberValue(weeklySnap.get("score")) ?? 0),
      now,
    }), { merge: true });
    tx.set(leaderboardEntryRef("all-time", uid, now), leaderboardPayload({
      uid,
      profile: nextProfile,
      user,
      score: profile.careXpTotal,
      now,
    }), { merge: true });
  });
  return getPetDashboard(uid);
}

export async function getPetLeaderboard(
  scope: PetLeaderboardScope,
  limit = 100,
): Promise<PetLeaderboardEntry[]> {
  const now = Date.now();
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  const boardId = leaderboardId(scope, now);
  const snap = await adminDb
    .collection("petLeaderboards")
    .doc(boardId)
    .collection("entries")
    .orderBy("score", "desc")
    .limit(safeLimit)
    .get();

  return snap.docs
    .map((doc) => toLeaderboardEntry(doc))
    .sort((left, right) =>
      right.score - left.score ||
      right.careXpTotal - left.careXpTotal ||
      (right.updatedAtMillis ?? 0) - (left.updatedAtMillis ?? 0) ||
      left.petName.localeCompare(right.petName),
    )
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

export function evolutionForCareXp(careXp: number) {
  const normalized = Math.max(0, Math.trunc(careXp));
  return [...PET_EVOLUTION_STAGES]
    .reverse()
    .find((item) => normalized >= item.careXp) ?? PET_EVOLUTION_STAGES[0];
}

export function nextEvolutionForCareXp(careXp: number): number | null {
  return PET_EVOLUTION_STAGES.find((item) => careXp < item.careXp)?.careXp ?? null;
}

export function derivePetStatus(
  profile: Pick<StoredPetProfile, "fullness" | "happiness" | "lastStatusAtMillis">,
  now = Date.now(),
): { fullness: number; happiness: number; mood: PetMood } {
  const elapsed = Math.max(0, now - profile.lastStatusAtMillis);
  const fullness = clamp(profile.fullness - Math.floor(elapsed / (4 * 60 * 60 * 1000)), 0, 100);
  const happiness = clamp(profile.happiness - Math.floor(elapsed / (8 * 60 * 60 * 1000)), 0, 100);
  const mood: PetMood = fullness < 35
    ? "hungry"
    : happiness < 35
      ? "sleepy"
      : fullness >= 65 && happiness >= 65
        ? "happy"
        : "content";
  return { fullness, happiness, mood };
}

export function currentPetWeekKey(now = new Date()): string {
  const local = localDateFor(now.getTime());
  const dayOfWeek = local.getUTCDay() || 7;
  local.setUTCDate(local.getUTCDate() + 4 - dayOfWeek);
  const weekYear = local.getUTCFullYear();
  const yearStart = new Date(Date.UTC(weekYear, 0, 1));
  const week = Math.ceil((((local.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
  return `${weekYear}-W${String(week).padStart(2, "0")}`;
}

async function ensurePet(uid: string): Promise<void> {
  const pet = petRefs(uid);
  const now = Date.now();
  await adminDb.runTransaction(async (tx) => {
    const profileSnap = await tx.get(pet.profile);
    if (profileSnap.exists) return;
    tx.set(pet.profile, {
      name: "Mực",
      evolutionStage: 1,
      careXpTotal: 0,
      fullness: 72,
      happiness: 72,
      lastStatusAtMillis: now,
      totalFeedings: 0,
      rankOptIn: false,
      floatingEnabled: true,
      equippedCompanionId: "MUC",
      createdAtMillis: now,
      updatedAtMillis: now,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(pet.wallet, {
      balance: STARTER_COINS,
      lifetimeEarned: STARTER_COINS,
      lifetimeSpent: 0,
      updatedAtMillis: now,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(pet.inventory.doc("KIBBLE"), {
      foodId: "KIBBLE",
      quantity: 1,
      updatedAtMillis: now,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(pet.ledger.doc("starter"), ledgerPayload({
      type: "REWARD",
      amount: STARTER_COINS,
      title: "Quà chào mừng cho Mực",
      occurredAtMillis: now,
      balanceAfter: STARTER_COINS,
    }));
  });
}

function petRefs(uid: string) {
  const root = adminDb.collection("users").doc(uid).collection(PET_COLLECTION);
  return {
    profile: root.doc("profile"),
    wallet: root.doc("wallet"),
    inventory: root.doc("inventory").collection("items"),
    companions: root.doc("companions").collection("items"),
    rewardClaims: root.doc("rewardClaims").collection("items"),
    rewardDays: root.doc("rewardDays").collection("items"),
    ledger: root.doc("ledger").collection("entries"),
  };
}

function leaderboardEntryRef(scope: PetLeaderboardScope, uid: string, now: number) {
  return adminDb
    .collection("petLeaderboards")
    .doc(leaderboardId(scope, now))
    .collection("entries")
    .doc(uid);
}

function leaderboardId(scope: PetLeaderboardScope, now: number): string {
  return scope === "weekly" ? `weekly_${currentPetWeekKey(new Date(now))}` : "all_time";
}

function leaderboardPayload(input: {
  uid: string;
  profile: StoredPetProfile;
  user: Record<string, unknown>;
  score: number;
  now: number;
}) {
  return {
    uid: input.uid,
    petName: input.profile.name,
    displayName: stringValue(input.user.displayName),
    avatarUrl: stringValue(input.user.avatarUrl),
    evolutionStage: evolutionForCareXp(input.profile.careXpTotal).stage,
    score: Math.max(0, Math.trunc(input.score)),
    careXpTotal: input.profile.careXpTotal,
    totalFeedings: input.profile.totalFeedings,
    updatedAtMillis: input.now,
    updatedAt: FieldValue.serverTimestamp(),
  };
}

function ledgerPayload(input: {
  type: PetLedgerType;
  amount: number;
  title: string;
  foodId?: PetFoodId;
  companionId?: PetCompanionId;
  occurredAtMillis: number;
  balanceAfter: number | null;
}) {
  return {
    type: input.type,
    amount: Math.trunc(input.amount),
    title: input.title,
    foodId: input.foodId ?? null,
    companionId: input.companionId ?? null,
    occurredAtMillis: input.occurredAtMillis,
    balanceAfter: input.balanceAfter,
    createdAt: FieldValue.serverTimestamp(),
  };
}

function toStoredProfile(data: Record<string, unknown> | undefined): StoredPetProfile {
  const now = Date.now();
  const careXpTotal = Math.max(0, numberValue(data?.careXpTotal) ?? 0);
  return {
    name: normalizePetName(stringValue(data?.name) ?? "Mực"),
    evolutionStage: evolutionForCareXp(careXpTotal).stage,
    careXpTotal,
    fullness: clamp(numberValue(data?.fullness) ?? 72, 0, 100),
    happiness: clamp(numberValue(data?.happiness) ?? 72, 0, 100),
    lastStatusAtMillis: Math.max(0, numberValue(data?.lastStatusAtMillis) ?? now),
    totalFeedings: Math.max(0, numberValue(data?.totalFeedings) ?? 0),
    rankOptIn: data?.rankOptIn === true,
    floatingEnabled: data?.floatingEnabled !== false,
    equippedCompanionId: isPetCompanionId(data?.equippedCompanionId) ? data.equippedCompanionId : "MUC",
    createdAtMillis: Math.max(0, numberValue(data?.createdAtMillis) ?? now),
  };
}

function toProfileView(
  profile: StoredPetProfile,
  status: ReturnType<typeof derivePetStatus>,
): PetProfileView {
  const evolution = evolutionForCareXp(profile.careXpTotal);
  return {
    name: profile.name,
    evolutionStage: evolution.stage,
    evolutionName: evolution.name,
    careXpTotal: profile.careXpTotal,
    nextEvolutionCareXp: nextEvolutionForCareXp(profile.careXpTotal),
    fullness: status.fullness,
    happiness: status.happiness,
    mood: status.mood,
    totalFeedings: profile.totalFeedings,
    rankOptIn: profile.rankOptIn,
    floatingEnabled: profile.floatingEnabled,
    equippedCompanionId: profile.equippedCompanionId,
  };
}

function toWallet(data: Record<string, unknown> | undefined): PetWalletView {
  const balance = Math.max(0, numberValue(data?.balance) ?? 0);
  return {
    balance,
    lifetimeEarned: Math.max(balance, numberValue(data?.lifetimeEarned) ?? balance),
    lifetimeSpent: Math.max(0, numberValue(data?.lifetimeSpent) ?? 0),
  } satisfies PetWalletView;
}

function toLedgerEntry(doc: FirebaseFirestore.QueryDocumentSnapshot): PetLedgerEntry {
  const data = doc.data();
  return {
    id: doc.id,
    type: data.type === "PURCHASE" || data.type === "FEED" ? data.type : "REWARD",
    amount: numberValue(data.amount) ?? 0,
    title: stringValue(data.title) ?? "Hoạt động cùng Mực",
    foodId: isPetFoodId(data.foodId) ? data.foodId : null,
    companionId: isPetCompanionId(data.companionId) ? data.companionId : null,
    occurredAtMillis: numberValue(data.occurredAtMillis) ?? 0,
    balanceAfter: numberValue(data.balanceAfter),
  };
}

function toLeaderboardEntry(doc: FirebaseFirestore.QueryDocumentSnapshot): PetLeaderboardEntry {
  const data = doc.data();
  return {
    rank: 0,
    uid: stringValue(data.uid) ?? doc.id,
    petName: normalizePetName(stringValue(data.petName) ?? "Mực"),
    displayName: stringValue(data.displayName),
    avatarUrl: stringValue(data.avatarUrl),
    evolutionStage: Math.max(1, Math.min(5, numberValue(data.evolutionStage) ?? 1)),
    score: Math.max(0, numberValue(data.score) ?? 0),
    careXpTotal: Math.max(0, numberValue(data.careXpTotal) ?? 0),
    totalFeedings: Math.max(0, numberValue(data.totalFeedings) ?? 0),
    updatedAtMillis: numberValue(data.updatedAtMillis),
  };
}

function requireFood(foodId: PetFoodId): PetFoodDefinition {
  const food = PET_FOOD_CATALOG[foodId];
  if (!food) throw BadRequest("Món ăn không hợp lệ");
  return food;
}

function requireCompanion(companionId: PetCompanionId): PetCompanionDefinition {
  const companion = PET_COMPANION_CATALOG[companionId];
  if (!companion) throw BadRequest("Pet không hợp lệ");
  return companion;
}

function isPetFoodId(value: unknown): value is PetFoodId {
  return typeof value === "string" && value in PET_FOOD_CATALOG;
}

function isPetCompanionId(value: unknown): value is PetCompanionId {
  return typeof value === "string" && value in PET_COMPANION_CATALOG;
}

function normalizePetName(value: string): string {
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length < 1 || name.length > 24) throw BadRequest("Tên mèo cần có từ 1 đến 24 ký tự.");
  return name;
}

function cleanTitle(value: string): string {
  const title = value.trim().replace(/\s+/g, " ");
  return title.slice(0, 80) || "Hoàn thành hoạt động học";
}

function safeDocumentId(value: string): string {
  return encodeURIComponent(value.trim()).slice(0, 1_400);
}

export function petDateKeyForMillis(millis: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PET_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(millis));
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function localDateFor(millis: number): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PET_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(millis));
  const numberPart = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  return new Date(Date.UTC(numberPart("year"), numberPart("month") - 1, numberPart("day")));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
