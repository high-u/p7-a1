# P7-A1

## 概要

いつも隣にいるフィジカル AI の脳や各器官および器官としてのハードウェア連携を目指す。

ユーザープロンプトにおけるユーザーセッションは存在しない。
日付単位のセッションか。多すぎるのは困るから、会話のターン数でセッションを区切る仕様は必要。

## env

```bash
bun create hono@latest
bun add ai zod
bun add @ai-sdk/openai
bun add -d typescript
bun add -D -E @biomejs/biome
bunx --bun @biomejs/biome init
```

## x

```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"prompt": "\"LGTM\" という文字が書かれた動く GIF を作って"}'
```
