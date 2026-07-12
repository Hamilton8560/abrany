"use client";

import { useEffect, useRef, useState } from "react";
import { PlayIcon, PauseIcon } from "@/components/icons";

/**
 * Free lesson narration via the browser's built-in Web Speech API — no API cost,
 * no key. Reads the lesson aloud so any subject can be a "lecture". A MiniMax
 * Speech-02 HD upgrade can slot in later behind the same button.
 */

/** strip markdown to something that reads cleanly aloud */
function toSpeech(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ". code block omitted. ") // skip code fences
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // links → text
    .replace(/\|/g, " ") // table pipes
    .replace(/[#>*_`~-]/g, " ") // md punctuation
    .replace(/\[\d+\]/g, "") // citation markers
    .replace(/\s+/g, " ")
    .trim();
}

export default function ListenButton({ text }: { text: string }) {
  const [supported, setSupported] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const uttRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    setSupported(typeof window !== "undefined" && "speechSynthesis" in window);
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const start = () => {
    const synth = window.speechSynthesis;
    synth.cancel();
    const utt = new SpeechSynthesisUtterance(toSpeech(text).slice(0, 30000));
    utt.rate = 1.0;
    utt.pitch = 1.0;
    const enVoice = synth.getVoices().find((v) => v.lang.startsWith("en"));
    if (enVoice) utt.voice = enVoice;
    utt.onend = () => {
      setSpeaking(false);
      setPaused(false);
    };
    utt.onerror = () => {
      setSpeaking(false);
      setPaused(false);
    };
    uttRef.current = utt;
    synth.speak(utt);
    setSpeaking(true);
    setPaused(false);
  };

  const toggle = () => {
    const synth = window.speechSynthesis;
    if (!speaking) return start();
    if (paused) {
      synth.resume();
      setPaused(false);
    } else {
      synth.pause();
      setPaused(true);
    }
  };

  const stop = () => {
    window.speechSynthesis.cancel();
    setSpeaking(false);
    setPaused(false);
  };

  if (!supported) return null;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={toggle}
        className="glassx flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold text-ink"
        aria-label={!speaking ? "Listen to this lesson" : paused ? "Resume" : "Pause"}
      >
        {!speaking || paused ? <PlayIcon className="size-3" /> : <PauseIcon className="size-3.5" />}
        {!speaking ? "Listen" : paused ? "Resume" : "Pause"}
      </button>
      {speaking && (
        <button
          type="button"
          onClick={stop}
          className="rounded-full px-2 py-1.5 text-[12px] font-medium text-muted hover:text-accent"
        >
          Stop
        </button>
      )}
    </div>
  );
}
