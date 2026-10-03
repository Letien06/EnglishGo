"use client";

import { useCallback, useEffect, useRef } from "react";
import type { VocabWordCard } from "@/types/vocab";
import { findBestEnglishVoice } from "@/lib/vocab-speech";

export default function useVocabularyAudio() {
  const audio = useRef<HTMLAudioElement | null>(null);

  // Eagerly pre-load voices so they are instantly ready on iOS/iPadOS/Safari/Android
  useEffect(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.getVoices();
      const onVoicesChanged = () => {
        window.speechSynthesis.getVoices();
      };
      window.speechSynthesis.addEventListener("voiceschanged", onVoicesChanged);
      return () => {
        window.speechSynthesis.removeEventListener("voiceschanged", onVoicesChanged);
      };
    }
  }, []);

  const stop = useCallback(() => {
    if (audio.current) {
      audio.current.pause();
      audio.current = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }, []);

  useEffect(() => stop, [stop]);

  const speak = useCallback(
    (text: string, url?: string, accent: "us" | "uk" = "us") => {
      stop();

      function fallback() {
        if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        const bestVoice = findBestEnglishVoice(accent);

        if (bestVoice) {
          utterance.voice = bestVoice;
          utterance.lang = bestVoice.lang;
        } else {
          utterance.lang = accent === "uk" ? "en-GB" : "en-US";
        }

        utterance.rate = 0.92; // Natural and clear TOEIC tempo
        utterance.pitch = 1.0;

        window.speechSynthesis.speak(utterance);
      }

      if (url) {
        const player = new Audio(url);
        audio.current = player;
        void player.play().catch(() => {
          if (audio.current === player) fallback();
        });
      } else {
        fallback();
      }
    },
    [stop]
  );

  const speakWord = useCallback(
    (word: VocabWordCard, accent: "us" | "uk" = "us") => {
      const url =
        accent === "us"
          ? word.audioUsUrl || word.audioUrl || word.audioUkUrl
          : word.audioUkUrl || word.audioUrl || word.audioUsUrl;
      speak(word.word, url, accent);
    },
    [speak]
  );

  return { speak, speakWord, stop };
}
