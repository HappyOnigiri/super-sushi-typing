# タイピング回転寿司 量子マグロ亭

![License](https://img.shields.io/badge/license-MIT-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)
![Vite](https://img.shields.io/badge/Vite-5.0-646CFF)

<img src="public/title.png" alt="Quantum Maguro Tei Title" width="400">


### 🚀 今すぐ遊ぶ: <a href="https://quantum-maguro.vercel.app/" target="_blank">quantum-maguro.vercel.app</a>

## ゲームの醍醐味

流れる寿司をテンポよく取り、ハイスコアを目指しましょう！

- **コンボでスコアが加速！**: 連続して寿司を取ることで「コンボ」が発生。繋げば繋ぐほど獲得スコアに強力な倍率がかかります。
- **一撃必殺の「同時取り」**: 複数の寿司を同時に取り抜く「同時取り」に成功すると、ボーナススコアが爆発的に増加します。4皿以上の「同時取り」が決まった瞬間の爽快感は格別です。

## 遊び方

- **ルール**: 流れてくる寿司に表示されたローマ字（例: `maguro`）をタイプして取り切ります。
- **制限時間**: 60秒（最後の寿司が残っている間は取り切るまで続行）。
- **入力**: `a-z` と `-` を受け付けます。`shi/si` などの表記ゆれも自動で許容されます。

## スコアボーナス

ハイスコアを狙うためのカギは、コンボと同時取りの掛け合わせです。

- **コンボボーナス**: 連続で皿を取るほど倍率が上昇します。
- **同時取りボーナス**: 
	- 2皿同時: **2倍**
	- 3皿同時: **4倍**
	- 4皿以上同時: **8倍** のボーナスが加算されます！

## 開発

### セットアップ

```bash
npm install
```

### 開発

```bash
npm run dev
```

### 静的解析とテスト (Makefile)
 
```bash
make ci-check
```

## ライセンス

このプロジェクトは [MIT License](./LICENSE) の下で公開されています。
