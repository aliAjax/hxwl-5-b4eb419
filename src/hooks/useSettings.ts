import { useEffect, useCallback, useState } from "react";
import { useLocalStorage, readLocalStorage } from "./useLocalStorage";
import type { Settings, SoundType } from "../types";

const SETTINGS_KEY = "hxwl-5-runes-settings";

const defaultSettings: Settings = {
  soundEnabled: true,
  animationIntensity: 100,
  theme: "dark",
  highlightTarget: true,
  practiceMode: false
};

function getInitialSettings(): Settings {
  const parsed = readLocalStorage<Partial<Settings>>(SETTINGS_KEY, {});
  return { ...defaultSettings, ...parsed };
}

function createSoundPlayer() {
  let ctx: AudioContext | null = null;
  function ensureCtx(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!ctx) {
      try {
        const AC =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        ctx = new AC();
      } catch {
        return null;
      }
    }
    if (ctx && ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    return ctx;
  }
  function playTone(
    freq: number,
    duration: number,
    type: OscillatorType = "sine",
    volume = 0.15
  ) {
    const context = ensureCtx();
    if (!context) return;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, context.currentTime);
    gain.gain.setValueAtTime(volume, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      context.currentTime + duration
    );
    osc.connect(gain);
    gain.connect(context.destination);
    osc.start();
    osc.stop(context.currentTime + duration);
  }
  function play(kind: SoundType) {
    switch (kind) {
      case "place":
        playTone(520, 0.12, "triangle", 0.18);
        setTimeout(() => playTone(780, 0.08, "triangle", 0.12), 40);
        break;
      case "rotate":
        playTone(440, 0.07, "square", 0.1);
        break;
      case "select":
        playTone(620, 0.08, "sine", 0.12);
        break;
      case "success":
        [0, 120, 240, 380].forEach((delay, i) => {
          setTimeout(
            () => playTone([523, 659, 784, 1046][i], 0.22, "triangle", 0.18),
            delay
          );
        });
        break;
      case "reset":
        playTone(300, 0.1, "sawtooth", 0.1);
        setTimeout(() => playTone(200, 0.12, "sawtooth", 0.08), 60);
        break;
    }
  }
  return { play, ensureCtx };
}

const sound = createSoundPlayer();

export function useSettings() {
  const [settings, setSettings] = useLocalStorage<Settings>(
    SETTINGS_KEY,
    getInitialSettings
  );
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = settings.theme;
    const intensity = Math.max(
      0,
      Math.min(100, settings.animationIntensity)
    );
    const durationScale = 0.2 + (1.8 * (100 - intensity)) / 100;
    const opacity = 0.15 + (0.85 * intensity) / 100;
    root.style.setProperty(
      "--anim-duration-scale",
      String(durationScale.toFixed(3))
    );
    root.style.setProperty("--anim-opacity", String(opacity.toFixed(3)));
  }, [settings.theme, settings.animationIntensity]);

  const playSound = useCallback(
    (kind: SoundType) => {
      if (settings.soundEnabled) {
        sound.ensureCtx();
        sound.play(kind);
      }
    },
    [settings.soundEnabled]
  );

  const updateSettings = useCallback(
    (patch: Partial<Settings>) => {
      setSettings((prev) => ({ ...prev, ...patch }));
    },
    [setSettings]
  );

  const togglePracticeMode = useCallback(() => {
    setSettings((prev) => ({ ...prev, practiceMode: !prev.practiceMode }));
  }, [setSettings]);

  return {
    settings,
    setSettings,
    updateSettings,
    playSound,
    togglePracticeMode,
    settingsOpen,
    setSettingsOpen
  };
}
