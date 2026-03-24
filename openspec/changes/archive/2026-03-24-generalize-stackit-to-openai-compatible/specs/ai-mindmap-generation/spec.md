## MODIFIED Requirements

### Requirement: The operator SHALL be able to configure the AI provider
The operator SHALL be able to choose between the default OpenAI provider and any OpenAI API-compatible provider by setting environment variables. The system SHALL support configuring the model, endpoint, and credentials. The `AI_LLM_PROVIDER` value SHALL be used as the SDK provider name.

#### Scenario: Default provider
- **WHEN** no provider is explicitly configured
- **THEN** the system SHALL use OpenAI as the default provider

#### Scenario: OpenAI-compatible provider
- **WHEN** the operator sets `AI_LLM_PROVIDER` to `openai-compatible`
- **AND** provides `AI_LLM_URL` and `AI_LLM_TOKEN`
- **THEN** the system SHALL create an OpenAI-compatible provider using the configured URL, token, and `AI_LLM_PROVIDER` as the provider name

#### Scenario: OpenAI-compatible provider missing URL
- **WHEN** the operator sets `AI_LLM_PROVIDER` to `openai-compatible`
- **AND** does not provide `AI_LLM_URL`
- **THEN** the system SHALL return an empty result (provider not created)

#### Scenario: OpenAI-compatible provider missing token
- **WHEN** the operator sets `AI_LLM_PROVIDER` to `openai-compatible`
- **AND** does not provide `AI_LLM_TOKEN`
- **THEN** the system SHALL return an empty result (provider not created)
