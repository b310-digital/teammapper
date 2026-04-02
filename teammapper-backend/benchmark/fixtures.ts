import type { BenchmarkFixture } from './benchmark.types'

export const BENCHMARK_FIXTURES: readonly BenchmarkFixture[] = [
  {
    id: 'en-info-photosynthesis',
    description: 'Factual science topic; baseline quality and depth check',
    mindmapDescription: 'Photosynthesis: how plants convert light to energy',
    language: 'en',
    topic: 'informational',
  },
  {
    id: 'en-tech-kubernetes',
    description: 'Technical jargon; tests clean node labels',
    mindmapDescription:
      'Kubernetes architecture: pods, services, and deployments',
    language: 'en',
    topic: 'technical',
  },
  {
    id: 'en-creative-scifi-themes',
    description: 'Open-ended creative topic; tests node diversity',
    mindmapDescription: 'Key themes in science fiction literature',
    language: 'en',
    topic: 'creative',
  },
  {
    id: 'en-info-seven-wonders',
    description: 'Must return real-world wonders, not fantasy ones',
    mindmapDescription: 'The Seven Wonders of the Ancient World',
    language: 'en',
    topic: 'informational',
  },
  {
    id: 'en-edge-single-word',
    description: 'Minimum viable input; tests graceful handling of tiny input',
    mindmapDescription: 'Cats',
    language: 'en',
    topic: 'edge-case',
  },
  {
    id: 'de-info-klimawandel',
    description: 'German factual topic with compound nouns',
    mindmapDescription: 'Ursachen und Folgen des Klimawandels',
    language: 'de',
    topic: 'informational',
  },
  {
    id: 'de-tech-softwarearchitektur',
    description: 'Tests umlauts in node labels',
    mindmapDescription: 'Grundprinzipien der Software-Architektur',
    language: 'de',
    topic: 'technical',
  },
  {
    id: 'de-creative-maerchen',
    description: 'Accented chars and compound words in node labels',
    mindmapDescription: 'Elemente eines deutschen Märchens',
    language: 'de',
    topic: 'creative',
  },
  {
    id: 'de-info-digitalisierung',
    description: 'Long German compound words in nodes',
    mindmapDescription: 'Chancen und Herausforderungen der Digitalisierung',
    language: 'de',
    topic: 'informational',
  },
  {
    id: 'de-edge-compound-words',
    description:
      'Single extremely long compound word; stress-tests node label limits',
    mindmapDescription: 'Donaudampfschifffahrt',
    language: 'de',
    topic: 'edge-case',
  },
]
