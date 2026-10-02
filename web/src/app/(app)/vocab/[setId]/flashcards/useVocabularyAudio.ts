"use client";

import { useCallback, useEffect, useRef } from "react";
import type { VocabWordCard } from "@/types/vocab";

export default function useVocabularyAudio() {
  const audio = useRef<HTMLAudioElement | null>(null);
  const stop = useCallback(() => {
    audio.current?.pause();
    audio.current = null;
    window.speechSynthesis?.cancel();
  }, []);
  useEffect(() => stop, [stop]);

  const speak = useCallback((text: string, url?: string, accent: "us" | "uk" = "us") => {
    stop();
    function fallback() {
      if (!window.speechSynthesis) return;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = accent === "us" ? "en-US" : "en-GB";
      window.speechSynthesis.speak(utterance);
    }
    if (url) {
      const player = new Audio(url);
      audio.current = player;
      void player.play().catch(() => { if (audio.current === player) fallback(); });
    } else fallback();
  }, [stop]);

  const speakWord = useCallback((word: VocabWordCard, accent: "us" | "uk" = "us") => {
    const url = accent === "us" ? word.audioUsUrl || word.audioUrl || word.audioUkUrl : word.audioUkUrl || word.audioUrl || word.audioUsUrl;
    speak(word.word, url, accent);
  }, [speak]);
  return { speak, speakWord, stop };
}
