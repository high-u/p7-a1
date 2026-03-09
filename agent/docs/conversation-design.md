# 会話システム設計書

## 1. DB・テーブル設計

### conversations テーブル

```sql
CREATE TABLE conversations (
    id                TIMESTAMPTZ PRIMARY KEY, -- ミリ秒精度の日時をIDに兼用
    role              TEXT        NOT NULL,    -- 'user' | 'assistant' | 'tool'
    content           TEXT,                   -- テキスト内容。FTS対象
    image             BLOB,                   -- 画像データ（nullable）。FTS対象外
    image_description TEXT,                   -- システム生成説明文。FTS対象。脳は見ない
);
```

| フィールド | 制御 | 説明 |
|---|---|---|
| `id` | システム（書き込み時の現在日時） | IDと作成日時を兼ねる |
| `role` | システム | `'user'` \| `'assistant'` \| `'tool'` |
| `content` | API から取得 | テキスト。ツールメッセージは JSON 文字列のまま格納 |
| `image` | システム | 圧縮済みバイナリ（nullable） |
| `image_description` | システム（VLM処理） | 検索用。脳に渡さない |

**FTS 設定**: `content` と `image_description` のみをインデックス対象とする。`image` は対象外。

**更新なし**: レコードの上書きは行わない。追加のみ。

---

## 2. スライディングウィンドウ

### 現在のコンテキスト取得

```sql
SELECT id, role, content, image
FROM conversations
ORDER BY id DESC
LIMIT N;
-- 取得後、時系列順（ASC）に並び替えて messages 配列に変換
```

N: 設定値（初期値は検証で決める）

### messages 配列への変換

AI SDK に渡す messages 配列を以下のルールで組み立てる。

| 条件 | 変換後の形式 |
|---|---|
| `role='user'`、テキストのみ | `{ role: 'user', content: string }` |
| `role='user'`、画像あり | `{ role: 'user', content: [{ type: 'image', ... }, ...] }` |
| `role='assistant'`、content がテキスト | `{ role: 'assistant', content: string }` |
| `role='assistant'`、content が JSON 配列 | `{ role: 'assistant', content: JSON.parse(content) }` |
| `role='tool'` | `{ role: 'tool', content: JSON.parse(content) }` |

---

## 3. 処理フロー

### ユーザーメッセージ受信時

```
[ユーザーメッセージ受信]
        |
        v
[conversations から最新 N 件を取得]
  → messages 配列に変換（画像はBLOBから復元）
        |
        v
[記憶システムの自動取得（別仕様）]
  → コンテキストに注入
        |
        v
[agent.generate(messages)]
  エージェントループ（ツール呼び出しを含む）
        |
        v
[応答生成]
```

### 会話保存（各通信）

```
[各通信発生時]
  ├─ user メッセージ    → conversations に INSERT
  ├─ assistant メッセージ（ツール呼び出し含む）→ INSERT
  └─ tool 結果          → INSERT
        |
        v （image が含まれる場合）
[システム: VLM を呼び出して説明文生成]
  入力: 圧縮画像
  出力: 検索用説明テキスト（日本語）
  → image_description を UPDATE
  ※ このVLM呼び出しは脳としての動作ではなくシステム処理
```

---

## 4. 画像処理フロー

```
カメラ → 画像取得（Base64）
  |
  ├─ [圧縮・縮小]（システム）
  |      → conversations.image に保存（BLOB）
  |      ※ 圧縮パラメーターは検証で決める（スコープ外）
  |
  └─ [VLM で説明文生成]（システム処理）
         入力: 圧縮画像
         出力: 検索用テキスト
         → conversations.image_description に保存
         ※ 脳（メイン VLM）は image_description を見ない
```

---

## 5. ツールプリミティブ詳細

### `search_conversation`

```
引数:
  query: string    -- 検索クエリ（LLM がキーワードを渡す）
  limit?: number   -- 取得上限

検索対象:
  conversations.content           -- テキスト内容（FTS）
  conversations.image_description -- 画像説明文（FTS）

戻り値:
  messages: Array<{ id, role, content, image? }>
  ※ 詳細は未決定
```

> 引数・検索ロジック・レスポンス形式の詳細は未決定。`search_memory` の設計と合わせて詰める。
