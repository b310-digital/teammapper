## ADDED Requirements

### Requirement: The system SHALL generate a mindmap from a text description
A user SHALL be able to submit a text description and a language, and receive a generated mindmap in return.

#### Scenario: Successful generation
- **WHEN** a user submits a valid description and a supported language
- **AND** AI generation is enabled and configured
- **THEN** the system SHALL return a generated mindmap

#### Scenario: AI generation is disabled
- **WHEN** AI generation is disabled by the operator
- **THEN** the generation feature SHALL be unavailable

#### Scenario: AI generation is not configured
- **WHEN** AI generation is enabled but no AI credentials are configured
- **THEN** the system SHALL return an empty result

### Requirement: The system SHALL only accept supported languages for generation
The system SHALL only accept language codes that the application supports. Any unrecognized language SHALL be rejected.

#### Scenario: Supported language accepted
- **WHEN** a user submits a generation request with language `de`
- **THEN** the system SHALL accept the request and generate content in German

#### Scenario: Unsupported language rejected
- **WHEN** a user submits a generation request with an unsupported or malformed language value
- **THEN** the system SHALL reject the request with a validation error

#### Scenario: Missing language rejected
- **WHEN** a user submits a generation request without specifying a language
- **THEN** the system SHALL reject the request with a validation error

### Requirement: The system SHALL enforce size limits on the generation description
The system SHALL require a non-empty description of at most 5000 characters.

#### Scenario: Valid description accepted
- **WHEN** a user submits a description of 200 characters
- **THEN** the system SHALL accept the request

#### Scenario: Oversized description rejected
- **WHEN** a user submits a description longer than 5000 characters
- **THEN** the system SHALL reject the request with a validation error

#### Scenario: Empty description rejected
- **WHEN** a user submits an empty description
- **THEN** the system SHALL reject the request with a validation error

### Requirement: The system SHALL rate-limit AI generation based on actual input size
The system SHALL estimate resource consumption proportional to the length of the submitted description, rather than using a fixed estimate regardless of input size.

#### Scenario: Short description consumes fewer resources
- **WHEN** a user submits a 100-character description
- **THEN** the rate limiter SHALL count proportionally fewer tokens than for a 4000-character description

#### Scenario: Long description consumes more resources
- **WHEN** a user submits a 4000-character description
- **THEN** the rate limiter SHALL count proportionally more tokens

### Requirement: The system SHALL enforce configurable global rate limits on AI generation
The system SHALL enforce operator-configurable limits on tokens per minute, requests per minute, and tokens per day. When a limit is exceeded, the request SHALL be rejected.

#### Scenario: Rate limit exceeded
- **WHEN** generation requests exceed the configured rate limit
- **THEN** the system SHALL reject the request and indicate the limit was exceeded

#### Scenario: No limits configured
- **WHEN** no rate limits are configured by the operator
- **THEN** the system SHALL allow all generation requests

### Requirement: The operator SHALL be able to configure the AI provider
The operator SHALL be able to choose between supported AI providers and configure the model, endpoint, and credentials.

#### Scenario: Default provider
- **WHEN** no provider is explicitly configured
- **THEN** the system SHALL use OpenAI as the default provider

#### Scenario: Alternative provider
- **WHEN** the operator configures an alternative provider (e.g. Stackit)
- **THEN** the system SHALL use the configured provider

### Requirement: Generated content SHALL be in the requested language and contain only mindmap syntax
The system SHALL instruct the AI to generate mindmap syntax in the user's requested language, without explanatory text, and to return an empty mindmap for inappropriate topics.

#### Scenario: Language respected
- **WHEN** the user requests generation in French
- **THEN** the generated mindmap content SHALL be in French
