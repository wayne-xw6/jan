import type { EmbeddingResponse } from '@janhq/core'

export type EmbeddingProfile = {
  model: string
  queryPrefix: string
  documentPrefix: string
}
export type KnowledgeDocument = { id: string; name: string; characters: number }
export type KnowledgeBase = {
  id: string
  name: string
  profile: EmbeddingProfile
  collection?: string
  dimension?: number
  documents: KnowledgeDocument[]
  updatedAt: string
}
export type KnowledgeHit = {
  id: string
  text: string
  file_id: string
  chunk_file_order: number
  score?: number
  source: string
}

export function embeddingVectors(response: EmbeddingResponse, count: number, model: string): number[][] {
  if (response.model !== model) throw new Error('Embedding model identity mismatch; index was not changed.')
  const vectors: number[][] = new Array(count)
  for (const item of response.data) {
    if (!Number.isInteger(item.index) || item.index < 0 || item.index >= count || vectors[item.index]) {
      throw new Error('Invalid embedding response index')
    }
    if (!item.embedding.length || item.embedding.some((n) => !Number.isFinite(n)) || !item.embedding.some((n) => n !== 0)) {
      throw new Error('Embedding model returned an invalid vector')
    }
    vectors[item.index] = item.embedding
  }
  if (Array.from({ length: count }, (_, i) => vectors[i]).some((v) => !v)) {
    throw new Error('Embedding response is incomplete')
  }
  if (vectors.some((v) => v.length !== vectors[0].length)) throw new Error('Inconsistent embedding dimensions')
  return vectors
}

// Split by Unicode code points so CJK and surrogate pairs survive splitting.
// The real model tokenizer, including its task prefix, decides the final size.
export async function splitForEmbedding(text: string, prefix: string, budget: number, count: (text: string) => Promise<number>): Promise<string[]> {
  if (!Number.isFinite(budget) || budget < 1) throw new Error('Invalid embedding token budget')
  const result: string[] = []
  const fit = async (part: string): Promise<void> => {
    const tokens = await count(prefix + part)
    if (!Number.isFinite(tokens) || tokens < 0) throw new Error('Invalid tokenizer result')
    if (tokens <= budget) { result.push(part); return }
    const points = Array.from(part)
    if (points.length < 2) throw new Error('Embedding prefix or input exceeds the model context')
    const middle = Math.floor(points.length / 2)
    await fit(points.slice(0, middle).join(''))
    await fit(points.slice(middle).join(''))
  }
  const points = Array.from(text.trim())
  for (let start = 0; start < points.length; start += 640) {
    await fit(points.slice(start, start + 768).join(''))
  }
  return result
}

export function knowledgeContext(hits: KnowledgeHit[]): string {
  return hits.map((hit, i) => `[${i + 1}] ${hit.source} · chunk ${hit.chunk_file_order + 1}\n${hit.text}`).join('\n\n')
}
