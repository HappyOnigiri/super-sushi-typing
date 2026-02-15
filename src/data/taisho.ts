import type { TaishoLine } from "../types";

export const TAISHO_LINES: TaishoLine[] = [
	{ trigger: "start", lines: ["いらっしゃい！何でも握るよ！"] },
	{
		trigger: "capture1",
		lines: ["へい、お待ち！", "あいよ！", "いい食いっぷりだ！", "はい一丁！"],
	},
	{
		trigger: "simul2",
		lines: [
			"おっと！二貫同時！",
			"両手で握った甲斐があった！",
			"二貫同時とは…やるねぇ！",
		],
	},
	{
		trigger: "simul3",
		lines: [
			"な…何が起きた！？",
			"大将の目が追いつかない！",
			"三貫同時！？正気か！？",
		],
	},
	{
		trigger: "simul4",
		lines: ["伝説だ…伝説が生まれた…", "この光景、一生忘れない…"],
	},
	{ trigger: "combo5", lines: ["止まらないね！", "いい手つきだ！"] },
	{
		trigger: "combo10",
		lines: ["天才寿司タイパーの誕生だ！", "もう弟子入りしてくれ！"],
	},
	{
		trigger: "missed",
		lines: [
			"あー、流れちゃった…",
			"あの寿司は自由を求めていたんだ",
			"惜しかったねぇ…",
		],
	},
	{
		trigger: "long_complete",
		lines: ["長いネタお見事！", "心肺機能も握りの一部"],
	},
	{ trigger: "last10", lines: ["ラストスパートだ！", "最後の追い込み！"] },
	{
		trigger: "idle",
		lines: ["…お茶でもどうぞ", "大将暇になってきた", "…ガリでもつまむ？"],
	},
];
