# ADR Conflict Detection - 実装計画

**Status:** Draft
**Target Version:** v3.10.0
**Last Updated:** 2025-01-25

---

## 概要

ADR（Architecture Decision Record）の一貫性を維持するため、既存の重複検出システムを拡張し、**矛盾検出機能**を追加する。

### 目的

- 同一キーに対する異なる値の検出（更新漏れの防止）
- 排他的な概念の同時存在を警告（一貫性の維持）
- 人間が最終判断を下すための情報提示

### 既存機能との違い

| 機能 | 目的 | 対象 |
|------|------|------|
| 重複検出（既存） | 同一決定の二重登録防止 | AI向け |
| **矛盾検出（新規）** | 相反する決定の警告 | 人間向け |

---

## Phase 1: 同一キー・異値検出

### 1.1 概要

正規化されたキーが同一で、値が異なる決定を検出する。

**検出対象:**
- バージョン違いの命名（`api/auth-v1` vs `api/auth-v2`）
- 表記ブレ（`api/auth-method` vs `api/auth`）
- 意図しない上書き漏れ

### 1.2 キー正規化ルール

```typescript
interface NormalizationRule {
  pattern: RegExp;
  replacement: string;
}

const KEY_NORMALIZATION_RULES: NormalizationRule[] = [
  // バージョンサフィックスの除去
  { pattern: /-v\d+$/i, replacement: '' },
  { pattern: /_v\d+$/i, replacement: '' },

  // 末尾の数字を除去（連番系）
  { pattern: /-\d+$/, replacement: '' },

  // 一般的な同義語の統一
  { pattern: /\bauth\b/i, replacement: 'authentication' },
  { pattern: /\bconfig\b/i, replacement: 'configuration' },
  { pattern: /\bdb\b/i, replacement: 'database' },
];

function normalizeKey(key: string): string {
  let normalized = key.toLowerCase();
  for (const rule of KEY_NORMALIZATION_RULES) {
    normalized = normalized.replace(rule.pattern, rule.replacement);
  }
  return normalized;
}
```

### 1.3 検出ロジック

```typescript
interface ConflictResult {
  type: 'same_key_different_value';
  severity: 'warning' | 'conflict';
  existing: {
    key: string;
    value: string;
    version: string;
    updated_at: string;
  };
  new: {
    key: string;
    value: string;
  };
  normalized_key: string;
  recommendation: string;
}

async function detectSameKeyConflict(
  newKey: string,
  newValue: string
): Promise<ConflictResult | null> {
  const normalizedNew = normalizeKey(newKey);

  // 正規化後のキーで既存決定を検索
  const existing = await findDecisionsByNormalizedKey(normalizedNew);

  for (const decision of existing) {
    // 完全一致は重複検出に任せる
    if (decision.key === newKey) continue;

    // 値が異なる場合のみ矛盾として検出
    if (decision.value !== newValue) {
      return {
        type: 'same_key_different_value',
        severity: 'warning',
        existing: {
          key: decision.key,
          value: decision.value,
          version: decision.version,
          updated_at: decision.updated_at,
        },
        new: { key: newKey, value: newValue },
        normalized_key: normalizedNew,
        recommendation: buildRecommendation(decision, newKey, newValue),
      };
    }
  }

  return null;
}
```

### 1.4 ユーザーへの提示

```
⚠️ 類似キーで異なる値が検出されました

既存の決定:
  キー: api/auth-v1
  値: "JWTを採用、有効期限は1時間"
  更新日: 2025-01-20

新規の決定:
  キー: api/auth-v2
  値: "OAuth2.0に移行、リフレッシュトークンを使用"

正規化キー: api/auth

推奨アクション:
  1. 既存の決定を更新する（置き換え）
  2. 両方を維持する（意図的な共存）
  3. 新規決定を中止する

続行しますか？ [update/keep-both/cancel]
```

### 1.5 データベース変更

```sql
-- 正規化キーのインデックス追加
ALTER TABLE context_keys ADD COLUMN normalized_key TEXT;

CREATE INDEX idx_context_keys_normalized
ON context_keys(normalized_key);

-- マイグレーション: 既存キーの正規化
UPDATE context_keys
SET normalized_key = lower(
  replace(replace(replace(key, '-v1', ''), '-v2', ''), '-v3', '')
);
```

---

## Phase 2: 排他タグパターン検出

### 2.1 概要

同時に存在すべきでないタグの組み合わせを定義し、矛盾を検出する。

**検出対象:**
- 相反するアーキテクチャ選択（stateless vs stateful）
- 排他的な技術選択（rest vs graphql、同一エンドポイント）
- 矛盾する設計方針（monolith vs microservice）

