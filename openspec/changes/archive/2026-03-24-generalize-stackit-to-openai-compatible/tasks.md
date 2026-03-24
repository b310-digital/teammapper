## 1. Generalize provider factory

- [x] 1.1 Rename `PROVIDER_STACKIT` constant to `PROVIDER_OPENAI_COMPATIBLE` with value `'openai-compatible'` in `aiProvider.ts`
- [x] 1.2 Rename `createStackitProvider` to `createOpenAICompatibleProvider` in `aiProvider.ts`
- [x] 1.3 Replace hardcoded `name: 'stackit'` with `llmConfig.provider` in the `createOpenAICompatible()` call
- [x] 1.4 Update the `createProvider` branch to check against `PROVIDER_OPENAI_COMPATIBLE`

## 2. Update documentation and defaults

- [x] 2.1 Update `.env.default` with `AI_LLM_PROVIDER` documentation referencing `openai-compatible`
- [x] 2.2 Update README AI configuration section to reference `openai-compatible` instead of `stackit`
- [x] 2.3 Add migration note about `AI_LLM_PROVIDER=stackit` → `AI_LLM_PROVIDER=openai-compatible`

## 3. Update tests

- [x] 3.1 Update existing `aiProvider` unit tests to use `'openai-compatible'` instead of `'stackit'`
- [x] 3.2 Add test case verifying the provider name passed to the SDK matches `AI_LLM_PROVIDER`
- [x] 3.3 Verify test cases for missing URL and missing token still pass
