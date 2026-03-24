## Context

The AI provider layer in `aiProvider.ts` uses a binary check: if `AI_LLM_PROVIDER === 'stackit'`, it creates an OpenAI-compatible provider; otherwise it creates a standard OpenAI provider. The STACKIT-specific code is identical to what any OpenAI API-compatible service would need — a base URL, a bearer token, and a provider name. The coupling to "stackit" is purely nominal.

The `LLMProps` interface in `config.service.ts` already carries `url`, `token`, `provider`, and `model` — everything needed for a generic OpenAI-compatible provider.

## Goals / Non-Goals

**Goals:**
- Replace the `stackit`-specific provider path with a generic `openai-compatible` path
- Use the existing `AI_LLM_PROVIDER` value as the provider name passed to the SDK
- Keep the default provider as `openai` (no behavioral change for unconfigured deployments)

**Non-Goals:**
- Adding new AI capabilities or endpoints
- Supporting non-OpenAI-compatible providers (e.g. Anthropic, Google) — those would need different SDK integrations
- Changing rate limiting, prompt logic, or frontend behavior

## Decisions

### 1. Provider selector value: `openai-compatible` replaces `stackit`

**Choice**: Use the string `'openai-compatible'` as the provider discriminator.

**Why**: It accurately describes the capability (any service implementing the OpenAI API contract) rather than naming a single vendor. Operators immediately understand what it means.

**Alternatives considered**:
- `custom` — too vague, doesn't convey the OpenAI-compatible requirement
- `compatible` — ambiguous about compatible with what
- Keep `stackit` and add aliases — accumulates tech debt

### 2. Use `AI_LLM_PROVIDER` value as SDK provider name

**Choice**: Pass `llmConfig.provider` (i.e. `'openai-compatible'`) as the `name` parameter to `createOpenAICompatible()`.

**Why**: The `createOpenAICompatible()` call accepts a `name` parameter used internally by the AI SDK for logging. `AI_LLM_PROVIDER` already identifies the provider — no new env var needed.

### 3. No backward-compatibility alias for `stackit`

**Choice**: Clean break — `stackit` is no longer recognized as a valid provider value.

**Why**: The change is a simple config update (`stackit` → `openai-compatible`) with no code-level migration needed. Adding aliases creates maintenance burden for minimal benefit. The breaking change is documented in the release notes.

### 4. Require `url` for `openai-compatible` provider

**Choice**: Keep the existing guard — `openai-compatible` provider returns `undefined` if `url` or `token` is missing, same as the current STACKIT path.

**Why**: Unlike the default OpenAI provider (which has a known base URL), a generic compatible provider must have an explicit endpoint. This validation already exists and is correct.

## Risks / Trade-offs

- **Breaking change for STACKIT users** → Mitigated by clear documentation and a single env var change. The `AI_LLM_PROVIDER` value is the only thing that changes.
- **Provider name defaults to `openai-compatible`** → The SDK `name` parameter reflects the `AI_LLM_PROVIDER` value directly.
- **No runtime validation of provider values** → If an operator sets `AI_LLM_PROVIDER=typo`, they get the default OpenAI path (existing behavior). This is acceptable — invalid config is an operator error, and the existing fallback-to-default pattern is preserved.

## Migration Plan

1. Update `aiProvider.ts`: rename function, change provider constant
2. Update `.env.default` and README: document new provider value
4. Update existing tests to use `openai-compatible` instead of `stackit`
5. **Rollback**: Revert the provider constant back to `stackit` — single-line change
