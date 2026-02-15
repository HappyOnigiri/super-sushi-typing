/**
 * ゲームバランス調整用定数
 */
export const GAME_CONFIG = {
	/** 初期制限時間（秒） */
	INITIAL_TIME: 60,

	/** 寿司の初期移動速度 */
	INITIAL_SPEED: 0.4,

	/** 時間経過による速度上昇率 */
	SPEED_UP_RATE: 0.005,

	/** 最大移動速度 */
	MAX_SPEED: 1.25,

	/** 寿司の再出現間隔（ミリ秒） - ランダム幅 */
	SPAWN_INTERVAL_RANDOM: 1000,

	/** コンボによるスコア倍率の上昇率 (1 + combo * value) */
	COMBO_MULTIPLIER_RATE: 0.1,

	/** 同時消しの倍率設定 */
	SIMULTANEOUS_MULTIPLIERS: {
		1: 1,
		2: 2,
		3: 4,
		4: 8, // 4皿以上
	} as Record<number, number>,

	/** 寿司1貫あたりの基礎点（この値 + タイピング文字数 がスコア計算の元になる） */
	BASE_POINTS: 120,

	/** 「長い寿司を打ち切った」演出を出す文字数の閾値 */
	LONG_READING_THRESHOLD: 18,

	/** 各レーンのY座標（下からの距離 px） */
	LANE_Y_POSITIONS: [18, 149, 280],

	/** 次の寿司が出るまでに必要な最低距離（px） */
	MIN_SPAWN_DISTANCE: 300,

	/** 寿司の再出現間隔（ミリ秒） - 初期値 */
	SPAWN_INTERVAL_BASE: 1200,
	/** 寿司の再出現間隔（ミリ秒） - 最小値（後半） */
	SPAWN_INTERVAL_MIN: 500,

	/** 画面内に表示できる寿司の最大数 */
	MAX_LIVE_SUSHI: 7,

	/** 即時出現モードになる寿司の残り数閾値 */
	IMMEDIATE_SPAWN_THRESHOLD: 3,

	/** 即時出現モード時の次の出現までの待機時間（ミリ秒） */
	IMMEDIATE_SPAWN_DELAY: 200,

	/** 寿司の右端出現位置のオフセット */
	SPAWN_X_OFFSET: 100,

	/** 寿司が画面外とみなされるX座標（左端） */
	DESPAWN_X: -280,

	/** 大将の絵文字の候補 */
	TAISHO_EMOJIS: [
		"🧑🏻‍🍳",
		"👨🏻‍🍳",
		"👩🏻‍🍳",
		"👴🏻",
		"👵🏻",
		"🐙",
		"👽",
		"👾",
		"🦖",
		"🧌",
	],
};
