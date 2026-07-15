"use client";

import type { PetMood } from "@/types/pet";

export default function PetCat({
  mood,
  stage,
  compact = false,
  reacting = false,
}: {
  mood: PetMood;
  stage: number;
  compact?: boolean;
  reacting?: boolean;
}) {
  return (
    <div
      className={`pet-cat-scene ${compact ? "pet-cat-scene--compact" : ""} ${reacting ? "is-reacting" : ""}`}
      data-mood={mood}
      data-stage={stage}
      aria-hidden="true"
    >
      <div className="pet-cat-shadow" />
      <div className="pet-cat-model">
        <span className="pet-cat-tail" />
        <span className="pet-cat-body" />
        <span className="pet-cat-paw pet-cat-paw--left" />
        <span className="pet-cat-paw pet-cat-paw--right" />
        <div className="pet-cat-head">
          <span className="pet-cat-ear pet-cat-ear--left" />
          <span className="pet-cat-ear pet-cat-ear--right" />
          <span className="pet-cat-face">
            <span className="pet-cat-eye pet-cat-eye--left" />
            <span className="pet-cat-eye pet-cat-eye--right" />
            <span className="pet-cat-nose" />
            <span className="pet-cat-mouth" />
            <span className="pet-cat-cheek pet-cat-cheek--left" />
            <span className="pet-cat-cheek pet-cat-cheek--right" />
          </span>
        </div>
        {stage >= 3 ? <span className="pet-cat-scarf" /> : null}
        {stage >= 4 ? <span className="pet-cat-aura" /> : null}
        {stage >= 5 ? <span className="pet-cat-star pet-cat-star--one">✦</span> : null}
        {stage >= 5 ? <span className="pet-cat-star pet-cat-star--two">✦</span> : null}
        {mood === "hungry" ? <span className="pet-cat-bubble">🐟</span> : null}
        {mood === "sleepy" ? <span className="pet-cat-z">Z</span> : null}
        {reacting ? <span className="pet-cat-heart">♥</span> : null}
      </div>
    </div>
  );
}