### 2.2 排他パターン定義

```typescript
interface ExclusivePattern {
  tags: [string, string];      // 排他的なタグのペア
  scope: 'global' | 'layer' | 'key_prefix';  // 適用範囲
  severity: 'warning' | 'conflict';
  description: string;
}

const EXCLUSIVE_PATTERNS: ExclusivePattern[] = [
  // アーキテクチャパターン
  {
    tags: ['stateless', 'stateful'],
    scope: 'layer',
    severity: 'conflict',
    description: 'ステートレスとステートフルは同一レイヤーで共存不可',
  },
  {
    tags: ['monolith', 'microservice'],
    scope: 'global',
    severity: 'conflict',
    description: 'モノリスとマイクロサービスは排他的アーキテクチャ',
  },

  // 通信パターン
  {
    tags: ['sync', 'async'],
    scope: 'key_prefix',
    severity: 'warning',
    description: '同一機能で同期・非同期の混在に注意',
  },
  {
    tags: ['rest', 'graphql'],
    scope: 'key_prefix',
    severity: 'warning',
    description: '同一エンドポイントでREST/GraphQLの混在',
  },

  // 認証方式
  {
    tags: ['jwt', 'session'],
    scope: 'layer',
    severity: 'warning',
    description: '認証方式の混在に注意',
  },

  // データベース
  {
    tags: ['sql', 'nosql'],
    scope: 'key_prefix',
    severity: 'warning',
    description: '同一ドメインでSQL/NoSQLの混在',
  },

  // キャッシュ戦略
  {
    tags: ['cache-aside', 'write-through'],
    scope: 'key_prefix',
    severity: 'warning',
    description: 'キャッシュ戦略の混在に注意',
  },
];
```

### 2.3 検出ロジック

```typescript
interface ExclusiveConflictResult {
  type: 'exclusive_tags';
  severity: 'warning' | 'conflict';
  pattern: ExclusivePattern;
  existing: {
    key: string;
    value: string;
    tags: string[];
  };
  new: {
    key: string;
    value: string;
    tags: string[];
  };
  conflicting_tags: [string, string];
  recommendation: string;
}

async function detectExclusiveTagConflict(
  newKey: string,
  newValue: string,
  newTags: string[],
  newLayer: string
): Promise<ExclusiveConflictResult[]> {
  const conflicts: ExclusiveConflictResult[] = [];

  for (const pattern of EXCLUSIVE_PATTERNS) {
    const [tag1, tag2] = pattern.tags;

    // 新規決定が排他ペアの一方を持つかチェック
    const newHasTag1 = newTags.includes(tag1);
    const newHasTag2 = newTags.includes(tag2);

    if (!newHasTag1 && !newHasTag2) continue;

    const searchTag = newHasTag1 ? tag2 : tag1;
    const newTag = newHasTag1 ? tag1 : tag2;

    // スコープに基づいて検索
    const existing = await findDecisionsByScope(
      pattern.scope,
      searchTag,
      newKey,
      newLayer
    );

    for (const decision of existing) {
      conflicts.push({
        type: 'exclusive_tags',
        severity: pattern.severity,
        pattern,
        existing: {
          key: decision.key,
          value: decision.value,
          tags: decision.tags,
        },
        new: {
          key: newKey,
          value: newValue,
          tags: newTags,
        },
        conflicting_tags: [newTag, searchTag],
        recommendation: buildExclusiveRecommendation(pattern, decision),
      });
    }
  }

  return conflicts;
}

async function findDecisionsByScope(
  scope: 'global' | 'layer' | 'key_prefix',
  tag: string,
  newKey: string,
  newLayer: string
): Promise<Decision[]> {
  switch (scope) {
    case 'global':
      // 全ての決定から検索
      return findDecisionsByTag(tag);

    case 'layer':
      // 同一レイヤー内で検索
      return findDecisionsByTagAndLayer(tag, newLayer);

    case 'key_prefix':
      // 同一キープレフィックス内で検索
      const prefix = extractKeyPrefix(newKey);
      return findDecisionsByTagAndKeyPrefix(tag, prefix);
  }
}

function extractKeyPrefix(key: string): string {
  // "api/users/auth" → "api/users"
  const parts = key.split('/');
  return parts.slice(0, -1).join('/') || parts[0];
}
```

### 2.4 ユーザーへの提示

