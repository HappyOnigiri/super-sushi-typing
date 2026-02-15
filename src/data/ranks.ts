import type { RankDef } from "../types";

export const RANKS: RankDef[] = [
	{
		minScore: 5000,
		name: "伝説の寿司マスター",
		emoji: "🌟",
		taisho: "弟子にしてください",
	},
	{
		minScore: 3000,
		name: "量子寿司職人",
		emoji: "⚛️",
		taisho: "うちで働かないか？",
	},
	{
		minScore: 1500,
		name: "創作寿司の達人",
		emoji: "🔥",
		taisho: "いい仕事してたね",
	},
	{
		minScore: 700,
		name: "見習い寿司タイパー",
		emoji: "🍣",
		taisho: "もうちょい頑張れ！",
	},
	{
		minScore: 300,
		name: "迷える寿司客",
		emoji: "😵‍💫",
		taisho: "お茶でも飲む？",
	},
	{ minScore: 0, name: "概念未満", emoji: "👻", taisho: "…お会計だけでいい？" },
];
