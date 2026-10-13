import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import type { modelInfo } from '@janhq/core'
import HeaderPage from '@/containers/HeaderPage'
import { Button } from '@/components/ui/button'
import { useServiceHub } from '@/hooks/useServiceHub'
import { knowledge } from '@/lib/knowledge'
import type { EmbeddingProfile, KnowledgeBase, KnowledgeHit } from '@/lib/knowledge-domain'

export const Route = createFileRoute('/knowledge')({ component: KnowledgePage })
const field = 'rounded-md border bg-background px-3 py-2 text-sm w-full'
const emptyProfile: EmbeddingProfile = { model: '', queryPrefix: '', documentPrefix: '' }

function KnowledgePage() {
  const hub = useServiceHub()
  const [bases, setBases] = useState<KnowledgeBase[]>([])
  const [selected, setSelected] = useState('')
  const [models, setModels] = useState<modelInfo[]>([])
  const [name, setName] = useState('我的知识库')
  const [profile, setProfile] = useState(emptyProfile)
  const [chatModel, setChatModel] = useState('')
  const [question, setQuestion] = useState('')
  const [hits, setHits] = useState<KnowledgeHit[]>([])
  const [answer, setAnswer] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [limit, setLimit] = useState(5)
  const [threshold, setThreshold] = useState(0.25)
  const abort = useRef<AbortController | null>(null)
  const active = bases.find((base) => base.id === selected)
  const embeddingModels = models.filter((model) => model.embedding)
  const chatModels = models.filter((model) => !model.embedding)

  const run = async (work: () => Promise<void>) => {
    setBusy(true); setError('')
    try { await work() } catch (e) {
      setError(e instanceof Error ? e.message : JSON.stringify(e))
    } finally { setBusy(false); setStatus(''); abort.current = null }
  }
  const refresh = async () => {
    const [saved, installed] = await Promise.all([knowledge.list(), knowledge.models()])
    setBases(saved); setModels(installed)
  }
  useEffect(() => {
    void run(refresh)
    return () => abort.current?.abort()
    // The service is initialized before routes mount.
  }, [])
  const choose = (id: string) => {
    setSelected(id); setHits([]); setAnswer('')
    setProfile(bases.find((base) => base.id === id)?.profile || emptyProfile)
  }
  const commit = async (base: KnowledgeBase) => {
    setBases(await knowledge.list()); setSelected(base.id); setProfile(base.profile)
    setHits([]); setAnswer('')
  }
  const search = async (generate: boolean) => {
    setHits([]); setAnswer('')
    const results = await knowledge.search(selected, question, limit, threshold)
    setHits(results); setAnswer('')
    if (generate) {
      abort.current = new AbortController()
      setStatus('正在使用本地模型回答…')
      await knowledge.answer(chatModel, question, results, abort.current, setAnswer)
    }
  }
  return <div className="flex h-full flex-col">
    <HeaderPage><h1 className="font-semibold">个人知识库</h1></HeaderPage>
    <main className="mx-auto w-full max-w-6xl flex-1 overflow-auto p-6 space-y-5">
      <p className="text-muted-foreground">文档保存在本机。先建立向量索引，检索相关片段，再由 Jan 内置模型回答。</p>
      <div className="flex gap-3 items-center">
        <select aria-label="选择知识库" className={field} disabled={busy} value={selected} onChange={(e) => choose(e.target.value)}>
          <option value="">新建知识库</option>{bases.map((base) => <option key={base.id} value={base.id}>{base.name}</option>)}
        </select>
        <Button variant="outline" disabled={busy} onClick={() => void run(refresh)}>刷新模型</Button>
        <Link to="/settings/providers/$providerName" params={{ providerName: 'llamacpp' }} className="shrink-0 underline text-sm">导入 / 下载模型</Link>
      </div>
      <section className="rounded-xl border p-5 space-y-4">
        <h2 className="font-semibold">{active ? active.name : '新建知识库'}</h2>
        {!active && <label className="block">名称<input className={field} value={name} disabled={busy} onChange={(e) => setName(e.target.value)} /></label>}
        <label className="block">Embedding 模型
          <select className={field} value={profile.model} disabled={busy} onChange={(e) => setProfile({ ...profile, model: e.target.value })}>
            <option value="">选择已导入的 embedding GGUF</option>
            {embeddingModels.map((model) => <option key={model.id} value={model.id}>{model.name || model.id}</option>)}
          </select>
        </label>
        <details><summary className="cursor-pointer text-sm">模型检索前缀（按模型说明填写）</summary>
          <div className="grid gap-3 mt-3 md:grid-cols-2">
            <label>查询前缀<textarea className={field} disabled={busy} value={profile.queryPrefix} onChange={(e) => setProfile({ ...profile, queryPrefix: e.target.value })} /></label>
            <label>文档前缀<textarea className={field} disabled={busy} value={profile.documentPrefix} onChange={(e) => setProfile({ ...profile, documentPrefix: e.target.value })} /></label>
          </div>
          <p className="text-muted-foreground text-sm">bge-m3 通常不需要前缀；EmbeddingGemma 系列请使用对应版本模型卡的 query / document 提示格式。</p>
        </details>
        <p className="text-sm text-muted-foreground">{active ? `已入库 ${active.documents.length} 个文档 · ${active.dimension || '—'} 维 · 当前索引模型：${active.profile.model}` : '聊天模型与 embedding 模型独立选择，由同一个 Jan 引擎管理。'}</p>
        <Button disabled={busy || !profile.model || (!active && !name.trim())} onClick={() => void run(async () => commit(active ? await knowledge.rebuild(active.id, profile, setStatus) : await knowledge.create(name, profile)))}>
          {active ? '按所选模型重建索引' : '创建知识库'}
        </Button>
        {active && <Button className="ml-3" variant="outline" disabled={busy} onClick={() => void run(async () => {
          const paths = await hub.dialog().open({ multiple: true, filters: [{ name: '文档', extensions: ['txt', 'md', 'pdf', 'docx', 'csv', 'html', 'xlsx', 'pptx'] }] })
          if (paths) await commit(await knowledge.import(active.id, Array.isArray(paths) ? paths : [paths], setStatus))
        })}>导入文档</Button>}
        {active?.documents.map((document) => <div className="flex items-center justify-between border-t pt-2" key={document.id}>
          <span className="break-all">{document.name} <span className="text-muted-foreground text-xs">{document.characters.toLocaleString()} 字符</span></span>
          <Button variant="ghost" disabled={busy} onClick={() => void run(async () => commit(await knowledge.removeDocument(active.id, document.id, setStatus)))}>移除</Button>
        </div>)}
      </section>
      <section className="rounded-xl border p-5 space-y-4">
        <h2 className="font-semibold">检索与问答</h2>
        <label className="block">本地聊天模型<select className={field} disabled={busy} value={chatModel} onChange={(e) => setChatModel(e.target.value)}>
          <option value="">选择聊天模型</option>{chatModels.map((model) => <option key={model.id} value={model.id}>{model.name || model.id}</option>)}
        </select></label>
        <textarea aria-label="知识库问题" placeholder="输入你想从资料中查找的问题…" className={field} rows={3} value={question} disabled={busy} onChange={(e) => setQuestion(e.target.value)} />
        <div className="flex flex-wrap gap-4 items-center">
          <label>片段数 <select value={limit} disabled={busy} onChange={(e) => setLimit(Number(e.target.value))}>{[3, 5, 8].map((n) => <option key={n}>{n}</option>)}</select></label>
          <label>最低相似度 <select value={threshold} disabled={busy} onChange={(e) => setThreshold(Number(e.target.value))}>{[0, 0.15, 0.25, 0.4, 0.6].map((n) => <option key={n}>{n}</option>)}</select></label>
          <Button variant="outline" disabled={busy || !active?.collection || !question.trim()} onClick={() => void run(() => search(false))}>检索片段</Button>
          <Button disabled={busy || !active?.collection || !chatModel || !question.trim()} onClick={() => void run(() => search(true))}>基于知识库回答</Button>
          {busy && abort.current && <Button variant="ghost" onClick={() => abort.current?.abort()}>停止生成</Button>}
        </div>
        {answer && <article className="whitespace-pre-wrap rounded-lg bg-muted p-4 leading-7">{answer}</article>}
        {hits.map((hit, i) => <details key={hit.id} className="rounded-lg border p-3" open>
          <summary className="cursor-pointer font-medium">[{i + 1}] {hit.source} · 片段 {hit.chunk_file_order + 1} · 相似度 {(hit.score ?? 0).toFixed(3)}</summary>
          <p className="whitespace-pre-wrap text-sm mt-3">{hit.text}</p>
        </details>)}
      </section>
      {busy && <p role="status">{status || '处理中…'}</p>}
      {error && <p role="alert" className="rounded-lg border border-destructive p-3 text-destructive break-all">{error}</p>}
    </main>
  </div>
}
