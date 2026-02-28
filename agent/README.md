# P7-A1

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
