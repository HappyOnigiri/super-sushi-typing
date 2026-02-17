# アーキテクチャマップ（SushiTyping / 量子マグロ亭）

このドキュメントは、AI エージェント／開発者がこのリポジトリの構造・責務・主要なデータフローを素早く把握するための「地図」です。ディレクトリ構成や主要フローを変更した場合は、必ず更新してください。

## 1. プロジェクトの目的

**タイピング回転寿司 量子マグロ亭**は、ブラウザ上で遊べるタイピングゲームです。

- 流れてくる寿司に表示された **ローマ字（reading）** を入力して「寿司を取る」
- **コンボ** と **同時取り** によりスコアが加速する
- **通常 / 特上** の2モード（難易度・速度・出現密度・スコアが異なる）
- PC キーボードだけでなく、スマホ向け **ソフトウェアキーボード**にも対応

## 2. 技術スタック

- **TypeScript**（`strict: true`）
- **Vite**（静的サイトとしてビルド/配信）
- **Vitest**（ユニットテスト）
- **Biome**（TS/TSX のチェック & 自動整形。`Makefile` 経由）
- 依存ライブラリ
	- `yaml`: 寿司データ（YAML）読み込み
	- `@vercel/analytics`: アナリティクス注入

## 3. ディレクトリ／主要ファイルと責務

### ルート直下

- `index.html`
	- HTML エントリ。`/src/main.ts` を読み込み、画面の DOM 骨格（タイトル・ゲーム・結果）を持つ。
- `src/style.css`
	- 画面全体の見た目。タイトル／ゲーム／結果／ソフトウェアキーボード等の UI を定義。
- `package.json`
	- `vite` / `tsc` / `vitest` の実行定義。
- `vite.config.ts`
	- `base: "./"`（相対パス前提の配信）。
- `tsconfig.json`
	- strict モード、DOM を含む lib、`moduleResolution: "bundler"`。
- `vitest.config.ts`
	- テスト環境は `node`。
- `Makefile`
	- `make ci` / `make ci-check` の入口。Biome / Prettier / TypeScript / ルール検査 / テストを実行。
- `scripts/`
	- リポジトリ固有の検査（TS ルール、寿司データ整合性）と CI オーケストレーション。
- `public/`
	- 静的アセット（ロゴなど）。

### `src/`（アプリ本体）

- `src/main.ts`
	- **アプリの実質的なエントリポイント**。ゲーム状態、DOM 操作、入力、スポーン、ゲームループ、結果表示、共有導線までを担当。
- `src/config.ts`
	- 難易度設定（通常/特上）のパラメータ群（速度、出現間隔、倍率など）。
- `src/romaji.ts`
	- **DOM 非依存の純粋ロジック**。`reading` から入力可能な表記ゆれパターンを生成する（例: `shi/si/ci`）。
	- 安全弁としてバリアント数に上限（キャッシュと上限カット）を持つ。
- `src/types.ts`
	- 主要データ型（寿司、グループ、アクティブ寿司、称号、台詞など）。
- `src/data/`
	- `sushi.yaml`: **寿司データの正（ソースオブトゥルース）**
	- `sushi.ts`: YAML の読み込み／型検証／重複検出を行い、ゲームで使う配列へ変換
	- `ranks.ts`: スコア→称号（ランク）の定義
	- `taisho.ts`: 大将の台詞（トリガー別）

## 4. 主要データ構造（抜粋）

- `SushiDef`（`src/types.ts`）
	- `name`: 表示名
	- `reading`: タイピング対象（a-z と `-`）
- `ActiveSushi`（`src/types.ts`）
	- 画面上に存在する寿司（座標、DOM 要素、マッチ進捗、捕獲状態など）
- `GameConfig`（`src/config.ts`）
	- モードごとのパラメータ群（速度・出現・倍率・UI 演出用定数）

## 5. 主要ロジック／データフロー

