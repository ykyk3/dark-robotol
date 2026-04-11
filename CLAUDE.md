# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

全ての人間とのコミュニケーションは日本語で行なってください。

## プロジェクト概要

「DARK ROBATTLE」- メダロットシリーズにインスパイアされたターン制グリッドバトルゲーム。Vite + TypeScript のフロントエンドSPAで、Cloudflare Pages にデプロイされる。フレームワーク不使用、Canvas + DOM で描画。

## コマンド

```bash
npm run dev       # 開発サーバー起動 (Vite)
npm run build     # tsc && vite build (dist/ に出力)
npm run preview   # ビルド結果のプレビュー
npm run deploy    # ビルド + Cloudflare Pages デプロイ (wrangler)
npx tsc --noEmit  # 型チェックのみ実行
```

テストフレームワークは未導入。tsconfig は `strict: true` + `noUnusedLocals` + `noUnusedParameters` が有効なため、未使用変数・引数はコンパイルエラーになる。

## アーキテクチャ

### データフロー

ゲームの状態管理は `BattleState` クラスに集約され、UI は毎フレーム `BattleState` を読み取って描画する一方向フロー。

```
ユーザー入力 (Canvas click / ActionMenu click)
  → main.ts (イベントハンドラ)
    → BattleState.executeAction()
      → eventBus.emit() でゲームイベント発行
        → MessageLog, CanvasRenderer が購読して表示更新
```

`eventBus` はシングルトンの pub-sub。`GameEvent` 判別共用体型を受け取り、MessageLog・main.ts(アニメーション)が独立して購読する。

### ゲームフェーズ

`BattlePhase` enum で管理: `Title → Deploy → PlayerTurn ⇄ EnemyTurn → Victory/Defeat`

- **Title**: チーム選択UI。`medabots.json` の `presets` からプリセットチームを選択
- **Deploy**: プレイヤーが自陣(x < 5)にユニットを1体ずつ配置
- **PlayerTurn**: ユニットごとに `move`(1マス移動) → `action`(攻撃/補助/防御等) の2段階
- **EnemyTurn**: `ai.ts` の `executeAiTurnAnimated()` が非同期でアニメーション付き実行

### main.ts のステートマシン

main.ts は3層のステートマシンを管理する:

1. **バトルフェーズ**: `BattleState.phase` (Title/Deploy/PlayerTurn/EnemyTurn/Victory/Defeat)
2. **ユニットフェーズ**: `BattleState.unitPhase` (move → action → done)
3. **入力フロー**: main.ts のローカル変数で管理
   - `pendingAction`: 選択中の行動 (`ActionSelection | null`)
   - `previewAction`: プレビュー中のアクション (`BattleAction | null`)
   - `pickTargets`: pick3武器の選択済みターゲット配列
   - `cursorPos`: キーボードカーソル位置

行動パイプライン:
```
onActionSelected() → pendingAction設定 → ハイライト表示
  → handleCellClick() → buildCellAction() → enterPreview()
    → 確認 → submit() → state.executeAction() → afterAction()
```

移動はキャンセル可能（`state.preMovePosition` に元位置を保存）。

### ターゲティングの3モード

武器の `blastShape` によりターゲティング方式が分岐する:

- **手動照準** (`blastShape` なし): セルをクリックして単体/十字/3x3 (`blastArea` で決定)
- **自動照準** (`same_col`/`mirror_col`/`front4`/`vertical_line`): セル選択不要、即プレビュー
- **pick3**: 3セルを順に選択 → `pickTargets` に蓄積 → 3つ揃うと自動プレビュー

### 戦闘システムの核心

**索敵 (Fog of War)**: `VisibilityManager` が敵の可視状態を時間ベースで管理（`Map<index, 残りターン数>`）。索敵(`scan`)や攻撃ヒットで一時的に可視化され、毎ターン `tickTurn()` でデクリメントされる。プレイヤー・AI双方が独立した VisibilityManager を持つ。

**行動タイプ** (`ActionType`): 原作準拠の8種（うつ/ねらいうち/なぐる/がむしゃら/まもる/なおす/たすける/しかける）。各パーツの `actionType` フィールドで決まる。

**ダメージ計算** (`damage-calc.ts`):
- 命中判定: `accuracy - evasion - disruptPenalty >= random(0-100)`
- ダメージ: `floor(power × (1 - defense/(defense+100)) × variance(0.85~1.15))`
- 特殊効果: `antiArmor` は防御値の30%を攻撃力に加算、`ignoreDefense` は防御無視
- チーム全体バフ: `atkBoost`/`defBoost` が `BattleState` にチーム単位で蓄積

**トラップ**: `しかける` で敵陣に設置。敵が移動時にトラップ位置を踏むとダメージ発生（`executeAction` 内の移動処理で判定）。

### データ定義の連携

メダロット → パーツ → 武器 の3層参照:
- `medabots.json`: 各ロボが `head/rightArm/leftArm/legs` でパーツIDを参照 + `presets` でチーム構成を定義
- `parts.json`: 攻撃系パーツは `weaponType` で武器IDを参照
- `weapons.json`: 射程・範囲・特殊効果を定義

新しいメダロットを追加する場合、3つのJSONすべてに整合性のあるエントリが必要。データ層（`*-db.ts`）はJSONを型付きで直接エクスポートするだけで変換処理なし。

### UI構成

HTMLは3画面構成: タイトル画面(`#title-screen`) → バトル画面(`#battle-screen`) → リザルト(`#result-overlay`)

- **CanvasRenderer**: `requestAnimationFrame` ループで毎フレーム描画。背景→グリッド→ハイライト→トラップ→ユニット→アニメーション→スキャンライン(CRT風)の順。`flashEffect`(ヒット演出) と `moveAnim`(移動補間) はトランジェントな描画状態
- **HUD**: プレイヤー3体のユニットカードをDOM生成。毎回 `innerHTML=''` で再構築
- **ActionMenu**: 十字配置（上:頭/左:左腕/右:右腕/下:移動）。フェーズに応じてコンテキスト切替
- **MessageLog**: イベントバス経由でメッセージ追加。最大50件、自動スクロール

### グリッド構成

10x6マス（48px/セル）。左半分(x < 5)が自陣、右半分(x >= 5)が敵陣。`CONFIG` オブジェクトで定数管理。移動は自陣内のみ1マス固定。グリッド計算関数（`grid.ts`）はすべて純粋関数で副作用なし。
