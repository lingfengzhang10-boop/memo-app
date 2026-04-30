import { MemoryEventCandidate } from '@/types/companion'

const YEAR_PATTERN = /(19|20)\d{2}年/g
const AGE_PATTERN = /(\d{1,2})岁/g
const CURRENT_KEYWORDS = ['最近', '现在', '目前', '当下', '这段时间']
const LIFE_STAGE_KEYWORDS = [
  ['小时候', '童年'],
  ['小学', '小学'],
  ['初中', '初中'],
  ['高中', '高中'],
  ['大学', '大学'],
  ['研究生', '研究生'],
  ['第一份工作', '第一份工作'],
  ['工作', '工作阶段'],
  ['结婚', '婚姻阶段'],
  ['怀孕', '孕期'],
  ['退休', '退休阶段'],
] as const
const EVENT_HINTS = [
  '毕业',
  '上学',
  '考上',
  '去了',
  '来到',
  '搬到',
  '搬家',
  '工作',
  '入职',
  '离职',
  '创业',
  '结婚',
  '分手',
  '恋爱',
  '生病',
  '住院',
  '手术',
  '去世',
  '第一次',
  '第一份工作',
  '生了',
  '生孩子',
]

function splitTranscriptIntoSentences(transcript: string) {
  return transcript
    .split(/[。！？；\n]/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
}

function hasEventSignal(sentence: string) {
  if (YEAR_PATTERN.test(sentence) || AGE_PATTERN.test(sentence)) {
    YEAR_PATTERN.lastIndex = 0
    AGE_PATTERN.lastIndex = 0
    return true
  }

  YEAR_PATTERN.lastIndex = 0
  AGE_PATTERN.lastIndex = 0

  return EVENT_HINTS.some((keyword) => sentence.includes(keyword))
}

function inferLifeStage(sentence: string) {
  const match = LIFE_STAGE_KEYWORDS.find(([keyword]) => sentence.includes(keyword))
  return match?.[1]
}

function inferLocationName(sentence: string) {
  const patterns = [
    /去(?:了)?([^，。！？；\s]{2,12})(?:工作|上学|读书|生活|定居)/,
    /在([^，。！？；\s]{2,12})(?:工作|上学|读书|生活|定居)/,
    /搬到([^，。！？；\s]{2,12})/,
    /来到([^，。！？；\s]{2,12})/,
  ]

  for (const pattern of patterns) {
    const match = sentence.match(pattern)
    if (match?.[1]) {
      return match[1]
    }
  }

  return undefined
}

function inferTitle(sentence: string) {
  if (sentence.includes('第一份工作')) return '第一份工作'
  if (sentence.includes('大学毕业') || sentence.includes('毕业')) return '毕业'
  if (sentence.includes('结婚')) return '结婚'
  if (sentence.includes('离职')) return '离职'
  if (sentence.includes('入职')) return '入职'
  if (sentence.includes('搬家') || sentence.includes('搬到')) return '搬家'
  if (sentence.includes('住院')) return '住院'
  if (sentence.includes('手术')) return '手术'
  if (sentence.includes('去了') && sentence.includes('工作')) return '去外地工作'
  if (sentence.includes('工作')) return '工作经历'

  const compact = sentence.replace(/\s+/g, '')
  return compact.length > 18 ? compact.slice(0, 18) : compact
}

function inferTimeType(sentence: string, year?: number, ageAtEvent?: number): MemoryEventCandidate['timeType'] {
  if (year) return 'year'
  if (ageAtEvent) return 'age'
  if (CURRENT_KEYWORDS.some((keyword) => sentence.includes(keyword))) return 'current'
  if (hasEventSignal(sentence)) return 'relative'
  return 'unknown'
}

function buildCanonicalKey(sentence: string, year?: number, ageAtEvent?: number) {
  const normalized = sentence.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 48)

  if (!normalized) {
    return ''
  }

  if (year) return `year-${year}-${normalized}`
  if (ageAtEvent) return `age-${ageAtEvent}-${normalized}`
  return `event-${normalized}`
}

export function buildFallbackEvents(transcript: string) {
  const sentences = splitTranscriptIntoSentences(transcript)
  const seen = new Set<string>()
  const events: MemoryEventCandidate[] = []

  for (const sentence of sentences) {
    if (!hasEventSignal(sentence)) {
      continue
    }

    const yearMatch = sentence.match(/((?:19|20)\d{2})年/)
    const ageMatch = sentence.match(/(\d{1,2})岁/)
    const year = yearMatch ? Number(yearMatch[1]) : undefined
    const ageAtEvent = ageMatch ? Number(ageMatch[1]) : undefined
    const title = inferTitle(sentence)
    const canonicalKey = buildCanonicalKey(sentence, year, ageAtEvent)

    if (!title || seen.has(canonicalKey || title)) {
      continue
    }

    seen.add(canonicalKey || title)

    events.push({
      canonicalKey,
      title,
      description: sentence,
      timeType: inferTimeType(sentence, year, ageAtEvent),
      year,
      ageAtEvent,
      lifeStage: inferLifeStage(sentence),
      isCurrent: CURRENT_KEYWORDS.some((keyword) => sentence.includes(keyword)),
      locationName: inferLocationName(sentence),
      importance: sentence.includes('第一份工作') || sentence.includes('毕业') ? 4 : 3,
      confidence: year || ageAtEvent ? 0.72 : 0.58,
      metadata: {
        extractedBy: 'heuristic_fallback',
        sourceSentence: sentence,
      },
    })

    if (events.length >= 5) {
      break
    }
  }

  return events
}
