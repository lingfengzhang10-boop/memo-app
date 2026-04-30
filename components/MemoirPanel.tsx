'use client'

import { useEffect, useMemo, useState } from 'react'
import { fetchMemoirData, updateMemoirEntry } from '@/lib/memoir'
import { MemoirData, MemoirEntryDraft, MemoryFactValidTimeType } from '@/types/companion'

type MemoirPanelProps = {
  open: boolean
  onClose: () => void
  canEdit: boolean
}

function replaceEntry(data: MemoirData, nextEntry: MemoirEntryDraft) {
  return {
    ...data,
    sections: data.sections.map((section) => ({
      ...section,
      entries: section.entries.map((entry) =>
        entry.id === nextEntry.id && entry.kind === nextEntry.kind ? nextEntry : entry,
      ),
    })),
  }
}

export function MemoirPanel({ open, onClose, canEdit }: MemoirPanelProps) {
  const [memoir, setMemoir] = useState<MemoirData>({ sections: [], eventCount: 0, factCount: 0 })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [savingKey, setSavingKey] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    let cancelled = false

    const load = async () => {
      try {
        setLoading(true)
        setError('')
        const data = await fetchMemoirData()

        if (!cancelled) {
          setMemoir(data)
        }
      } catch (loadError) {
        console.error('加载回忆录失败:', loadError)
        if (!cancelled) {
          setError('加载回忆录失败，请稍后再试。')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [open])

  const totalCount = useMemo(() => memoir.eventCount + memoir.factCount, [memoir.eventCount, memoir.factCount])

  const handleEventChange = (
    id: string,
    field: 'title' | 'description' | 'lifeStage' | 'locationName' | 'year',
    value: string,
  ) => {
    setMemoir((current) => ({
      ...current,
      sections: current.sections.map((section) => ({
        ...section,
        entries: section.entries.map((entry) => {
          if (entry.kind !== 'event' || entry.id !== id) {
            return entry
          }

          if (field === 'year') {
            return {
              ...entry,
              year: value.trim() ? Number(value) : undefined,
            }
          }

          return {
            ...entry,
            [field]: value,
          }
        }),
      })),
    }))
  }

  const handleFactChange = (
    id: string,
    field: 'subject' | 'predicate' | 'objectText' | 'validTimeType',
    value: string,
  ) => {
    setMemoir((current) => ({
      ...current,
      sections: current.sections.map((section) => ({
        ...section,
        entries: section.entries.map((entry) =>
          entry.kind !== 'fact' || entry.id !== id
            ? entry
            : {
                ...entry,
                [field]: value,
              },
        ),
      })),
    }))
  }

  const handleSave = async (entry: MemoirEntryDraft) => {
    try {
      setSavingKey(`${entry.kind}:${entry.id}`)
      setError('')
      await updateMemoirEntry(entry)
      setMemoir((current) => replaceEntry(current, entry))
    } catch (saveError) {
      console.error('保存回忆录条目失败:', saveError)
      setError('保存失败，请稍后再试。')
    } finally {
      setSavingKey(null)
    }
  }

  if (!open) {
    return null
  }

  return (
    <div className="memoir-shell" role="dialog" aria-modal="true" aria-label="回忆录">
      <div className="memoir-backdrop" onClick={onClose} />
      <aside className="memoir-panel">
        <div className="memoir-panel__header">
          <div>
            <p className="memoir-panel__eyebrow">回忆录</p>
            <h2 className="memoir-panel__title">把已确认的人生线索整理成可编辑的档案</h2>
            <p className="memoir-panel__subtitle">
              这里展示的是已经进入正式资产层的事件与事实；原话证据只是辅助理解，不会覆盖正式记忆。
            </p>
          </div>
          <button type="button" className="memoir-panel__close" onClick={onClose}>
            关闭
          </button>
        </div>

        <div className="memoir-panel__meta">
          <span>{memoir.eventCount} 条事件</span>
          <span>{memoir.factCount} 条事实</span>
          <span>{totalCount} 条线索</span>
        </div>

        {loading && <p className="memoir-panel__state">正在加载回忆录…</p>}
        {!loading && error && <p className="memoir-panel__state memoir-panel__state-error">{error}</p>}
        {!loading && !error && memoir.sections.length === 0 && (
          <p className="memoir-panel__state">还没有已确认的正式记忆，先去说一段或确认几条线索吧。</p>
        )}

        <div className="memoir-sections">
          {memoir.sections.map((section) => (
            <section key={section.id} className="memoir-section">
              <div className="memoir-section__header">
                <h3>{section.title}</h3>
                <p>{section.summary}</p>
              </div>

              <div className="memoir-section__entries">
                {section.entries.map((entry) => {
                  const rowKey = `${entry.kind}:${entry.id}`
                  const saving = savingKey === rowKey

                  if (entry.kind === 'event') {
                    return (
                      <article key={rowKey} className="memoir-entry memoir-entry-event">
                        <div className="memoir-entry__meta">
                          <span className="memoir-entry__kind">事件</span>
                          <span>{entry.timeLabel}</span>
                        </div>

                        <label className="memoir-entry__field">
                          <span>标题</span>
                          <input
                            value={entry.title}
                            onChange={(event) => handleEventChange(entry.id, 'title', event.target.value)}
                            disabled={!canEdit || saving}
                          />
                        </label>

                        <label className="memoir-entry__field">
                          <span>描述</span>
                          <textarea
                            value={entry.description}
                            onChange={(event) => handleEventChange(entry.id, 'description', event.target.value)}
                            rows={3}
                            disabled={!canEdit || saving}
                          />
                        </label>

                        <div className="memoir-entry__grid">
                          <label className="memoir-entry__field">
                            <span>年份</span>
                            <input
                              value={entry.year ?? ''}
                              onChange={(event) => handleEventChange(entry.id, 'year', event.target.value)}
                              inputMode="numeric"
                              disabled={!canEdit || saving}
                            />
                          </label>

                          <label className="memoir-entry__field">
                            <span>阶段</span>
                            <input
                              value={entry.lifeStage ?? ''}
                              onChange={(event) => handleEventChange(entry.id, 'lifeStage', event.target.value)}
                              disabled={!canEdit || saving}
                            />
                          </label>

                          <label className="memoir-entry__field">
                            <span>地点</span>
                            <input
                              value={entry.locationName ?? ''}
                              onChange={(event) => handleEventChange(entry.id, 'locationName', event.target.value)}
                              disabled={!canEdit || saving}
                            />
                          </label>
                        </div>

                        <div className="memoir-entry__footer">
                          <span>来源录音 {entry.sourceMemoryIds.length} 条</span>
                          {canEdit && (
                            <button type="button" onClick={() => handleSave(entry)} disabled={saving}>
                              {saving ? '保存中…' : '保存'}
                            </button>
                          )}
                        </div>

                        {entry.semanticEvidence && entry.semanticEvidence.length > 0 && (
                          <div className="memoir-entry__evidence">
                            <p className="memoir-entry__evidence-title">原话证据</p>
                            <ul className="memoir-entry__evidence-list">
                              {entry.semanticEvidence.map((evidence) => (
                                <li key={`${entry.id}-${evidence.memoryId}-${evidence.excerpt}`}>
                                  <span>{evidence.excerpt}</span>
                                  <small>{evidence.reasons.join(' / ')}</small>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </article>
                    )
                  }

                  return (
                    <article key={rowKey} className="memoir-entry memoir-entry-fact">
                      <div className="memoir-entry__meta">
                        <span className="memoir-entry__kind">事实</span>
                        <span>{entry.timeLabel}</span>
                      </div>

                      <div className="memoir-entry__triple">
                        <label className="memoir-entry__field">
                          <span>主体</span>
                          <input
                            value={entry.subject}
                            onChange={(event) => handleFactChange(entry.id, 'subject', event.target.value)}
                            disabled={!canEdit || saving}
                          />
                        </label>
                        <label className="memoir-entry__field">
                          <span>关系</span>
                          <input
                            value={entry.predicate}
                            onChange={(event) => handleFactChange(entry.id, 'predicate', event.target.value)}
                            disabled={!canEdit || saving}
                          />
                        </label>
                        <label className="memoir-entry__field">
                          <span>内容</span>
                          <input
                            value={entry.objectText}
                            onChange={(event) => handleFactChange(entry.id, 'objectText', event.target.value)}
                            disabled={!canEdit || saving}
                          />
                        </label>
                      </div>

                      <label className="memoir-entry__field">
                        <span>时间类型</span>
                        <select
                          value={entry.validTimeType}
                          onChange={(event) =>
                            handleFactChange(entry.id, 'validTimeType', event.target.value as MemoryFactValidTimeType)
                          }
                          disabled={!canEdit || saving}
                        >
                          <option value="current">当前</option>
                          <option value="temporary">阶段性</option>
                          <option value="long_term">长期</option>
                          <option value="past">过去</option>
                          <option value="unknown">未定</option>
                        </select>
                      </label>

                      <div className="memoir-entry__footer">
                        <span>来源录音 {entry.sourceMemoryIds.length} 条</span>
                        {canEdit && (
                          <button type="button" onClick={() => handleSave(entry)} disabled={saving}>
                            {saving ? '保存中…' : '保存'}
                          </button>
                        )}
                      </div>

                      {entry.semanticEvidence && entry.semanticEvidence.length > 0 && (
                        <div className="memoir-entry__evidence">
                          <p className="memoir-entry__evidence-title">原话证据</p>
                          <ul className="memoir-entry__evidence-list">
                            {entry.semanticEvidence.map((evidence) => (
                              <li key={`${entry.id}-${evidence.memoryId}-${evidence.excerpt}`}>
                                <span>{evidence.excerpt}</span>
                                <small>{evidence.reasons.join(' / ')}</small>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </article>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      </aside>
    </div>
  )
}
