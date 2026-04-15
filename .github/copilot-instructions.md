# GitHub Copilot Code Review 指示書

## レビュー言語

コードレビューのコメントは必ず **日本語** で書いてください。英語で書かないこと。

## 指摘しない観点（nitpick 抑制）

- typo・軽微なスタイル
- tsc が検出する型エラー・未使用変数（`strict: true` + `noUnusedLocals` + `noUnusedParameters` が有効）
- 自明なコメント・JSDoc 追加要求
- テスト追加要求（本プロジェクトはテストフレームワーク未導入）
- prettier / eslint が検出するフォーマット関連

## 重視する観点

以下に関わる変更は丁寧にレビューしてください:

1. **データ整合性**: `medabots.json` / `parts.json` / `weapons.json` の3層参照。メダロットが `head/rightArm/leftArm/legs` でパーツIDを、攻撃系パーツが `weaponType` で武器IDを参照する構造。存在しないID参照はバグ
2. **戦闘計算の正確性**:
   - 命中判定: `accuracy - evasion - disruptPenalty >= random(0-100)`
   - ダメージ式: `floor(power × (1 - defense/(defense+100)) × variance(0.85~1.15))`
   - 特殊効果: `antiArmor`（防御30%を攻撃加算）/ `ignoreDefense`（防御無視）
3. **一方向データフロー違反**: ゲーム状態は `BattleState` に集約。UI は毎フレーム `BattleState` を読み取るのみ。UI から状態を直接書き換える変更は要注意
4. **main.ts のステートマシン整合性**: 3層管理（`BattlePhase` / `unitPhase` / 入力フロー: `pendingAction` / `previewAction` / `pickTargets` / `cursorPos`）のライフサイクル
5. **Canvas 描画のトランジェント状態**: `flashEffect`（ヒット演出）・`moveAnim`（移動補間）のリセット漏れ・タイミング不整合

## プロジェクト概要（簡易版）

「DARK ROBATTLE」- メダロットシリーズ風ターン制グリッドバトル。Vite + TypeScript + Canvas + DOM（フレームワーク不使用）。Cloudflare Pages にデプロイ。

### ゲームフェーズ

`Title → Deploy → PlayerTurn ⇄ EnemyTurn → Victory/Defeat`（`BattlePhase` enum）

- **Title**: `medabots.json` の `presets` からチーム選択
- **Deploy**: 自陣(x < 5)にユニットを1体ずつ配置
- **PlayerTurn**: ユニットごとに `move`(1マス) → `action` の2段階
- **EnemyTurn**: `ai.ts` の `executeAiTurnAnimated()` が非同期実行

### 行動パイプライン

```
onActionSelected() → pendingAction設定 → ハイライト
  → handleCellClick() → buildCellAction() → enterPreview()
    → 確認 → submit() → state.executeAction() → afterAction()
```

移動はキャンセル可能（`state.preMovePosition` に元位置保存）。

### ターゲティング3モード

武器の `blastShape` で分岐:

- **手動照準**（`blastShape` なし）: クリック選択 → `blastArea` で単体/十字/3x3
- **自動照準**（`same_col`/`mirror_col`/`front4`/`vertical_line`）: 即プレビュー
- **pick3**: 3セル順次選択 → 揃うと自動プレビュー

### 索敵（Fog of War）

`VisibilityManager` が敵可視状態をターン数ベースで管理（`Map<index, 残りターン数>`）。`scan` や攻撃ヒットで一時可視化、毎ターン `tickTurn()` でデクリメント。プレイヤー・AI独立。

### 行動タイプ

原作準拠8種: うつ / ねらいうち / なぐる / がむしゃら / まもる / なおす / たすける / しかける（各パーツの `actionType` で決定）。

### グリッド

10x6マス・48px/セル。左半分(x<5)自陣、右半分(x>=5)敵陣。移動は自陣内1マス固定。`grid.ts` は純粋関数のみ。

### データ層

`medabots.json` / `parts.json` / `weapons.json` を `*-db.ts` が型付きで直接エクスポート（変換処理なし）。

詳細は AGENTS.md 参照。
