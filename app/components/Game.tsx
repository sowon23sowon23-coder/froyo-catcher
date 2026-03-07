"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { trackEvent } from "../lib/gtag";

type CharId = "green" | "berry" | "sprinkle";
type GameMode = "free" | "mission" | "timeAttack";
const HEART_EMOJI = "💗";
const FREE_HEART_SPAWN_CHANCE = 0.08;
const FREE_HEART_MIN_INTERVAL_MS = 7000;
const FREE_HEART_MAX_ACTIVE = 1;
const MAX_LIVES = 5;

const FALLING_ITEM_CANDIDATES = [
  "gummy-bear.png",
  "green-gummy-bear.png",
  "yellow-gummy-bear.png",
  "red-gummy-bear.png",
  "orange-gummy-bear.png",
  "strawberry.png",
  "kiwi.png",
  "pineapple.png",
  "mango.png",
  "cookie.png",
  "m-and-m-brown.png",
  "m-and-m-red.png",
  "m-and-m-orange.png",
] as const;
type MissionItemImage = string;

type FallingItem = { id: number; x: number; y: number; v: number; emoji?: string; image?: string };
type Pop = { id: number; x: number; y: number; text: string; born: number; kind?: "gain" | "loss" };
type CaughtItem = { id: number; emoji?: string; image?: string; x: number; y: number; rotate: number; scale: number };
type CreamZone = { minX: number; maxX: number; minY: number; maxY: number };

const GAME_BG_CANDIDATES = [
  "/game-bg-1.jpg",
  "/game-bg-2.jpg",
  "/game-bg-1.jpeg",
  "/game-bg-2.jpeg",
  "/game-bg-1.png",
  "/game-bg-2.png",
] as const;

const DEFAULT_GAME_BG =
  "radial-gradient(circle at 18% 18%, rgba(255,255,255,0.48), transparent 36%), linear-gradient(180deg, #99dcff 0%, #70c9ff 48%, #4ca6e8 100%)";
const FREE_DIFFICULTY_STEP = 10;
const FREE_BASE_FALL_SPEED_MIN = 0.7;
const FREE_BASE_FALL_SPEED_RANGE = 1.15;
const DEFAULT_BASE_FALL_SPEED_MIN = 1.2;
const DEFAULT_BASE_FALL_SPEED_RANGE = 2.4;
const MISSION_GOAL_SCORE = 10;
const CATCH_HALF_WIDTH_PCT = 9.5;
const CATCH_Y_START_PCT = 84;
const MISS_Y_PCT = 101;
const TIME_ATTACK_CREAM_ZONES: CreamZone[] = [
  { minX: 44, maxX: 56, minY: 10, maxY: 20 },
  { minX: 33, maxX: 66, minY: 20, maxY: 30 },
  { minX: 27, maxX: 70, minY: 30, maxY: 40 },
  { minX: 23, maxX: 74, minY: 40, maxY: 49 },
];
const LEVEL_UP_PRAISES = [
  "Nice catch!",
  "You're on a roll!",
  "Keep it going!",
  "Smooth moves!",
  "Hot streak!",
] as const;

function randomCreamToppingPlacement() {
  const zone = TIME_ATTACK_CREAM_ZONES[Math.floor(Math.random() * TIME_ATTACK_CREAM_ZONES.length)];
  return {
    x: zone.minX + Math.random() * (zone.maxX - zone.minX),
    y: zone.minY + Math.random() * (zone.maxY - zone.minY),
    rotate: Math.random() * 36 - 18,
    scale: 0.82 + Math.random() * 0.35,
  };
}

function imageScaleBoost(image?: string) {
  if (image === "strawberry.png") return 1.18;
  if (image === "mango.png") return 1.16;
  return 1;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

function pickCreamPlacementAvoidOverlap(existing: CaughtItem[], image?: string) {
  // Try many random candidates and keep the one with the best spacing.
  let best = randomCreamToppingPlacement();
  let bestSpacingScore = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < 40; i += 1) {
    const candidate = randomCreamToppingPlacement();
    const candidateScale = candidate.scale * imageScaleBoost(image);
    let minSpacing = Number.POSITIVE_INFINITY;

    for (const placed of existing) {
      const dx = candidate.x - placed.x;
      const dy = candidate.y - placed.y;
      const centerDistance = Math.hypot(dx, dy);
      const placedScale = placed.scale * imageScaleBoost(placed.image);
      const requiredDistance = 6.4 + candidateScale * 2.4 + placedScale * 2.4;
      const spacing = centerDistance - requiredDistance;
      if (spacing < minSpacing) minSpacing = spacing;
    }

    if (existing.length === 0) {
      return candidate;
    }

    if (minSpacing > bestSpacingScore) {
      best = candidate;
      bestSpacingScore = minSpacing;
    }

    if (minSpacing >= 0) {
      return candidate;
    }
  }

  return best;
}

function freeDifficultyLevelFromScore(score: number) {
  return Math.floor(score / FREE_DIFFICULTY_STEP);
}

function freeSpeedMultiplier(score: number) {
  const level = freeDifficultyLevelFromScore(score);
  if (level <= 2) return 1 + level * 0.06; // 0..29: smooth ramp
  if (level <= 5) return 1 + 2 * 0.06 + (level - 2) * 0.11; // 30..59: medium ramp
  return 1 + 2 * 0.06 + 3 * 0.11 + (level - 5) * 0.16; // 60+: steeper ramp
}

function freeSpawnBurstCount(score: number) {
  if (score < 30) return 1;
  if (score < 60) return Math.random() < 0.35 ? 2 : 1;
  if (score < 90) return Math.random() < 0.7 ? 2 : 1;
  return Math.random() < 0.2 ? 3 : 2;
}

