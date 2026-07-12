"use client";

import { useEffect, useRef, useState } from "react";
import { PlayIcon, PauseIcon } from "@/components/icons";

/**
 * Dynamically-capable lesson narration. Asks the server which voice provider is
 * active: if a server voice (MiniMax / Kokoro / OpenAI) is configured it streams
 * that HD audio; otherwise it uses the browser's built-in speech — always free,
 * always available. The same button upgrades automatically once you add a
 * provider's creds; no UI change.
 */

function toSpeech(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ". code block omitted. ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\|/g, " ")
    .replace(/[#>*_`~-]/g, " ")
    .replace(/\[\d+\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export default function ListenButton({ text }: { text: string }) {
  const [serverVoice, setServerVoice] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [loading, setLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  const browserSupported = typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(() => {
    fetch("/api/tts")
      .then((r) => r.json())
      .then((d) => setServerVoice(!!d.server))
      .catch(() => setServerVoice(false));
    return () => cleanup();
  }, []);

  const cleanup = () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  };

  /* ── browser (free) path ── */
  const speakBrowser = () => {
    const synth = window.speechSynthesis;
    synth.cancel();
    const utt = new SpeechSynthesisUtterance(toSpeech(text).slice(0, 30000));
    utt.rate = 1;
    const en = synth.getVoices().find((v) => v.lang.startsWith("en"));
    if (en) utt.voice = en;
    utt.onend = () => reset();
    utt.onerror = () => reset();
    synth.speak(utt);
    setSpeaking(true);
    setPaused(false);
  };

  /* ── server (HD) path ── */
  const speakServer = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const ct = res.headers.get("content-type") ?? "";
      if (!res.ok || !ct.startsWith("audio")) {
        // provider unavailable → free browser voice
        if (browserSupported) speakBrowser();
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => reset();
      audio.onerror = () => reset();
      await audio.play();
      setSpeaking(true);
      setPaused(false);
    } catch {
      if (browserSupported) speakBrowser();
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setSpeaking(false);
    setPaused(false);
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    audioRef.current = null;
  };

  const toggle = () => {
    if (!speaking) return serverVoice ? speakServer() : speakBrowser();
    // pause/resume for whichever path is active
    if (audioRef.current) {
      if (paused) {
        audioRef.current.play();
        setPaused(false);
      } else {
        audioRef.current.pause();
        setPaused(true);
      }
      return;
    }
    const synth = window.speechSynthesis;
    if (paused) {
      synth.resume();
      setPaused(false);
    } else {
      synth.pause();
      setPaused(true);
    }
  };

  const stop = () => {
    cleanup();
    reset();
  };

  if (!browserSupported && !serverVoice) return null;

  const label = loading ? "…" : !speaking ? "Listen" : paused ? "Resume" : "Pause";

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={toggle}
        disabled={loading}
        className="glassx flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold text-ink disabled:opacity-60"
        aria-label={label}
        title={serverVoice ? "Listen (HD voice)" : "Listen"}
      >
        {!speaking || paused ? <PlayIcon className="size-3" /> : <PauseIcon className="size-3.5" />}
        {label}
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