### 5.1 起動フロー（ページロード）

1. `index.html` が UI の骨格 DOM を配置し、`/src/main.ts` を読み込む
2. `src/main.ts` が `@vercel/analytics` を注入
3. `getElement()` で主要 DOM を取得（見つからない場合は例外で落とす）
4. 初期状態を `title` にしてタイトル画面を表示

### 5.2 ゲーム開始（タイトル → プレイ）

- `start-btn`（通常）/ `tokujo-btn`（特上）のクリックで `startGame(config)` を実行
- 既存の `requestAnimationFrame` / `setInterval` を解除してから状態を初期化
- 寿司の出現プール（ランダム・グループ）をリセット
- カウントダウン後、`gameState = "playing"` へ遷移し、タイマーとゲームループを開始

### 5.3 ゲームループ（スポーン・移動・終了判定）

- `requestAnimationFrame(gameLoop)` で毎フレーム処理
	- 経過時間に応じて速度を上げる（上限あり）
	- 既存寿司を左へ移動し、一定位置を超えたら「取り逃し」扱い（コンボリセット等）
	- 画面内寿司数や空きレーン、残データ量に応じて新しい寿司を出現
	- **寿司データを使い切ったらゲーム終了**（同一ゲーム内で同一寿司を出さない設計）
	- タイムアップ後も、残寿司があれば取り切るまで継続

### 5.4 入力処理（判定 → 捕獲 → スコア）

- `document.keydown` で `a-z` と `-` を受け付ける
- `handleKeyInput(char)` は **捕獲されていない全寿司**に対し、寿司ごとの複数パターン（`generateVariants(reading)`）で 1 文字進捗を進める
- その tick で捕獲が発生した場合
	- 同時取り数を算出し、倍率（config）を適用してスコア加算
	- スコアポップアップ、コンボバースト、大将台詞などの演出を更新
	- 捕獲済み寿司は短い遅延後に DOM から削除

### 5.5 結果表示・シェア

- `endGame()` → `showResult()` で結果画面へ
- ランクは `src/data/ranks.ts` の閾値で決定
- `share-btn` は `https://twitter.com/intent/tweet` を開いてシェアテキストを投稿

### 5.6 ソフトウェアキーボード（モバイル向け）

- `initSoftwareKeyboard()` が画面内キーボードを生成し、タップで `handleKeyInput()` を呼ぶ
- モバイル幅では `keyboard-active` を付与してデフォルト表示（トグルで表示切替）

## 6. データ（寿司）更新のルール

### 寿司データの正は `src/data/sushi.yaml`

- `src/data/sushi.ts` は「読み込み・検証・変換」だけを担当し、**寿司一覧の正は YAML**です
- `reading` は `a-z` と `-` のみ許可（`scripts/check_sushi_data.mjs` でも検証）
- `random_sushis` 内の重複、グループ内重複、全体での重複はすべて禁止

## 7. 実装ルール（このリポジトリ固有）

- **型安全**
	- `any` の明示利用（`: any`, `as any`）禁止
	- `@ts-ignore` / `@ts-nocheck` 禁止（`scripts/check_ts_rules.py` が検知）
- **責務分離**
	- `src/romaji.ts` は DOM に依存しない純粋ロジックとして維持（UI ロジックは `src/main.ts` 側へ）
- **パフォーマンス注意**
	- `handleKeyInput()` は「全寿司 × 全パターン」を毎キーで走査するため、パターン爆発や無駄な割り当てを避ける（`generateVariants` はキャッシュ済み）
- **DOM の前提**
	- `getElement()` は存在しない ID を例外にするため、`index.html` の ID 変更は `src/main.ts` とセットで行う

## 8. テスト／CI

- テスト: `npm run test`（Vitest）
- 開発: `npm run dev`
- CI（推奨）: `make ci-check`
- ローカル CI（自動整形→検査→テスト）: `make ci`