function randomMissionTargetsFrom(images: readonly string[]) {
  if (images.length === 0) return [];
  const maxCount = Math.min(5, images.length);
  const minCount = Math.min(2, maxCount);
  const count = Math.floor(Math.random() * (maxCount - minCount + 1)) + minCount;
  const shuffled = [...images].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function pickNextMissionTarget(pool: readonly string[], previous?: string | null) {
  if (pool.length === 0) return null;
  if (pool.length === 1) return pool[0];
  const candidates = previous ? pool.filter((item) => item !== previous) : [...pool];
  if (candidates.length === 0) return pool[0];
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function pickRandomFallingImage(
  pool: readonly string[],
  excluded: readonly string[] = []
) {
  const fallback = pool[0] ?? "gummy-bear.png";
  if (pool.length === 0) return fallback;
  const excludedSet = new Set(excluded);
  const candidates = pool.filter((item) => !excludedSet.has(item));
  const source = candidates.length > 0 ? candidates : pool;
  return source[Math.floor(Math.random() * source.length)] ?? fallback;
}

export default function Game({
  character,
  mode,
  startSignal,
  onExitToHome,
  onBestScore,
  onGameOver,
}: {
  character: CharId;
  mode: GameMode;
  startSignal: number;
  onExitToHome: () => void;
  onBestScore: (best: number) => void;
  onGameOver?: (finalScore: number) => void;
}) {
  const [phase, setPhase] = useState<"idle" | "play" | "over">("idle");
  const [countdown, setCountdown] = useState<"mission" | "ready" | "go" | null>(null);

  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [timeLeft, setTimeLeft] = useState(30);
  const [difficultyLevel, setDifficultyLevel] = useState(0);
  const [difficultyNotice, setDifficultyNotice] = useState<string | null>(null);
  const [levelUpPraise, setLevelUpPraise] = useState<string | null>(null);
  const [shareNotice, setShareNotice] = useState<string | null>(null);
  const [playerX, setPlayerX] = useState(50);
  const [missionTargets, setMissionTargets] = useState<MissionItemImage[]>([]);
  const [currentMissionTarget, setCurrentMissionTarget] = useState<MissionItemImage | null>(null);
  const [fallingItemImages, setFallingItemImages] = useState<string[]>(["gummy-bear.png"]);

  const [items, setItems] = useState<FallingItem[]>([]);
  const [pops, setPops] = useState<Pop[]>([]);

  const [tilt, setTilt] = useState(0);
  const [bounce, setBounce] = useState(false);
  const [shake, setShake] = useState(false);
  const [dangerFlash, setDangerFlash] = useState(false);
  const [gameBg, setGameBg] = useState<string | null>(null);
  const [finalCupLoadFailed, setFinalCupLoadFailed] = useState(false);

  const [collectedToppings, setCollectedToppings] = useState<CaughtItem[]>([]);
  const visibleLives = Math.min(lives, MAX_LIVES);
  const extraLives = Math.max(0, lives - MAX_LIVES);

  const areaRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(0);
  const popIdRef = useRef(0);
  const lastLifeLossRef = useRef(0);
  const lastHeartSpawnAtRef = useRef(0);
  const spawnRef = useRef<number | null>(null);
  const loopRef = useRef<number | null>(null);
  const noticeTimeoutRef = useRef<number | null>(null);
  const levelCelebrateTimeoutRef = useRef<number | null>(null);
  const playerXRef = useRef(50);
  const gameOverFiredRef = useRef(false);
  const difficultyLevelRef = useRef(0);
  const scoreRef = useRef(0);
  const collectedRef = useRef<CaughtItem[]>([]);
  const leaderboardOpenedRef = useRef(false);
  const lastWarningVibrateRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const catchStreakRef = useRef(0);
  const timeUpSfxPlayedRef = useRef(false);

  const isPaused = false;

  useEffect(() => {
    playerXRef.current = playerX;
  }, [playerX]);

  useEffect(() => {
    difficultyLevelRef.current = difficultyLevel;
  }, [difficultyLevel]);

  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  useEffect(
    () => () => {
      if (noticeTimeoutRef.current !== null) {
        clearTimeout(noticeTimeoutRef.current);
      }
      if (levelCelebrateTimeoutRef.current !== null) {
        clearTimeout(levelCelebrateTimeoutRef.current);
      }
    },
    []
  );

  useEffect(() => {
    let active = true;

    const canLoad = (src: string) =>
      new Promise<boolean>((resolve) => {
        const img = new Image();
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = src;
      });

    (async () => {
      const checks = await Promise.all(GAME_BG_CANDIDATES.map((src) => canLoad(src)));
      const available = GAME_BG_CANDIDATES.filter((_, i) => checks[i]);
      if (!active || available.length === 0) return;
      const randomIndex = Math.floor(Math.random() * available.length);
      setGameBg(available[randomIndex]);
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    const canLoad = (src: string) =>
      new Promise<boolean>((resolve) => {
        const img = new Image();
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = src;
      });

    (async () => {
      const checks = await Promise.all(FALLING_ITEM_CANDIDATES.map((name) => canLoad(`/${name}`)));
      const available = FALLING_ITEM_CANDIDATES.filter((_, i) => checks[i]);
      if (!active) return;
      if (available.length > 0) {
        setFallingItemImages([...available]);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const stopAll = () => {
    if (spawnRef.current !== null) {
      clearInterval(spawnRef.current);
      spawnRef.current = null;
    }
    if (loopRef.current !== null) {
      clearInterval(loopRef.current);
      loopRef.current = null;
    }
  };

  const finishGame = () => {
    if (gameOverFiredRef.current) return;
    gameOverFiredRef.current = true;

    stopAll();
    setPhase("over");
    trackEvent({ action: "game_over", category: "game", label: mode, value: score });

    const best = Number(localStorage.getItem("bestScore") || 0);
    const isNewBest = score > best;
    if (isNewBest) {
      localStorage.setItem("bestScore", String(score));
      onBestScore(score);
      trackEvent({ action: "new_best_score", category: "game", label: mode, value: score });
    }

    if (mode === "timeAttack") {
      // Show Final Reveal Screen.
      setCollectedToppings([...collectedRef.current]);
      onGameOver?.(score);
      return;
    }

    if (mode === "free") {
      if (isNewBest && !leaderboardOpenedRef.current) {
        leaderboardOpenedRef.current = true;
        playSfx("fanfare");
        vibrateByEvent("fanfare");
        window.setTimeout(() => {
          onGameOver?.(score);
        }, 650);
      }
      return;
    }

    onGameOver?.(score);
  };

  const start = () => {
    idRef.current = 0;
    popIdRef.current = 0;
    lastLifeLossRef.current = 0;
    lastHeartSpawnAtRef.current = 0;
    playerXRef.current = 50;
    gameOverFiredRef.current = false;
    collectedRef.current = [];
    leaderboardOpenedRef.current = false;
    setCollectedToppings([]);
    setFinalCupLoadFailed(false);

    setScore(0);
    setLives(3);
    setTimeLeft(30);
    setDifficultyLevel(0);
    setDifficultyNotice(null);
    setLevelUpPraise(null);
    setShareNotice(null);
    setPlayerX(50);
    setItems([]);
    setPops([]);
    setTilt(0);
    setBounce(false);
    setShake(false);
    setDangerFlash(false);
    catchStreakRef.current = 0;
    timeUpSfxPlayedRef.current = false;
    difficultyLevelRef.current = 0;
    if (noticeTimeoutRef.current !== null) {
      clearTimeout(noticeTimeoutRef.current);
      noticeTimeoutRef.current = null;
    }
    if (levelCelebrateTimeoutRef.current !== null) {
      clearTimeout(levelCelebrateTimeoutRef.current);
      levelCelebrateTimeoutRef.current = null;
    }

    trackEvent({ action: "game_start", category: "game", label: mode, value: 0 });

    if (mode === "mission") {
      const missionPool = fallingItemImages.length > 0 ? fallingItemImages : ["gummy-bear.png"];
      const nextMissionTargets = randomMissionTargetsFrom(missionPool);
      setMissionTargets(nextMissionTargets);
      setCurrentMissionTarget(pickNextMissionTarget(missionPool));
      setCountdown("mission");
      setPhase("idle");

      window.setTimeout(() => setCountdown("ready"), 1400);
      window.setTimeout(() => setCountdown("go"), 1850);
      window.setTimeout(() => {
        setCountdown(null);
        setPhase("play");
      }, 2300);
      return;
    }

    setMissionTargets([]);
    setCurrentMissionTarget(null);
    setCountdown("ready");
    setPhase("idle");

    window.setTimeout(() => setCountdown("go"), 450);
    window.setTimeout(() => {
      setCountdown(null);
      setPhase("play");
    }, 900);
  };

  useEffect(() => {
    if (!startSignal) return;
    start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startSignal]);

  useEffect(() => {
    if (mode !== "free" || phase !== "play") return;
    const nextLevel = freeDifficultyLevelFromScore(score);
    if (nextLevel <= difficultyLevelRef.current) return;

    difficultyLevelRef.current = nextLevel;
    setDifficultyLevel(nextLevel);
    setDifficultyNotice(`Level Up! Lv.${nextLevel}`);
    setLevelUpPraise(LEVEL_UP_PRAISES[(nextLevel - 1) % LEVEL_UP_PRAISES.length]);

    if (noticeTimeoutRef.current !== null) {
      clearTimeout(noticeTimeoutRef.current);
    }
    noticeTimeoutRef.current = window.setTimeout(() => {
      setDifficultyNotice(null);
      noticeTimeoutRef.current = null;
    }, 1400);

    if (levelCelebrateTimeoutRef.current !== null) {
      clearTimeout(levelCelebrateTimeoutRef.current);
    }
    levelCelebrateTimeoutRef.current = window.setTimeout(() => {
      setLevelUpPraise(null);
      levelCelebrateTimeoutRef.current = null;
    }, 1800);
  }, [mode, phase, score]);

  const PLAYER_W = 80;

  const vibrateByEvent = (kind: "catch" | "fail" | "combo" | "timeup" | "fanfare") => {
    if (!("vibrate" in navigator)) return;
    if (kind === "catch") navigator.vibrate(14);
    if (kind === "fail") navigator.vibrate(26);
    if (kind === "combo") navigator.vibrate([14, 22, 14]);
    if (kind === "timeup") navigator.vibrate([40, 24, 40]);
    if (kind === "fanfare") navigator.vibrate([20, 30, 20, 30, 40]);
  };

  const playSfx = (kind: "catch" | "fail" | "combo" | "timeup" | "fanfare") => {
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtxRef.current) audioCtxRef.current = new Ctx();
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") void ctx.resume();

      const now = ctx.currentTime + 0.001;
      const beep = (freq: number, dur: number, type: OscillatorType, gain: number, at: number) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, at);
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(gain, at + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(at);
        osc.stop(at + dur + 0.02);
      };

      if (kind === "catch") beep(920, 0.08, "triangle", 0.04, now);
      if (kind === "fail") beep(220, 0.14, "sawtooth", 0.05, now);
      if (kind === "combo") {
        beep(680, 0.08, "triangle", 0.035, now);
        beep(860, 0.08, "triangle", 0.035, now + 0.09);
        beep(1120, 0.1, "triangle", 0.04, now + 0.18);
      }
      if (kind === "timeup") {
        beep(740, 0.12, "square", 0.04, now);
        beep(520, 0.18, "square", 0.045, now + 0.13);
      }
      if (kind === "fanfare") {
        beep(740, 0.08, "triangle", 0.035, now);
        beep(940, 0.09, "triangle", 0.038, now + 0.1);
        beep(1240, 0.12, "triangle", 0.04, now + 0.22);
        beep(1560, 0.18, "triangle", 0.042, now + 0.36);
      }
    } catch {
      // Ignore audio errors in restricted browsers.
    }
  };

  const createTimeAttackShareFile = async () => {
    const size = 1080;
    const baseToppingPx = 82;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    try {
      const cup = await loadImage("/final-cup.png?v=20260223");
      ctx.drawImage(cup, 0, 0, size, size);

      const toppings = collectedToppings.filter((t) => Boolean(t.image)).slice(0, 22);
      for (const t of toppings) {
        if (!t.image) continue;
        const topping = await loadImage(`/${t.image}`);
        const finalScale = t.scale * imageScaleBoost(t.image);
        const drawW = baseToppingPx * finalScale;
        const drawH = baseToppingPx * finalScale;
        const x = (t.x / 100) * size;
        const y = (t.y / 100) * size;

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate((t.rotate * Math.PI) / 180);
        ctx.drawImage(topping, -drawW / 2, -drawH / 2, drawW, drawH);
        ctx.restore();
      }

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/png", 0.95)
      );
      if (!blob) return null;

      return new File([blob], `ice-cream-cup-${Date.now()}.png`, { type: "image/png" });
    } catch {
      return null;
    }
  };

  const handleShare = async () => {
    const url = window.location.href;
    const title = "Froyo Catcher";
    const text = `I scored ${score} points in Froyo Catcher! Try it here:`;

    trackEvent({ action: "share_click", category: "engagement", label: `score_${score}`, value: score });

    try {
      if (navigator.share) {
        if (mode === "timeAttack" && phase === "over") {
          const shareFile = await createTimeAttackShareFile();
          if (shareFile) {
            try {
              const canShareFiles =
                typeof navigator.canShare !== "function" || navigator.canShare({ files: [shareFile] });
              if (canShareFiles) {
                await navigator.share({ title, text, url, files: [shareFile] });
                setShareNotice("Image shared successfully.");
                return;
              }
            } catch {
              // Fall through to link share if file share is not supported.
            }
          }
        }

        await navigator.share({ title, text, url });
        setShareNotice("Shared successfully.");
        return;
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setShareNotice("Game link copied.");
        return;
      }

      setShareNotice("Copy this link and share it.");
      window.prompt("Copy this link:", url);
    } catch {
      setShareNotice("Share canceled.");
    }
  };

  const move = (clientX: number) => {
    if (isPaused) return;
    const r = areaRef.current?.getBoundingClientRect();
    if (!r) return;

    const xPx = clientX - r.left;
    const clamped = Math.max(PLAYER_W / 2, Math.min(r.width - PLAYER_W / 2, xPx));
    const pct = (clamped / r.width) * 100;

    setPlayerX(pct);
    setTilt((pct - 50) / 10);
    setBounce(true);
    setTimeout(() => setBounce(false), 140);
  };

  useEffect(() => {
    if (phase !== "play") return;
    const prevOverflow = document.body.style.overflow;
    const prevTouchAction = document.body.style.touchAction;

    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";

    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.touchAction = prevTouchAction;
    };
  }, [phase, isPaused]);

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;

    const handler = (e: TouchEvent) => {
      if (phase !== "play" || isPaused) return;
      e.preventDefault();
      if (e.touches && e.touches.length > 0) move(e.touches[0].clientX);
    };

    el.addEventListener("touchmove", handler, { passive: false });
    return () => el.removeEventListener("touchmove", handler);
  }, [phase, isPaused]);

  useEffect(() => {
    if (phase !== "play") return;
    if (mode === "timeAttack") return;
    if (lives > 0) return;
    finishGame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lives, mode, phase, score]);

  useEffect(() => {
    if (phase !== "play") return;
    if (mode !== "mission") return;
    if (score < MISSION_GOAL_SCORE) return;
    finishGame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, phase, score]);

  useEffect(() => {
    if (phase !== "play") return;
    if (mode !== "timeAttack") return;
    if (timeLeft > 0) return;
    if (!timeUpSfxPlayedRef.current) {
      timeUpSfxPlayedRef.current = true;
      playSfx("timeup");
      vibrateByEvent("timeup");
    }
    finishGame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, phase, timeLeft, score]);

  useEffect(() => {
    if (phase !== "play") return;
    if (mode !== "timeAttack") return;

    const timer = window.setInterval(() => {
      setTimeLeft((t) => Math.max(0, t - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [mode, phase]);

  useEffect(() => {
    if (mode !== "timeAttack" || phase !== "play") {
      lastWarningVibrateRef.current = null;
      return;
    }
    if (timeLeft <= 0 || timeLeft > 10) return;
    if (lastWarningVibrateRef.current === timeLeft) return;

    lastWarningVibrateRef.current = timeLeft;
    if ("vibrate" in navigator) {
      const pattern = timeLeft <= 5 ? [80, 40, 80] : [60];
      navigator.vibrate(pattern);
    }
  }, [mode, phase, timeLeft]);

  useEffect(() => {
    if (phase !== "play") {
      stopAll();
      return;
    }
    if (loopRef.current !== null) return;

    spawnRef.current = window.setInterval(() => {
      setItems((currentItems) => {
        const nowMs = Date.now();
        const activeHeartCount = currentItems.filter((item) => item.emoji === HEART_EMOJI).length;
        const canSpawnHeartByInterval =
          nowMs - lastHeartSpawnAtRef.current >= FREE_HEART_MIN_INTERVAL_MS;
        const shouldSpawnHeart =
          mode === "free" &&
          canSpawnHeartByInterval &&
          activeHeartCount < FREE_HEART_MAX_ACTIVE &&
          Math.random() < FREE_HEART_SPAWN_CHANCE;

        let itemData: { emoji?: string; image?: string } | null = null;
        if (shouldSpawnHeart) {
          itemData = { emoji: HEART_EMOJI };
          lastHeartSpawnAtRef.current = nowMs;
        }

        const currentScore = scoreRef.current;
        const spawnCount = shouldSpawnHeart ? 1 : mode === "free" ? freeSpawnBurstCount(currentScore) : 1;
        const nextItems: FallingItem[] = [];
        const burstImages: string[] = [];

        for (let i = 0; i < spawnCount; i += 1) {
          const baseFallSpeed =
            mode === "free"
              ? FREE_BASE_FALL_SPEED_MIN + Math.random() * FREE_BASE_FALL_SPEED_RANGE
              : DEFAULT_BASE_FALL_SPEED_MIN + Math.random() * DEFAULT_BASE_FALL_SPEED_RANGE;
          const nextItemData =
            shouldSpawnHeart || itemData?.emoji
              ? itemData
              : {
                  image: pickRandomFallingImage(fallingItemImages, burstImages),
                };
          if (nextItemData.image) {
            burstImages.push(nextItemData.image);
          }
          nextItems.push({
            id: idRef.current++,
            x: Math.random() * 90 + 5,
            y: -5 - i * 3.2,
            v: baseFallSpeed,
            ...nextItemData,
          });
        }

        return [...currentItems, ...nextItems];
      });
    }, 900);

    loopRef.current = window.setInterval(() => {
      const now = performance.now();
      const px = playerXRef.current;

      setItems((prev) => {
        let gained = 0;
        let lifeGain = 0;
        let lifeLoss = 0;
        const popsToAdd: Pop[] = [];
        const next: FallingItem[] = [];
        let lifeLossReason: { x: number; text: string } | null = null;

        for (const item of prev) {
          const speedMultiplier =
            mode === "free" ? freeSpeedMultiplier(scoreRef.current) : 1;
          const ny = item.y + item.v * speedMultiplier;
          const isMissionTarget =
            mode === "mission" && item.image ? item.image === currentMissionTarget : false;
          const inCatchRangeX = Math.abs(item.x - px) <= CATCH_HALF_WIDTH_PCT;
          const inCatchRangeY = ny >= CATCH_Y_START_PCT && ny <= 96;

          if (inCatchRangeX && inCatchRangeY) {
            if (mode === "mission") {
              if (isMissionTarget) {
                gained += 1;
                popsToAdd.push({
                  id: popIdRef.current++,
                  x: item.x,
                  y: 88,
                  text: "+1",
                  born: now,
                  kind: "gain",
                });
                setCurrentMissionTarget((prevTarget) =>
                  pickNextMissionTarget(fallingItemImages, prevTarget)
                );
              } else {
                lifeLoss += 1;
                if (!lifeLossReason) lifeLossReason = { x: item.x, text: "WRONG" };
              }
            } else {
              const isHeart = mode === "free" && item.emoji === HEART_EMOJI;
              if (isHeart) {
                lifeGain += 1;
                popsToAdd.push({
                  id: popIdRef.current++,
                  x: item.x,
                  y: 88,
                  text: "LIFE +1",
                  born: now,
                  kind: "gain",
                });
              } else {
                gained += 1;
                popsToAdd.push({
                  id: popIdRef.current++,
                  x: item.x,
                  y: 88,
                  text: "+1",
                  born: now,
                  kind: "gain",
                });
              }
              // Track caught items for Time Attack reveal screen
              if (mode === "timeAttack") {
                const placement = pickCreamPlacementAvoidOverlap(collectedRef.current, item.image);
                collectedRef.current.push({
                  id: item.id,
                  emoji: item.emoji,
                  image: item.image,
                  x: placement.x,
                  y: placement.y,
                  rotate: placement.rotate,
                  scale: placement.scale,
                });
              }
            }
            continue;
          }

          if (ny > MISS_Y_PCT) {
            const isHeart = mode === "free" && item.emoji === HEART_EMOJI;
            if (mode === "mission") {
              if (isMissionTarget) {
                lifeLoss += 1;
                if (!lifeLossReason) lifeLossReason = { x: item.x, text: "MISSED" };
              }
            } else {
              if (mode !== "timeAttack") {
                if (isHeart) {
                  continue;
                }
                lifeLoss += 1;
                if (!lifeLossReason) lifeLossReason = { x: item.x, text: "MISSED" };
              }
            }
            continue;
          }

          next.push({ ...item, y: ny });
        }

        if (gained) {
          setScore((s) => s + gained);
          playSfx("catch");
          vibrateByEvent("catch");
          const prevStreak = catchStreakRef.current;
          const nextStreak = prevStreak + gained;
          catchStreakRef.current = nextStreak;
          if (Math.floor(prevStreak / 5) < Math.floor(nextStreak / 5)) {
            playSfx("combo");
            vibrateByEvent("combo");
          }
        }
        if (lifeGain) {
          playSfx("catch");
          vibrateByEvent("catch");
          setLives((l) => l + lifeGain);
        }

        if (lifeLoss) {
          const now2 = performance.now();
          if (now2 - lastLifeLossRef.current >= 400) {
            lastLifeLossRef.current = now2;
            setPops((ps) =>
              ps.concat([
                {
                  id: popIdRef.current++,
                  x: lifeLossReason?.x ?? playerXRef.current,
                  y: 88,
                  text: lifeLossReason?.text ?? "MISS",
                  born: now2,
                  kind: "loss",
                },
              ])
            );
            setShake(true);
            setTimeout(() => setShake(false), 180);
            setDangerFlash(true);
            setTimeout(() => setDangerFlash(false), 160);
            catchStreakRef.current = 0;
            playSfx("fail");
            vibrateByEvent("fail");
            setLives((l) => Math.max(0, l - 1));
          }
        }

        setPops((ps) => ps.concat(popsToAdd).filter((p) => now - p.born < 700));
        return next;
      });
    }, 30);

    return () => stopAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, mode, currentMissionTarget, fallingItemImages]);

  return (
    <main className="h-full min-h-full bg-gradient-to-b from-pink-100 to-blue-100 flex items-start sm:items-center justify-center overflow-y-auto p-2 sm:p-4">
      <style jsx global>{`
        @keyframes shake {
          0% {
            transform: translate3d(0, 0, 0);
          }
          20% {
            transform: translate3d(-3px, 0, 0);
          }
          40% {
            transform: translate3d(3px, 0, 0);
          }
          60% {
            transform: translate3d(-2px, 0, 0);
          }
          80% {
            transform: translate3d(2px, 0, 0);
          }
          100% {
            transform: translate3d(0, 0, 0);
          }
        }
        .animate-shake {
          animation: shake 0.18s ease-in-out;
        }
        @keyframes bubbleFloat {
          0% {
            transform: translateY(0) scale(1);
            opacity: 0;
          }
          10% {
            opacity: 0.32;
          }
          100% {
            transform: translateY(-100px) scale(1.08);
            opacity: 0;
          }
        }
        .bubble-float {
          animation-name: bubbleFloat;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
        }
        @keyframes toppingReveal {
          0%   { opacity: 0; transform: rotate(var(--rot)) scale(0.3) translateY(-22px); }
          65%  { opacity: 1; transform: rotate(var(--rot)) scale(1.12) translateY(3px); }
          100% { opacity: 1; transform: rotate(var(--rot)) scale(1) translateY(0); }
        }
        .topping-reveal {
          animation: toppingReveal 0.45s ease-out forwards;
          opacity: 0;
        }
        @keyframes warningPulse {
          0%   { opacity: 0.04; }
          50%  { opacity: 0.16; }
          100% { opacity: 0.04; }
        }
        .warning-pulse {
          animation: warningPulse 1.35s ease-in-out infinite;
        }
        @keyframes revealFadeIn {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .reveal-fade-in {
          animation: revealFadeIn 0.4s ease-out forwards;
        }
        @keyframes levelBadgeCelebrate {
          0% { transform: translateY(0) scale(1); box-shadow: 0 10px 24px rgba(150,9,83,0.18); }
          30% { transform: translateY(-2px) scale(1.08); box-shadow: 0 14px 32px rgba(150,9,83,0.26); }
          100% { transform: translateY(0) scale(1); box-shadow: 0 10px 24px rgba(150,9,83,0.18); }
        }
        .level-badge-celebrate {
          animation: levelBadgeCelebrate 0.7s ease-out;
        }
        @keyframes levelToastIn {
          0% { opacity: 0; transform: translate(-50%, -14px) scale(0.92); }
          100% { opacity: 1; transform: translate(-50%, 0) scale(1); }
        }
        .level-toast {
          animation: levelToastIn 0.28s ease-out;
        }
        @keyframes sparkleFloat {
          0% { opacity: 0; transform: translateY(10px) scale(0.7); }
          25% { opacity: 1; }
          100% { opacity: 0; transform: translateY(-14px) scale(1.15); }
        }
        .sparkle-float {
          animation: sparkleFloat 0.95s ease-out forwards;
        }
      `}</style>

      <div className="w-full max-w-[430px] py-1 sm:py-0">
        <div className="mb-3 flex gap-2">
          {/* Score */}
          <div className={`flex flex-col items-center rounded-2xl py-2 shadow ${mode === "timeAttack" ? "flex-[2] bg-[var(--yl-primary)]" : "flex-1 bg-white/90 ring-1 ring-[var(--yl-card-border)]"}`}>
            <span className={`text-xs font-black uppercase tracking-[0.14em] ${mode === "timeAttack" ? "text-white/85" : "text-[var(--yl-primary)]"}`}>
              {mode === "timeAttack" ? "TOPPING COLLECTED" : "SCORE"}
            </span>
            <span className={`font-black leading-tight ${mode === "timeAttack" ? "text-3xl text-white" : "text-2xl text-[var(--yl-ink-strong)]"}`}>{score}</span>
          </div>
          {/* Lives — free & mission only */}
          {mode !== "timeAttack" && (
            <div className="flex flex-1 flex-col items-center rounded-2xl bg-white/90 py-2 shadow ring-1 ring-[var(--yl-card-border)]">
              <span className="text-xs font-black uppercase tracking-[0.14em] text-[var(--yl-primary)]">LIVES</span>
              <div className="mt-0.5 flex items-center gap-1">
                {Array.from({ length: MAX_LIVES }).map((_, i) => (
                  <span key={i} className="text-lg leading-none">{i < visibleLives ? "❤️" : "🤍"}</span>
                ))}
                {extraLives > 0 && (
                  <span className="ml-1 text-sm font-black leading-none text-[var(--yl-primary)]">
                    x{extraLives}
                  </span>
                )}
              </div>
            </div>
          )}
          {/* Level — free play only */}
          {mode === "free" && (
            <div
              className={`relative flex flex-1 flex-col items-center rounded-2xl bg-[var(--yl-primary)] py-2 shadow ${
                levelUpPraise ? "level-badge-celebrate" : ""
              }`}
            >
              <span className="text-xs font-black uppercase tracking-[0.14em] text-white/85">LEVEL</span>
              <span className="text-2xl font-black leading-tight text-white">{difficultyLevel}</span>
              {levelUpPraise ? (
                <>
                  <span className="sparkle-float pointer-events-none absolute -left-1 top-2 text-xs text-yellow-200">*</span>
                  <span
                    className="sparkle-float pointer-events-none absolute -right-1 top-3 text-[10px] text-pink-100"
                    style={{ animationDelay: "0.08s" }}
                  >
                    *
                  </span>
                </>
              ) : null}
            </div>
          )}
          {/* Time — time attack only */}
          {mode === "timeAttack" && (
            <div
              className={`flex flex-[2] flex-col items-center rounded-2xl py-2 shadow transition-colors duration-300 ${
                timeLeft <= 5
                  ? "bg-red-600 ring-2 ring-red-300"
                  : timeLeft <= 10
                    ? "bg-orange-500"
                    : "bg-[var(--yl-primary)]"
              }`}
            >
              <span className="text-xs font-black uppercase tracking-[0.14em] text-white/85">⏱ TIME</span>
              <span className={`font-black leading-tight text-white ${timeLeft <= 5 ? "text-4xl" : "text-3xl"}`}>
                {timeLeft}s
              </span>
            </div>
          )}
        </div>

        {/* Time Attack progress bar */}
        {mode === "timeAttack" && (
          <div className="mb-3 h-3 w-full overflow-hidden rounded-full bg-white/40 shadow-inner">
            <div
              className={`h-full rounded-full transition-all duration-1000 ease-linear ${
                timeLeft <= 2
                  ? "bg-red-600"
                  : timeLeft <= 4
                    ? "bg-orange-500"
                    : "bg-[var(--yl-primary)]"
              }`}
              style={{ width: `${(timeLeft / 30) * 100}%` }}
            />
          </div>
        )}

        {mode === "mission" && currentMissionTarget && (
          <div className="mb-2 rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-center text-xs font-bold text-amber-900 sm:mb-3 sm:rounded-2xl sm:px-4 sm:py-2 sm:text-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.1em] text-amber-800 sm:text-xs sm:tracking-[0.12em]">
              Mission Progress: {Math.min(score, MISSION_GOAL_SCORE)}/{MISSION_GOAL_SCORE}
            </p>
            <div className="mx-auto mt-1 h-1.5 w-full max-w-[180px] overflow-hidden rounded-full bg-amber-100 ring-1 ring-amber-200 sm:mt-2 sm:h-2 sm:max-w-[220px]">
              <div
                className="h-full rounded-full bg-amber-500 transition-all duration-300"
                style={{ width: `${(Math.min(score, MISSION_GOAL_SCORE) / MISSION_GOAL_SCORE) * 100}%` }}
              />
            </div>
            <p className="mt-1 text-[11px] sm:text-sm">Grab only this!</p>
            <div className="mt-1 flex items-center justify-center gap-1.5 sm:mt-2 sm:gap-2">
              <img
                src={`/${currentMissionTarget}`}
                alt={currentMissionTarget}
                className="h-5 w-5 object-contain sm:h-7 sm:w-7"
                draggable={false}
                style={{ transform: `scale(${imageScaleBoost(currentMissionTarget)})` }}
              />
            </div>
          </div>
        )}

        <div
          ref={areaRef}
          onMouseMove={(e) => phase === "play" && move(e.clientX)}
          className={`relative ${
            mode === "mission"
              ? "aspect-[4/5] sm:aspect-[9/16]"
              : "aspect-[3/5] sm:aspect-[9/16]"
          } rounded-3xl overflow-hidden shadow-xl ring-1 ring-white/50 touch-none ${
            shake ? "animate-shake" : ""
          }`}
          style={{
            backgroundImage: gameBg
              ? `linear-gradient(180deg, rgba(255,255,255,0.18), rgba(255,255,255,0.18)), url(${gameBg})`
              : DEFAULT_GAME_BG,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <div className="absolute inset-0 pointer-events-none z-0">
            <div className="absolute -top-10 -left-6 h-40 w-40 rounded-full bg-white/25 blur-2xl" />
            <div className="absolute top-12 -right-10 h-36 w-36 rounded-full bg-cyan-100/30 blur-2xl" />
            <div className="absolute bottom-[-4.5rem] left-[-2rem] h-36 w-44 rounded-[50%] bg-white/35 blur-md" />
            <div className="absolute bottom-[-4rem] right-[-2rem] h-32 w-40 rounded-[50%] bg-white/30 blur-md" />
          </div>

          <div className="absolute inset-0 pointer-events-none z-0">
            {[12, 32, 54, 78].map((left, idx) => (
              <span
                key={`bubble-${left}`}
                className="bubble-float absolute bottom-4 rounded-full bg-white/35"
                style={{
                  left: `${left}%`,
                  width: `${10 + (idx % 2) * 4}px`,
                  height: `${10 + (idx % 2) * 4}px`,
                  animationDelay: `${idx * 0.95}s`,
                  animationDuration: `${6.2 + (idx % 2) * 1.5}s`,
                }}
              />
            ))}
          </div>

          <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-white/30 to-transparent pointer-events-none z-0" />

          {phase === "play" && (
            <div
              className="pointer-events-none absolute z-10 rounded-full border border-white/65 bg-white/15"
              style={{
                left: `${playerX}%`,
                top: `${CATCH_Y_START_PCT}%`,
                width: `${CATCH_HALF_WIDTH_PCT * 2}%`,
                height: 16,
                transform: "translate(-50%, -50%)",
              }}
            />
          )}

          {phase === "play" && dangerFlash && (
            <div className="pointer-events-none absolute inset-0 z-20 bg-red-500/14" />
          )}

          {mode === "timeAttack" && phase === "play" && timeLeft <= 10 && timeLeft > 0 && (
            <div
              className={`pointer-events-none absolute inset-0 z-10 ${
                timeLeft <= 5 ? "warning-pulse bg-red-500/20" : "bg-orange-400/10"
              }`}
            />
          )}

          {mode === "free" && phase === "play" && difficultyNotice && (
            <div className="level-toast absolute top-4 left-1/2 z-30 w-[min(88%,320px)] -translate-x-1/2 rounded-[1.4rem] border border-white/65 bg-[linear-gradient(135deg,rgba(176,27,101,0.95),rgba(255,132,76,0.92))] px-4 py-3 text-white shadow-[0_18px_38px_rgba(113,15,68,0.28)]">
              <div className="flex items-center justify-center gap-2 text-[11px] font-black uppercase tracking-[0.22em] text-white/75">
                <span>*</span>
                <span>Momentum Boost</span>
                <span>*</span>
              </div>
              <div className="mt-1 text-center text-base font-black leading-tight">{difficultyNotice}</div>
              {levelUpPraise ? (
                <div className="mt-1 text-center text-xs font-bold text-white/88">{levelUpPraise}</div>
              ) : null}
            </div>
          )}

          {countdown && (
            <div className="absolute inset-0 z-30 flex items-center justify-center">
              <div className="px-8 py-4 rounded-3xl bg-white/80 backdrop-blur-md border border-black/5 shadow-2xl text-center">
                {countdown === "mission" ? (
                  <>
                    <div className="text-xs font-extrabold uppercase tracking-[0.16em] text-amber-700 mb-2">
                      Topping Mission
                    </div>
                    <div className="flex items-center justify-center gap-2">
                      {currentMissionTarget && (
                        <img
                          key={`countdown-${currentMissionTarget}`}
                          src={`/${currentMissionTarget}`}
                          alt={currentMissionTarget}
                          className="h-9 w-9 object-contain"
                          draggable={false}
                          style={{ transform: `scale(${imageScaleBoost(currentMissionTarget)})` }}
                        />
                      )}
                    </div>
                  </>
                ) : (
                  <div className="text-4xl font-black text-pink-600">
                    {countdown === "ready" ? "READY" : "GO!"}
                  </div>
                )}
              </div>
            </div>
          )}

          {(phase === "idle" || (phase === "over" && mode !== "timeAttack")) && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white/55 backdrop-blur-sm">
              <div className="text-5xl mb-3">
                {phase === "over" ? (mode === "mission" && score >= MISSION_GOAL_SCORE ? "🏆" : "💥") : "🍨"}
              </div>
              <div className="text-xl font-extrabold text-pink-600 mb-2">
                {phase === "over"
                  ? mode === "mission" && score >= MISSION_GOAL_SCORE
                    ? "Mission Complete!"
                    : "Game Over!"
                  : "Loading..."}
              </div>

              <div className="mb-5 flex flex-col items-center">
                <img
                  src={`/${character}.png`}
                  alt={character}
                  className="w-20 h-20 select-none pointer-events-none drop-shadow"
                  draggable={false}
                />
              </div>

              {phase === "over" && (
                <>
                  <div className="mb-3 text-base font-bold text-[var(--yl-ink-muted)]">
                    Your Score: <span className="font-black text-[var(--yl-primary)]">{score}</span>
                  </div>

                  {mode === "free" && (
                    <button
                      type="button"
                      onClick={() => {
                        leaderboardOpenedRef.current = true;
                        onGameOver?.(score);
                      }}
                      className="px-10 py-4 rounded-full bg-[var(--yl-primary)] text-white font-extrabold shadow-lg transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--yl-focus-ring)]"
                    >
                      Leaderboard
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={start}
                    className="mt-3 px-10 py-4 rounded-full border border-[var(--yl-primary)] bg-white text-[var(--yl-primary)] font-extrabold shadow-sm transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--yl-focus-ring)]"
                  >
                    Retry
                  </button>

                  <button
                    type="button"
                    onClick={handleShare}
                    className="mt-3 px-8 py-3 rounded-full border border-[var(--yl-card-border)] bg-white/85 text-[var(--yl-ink-muted)] font-bold transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--yl-focus-ring)]"
                  >
                    Share With Friends
                  </button>

                  {shareNotice && (
                    <div className="mt-2 text-sm font-bold text-[var(--yl-ink-muted)]">{shareNotice}</div>
                  )}

                  <button
                    type="button"
                    onClick={onExitToHome}
                    className="mt-3 text-sm font-bold text-[var(--yl-primary-deep)] underline underline-offset-4"
                  >
                    Back to Home
                  </button>
                </>
              )}
            </div>
          )}

          {items.map((item) => (
            <div
              key={item.id}
              style={{ left: `${item.x}%`, top: `${item.y}%` }}
              className="absolute text-4xl flex items-center justify-center w-8 h-8"
            >
              {item.image ? (
                <img
                  src={`/${item.image}`}
                  alt="falling item"
                  draggable={false}
                  className="w-8 h-8"
                  style={{ transform: `scale(${imageScaleBoost(item.image)})` }}
                />
              ) : (
                item.emoji
              )}
            </div>
          ))}

          {pops.map((p) => {
            const age = (performance.now() - p.born) / 1000;
            const opacity = Math.max(0, 1 - age / 0.7);
            const rise = Math.min(12, age * 20);
            const isLoss = p.kind === "loss";

            return (
              <div
                key={p.id}
                className={`absolute pointer-events-none select-none font-extrabold ${
                  isLoss ? "text-red-600" : "text-pink-600"
                }`}
                style={{
                  left: `${p.x}%`,
                  top: `${p.y - rise}%`,
                  opacity,
                  transform: `translateX(-50%) rotate(${tilt}deg) scale(${bounce ? 1.08 : 1})`,
                  transition: "transform 120ms ease",
                  textShadow: isLoss
                    ? "0 2px 10px rgba(185,28,28,0.28)"
                    : "0 2px 10px rgba(0,0,0,0.12)",
                }}
              >
                {p.text}
              </div>
            );
          })}

          {phase === "play" && (
            <div
              className="absolute bottom-0"
              style={{ left: `${playerX}%`, transform: "translateX(-50%)", width: 96, height: 96 }}
            >
              <img
                src={`/${character}.png`}
                alt="character"
                draggable={false}
                className="w-24 select-none"
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Time Attack Final Reveal Screen ── */}
      {phase === "over" && mode === "timeAttack" && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden px-3 py-3 sm:py-6"
          style={{
            background:
              "radial-gradient(circle at 50% 0%, #fff8fc 0%, #fce4f0 50%, #f3c0db 100%)",
          }}
        >
          <div className="reveal-fade-in flex aspect-[3/5] sm:aspect-[9/16] w-full max-w-[430px] flex-col items-center justify-between overflow-hidden rounded-3xl border border-white/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.72),rgba(255,241,248,0.94))] px-3 py-4 text-center shadow-[0_24px_50px_rgba(150,9,83,0.22)] sm:gap-3 sm:px-4 sm:py-5">
            {/* Header */}
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--yl-primary)]">
                Time Attack
              </p>
              <h2 className="mt-0.5 text-3xl font-black text-[var(--yl-ink-strong)]">Time&apos;s Up! 🍦</h2>
              <p className="mt-1 text-base font-bold text-[var(--yl-ink-muted)]">
                {score >= 25
                  ? "Amazing! 🌟"
                  : score >= 15
                    ? "Great job! 🎉"
                    : score >= 5
                      ? "Nice catch! ✨"
                      : "Keep going! 🍨"}
              </p>
            </div>

            {/* Score badge */}
            <div className="rounded-2xl bg-white/90 px-8 py-2 shadow ring-1 ring-[var(--yl-card-border)] sm:px-9 sm:py-2.5">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--yl-primary)]">Score</p>
              <p className="text-4xl font-black text-[var(--yl-ink-strong)] sm:text-[2.6rem]">{score}</p>
            </div>

            {/* Cup + toppings */}
            <div className="relative h-72 w-64 max-w-full sm:h-80 sm:w-72">
              {!finalCupLoadFailed ? (
                <img
                  src="/final-cup.png?v=20260223"
                  alt="Your ice cream cup"
                  className="h-full w-full select-none object-contain drop-shadow-xl"
                  draggable={false}
                  onLoad={() => setFinalCupLoadFailed(false)}
                  onError={() => setFinalCupLoadFailed(true)}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center rounded-[2rem] bg-white/45 ring-1 ring-[var(--yl-card-border)]">
                  <span className="text-7xl">🍨</span>
                </div>
              )}
              {collectedToppings.slice(0, 22).map((t, i) => (
                <div
                  key={t.id}
                  className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${t.x}%`, top: `${t.y}%` }}
                >
                  <div
                    className="topping-reveal"
                    style={
                      {
                        "--rot": `${t.rotate}deg`,
                        animationDelay: `${i * 55}ms`,
                      } as CSSProperties
                    }
                  >
                    {t.image ? (
                      <img
                        src={`/${t.image}`}
                        alt=""
                        className="h-7 w-7"
                        draggable={false}
                        style={{ transform: `scale(${t.scale * imageScaleBoost(t.image)})` }}
                      />
                    ) : (
                      <span
                        className="text-2xl leading-none"
                        style={{ display: "block", transform: `scale(${t.scale})` }}
                      >
                        {t.emoji}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Buttons */}
            <div className="flex w-full max-w-sm flex-col">
              <button
                type="button"
                onClick={start}
                className="px-10 py-4 rounded-full border border-[var(--yl-primary)] bg-white text-[var(--yl-primary)] font-extrabold shadow-sm transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--yl-focus-ring)]"
              >
                Retry
              </button>

              <button
                type="button"
                onClick={handleShare}
                className="mt-3 px-8 py-3 rounded-full border border-[var(--yl-card-border)] bg-white/85 text-[var(--yl-ink-muted)] font-bold transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--yl-focus-ring)]"
              >
                Share With Friends
              </button>

              {shareNotice && (
                <div className="mt-2 text-sm font-bold text-[var(--yl-ink-muted)]">{shareNotice}</div>
              )}

              <button
                type="button"
                onClick={onExitToHome}
                className="mt-3 text-sm font-bold text-[var(--yl-primary-deep)] underline underline-offset-4"
              >
                Back to Home
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
