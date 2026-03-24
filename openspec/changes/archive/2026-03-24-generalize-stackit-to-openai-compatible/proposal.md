## Why

The AI provider layer currently hardcodes a `stackit` provider name check to route between the standard OpenAI SDK and the `@ai-sdk/openai-compatible` wrapper. This is unnecessarily specific — any OpenAI-compatible API (e.g. Azure OpenAI, Ollama, vLLM, LiteLLM, Groq) would use the exact same `createOpenAICompatible` code path. Generalizing this removes the STACKIT-specific coupling and lets operators connect any OpenAI API-compatible service without code changes.

## What Changes

- **BREAKING**: The `AI_LLM_PROVIDER` value `stackit` is replaced by `openai-compatible` as the provider selector. Existing deployments using `stackit` will need to update their configuration.
- The `createStackitProvider` function is renamed/generalized to `createOpenAICompatibleProvider`, with no STACKIT-specific logic.
- The hardcoded provider name `'stackit'` passed to `createOpenAICompatible({ name })` is replaced by the `AI_LLM_PROVIDER` value (i.e. `'openai-compatible'`).
- Documentation and environment defaults are updated to reflect the generic provider option.

## Capabilities

### New Capabilities

_None — this is a generalization of existing capability, not a new feature._

### Modified Capabilities

- `ai-mindmap-generation`: The provider configuration requirement changes — the system accepts `openai-compatible` as a provider value instead of `stackit`.

## Impact

- **Backend code**: `teammapper-backend/src/map/utils/aiProvider.ts` — primary change target
- **Environment files**: `.env.default`, README documentation
- **Breaking for operators**: Anyone with `AI_LLM_PROVIDER=stackit` must change to `AI_LLM_PROVIDER=openai-compatible`
- **No frontend impact**: The frontend is unaware of provider details
- **No API contract change**: The `/api/mermaid/create` endpoint behavior is unchanged
