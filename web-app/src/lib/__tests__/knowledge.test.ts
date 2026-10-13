import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(), embed: vi.fn(), count: vi.fn(), read: vi.fn(),
  stored: '' as string, failPublish: false,
}))
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }))
vi.mock('@janhq/core', () => ({
  fs: { mkdir: vi.fn(), readFileSync: mocks.read, writeFileSync: vi.fn(), rm: vi.fn().mockResolvedValue(undefined) },
  getJanDataFolderPath: async () => '/profile', joinPath: async (parts: string[]) => parts.join('/'),
  getEmbeddingEngine: () => ({
    getEmbeddingContextSize: async () => 512,
    countEmbeddingTokens: mocks.count,
    embed: mocks.embed,
  }),
}))
import { knowledge } from '../knowledge'

const base = {
  id: 'library', name: 'Notes', profile: { model: 'old', queryPrefix: '', documentPrefix: '' },
  collection: 'old-index', dimension: 2, documents: [{ id: 'doc', name: 'manual.txt', characters: 10 }], updatedAt: '',
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.stored = JSON.stringify([base]); mocks.failPublish = false
  mocks.read.mockResolvedValue('A retained document')
  mocks.count.mockResolvedValue([10])
  mocks.embed.mockImplementation(async (_text, model) => ({ model, data: [{ index: 0, embedding: [1, 2] }] }))
  mocks.invoke.mockImplementation(async (command, args) => {
    if (command === 'knowledge_catalog_get') return mocks.stored
    if (command === 'knowledge_catalog_set') {
      if (mocks.failPublish) throw new Error('disk full')
      mocks.stored = args.value
    }
    if (command === 'plugin:vector-db|create_file') return { id: 'file' }
    if (command === 'plugin:vector-db|list_attachments') return [{ id: 'file', name: 'manual.txt' }]
    if (command === 'plugin:vector-db|search_collection') return [{ id: 'chunk', text: 'evidence', file_id: 'file', chunk_file_order: 0, score: 0.9 }]
  })
})
describe('knowledge generation commits', () => {
  it('pins the requested model and switches the index only after successful ingestion', async () => {
    const next = await knowledge.rebuild('library', { ...base.profile, model: 'new' }, vi.fn())
    expect(next.collection).not.toBe('old-index')
    expect(JSON.parse(mocks.stored)[0].profile.model).toBe('new')
    expect(mocks.embed).toHaveBeenCalledWith(['A retained document'], 'new')
    const commands = mocks.invoke.mock.calls.map(([cmd]) => cmd)
    expect(commands.indexOf('knowledge_catalog_set')).toBeGreaterThan(commands.indexOf('plugin:vector-db|insert_chunks'))
    expect(mocks.invoke).toHaveBeenLastCalledWith('plugin:vector-db|delete_collection', { collection: 'old-index' })
  })
  it('keeps the previous index when vectorization fails', async () => {
    mocks.embed.mockRejectedValue(new Error('engine unavailable'))
    await expect(knowledge.rebuild('library', { ...base.profile, model: 'new' }, vi.fn())).rejects.toThrow('engine unavailable')
    expect(JSON.parse(mocks.stored)[0].collection).toBe('old-index')
    expect(mocks.invoke).not.toHaveBeenCalledWith('plugin:vector-db|delete_collection', { collection: 'old-index' })
  })
  it('keeps the previous generation if publishing to disk fails', async () => {
    mocks.failPublish = true
    await expect(knowledge.rebuild('library', { ...base.profile, model: 'new' }, vi.fn())).rejects.toThrow('disk full')
    expect(JSON.parse(mocks.stored)[0].collection).toBe('old-index')
    expect(mocks.invoke).not.toHaveBeenCalledWith('plugin:vector-db|delete_collection', { collection: 'old-index' })
  })
  it('queries with the indexed model even after the global default changes', async () => {
    const hits = await knowledge.search('library', 'question')
    expect(mocks.embed).toHaveBeenCalledWith(['question'], 'old')
    expect(hits[0].source).toBe('manual.txt')
  })
  it('rejects mismatched model identity before calling vector search', async () => {
    mocks.embed.mockResolvedValue({ model: 'wrong', data: [{ index: 0, embedding: [1, 2] }] })
    await expect(knowledge.search('library', 'question')).rejects.toThrow('identity')
    expect(mocks.invoke.mock.calls.some(([cmd]) => cmd === 'plugin:vector-db|search_collection')).toBe(false)
  })
})
