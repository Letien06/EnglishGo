export type PetFoodId = "KIBBLE" | "SALMON" | "PATE" | "CAKE";

export type PetCompanionId = "MUC" | "MOCHI" | "LUNA" | "CORGI" | "SHIBA" | "HUSKY";

export type PetMood = "happy" | "content" | "hungry" | "sleepy";

export type PetLeaderboardScope = "weekly" | "all-time";

export interface PetFoodDefinition {
  id: PetFoodId;
  name: string;
  description: string;
  icon: string;
  price: number;
  fullness: number;
  happiness: number;
  careXp: number;
}

export interface PetCompanionDefinition {
  id: PetCompanionId;
  name: string;
  description: string;
  species: "cat" | "dog";
  rarity: "starter" | "rare" | "legendary";
  price: number;
  assetPath: string;
  visualVariant: "muc-cat" | "british-cat" | "maine-coon-cat" | "corgi-dog" | "shiba-dog" | "husky-dog";
}

export interface PetProfileView {
  name: string;
  evolutionStage: number;
  evolutionName: string;
  careXpTotal: number;
  nextEvolutionCareXp: number | null;
  fullness: number;
  happiness: number;
  mood: PetMood;
  totalFeedings: number;
  rankOptIn: boolean;
  floatingEnabled: boolean;
  equippedCompanionId: PetCompanionId;
}

export interface PetWalletView {
  balance: number;
  lifetimeEarned: number;
  lifetimeSpent: number;
}

export interface PetInventoryItem {
  foodId: PetFoodId;
  quantity: number;
}

export interface PetLedgerEntry {
  id: string;
  type: "REWARD" | "PURCHASE" | "FEED";
  amount: number;
  title: string;
  foodId: PetFoodId | null;
  companionId: PetCompanionId | null;
  occurredAtMillis: number;
  balanceAfter: number | null;
}

export interface PetDashboard {
  profile: PetProfileView;
  wallet: PetWalletView;
  inventory: PetInventoryItem[];
  catalog: PetFoodDefinition[];
  companionCatalog: PetCompanionDefinition[];
  ownedCompanionIds: PetCompanionId[];
  history: PetLedgerEntry[];
}

export interface PetLeaderboardEntry {
  rank: number;
  uid: string;
  petName: string;
  displayName: string | null;
  avatarUrl: string | null;
  evolutionStage: number;
  score: number;
  careXpTotal: number;
  totalFeedings: number;
  updatedAtMillis: number | null;
}

export interface PetRewardResult {
  granted: number;
  balance: number;
  duplicate: boolean;
  dailyCapReached: boolean;
}
