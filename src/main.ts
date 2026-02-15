import { GAME_CONFIG } from "./config";
import { RANKS } from "./data/ranks";
import { SUSHI_DEFS, SUSHI_SETS } from "./data/sushi";
import { TAISHO_LINES } from "./data/taisho";
import type { ActiveSushi, RankDef, SushiDef, SushiSet } from "./types";

const SUSHI_MAP = new Map<string, SushiDef>();
for (const d of SUSHI_DEFS) {
	SUSHI_MAP.set(d.reading, d);
}

// ---------- Romaji Variant Generation ----------

const ROMAJI_SWAPS: [string, string][] = [
	["shi", "si"],
	["chi", "ti"],
	["tsu", "tu"],
	["fu", "hu"],
	["ji", "zi"],
	["sha", "sya"],
	["shu", "syu"],
	["sho", "syo"],
	["cha", "tya"],
	["chu", "tyu"],
	["cho", "tyo"],
	["ja", "zya"],
	["ju", "zyu"],
	["jo", "zyo"],
];

function generateVariants(reading: string): string[] {
	let variants = new Set<string>([reading]);

	// 伸ばし棒（ハイフン）のバリエーション生成: "sa-mon" -> "saamon" も許容する
	for (const v of Array.from(variants)) {
		if (v.includes("-")) {
			let replaced = v;
			while (replaced.includes("-")) {
				const idx = replaced.indexOf("-");
				if (idx > 0) {
					const vowel = replaced[idx - 1];
					replaced =
						replaced.substring(0, idx) + vowel + replaced.substring(idx + 1);
				} else {
					replaced = replaced.replace("-", "");
				}
			}
			variants.add(replaced);
		}
	}

	for (const [a, b] of ROMAJI_SWAPS) {
		const newVariants = new Set<string>();
		for (const v of variants) {
			newVariants.add(v);
			if (v.includes(a)) {
				newVariants.add(v.split(a).join(b));
			}
			if (v.includes(b)) {
				newVariants.add(v.split(b).join(a));
			}
		}
		variants = newVariants;
	}

	const arr = Array.from(variants);
	if (arr.length > 16) {
		return arr.slice(0, 16);
	}
	return arr;
}

// ---------- Taisho Lines ----------

function getTaishoLine(trigger: string): string {
	const entry = TAISHO_LINES.find((t) => t.trigger === trigger);
	if (!entry) return "";
	return entry.lines[Math.floor(Math.random() * entry.lines.length)];
}

// ---------- Game State ----------

let gameState: "title" | "playing" | "result" = "title";
let score = 0;
let combo = 0;
let maxCombo = 0;
let maxSimultaneous = 0;
let totalPlates = 0;
let timeLeft = GAME_CONFIG.INITIAL_TIME;
let startTime = 0;
let sushiIdCounter = 0;
let activeSushi: ActiveSushi[] = [];
let setQueue: SushiSet[] = [];
let currentSetSushiReadings: string[] = [];
let currentSetIndex = 0;
let nextSpawnTime = 0;
let lastCaptureTime = 0;
let last10sTriggered = false;
let idleTimer = 0;
let lastKeyTime = 0;
let animFrameId = 0;
let gameTimerId = 0;
let currentTaishoEmoji = "🧑🏻‍🍳";
let countdownIntervalId = 0;

// DOM helper
function getElement<T extends HTMLElement>(id: string): T {
	const el = document.getElementById(id);
	if (!el) throw new Error(`Element with id ${id} not found`);
	return el as T;
}

// DOM refs
const titleScreen = getElement("title-screen");
const gameScreen = getElement("game-screen");
const resultScreen = getElement("result-screen");
const startBtn = getElement("start-btn");
const scoreValue = getElement("score-value");
const comboValue = getElement("combo-value");
const timeValue = getElement("time-value");
const laneArea = getElement("lane-area");
const inputDisplay = getElement("input-display");
const inputHint = getElement("input-hint");
const taishoBubble = getElement("taisho-bubble");
const taishoEmoji = getElement("taisho-emoji");
const countdownOverlay = getElement("countdown-overlay");
const comboBurst = getElement("combo-burst");

