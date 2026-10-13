import { describe, expect, it } from 'vitest'
import { embeddingVectors, splitForEmbedding, knowledgeContext } from '../knowledge-domain'

describe('knowledge index invariants', () => {
  it('rejects a different model even when dimensions match', () => {
    expect(() => embeddingVectors({ model: 'other', data: [{ index: 0, embedding: [1, 2] }] }, 1, 'bge')).toThrow('identity')
  })
  it('restores response order and rejects missing, duplicate and invalid vectors', () => {
    expect(embeddingVectors({ model: 'bge', data: [{ index: 1, embedding: [2] }, { index: 0, embedding: [1] }] }, 2, 'bge')).toEqual([[1], [2]])
    expect(() => embeddingVectors({ model: 'bge', data: [] }, 1, 'bge')).toThrow('incomplete')
    expect(() => embeddingVectors({ model: 'bge', data: [{ index: 0, embedding: [1] }, { index: 0, embedding: [2] }] }, 2, 'bge')).toThrow('index')
    for (const vector of [[0, 0], [NaN], [Infinity]]) {
      expect(() => embeddingVectors({ model: 'bge', data: [{ index: 0, embedding: vector }] }, 1, 'bge')).toThrow('invalid vector')
    }
  })
  it('fits CJK and emoji to the real tokenizer including the prefix', async () => {
    const text = '知识库🙂中文检索资料'
    const chunks = await splitForEmbedding(text, 'query: ', 11, async (s) => Array.from(s).length)
    expect(chunks.join('')).toBe(text)
    expect(chunks.every((s) => Array.from('query: ' + s).length <= 11)).toBe(true)
  })
  it('fails rather than truncating input when even the prefix does not fit', async () => {
    await expect(splitForEmbedding('中', 'too long', 2, async (s) => s.length)).rejects.toThrow('exceeds')
  })
  it('includes source labels and chunk order in answer context', () => {
    expect(knowledgeContext([{ id: 'x', text: '证据', file_id: 'f', chunk_file_order: 2, source: '指南.pdf' }])).toBe('[1] 指南.pdf · chunk 3\n证据')
  })
})
