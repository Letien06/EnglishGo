"use client";

import Image from "next/image";
import type { PetCompanionId, PetMood } from "@/types/pet";

const VARIANT_BY_COMPANION: Record<PetCompanionId, "sunset" | "berry" | "midnight"> = {
  MUC: "sunset",
  MOCHI: "berry",
  LUNA: "midnight",
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
  return (
    <div
      className={`pet-cat-scene pet-cat-scene--${VARIANT_BY_COMPANION[companionId]} ${compact ? "pet-cat-scene--compact" : ""} ${reacting ? "is-reacting" : ""}`}
      data-mood={mood}
      data-stage={stage}
      aria-hidden="true"
    >
      <span className="pet-cat-shadow" />
      {stage >= 4 ? <span className="pet-cat-aura" /> : null}
      <Image
        src="/pets/muc-cat.png"
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