// Result refs
const resultScore = getElement("result-score");
const resultPlates = getElement("result-plates");
const resultCombo = getElement("result-combo");
const resultSimul = getElement("result-simul");
const resultRankEmoji = getElement("result-rank-emoji");
const resultRankName = getElement("result-rank-name");
const resultRankComment = getElement("result-rank-comment");
const resultTaisho = getElement("result-taisho");
const shareBtn = getElement("share-btn");
const retryBtn = getElement("retry-btn");

// ---------- Utility ----------

function shuffle<T>(arr: T[]): T[] {
	const a = [...arr];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

function getBasePoints(length: "short" | "medium" | "long"): number {
	return GAME_CONFIG.BASE_POINTS[length] || 0;
}

function getSimultaneousMultiplier(count: number): number {
	if (count <= 1) return GAME_CONFIG.SIMULTANEOUS_MULTIPLIERS[1];
	if (count === 2) return GAME_CONFIG.SIMULTANEOUS_MULTIPLIERS[2];
	if (count === 3) return GAME_CONFIG.SIMULTANEOUS_MULTIPLIERS[3];
	return GAME_CONFIG.SIMULTANEOUS_MULTIPLIERS[4];
}

// ---------- Sushi DOM ----------

function createSushiElement(sushi: ActiveSushi): HTMLElement {
	const el = document.createElement("div");
	el.className = "sushi-item";
	el.dataset.sushiId = String(sushi.id);
	el.style.bottom = sushi.y + "px";

	const nameEl = document.createElement("div");
	nameEl.className = "sushi-name";
	nameEl.textContent = sushi.def.name;

	const readingEl = document.createElement("div");
	readingEl.className = "sushi-reading";
	updateReadingDisplay(readingEl, sushi);

	const emojiEl = document.createElement("div");
	emojiEl.className = "sushi-emoji";
	emojiEl.textContent = "🍣";

	const plateEl = document.createElement("div");
	plateEl.className = "sushi-plate";

	el.appendChild(nameEl);
	el.appendChild(readingEl);
	el.appendChild(emojiEl);
	el.appendChild(plateEl);

	return el;
}

function updateReadingDisplay(readingEl: HTMLElement, sushi: ActiveSushi) {
	let bestPatternIdx = 0;
	let bestVal = -1;
	for (let i = 0; i < sushi.matchIndices.length; i++) {
		if (sushi.matchIndices[i] > bestVal) {
			bestVal = sushi.matchIndices[i];
			bestPatternIdx = i;
		}
	}
	const pattern = sushi.patterns[bestPatternIdx];
	const matchIdx = sushi.matchIndices[bestPatternIdx];

	readingEl.innerHTML = "";
	const matched = document.createElement("span");
	matched.className = "matched";
	matched.textContent = pattern.substring(0, matchIdx);
	const unmatched = document.createElement("span");
	unmatched.className = "unmatched";
	unmatched.textContent = pattern.substring(matchIdx);
	readingEl.appendChild(matched);
	readingEl.appendChild(unmatched);
}

function updateSushiVisuals(sushi: ActiveSushi) {
	const el = sushi.el;
	const bestMatchIndex = Math.max(...sushi.matchIndices, 0);
	const bestPatternIdx = sushi.matchIndices.indexOf(bestMatchIndex);
	const pattern = sushi.patterns[bestPatternIdx >= 0 ? bestPatternIdx : 0];
	const remaining = pattern.length - bestMatchIndex;

	el.classList.remove("glowing", "almost");
	if (bestMatchIndex > 0 && remaining > 3) {
		el.classList.add("glowing");
	} else if (bestMatchIndex > 0 && remaining <= 3) {
		el.classList.add("almost");
	}

	const readingEl = el.querySelector(".sushi-reading") as HTMLElement;
	if (readingEl) updateReadingDisplay(readingEl, sushi);
}

// ---------- Set / Spawn Logic ----------

function buildSetQueue(): SushiSet[] {
	const typeB = SUSHI_SETS.filter((s) => s.type === "B");
	const typeAC = SUSHI_SETS.filter((s) => s.type === "A" || s.type === "C");
	const typeD = SUSHI_SETS.filter((s) => s.type === "D");

	const shuffledB = shuffle(typeB);
	const shuffledAC = shuffle(typeAC);
	const shuffledD = shuffle(typeD);

	const result: SushiSet[] = [];
	result.push(...shuffledB.slice(0, 2));
	const remaining = [...shuffledAC, ...shuffledB.slice(2)];
	result.push(...shuffle(remaining));
	result.push(...shuffledD);

	return result;
}

function loadNextSet() {
	if (setQueue.length === 0) {
		setQueue = buildSetQueue();
		currentSetIndex = 0;
	}
	if (currentSetIndex >= setQueue.length) {
		setQueue = buildSetQueue();
		currentSetIndex = 0;
	}
	const set = setQueue[currentSetIndex++];
	currentSetSushiReadings = [...set.readings];
	nextSpawnTime = performance.now();
}

let lastSpawnLane = -1;

function spawnSushi(reading: string, laneIndex: number) {
	const def = SUSHI_MAP.get(reading);
	if (!def) return;

	const patterns = generateVariants(def.reading);
	const y =
		GAME_CONFIG.LANE_Y_POSITIONS[laneIndex] || GAME_CONFIG.LANE_Y_POSITIONS[0];

	const sushi: ActiveSushi = {
		id: sushiIdCounter++,
		def,
		patterns,
		matchIndices: new Array(patterns.length).fill(0),
		x: laneArea.clientWidth + GAME_CONFIG.SPAWN_X_OFFSET,
		y: y,
		el: null!,
		captured: false,
		capturedAt: 0,
	};

	const el = createSushiElement(sushi);
	sushi.el = el;
	laneArea.appendChild(el);
	el.style.left = sushi.x + "px";

	activeSushi.push(sushi);
}

// ---------- Score Popup ----------

function showScorePopup(
	x: number,
	y: number,
	text: string,
	simultaneous: boolean,
) {
	const popup = document.createElement("div");
	popup.className = "score-popup" + (simultaneous ? " simultaneous" : "");
	popup.textContent = text;
	popup.style.left = x + "px";
	popup.style.top = y + "px";
	laneArea.appendChild(popup);
	setTimeout(() => popup.remove(), 1000);
}

// ---------- Combo Burst ----------

function showComboBurst(text: string) {
	comboBurst.textContent = text;
	comboBurst.classList.remove("show");
	void comboBurst.offsetWidth;
	comboBurst.classList.add("show");
	setTimeout(() => comboBurst.classList.remove("show"), 800);
}

// ---------- Taisho ----------

function setRandomTaisho() {
	const emojis = GAME_CONFIG.TAISHO_EMOJIS;
	currentTaishoEmoji = emojis[Math.floor(Math.random() * emojis.length)];
	taishoEmoji.textContent = currentTaishoEmoji;
}

let taishoTimeout = 0;

function setTaishoLine(trigger: string) {
	const line = getTaishoLine(trigger);
	if (!line) return;
	taishoBubble.textContent = line;
	clearTimeout(taishoTimeout);
	taishoTimeout = window.setTimeout(() => {}, 2500);
}

// ---------- Input Handler ----------

function handleKeyInput(char: string, isDebugAutoMatch = false) {
	if (gameState !== "playing") return;

	lastKeyTime = performance.now();
	idleTimer = 0;

	if (!isDebugAutoMatch) {
		inputDisplay.textContent = (inputDisplay.textContent || "") + char;
		if (inputDisplay.textContent && inputDisplay.textContent.length > 25) {
			inputDisplay.textContent = inputDisplay.textContent.slice(-25);
		}
	}

	const capturedThisTick: ActiveSushi[] = [];
	let anyMatch = false;

	for (const sushi of activeSushi) {
		if (sushi.captured) continue;

		for (let p = 0; p < sushi.patterns.length; p++) {
			const pattern = sushi.patterns[p];
			const idx = sushi.matchIndices[p];

			if (isDebugAutoMatch || (idx < pattern.length && char === pattern[idx])) {
				anyMatch = true;
				sushi.matchIndices[p] = isDebugAutoMatch ? idx + 1 : idx + 1;

				if (sushi.matchIndices[p] === pattern.length) {
					sushi.captured = true;
					sushi.capturedAt = performance.now();
					capturedThisTick.push(sushi);
					break;
				}
			}
		}

		if (!sushi.captured) {
			updateSushiVisuals(sushi);
		}
	}

	if (!isDebugAutoMatch && !anyMatch && activeSushi.length > 0) {
		inputDisplay.classList.remove("shake");
		void inputDisplay.offsetWidth; // trigger reflow
		inputDisplay.classList.add("shake");
	}

	if (capturedThisTick.length > 0) {
		const simultaneous = capturedThisTick.length;
		if (simultaneous > maxSimultaneous) maxSimultaneous = simultaneous;

		const simulMultiplier = getSimultaneousMultiplier(simultaneous);

		for (const sushi of capturedThisTick) {
			combo++;
			if (combo > maxCombo) maxCombo = combo;
			totalPlates++;

			const basePoints = getBasePoints(sushi.def.length);
			const comboMultiplier = 1 + combo * GAME_CONFIG.COMBO_MULTIPLIER_RATE;
			const points = Math.round(basePoints * comboMultiplier * simulMultiplier);
			score += points;

			sushi.el.classList.add("captured");

			const rect = sushi.el.getBoundingClientRect();
			const laneRect = laneArea.getBoundingClientRect();
			showScorePopup(
				rect.left - laneRect.left + 30,
				rect.top - laneRect.top,
				"+" + points,
				simultaneous > 1,
			);
		}

		lastCaptureTime = performance.now();

		scoreValue.textContent = score.toLocaleString();
		comboValue.textContent = String(combo);

		if (simultaneous >= 4) {
			setTaishoLine("simul4");
			showComboBurst("🎆 " + simultaneous + "貫同時！");
		} else if (simultaneous === 3) {
			setTaishoLine("simul3");
			showComboBurst("🔥 3貫同時！");
		} else if (simultaneous === 2) {
			setTaishoLine("simul2");
			showComboBurst("✨ 2貫同時！");
		} else {
			if (capturedThisTick[0].def.length === "long") {
				setTaishoLine("long_complete");
			} else {
				setTaishoLine("capture1");
			}
		}

		if (combo === 10) {
			setTaishoLine("combo10");
			showComboBurst("🌟 10コンボ！");
		} else if (combo === 5) {
			setTaishoLine("combo5");
		}

		for (const sushi of capturedThisTick) {
			setTimeout(() => {
				sushi.el.remove();
				const idx = activeSushi.indexOf(sushi);
				if (idx >= 0) activeSushi.splice(idx, 1);
			}, 500);
		}
	}
}

// ---------- Game Loop ----------

function gameLoop(timestamp: number) {
	if (gameState !== "playing") return;

	const elapsed = (timestamp - startTime) / 1000;
	const speed = Math.min(
		GAME_CONFIG.INITIAL_SPEED + elapsed * GAME_CONFIG.SPEED_UP_RATE,
		GAME_CONFIG.MAX_SPEED,
	);

	for (const sushi of activeSushi) {
		if (sushi.captured) continue;
		sushi.x -= speed;
		sushi.el.style.left = sushi.x + "px";

		if (sushi.x < GAME_CONFIG.DESPAWN_X) {
			sushi.el.remove();
			combo = 0;
			comboValue.textContent = "0";
			setTaishoLine("missed");
		}
	}

	activeSushi = activeSushi.filter((s) => {
		if (s.captured) return true;
		if (s.x < GAME_CONFIG.DESPAWN_X) return false;
		return true;
	});

	const liveCount = activeSushi.filter((s) => !s.captured).length;
	// 残りの寿司が少ない場合（閾値以下）は、出現時間を待たずに即座に出現させる
	const shouldSpawnImmediately =
		liveCount <= GAME_CONFIG.IMMEDIATE_SPAWN_THRESHOLD;

	if (
		timeLeft > 0 &&
		currentSetSushiReadings.length > 0 &&
		liveCount < GAME_CONFIG.MAX_LIVE_SUSHI &&
		(timestamp >= nextSpawnTime || shouldSpawnImmediately)
	) {
		const laneWidth = laneArea.clientWidth || 800;
		const availableLanes: number[] = [];

		// Check each lane for space
		for (let i = 0; i < GAME_CONFIG.LANE_Y_POSITIONS.length; i++) {
			const laneY = GAME_CONFIG.LANE_Y_POSITIONS[i];
			const laneSushis = activeSushi.filter(
				(s) => !s.captured && Math.abs(s.y - laneY) < 1,
			);

			if (laneSushis.length === 0) {
				availableLanes.push(i);
			} else {
				const rightMostX = laneSushis.reduce(
					(max, s) => Math.max(max, s.x),
					-9999,
				);
				if (rightMostX < laneWidth - GAME_CONFIG.MIN_SPAWN_DISTANCE) {
					availableLanes.push(i);
				}
			}
		}

		if (availableLanes.length > 0) {
			// Prefer different lane from last spawn
			let targetLane = -1;
			const otherLanes = availableLanes.filter((l) => l !== lastSpawnLane);

			if (otherLanes.length > 0) {
				targetLane = otherLanes[Math.floor(Math.random() * otherLanes.length)];
			} else {
				targetLane =
					availableLanes[Math.floor(Math.random() * availableLanes.length)];
			}

			const reading = currentSetSushiReadings.shift()!;
			spawnSushi(reading, targetLane);
			lastSpawnLane = targetLane;

			// Calculate next spawn time based on progress
			// As time passes, interval gets shorter
			const progress = Math.min(elapsed / GAME_CONFIG.INITIAL_TIME, 1.0);

			const currentBase =
				GAME_CONFIG.SPAWN_INTERVAL_BASE -
				(GAME_CONFIG.SPAWN_INTERVAL_BASE - GAME_CONFIG.SPAWN_INTERVAL_MIN) *
					progress;

			const currentRandom =
				GAME_CONFIG.SPAWN_INTERVAL_RANDOM * (1.0 - progress * 0.5);

			nextSpawnTime = timestamp + currentBase + Math.random() * currentRandom;

			// 即時出現モードの場合は、次の出現までの時間を短縮する
			if (shouldSpawnImmediately) {
				nextSpawnTime = timestamp + GAME_CONFIG.IMMEDIATE_SPAWN_DELAY;
			}
		}
	}

	if (timeLeft > 0 && currentSetSushiReadings.length === 0 && liveCount <= 1) {
		loadNextSet();
	}

	if (timeLeft <= 0 && activeSushi.length === 0) {
		endGame();
		return;
	}

	if (
		lastKeyTime > 0 &&
		timestamp - lastKeyTime > 5000 &&
		timestamp - lastCaptureTime > 5000
	) {
		if (idleTimer === 0) {
			setTaishoLine("idle");
			idleTimer = 1;
		}
	}

	if (timeLeft <= 10 && !last10sTriggered) {
		last10sTriggered = true;
		setTaishoLine("last10");
	}

	animFrameId = requestAnimationFrame(gameLoop);
}

// ---------- Timer ----------

function startTimer() {
	timeLeft = GAME_CONFIG.INITIAL_TIME;
	timeValue.textContent = String(GAME_CONFIG.INITIAL_TIME);

	gameTimerId = window.setInterval(() => {
		if (gameState !== "playing") return;
		timeLeft--;
		timeValue.textContent = String(Math.max(0, timeLeft));

		if (timeLeft <= 10) {
			timeValue.style.fontSize = "1.6rem";
			setTimeout(() => {
				timeValue.style.fontSize = "";
			}, 200);
		}

		if (timeLeft <= 0) {
			clearInterval(gameTimerId);
			inputHint.textContent = "最後の一皿まで握れ！";
			inputHint.style.color = "#ff6b6b";
			inputHint.style.fontWeight = "700";
		}
	}, 1000);
}

// ---------- Game Flow ----------

function startCountdown(callback: () => void) {
	countdownOverlay.style.display = "flex";
	let count = 3;
	countdownOverlay.textContent = String(count);

	countdownIntervalId = window.setInterval(() => {
		count--;
		if (count > 0) {
			countdownOverlay.textContent = String(count);
		} else if (count === 0) {
			countdownOverlay.textContent = "GO!";
		} else {
			clearInterval(countdownIntervalId);
			countdownOverlay.style.display = "none";
			callback();
		}
	}, 700);
}

function startGame() {
	// 既存の処理をキャンセル
	cancelAnimationFrame(animFrameId);
	clearInterval(gameTimerId);
	clearInterval(countdownIntervalId);
	countdownOverlay.style.display = "none";

	score = 0;
	combo = 0;
	maxCombo = 0;
	maxSimultaneous = 0;
	totalPlates = 0;
	timeLeft = GAME_CONFIG.INITIAL_TIME;
	sushiIdCounter = 0;
	activeSushi = [];
	currentSetSushiReadings = [];
	currentSetIndex = 0;
	last10sTriggered = false;
	idleTimer = 0;
	lastKeyTime = 0;
	lastCaptureTime = 0;

	lastSpawnLane = -1;
	setRandomTaisho();

	const sushiEls = laneArea.querySelectorAll(".sushi-item, .score-popup");
	sushiEls.forEach((el) => {
		el.remove();
	});

	scoreValue.textContent = "0";
	comboValue.textContent = "0";
	timeValue.textContent = String(GAME_CONFIG.INITIAL_TIME);
	inputDisplay.textContent = "";
	inputHint.textContent = "キーボードで寿司を打とう";

	titleScreen.style.display = "none";
	resultScreen.style.display = "none";
	gameScreen.style.display = "flex";

	setQueue = buildSetQueue();
	loadNextSet();

	startCountdown(() => {
		gameState = "playing";
		startTime = performance.now();
		setTaishoLine("start");
		startTimer();
		animFrameId = requestAnimationFrame(gameLoop);
	});
}

function endGame() {
	gameState = "result";
	clearInterval(gameTimerId);
	cancelAnimationFrame(animFrameId);
	showResult();
}

// ---------- Result ----------

function getRank(score: number): RankDef {
	for (const r of RANKS) {
		if (score >= r.minScore) return r;
	}
	return RANKS[RANKS.length - 1];
}

function showResult() {
	gameScreen.style.display = "none";
	resultScreen.style.display = "flex";

	const rank = getRank(score);
	const randomComment =
		rank.taisho[Math.floor(Math.random() * rank.taisho.length)];

	resultScore.textContent = score.toLocaleString();
	resultPlates.textContent = totalPlates + "皿";
	resultCombo.textContent = String(maxCombo);
	resultSimul.textContent = maxSimultaneous + "皿！";
	resultRankEmoji.textContent = rank.emoji;
	resultRankName.textContent = rank.name;
	resultRankComment.textContent = `「${rank.name}」の称号を獲得！`;
	resultTaisho.textContent = `${currentTaishoEmoji} 大将「${randomComment}」`;
}

function getShareText(): string {
	const rank = getRank(score);
	// resultTaisho のテキストから現在のコメントを取得（ランダム性を保持するため）
	const commentText = resultTaisho.textContent || "";
	const commentMatch = commentText.match(/「(.*)」/);
	const currentComment = commentMatch ? commentMatch[1] : rank.taisho[0];

	return `🍣 タイピング回転寿司 量子マグロ亭

${rank.emoji} ${rank.name}
スコア: ${score.toLocaleString()}
取った皿: ${totalPlates}皿
最大コンボ: ${maxCombo}
最大同時取り: ${maxSimultaneous}皿！

${currentTaishoEmoji} 大将「${currentComment}」

#量子マグロ亭`;
}

// ---------- Event Listeners ----------

startBtn.addEventListener("click", () => {
	startGame();
});

retryBtn.addEventListener("click", () => {
	startGame();
});

shareBtn.addEventListener("click", () => {
	const text = getShareText();
	const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
	window.open(url, "_blank", "noopener,noreferrer");
});

document.addEventListener("keydown", (e) => {
	if (gameState === "playing") {
		if (e.key.length === 1 && /^[a-zA-Z]$/.test(e.key)) {
			e.preventDefault();
			handleKeyInput(e.key.toLowerCase());
		} else if (e.key === "Enter" && import.meta.env.DEV) {
			e.preventDefault();
			handleKeyInput("", true);
		}
	}

	if (gameState === "title" && e.key === "Enter") {
		startGame();
	}

	if (gameState === "result" && e.key === "Enter") {
		// Enter でリトライしないように削除
	}
});

document.addEventListener("keydown", (e) => {
	if (e.key === " " && gameState === "playing") {
		e.preventDefault();
	}
});

// ---------- Initial State ----------

gameState = "title";
titleScreen.style.display = "flex";
gameScreen.style.display = "none";
resultScreen.style.display = "none";
setRandomTaisho();
