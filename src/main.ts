import { inject } from "@vercel/analytics";
import packageJson from "../package.json";
import { type GameConfig, NORMAL_CONFIG, TOKUJO_CONFIG } from "./config";
import { RANKS } from "./data/ranks";
import { RANDOM_SUSHI_DEFS, SUSHI_DEFS, SUSHI_GROUPS } from "./data/sushi";
import { TAISHO_LINES } from "./data/taisho";
import { generateVariants } from "./romaji";
import type { ActiveSushi, RankDef, SushiDef } from "./types";


inject();

let currentConfig: GameConfig = NORMAL_CONFIG;

const SUSHI_MAP = new Map<string, SushiDef>();
for (const d of SUSHI_DEFS) {
	SUSHI_MAP.set(d.reading, d);
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
let timeLeft = currentConfig.INITIAL_TIME;
let startTime = 0;
let sushiIdCounter = 0;
let activeSushi: ActiveSushi[] = [];
let nextSpawnTime = 0;
let lastCaptureTime = 0;
let last10sTriggered = false;
let idleTimer = 0;
let lastKeyTime = 0;
let animFrameId = 0;
let gameTimerId = 0;
const currentTaishoEmoji = "🧑🏻‍🍳";
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
const appFooter = document.querySelector(".app-footer");
const appVersion = document.getElementById("app-version");
if (appVersion) {
	appVersion.textContent = `v${packageJson.version}`;
}

// Result refs
const resultScore = getElement("result-score");
const resultPlates = getElement("result-plates");
const resultCombo = getElement("result-combo");
const resultSimul = getElement("result-simul");
const resultRankEmoji = getElement("result-rank-emoji");
const resultRankName = getElement("result-rank-name");
const resultRankComment = getElement("result-rank-comment");
const resultTaisho = getElement("result-taisho");
const resultMode = getElement("result-mode");
const shareBtn = getElement("share-btn");
const topBtn = getElement("top-btn");
const tokujoBtn = getElement("tokujo-btn");

// ---------- Utility ----------

function shuffle<T>(arr: T[]): T[] {
	const a = [...arr];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

function getReadingCharCount(reading: string): number {
	return reading.length;
}

function getSimultaneousMultiplier(count: number): number {
	if (count <= 1) return currentConfig.SIMULTANEOUS_MULTIPLIERS[1];
	if (count === 2) return currentConfig.SIMULTANEOUS_MULTIPLIERS[2];
	if (count === 3) return currentConfig.SIMULTANEOUS_MULTIPLIERS[3];
	return currentConfig.SIMULTANEOUS_MULTIPLIERS[4];
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

// ---------- Spawn Logic ----------

let remainingRandomReadings: string[] = [];
let pendingGroupReadings: string[] = [];
let remainingGroupIds: string[] = [];
let nextGroupPickElapsedSec = 10;

function resetRandomReadingPool() {
	remainingRandomReadings = shuffle(RANDOM_SUSHI_DEFS.map((d) => d.reading));
}

function resetGroupingState() {
	pendingGroupReadings = [];
	remainingGroupIds = shuffle(SUSHI_GROUPS.map((g) => g.id));
	nextGroupPickElapsedSec = 10;
}

function pickNextRandomReading(): string {
	return remainingRandomReadings.shift() ?? "";
}

function maybeStartNextGroup(elapsedSec: number) {
	if (elapsedSec < 10) return;
	if (elapsedSec < nextGroupPickElapsedSec) return;
	if (pendingGroupReadings.length > 0) return;
	if (remainingGroupIds.length === 0) return;

	const groupId = remainingGroupIds.shift()!;
	const group = SUSHI_GROUPS.find((g) => g.id === groupId);
	if (!group) return;
	pendingGroupReadings = [...group.readings];
	nextGroupPickElapsedSec += 10;
}

function pickNextReadingForSpawn(): string {
	if (pendingGroupReadings.length > 0) {
		return pendingGroupReadings.shift() ?? "";
	}
	return pickNextRandomReading();
}

let lastSpawnLane = -1;

const BASE_WIDTH = 1000;

function getScaleRatio(): number {
	const currentWidth = laneArea.clientWidth || BASE_WIDTH;
	return currentWidth / BASE_WIDTH;
}

// function definition moved down

function spawnSushi(reading: string, laneIndex: number) {
	const def = SUSHI_MAP.get(reading);
	if (!def) return;

	const patterns = generateVariants(def.reading);
	const y =
		currentConfig.LANE_Y_POSITIONS[laneIndex] ||
		currentConfig.LANE_Y_POSITIONS[0];

	const scaleRatio = getScaleRatio();
	// Spawn slightly off-screen to the right, scaled
	const spawnX =
		laneArea.clientWidth + currentConfig.SPAWN_X_OFFSET * scaleRatio;

	const sushi: ActiveSushi = {
		id: sushiIdCounter++,
		def,
		patterns,
		matchIndices: new Array(patterns.length).fill(0),
		x: spawnX,
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

// ... (omitted) ...

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
	const emojis = currentConfig.TAISHO_EMOJIS;
	const currentTaishoEmoji = emojis[Math.floor(Math.random() * emojis.length)];
	taishoEmoji.textContent = currentTaishoEmoji;
	taishoBubble.textContent =
		getTaishoLine("start") || "いらっしゃい！何でも握るよ！";
	clearTimeout(taishoTimeout);
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
		if (inputDisplay.textContent && inputDisplay.textContent.length > 20) {
			inputDisplay.textContent = inputDisplay.textContent.slice(-20);
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

			const basePoints =
				currentConfig.BASE_POINTS + getReadingCharCount(sushi.def.reading);
			const comboMultiplier = 1 + combo * currentConfig.COMBO_MULTIPLIER_RATE;
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
			const charCount = getReadingCharCount(capturedThisTick[0].def.reading);
			if (charCount >= currentConfig.LONG_READING_THRESHOLD) {
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
	maybeStartNextGroup(elapsed);

	const scaleRatio = getScaleRatio();

	// Calculate base speed
	const baseSpeed = Math.min(
		currentConfig.INITIAL_SPEED + elapsed * currentConfig.SPEED_UP_RATE,
		currentConfig.MAX_SPEED,
	);

	// Apply scale ratio to speed so visual traversal time is consistent
	const speed = baseSpeed * scaleRatio;

	// Scale Despawn X
	const despawnX = currentConfig.DESPAWN_X * scaleRatio;

	for (const sushi of activeSushi) {
		if (sushi.captured) continue;
		sushi.x -= speed;
		sushi.el.style.left = sushi.x + "px";

		if (sushi.x < despawnX) {
			sushi.el.remove();
			combo = 0;
			comboValue.textContent = "0";
			setTaishoLine("missed");
		}
	}

	activeSushi = activeSushi.filter((s) => {
		if (s.captured) return true;
		if (s.x < despawnX) return false;
		return true;
	});

	const liveCount = activeSushi.filter((s) => !s.captured).length;
	// 残りの寿司が少ない場合（閾値以下）は、出現時間を待たずに即座に出現させる
	const shouldSpawnImmediately =
		liveCount <= currentConfig.IMMEDIATE_SPAWN_THRESHOLD;

	if (
		timeLeft > 0 &&
		(pendingGroupReadings.length > 0 || remainingRandomReadings.length > 0) &&
		liveCount < currentConfig.MAX_LIVE_SUSHI &&
		(timestamp >= nextSpawnTime || shouldSpawnImmediately)
	) {
		const laneWidth = laneArea.clientWidth || 800;
		const availableLanes: number[] = [];
		const minSpawnDistance = currentConfig.MIN_SPAWN_DISTANCE * scaleRatio;

		// Check each lane for space
		for (let i = 0; i < currentConfig.LANE_Y_POSITIONS.length; i++) {
			const laneY = currentConfig.LANE_Y_POSITIONS[i];
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
				// Check distance including scaled MIN_SPAWN_DISTANCE
				// Also consider that rightMostX is the *left* edge of the sushi?
				// The prompt says "sushi.x" is generally used for position.
				// Assuming s.x is left edge.
				// We want the new sushi (spawn at laneWidth + offset) to be far enough.
				// The condition "rightMostX < laneWidth - MIN_SPAWN_DISTANCE" implies:
				// If the rightmost existing sushi is further to the left than (laneWidth - distance),
				// then there is enough space (distance) between it and the right edge (where new one spawns).
				if (rightMostX < laneWidth - minSpawnDistance) {
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

			const reading = pickNextReadingForSpawn();
			if (reading) {
				spawnSushi(reading, targetLane);
			}
			lastSpawnLane = targetLane;

			// Calculate next spawn time based on progress
			// As time passes, interval gets shorter
			const progress = Math.min(elapsed / currentConfig.INITIAL_TIME, 1.0);

			const currentBase =
				currentConfig.SPAWN_INTERVAL_BASE -
				(currentConfig.SPAWN_INTERVAL_BASE - currentConfig.SPAWN_INTERVAL_MIN) *
					progress;

			const currentRandom =
				currentConfig.SPAWN_INTERVAL_RANDOM * (1.0 - progress * 0.5);

			nextSpawnTime = timestamp + currentBase + Math.random() * currentRandom;

			// 即時出現モードの場合は、次の出現までの時間を短縮する
			if (shouldSpawnImmediately) {
				nextSpawnTime = timestamp + currentConfig.IMMEDIATE_SPAWN_DELAY;
			}
		}
	}

	// 1ゲーム中に同一寿司を出さないため、寿司を使い切ったらゲームを終了する
	if (
		timeLeft > 0 &&
		pendingGroupReadings.length === 0 &&
		remainingRandomReadings.length === 0 &&
		remainingGroupIds.length === 0 &&
		activeSushi.length === 0
	) {
		endGame();
		return;
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
	timeLeft = currentConfig.INITIAL_TIME;
	timeValue.textContent = String(currentConfig.INITIAL_TIME);

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

function startGame(config: GameConfig = NORMAL_CONFIG) {
	currentConfig = config;
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
	timeLeft = currentConfig.INITIAL_TIME;
	sushiIdCounter = 0;
	activeSushi = [];
	last10sTriggered = false;
	idleTimer = 0;
	lastKeyTime = 0;
	lastCaptureTime = 0;

	lastSpawnLane = -1;
	setRandomTaisho();
	resetRandomReadingPool();
	resetGroupingState();

	const sushiEls = laneArea.querySelectorAll(".sushi-item, .score-popup");
	sushiEls.forEach((el) => {
		el.remove();
	});

	scoreValue.textContent = "0";
	comboValue.textContent = "0";
	timeValue.textContent = String(currentConfig.INITIAL_TIME);
	inputDisplay.textContent = "";
	inputHint.textContent = "キーボードで寿司を打とう";

	titleScreen.style.display = "none";
	resultScreen.style.display = "none";
	titleScreen.style.display = "none";
	resultScreen.style.display = "none";
	gameScreen.style.display = "flex";
	appFooter?.classList.add("hidden");

	nextSpawnTime = performance.now();

	startCountdown(() => {
		gameState = "playing";
		startTime = performance.now();
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
	appFooter?.classList.remove("hidden");

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
	resultMode.textContent = `${currentConfig.MODE_NAME}モード`;

	if (currentConfig.MODE_NAME === "特上") {
		resultMode.style.borderColor = "#ffd700";
		resultMode.style.color = "#ffd700";
		resultMode.style.boxShadow = "0 0 10px rgba(255, 215, 0, 0.3)";
	} else {
		resultMode.style.borderColor = "var(--cyber-blue)";
		resultMode.style.color = "var(--cyber-blue)";
		resultMode.style.boxShadow = "0 0 10px rgba(0, 243, 255, 0.2)";
	}
}

function getShareText(): string {
	const rank = getRank(score);
	// resultTaisho のテキストから現在のコメントを取得（ランダム性を保持するため）
	const commentText = resultTaisho.textContent || "";
	const commentMatch = commentText.match(/「(.*)」/);
	const currentComment = commentMatch ? commentMatch[1] : rank.taisho[0];

	return `🍣 タイピング回転寿司 量子マグロ亭
【${currentConfig.MODE_NAME}モード】

${rank.emoji} ${rank.name}
スコア: ${score.toLocaleString()}
取った皿: ${totalPlates}皿
最大コンボ: ${maxCombo}
最大同時取り: ${maxSimultaneous}皿！

${currentTaishoEmoji} 大将「${currentComment}」

https://quantum-maguro.vercel.app/
#量子マグロ亭`;
}

// ---------- Event Listeners ----------

startBtn.addEventListener("click", () => {
	startGame(NORMAL_CONFIG);
});

tokujoBtn.addEventListener("click", () => {
	startGame(TOKUJO_CONFIG);
});

topBtn.addEventListener("click", () => {
	gameState = "title";
	titleScreen.style.display = "flex";
	gameScreen.style.display = "none";
	resultScreen.style.display = "none";
	appFooter?.classList.remove("hidden");
	setRandomTaisho();
});

shareBtn.addEventListener("click", () => {
	const text = getShareText();
	const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
	window.open(url, "_blank", "noopener,noreferrer");
});

document.addEventListener("keydown", (e) => {
	if (gameState === "playing") {
		if (e.key.length === 1 && /^[a-zA-Z-]$/.test(e.key)) {
			e.preventDefault();
			handleKeyInput(e.key.toLowerCase());
		} else if (e.key === "Enter" && import.meta.env.DEV) {
			e.preventDefault();
			handleKeyInput("", true);
		}
	}

	if (gameState === "title" && e.key === "Enter") {
		startGame(NORMAL_CONFIG);
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

// ---------- Software Keyboard ----------

function initSoftwareKeyboard() {
	const keyboardArea = document.getElementById("keyboard-area");
	if (!keyboardArea) return;

	const layout = [
		["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
		["a", "s", "d", "f", "g", "h", "j", "k", "l"],
		["z", "x", "c", "v", "b", "n", "m"],
	];

	keyboardArea.innerHTML = ""; // Clear existing

	layout.forEach((rowChars, rowIndex) => {
		const rowEl = document.createElement("div");
		rowEl.className = "keyboard-row";

		// Indent for second and third rows to look like a real keyboard
		if (rowIndex === 1) {
			const spacer = document.createElement("div");
			spacer.className = "key-spacer";
			rowEl.appendChild(spacer);
		} else if (rowIndex === 2) {
			const spacer = document.createElement("div");
			spacer.className = "key-spacer";
			spacer.style.flex = "1.5";
			rowEl.appendChild(spacer);
		}

		rowChars.forEach((char) => {
			const keyEl = document.createElement("div");
			keyEl.className = "key";
			keyEl.textContent = char.toUpperCase();
			keyEl.dataset.key = char;

			// Touch handling
			keyEl.addEventListener(
				"touchstart",
				(e) => {
					e.preventDefault(); // Prevent scroll/zoom
					e.stopPropagation();
					handleKeyInput(char);
					keyEl.classList.add("active");
					// Remove active class after short delay
					setTimeout(() => keyEl.classList.remove("active"), 100);
				},
				{ passive: false },
			);

			// Mouse handling for testing
			keyEl.addEventListener("mousedown", (e) => {
				e.preventDefault();
				handleKeyInput(char);
				keyEl.classList.add("active");
			});
			keyEl.addEventListener("mouseup", () => {
				keyEl.classList.remove("active");
			});
			keyEl.addEventListener("mouseleave", () => {
				keyEl.classList.remove("active");
			});

			rowEl.appendChild(keyEl);
		});

		if (rowIndex === 1) {
			const spacer = document.createElement("div");
			spacer.className = "key-spacer";
			rowEl.appendChild(spacer);
		} else if (rowIndex === 2) {
			const spacer = document.createElement("div");
			spacer.className = "key-spacer";
			spacer.style.flex = "1.5";
			rowEl.appendChild(spacer);

			// Add Backspace/Hyphen if needed?
			// Current input doesn't really need backspace as it's just typing forward.
			// But maybe a hyphen '-' is needed for some romaji?
			// Checking existing code, /^[a-zA-Z-]$/ is allowed.
			const hyphenKey = document.createElement("div");
			hyphenKey.className = "key";
			hyphenKey.textContent = "-";
			hyphenKey.dataset.key = "-";
			hyphenKey.addEventListener(
				"touchstart",
				(e) => {
					e.preventDefault();
					handleKeyInput("-");
					hyphenKey.classList.add("active");
					setTimeout(() => hyphenKey.classList.remove("active"), 100);
				},
				{ passive: false },
			);
			hyphenKey.addEventListener("mousedown", (e) => {
				e.preventDefault();
				handleKeyInput("-");
				hyphenKey.classList.add("active");
			});
			hyphenKey.addEventListener("mouseup", () => {
				hyphenKey.classList.remove("active");
			});
			hyphenKey.addEventListener("mouseleave", () => {
				hyphenKey.classList.remove("active");
			});
			rowEl.appendChild(hyphenKey);
		}

		keyboardArea.appendChild(rowEl);
	});

	// Prevent double-tap zoom on the keyboard area
	keyboardArea.addEventListener(
		"touchstart",
		(e) => {
			if (
				e.target === keyboardArea ||
				(e.target as HTMLElement).classList.contains("keyboard-row")
			) {
				e.preventDefault();
			}
		},
		{ passive: false },
	);
}

// ---------- Keyboard Toggle ----------

const keyboardToggleBtn = document.getElementById("keyboard-toggle-btn");
if (keyboardToggleBtn) {
	keyboardToggleBtn.addEventListener("click", () => {
		gameScreen.classList.toggle("keyboard-active");
	});
}

// ---------- Initial State ----------

initSoftwareKeyboard();
// Auto-show keyboard on mobile/tablet
if (window.innerWidth <= 1024) {
	gameScreen.classList.add("keyboard-active");
}

gameState = "title";
titleScreen.style.display = "flex";
gameScreen.style.display = "none";
resultScreen.style.display = "none";
appFooter?.classList.remove("hidden");
setRandomTaisho();
