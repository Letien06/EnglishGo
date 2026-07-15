"use client";

import Image from "next/image";
import type { PetCompanionDefinition, PetCompanionId, PetMood } from "@/types/pet";

const VISUAL_BY_COMPANION: Record<PetCompanionId, Pick<PetCompanionDefinition, "assetPath" | "visualVariant" | "species">> = {
  MUC: { assetPath: "/pets/muc-cat.png", visualVariant: "muc-cat", species: "cat" },
  MOCHI: { assetPath: "/pets/british-shorthair-cat.png", visualVariant: "british-cat", species: "cat" },
  LUNA: { assetPath: "/pets/maine-coon-cat.png", visualVariant: "maine-coon-cat", species: "cat" },
  CORGI: { assetPath: "/pets/corgi-dog.png", visualVariant: "corgi-dog", species: "dog" },
  SHIBA: { assetPath: "/pets/shiba-dog.png", visualVariant: "shiba-dog", species: "dog" },
  HUSKY: { assetPath: "/pets/husky-dog.png", visualVariant: "husky-dog", species: "dog" },
};

export default function PetCat({
  mood,
  stage,
  companionId = "MUC",
  compact = false,
  reacting = false,
}: {
  mood: PetMood;
  stage: number;
  companionId?: PetCompanionId;
  compact?: boolean;
  reacting?: boolean;
}) {
  const visual = VISUAL_BY_COMPANION[companionId];
  return (
    <div
      className={`pet-cat-scene pet-cat-scene--${visual.visualVariant} ${compact ? "pet-cat-scene--compact" : ""} ${reacting ? "is-reacting" : ""}`}
      data-mood={mood}
      data-stage={stage}
      data-species={visual.species}
      aria-hidden="true"
    >
      <span className="pet-cat-shadow" />
      {stage >= 4 ? <span className="pet-cat-aura" /> : null}
      <Image
        src={visual.assetPath}
        alt=""
        width={512}
        height={512}
        sizes={compact ? "96px" : "(max-width: 1024px) 220px, 320px"}
        className="pet-cat-image"
        draggable={false}
      />
      {stage >= 3 ? <span className="pet-cat-level-ribbon">Lv.{stage}</span> : null}
      {stage >= 5 ? <span className="pet-cat-star pet-cat-star--one">✦</span> : null}
      {stage >= 5 ? <span className="pet-cat-star pet-cat-star--two">✦</span> : null}
      {mood === "hungry" ? <span className="pet-cat-bubble">🐟</span> : null}
      {mood === "sleepy" ? <span className="pet-cat-z">Z</span> : null}
      {reacting ? <span className="pet-cat-heart">♥</span> : null}
    </div>
  );
}
