# AI Benchmark

Automated benchmark suite that evaluates the quality of AI-generated mind maps. It sends a set of predefined prompts (fixtures) through the mind map generation pipeline, then grades each output on two dimensions using an LLM-as-judge approach plus static Mermaid syntax validation.

## Running

```bash
# Requires AI_LLM_TOKEN and AI_LLM_MODEL environment variables
pnpm run benchmark:ai
```

## How it works

1. Each fixture describes a mind map topic, language, and category.
2. The `AiService` generates a Mermaid mind map for the fixture.
3. The `BenchmarkGraderService` scores the output on two dimensions:
   - **Semantic Quality** — An LLM judges relevance, depth, and structure (0–10).
   - **Mermaid Syntax** — A static validator checks structural correctness (0–10).
4. Results are printed to the console and saved as a timestamped JSON report in `benchmark/reports/`.

## Fixtures

Defined in `fixtures.ts`. Each fixture has a topic category:

| Category        | Description                                      |
|-----------------|--------------------------------------------------|
| `informational` | Factual topics testing accuracy and depth         |
| `technical`     | Domain-specific jargon testing clean node labels  |
| `creative`      | Open-ended topics testing node diversity           |
| `edge-case`     | Minimal or extreme inputs testing graceful handling|

Fixtures cover both English (`en`) and German (`de`) prompts.

## Output JSON format

Reports are written to `benchmark/reports/<timestamp>.json`. The top-level structure is a `GradingReport`:

| Field            | Type                       | Description                                                        |
|------------------|----------------------------|--------------------------------------------------------------------|
| `timestamp`      | `string`                   | ISO 8601 timestamp of the benchmark run.                           |
| `provider`       | `string`                   | LLM provider used (e.g. `"openai-compatible"`).                    |
| `model`          | `string`                   | Model identifier (e.g. `"mistral-large-latest"`).                  |
| `systemPrompt`   | `string`                   | The full system prompt sent to the AI for mind map generation.     |
| `results`        | `BenchmarkResult[]`        | Per-fixture results (see below).                                   |
| `averages`       | `Record<string, number>`   | Average score per grading dimension across all fixtures.           |
| `overallAverage` | `number`                   | Grand average of all dimension scores across all fixtures.         |

### `BenchmarkResult`

Each entry in the `results` array:

| Field        | Type                 | Description                                                    |
|--------------|----------------------|----------------------------------------------------------------|
| `fixtureId`  | `string`             | Unique fixture identifier (e.g. `"en-info-photosynthesis"`).   |
| `fixture`    | `BenchmarkFixture`   | Full fixture definition (id, description, language, topic).    |
| `rawOutput`  | `string`             | The raw Mermaid syntax returned by the AI.                     |
| `durationMs` | `number`             | Time taken for generation in milliseconds.                     |
| `error`      | `string \| null`     | Error message if generation failed or timed out, otherwise `null`. |
| `dimensions` | `GradingDimension[]` | Array of scored grading dimensions (typically 2).              |

### `GradingDimension`

Each entry in the `dimensions` array:

| Field        | Type     | Description                                           |
|--------------|----------|-------------------------------------------------------|
| `name`       | `string` | Dimension name (`"Semantic Quality"` or `"Mermaid Syntax"`). |
| `score`      | `number` | Score from 0 to 10.                                   |
| `strengths`  | `string` | One-sentence summary of what the output did well.     |
| `weaknesses` | `string` | One-sentence summary of issues found.                 |

### `BenchmarkFixture`

| Field               | Type     | Description                                              |
|---------------------|----------|----------------------------------------------------------|
| `id`                | `string` | Unique identifier (e.g. `"de-tech-softwarearchitektur"`). |
| `description`       | `string` | Human-readable description of what the fixture tests.    |
| `mindmapDescription`| `string` | The prompt sent to the AI for mind map generation.       |
| `language`          | `string` | Language code (`"en"` or `"de"`).                        |
| `topic`             | `string` | Fixture category: `informational`, `technical`, `creative`, or `edge-case`. |