```
⚠️ 排他的なタグの組み合わせが検出されました

矛盾パターン: stateless ↔ stateful
説明: ステートレスとステートフルは同一レイヤーで共存不可

既存の決定:
  キー: api/session-management
  値: "セッションをRedisで管理（stateful）"
  タグ: [stateful, redis, session]
  レイヤー: infrastructure

新規の決定:
  キー: api/auth-strategy
  値: "JWTによるステートレス認証"
  タグ: [stateless, jwt, auth]
  レイヤー: infrastructure

推奨アクション:
  1. 設計を見直す（どちらかに統一）
  2. スコープを分離する（異なるレイヤーに配置）
  3. 意図的な共存として記録する（理由を明記）

続行しますか？ [review/separate/acknowledge]
```

### 2.5 カスタムパターンの追加

ユーザーがプロジェクト固有の排他パターンを追加できる機能：

```typescript
// constraint ツールを拡張
constraint({
  action: "add_exclusive",
  tags: ["redis", "memcached"],
  scope: "layer",
  severity: "warning",
  description: "同一レイヤーでのキャッシュ実装の混在"
});

// 設定ファイル (.sqlew/config.toml)
[[conflict_detection.exclusive_patterns]]
tags = ["redis", "memcached"]
scope = "layer"
severity = "warning"
description = "同一レイヤーでのキャッシュ実装の混在"
```

---

## 統合アーキテクチャ

### 検出フロー

```
decision.set() 呼び出し
        ↓
┌───────────────────────────────────────┐
│         既存: 重複検出 (suggest)       │
│         スコア算出 → 3層判定           │
└───────────────────────────────────────┘
        ↓
┌───────────────────────────────────────┐
│    新規: Phase 1 同一キー・異値検出    │
│    正規化キーで既存決定を検索          │
└───────────────────────────────────────┘
        ↓
┌───────────────────────────────────────┐
│    新規: Phase 2 排他タグパターン検出   │
│    タグの排他関係をチェック            │
└───────────────────────────────────────┘
        ↓
    結果を集約して提示
        ↓
  ユーザーの判断を待つ
```

### レスポンス構造

```typescript
interface ConflictDetectionResponse {
  // 既存の重複検出結果
  duplicate_risk?: DuplicateRisk;

  // 新規: 矛盾検出結果
  conflicts?: {
    same_key: ConflictResult[];
    exclusive_tags: ExclusiveConflictResult[];
  };

  // 総合判定
  requires_user_decision: boolean;
  severity: 'none' | 'warning' | 'conflict';

  // 推奨アクション
  recommendations: string[];
}
```

---

## 実装タスク

### Phase 1: 同一キー・異値検出

- [ ] `normalizeKey()` 関数の実装
- [ ] `normalized_key` カラムの追加（マイグレーション）
- [ ] `detectSameKeyConflict()` の実装
- [ ] `decision.set()` への統合
- [ ] ユーザー向けメッセージのフォーマット
- [ ] テストケースの作成

### Phase 2: 排他タグパターン検出

- [ ] `ExclusivePattern` の定義とシードデータ
- [ ] `detectExclusiveTagConflict()` の実装
- [ ] スコープ別検索ロジックの実装
- [ ] `constraint.add_exclusive` アクションの追加
- [ ] 設定ファイルでのカスタムパターン対応
- [ ] テストケースの作成

### 共通

- [ ] `ConflictDetectionResponse` の定義
- [ ] CLI/MCPでの対話的確認フローの実装
- [ ] ドキュメントの更新
- [ ] ヘルプシステムへの追加

---

## 設計上の考慮事項

### バイパス機構

矛盾検出も既存の `ignore_suggest` と同様のバイパスを提供：

```typescript
decision({
  action: "set",
  key: "api/auth-hybrid",
  value: "JWTとセッションのハイブリッド認証",
  tags: ["jwt", "session", "auth"],
  ignore_conflict: true,
  conflict_reason: "段階的移行のため一時的に両方式を共存"
});
```

### パフォーマンス

- 正規化キーはインデックス化
- 排他パターンはメモリキャッシュ
- 検出は `decision.set()` 時のみ実行（読み取り時は実行しない）

### 誤検出への対応

- 全ての検出は「警告」として提示（自動ブロックはしない）
- ユーザーが最終判断を下す
- バイパス時は理由を記録（学習データとして活用可能）

---

## 今後の拡張可能性

- **Phase 3**: レイヤー依存グラフによる影響分析
- **Phase 4**: 技術カテゴリの自動抽出（NLP）
- **Phase 5**: 矛盾パターンの学習（ユーザーフィードバック）

---

## 参考資料

- [DECISION_INTELLIGENCE.md](./DECISION_INTELLIGENCE.md) - 既存の重複検出システム
- [ARCHITECTURE.md](./ARCHITECTURE.md) - 全体アーキテクチャ
- [TOOL_REFERENCE.md](./TOOL_REFERENCE.md) - ツールリファレンス
