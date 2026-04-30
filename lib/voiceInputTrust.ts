import { VoiceInputTrustLevel } from '@/types/companion'

const AI_API_KEY = process.env.AI_API_KEY || process.env.OPENAI_API_KEY
const AI_BASE_URL = process.env.AI_BASE_URL || 'https://api.siliconflow.cn/v1'
const ANALYSIS_MODEL = process.env.AI_ANALYSIS_MODEL || 'Qwen/Qwen2.5-7B-Instruct'
const CHAT_COMPLETIONS_ENDPOINT = `${AI_BASE_URL}/chat/completions`
const ENABLE_VOICE_INPUT_TRUST_PIPELINE = process.env.ENABLE_VOICE_INPUT_TRUST_PIPELINE !== 'false'

export type VoiceInputTrustSurface = 'twin-chat' | 'memory-reflect'

export type StabilizedVoiceInput = {
  transcript: string
  trustedTranscript: string
  displayTranscript: string
  trustLevel: VoiceInputTrustLevel
  riskFlags: string[]
  usedRepair: boolean
}

const CONCERN_PATTERN = /(?:最难|压力|担心|害怕|焦虑|不稳定|悬着心|难受|发愁|紧张)/i
const SUPPORT_PATTERN = /(?:安慰|支持|后盾|陪着|帮我|理解我)/i
const SOCIAL_ACTIVITY_PATTERN = /(?:聚会|聚餐|聚一下|喝酒|唱歌|出去玩|见朋友|参加活动|约了朋友)/i
const REPEATED_LAUGHTER_PATTERN = /(?:嘿{3,}|哈{3,}|呵{3,}|嘿嘿嘿+|哈哈哈+|呵呵呵+)/i
const TRAILING_NOISE_PATTERN = /(?:[，。！？；]\s*)?(?:嘿嘿|哈哈|呵呵|嗯嗯|啊啊|哦哦|唉唉){2,}\s*$/i
const EMOJI_PATTERN = /\p{Extended_Pictographic}/gu
const ANCHOR_PATTERN = /(?:20\d{2}年|杭州|北京|上海|深圳|广州|南京|苏州|武汉|成都|妈妈|爸爸|大学|高中|老家|那时候|那阵子|后来)/i

function normalizeTranscript(value: string) {
  return value
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
}

function sanitizeVisibleTranscript(value: string) {
  return normalizeTranscript(value)
    .replace(EMOJI_PATTERN, '')
    .replace(TRAILING_NOISE_PATTERN, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function splitClauses(value: string) {
  return sanitizeVisibleTranscript(value)
    .split(/[，。！？；]/)
    .map((clause) => clause.trim())
    .filter(Boolean)
}

function detectRiskFlags(transcript: string, context: string[]) {
  const flags: string[] = []
  const normalized = sanitizeVisibleTranscript(transcript)
  const hasConcern = CONCERN_PATTERN.test(normalized)
  const hasSocialActivity = SOCIAL_ACTIVITY_PATTERN.test(normalized)

  if (REPEATED_LAUGHTER_PATTERN.test(transcript) || TRAILING_NOISE_PATTERN.test(transcript)) {
    flags.push('repeated-laughter-tail')
  }

  if (EMOJI_PATTERN.test(transcript)) {
    flags.push('emoji-noise')
  }

  if (hasConcern && hasSocialActivity) {
    flags.push('mixed-social-expansion')
  }

  if (normalized.length > 72 && hasConcern) {
    flags.push('overlong-concern-draft')
  }

  const lastContext = context.at(-1)?.trim() || ''
  if (lastContext && /(?:还有别的事情吗|除了这些|还发生了什么)/.test(lastContext) && hasConcern && hasSocialActivity) {
    flags.push('followup-overexpansion')
  }

  return flags
}

function scoreClause(clause: string, hasConcern: boolean) {
  let score = 0

  if (CONCERN_PATTERN.test(clause)) {
    score += 5
  }

  if (SUPPORT_PATTERN.test(clause)) {
    score += 3
  }

  if (ANCHOR_PATTERN.test(clause)) {
    score += 2
  }

  if (SOCIAL_ACTIVITY_PATTERN.test(clause) && hasConcern) {
    score -= 2
  }

  if (clause.length < 3) {
    score -= 2
  }

  return score
}

function buildConservativeTranscript(transcript: string) {
  const cleaned = sanitizeVisibleTranscript(transcript)
  const clauses = splitClauses(cleaned)

  if (clauses.length <= 1) {
    return cleaned
  }

  const hasConcern = clauses.some((clause) => CONCERN_PATTERN.test(clause))
  const ranked = clauses
    .map((clause, index) => ({
      clause,
      index,
      score: scoreClause(clause, hasConcern),
    }))
    .filter((item) => item.score >= 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score
      }

      return left.index - right.index
    })
    .slice(0, hasConcern ? 2 : 3)
    .sort((left, right) => left.index - right.index)

  const rebuilt = ranked.map((item) => item.clause).join('，').trim()
  return rebuilt || cleaned
}

async function readErrorPayload(response: Response) {
  const rawText = await response.text()

  try {
    const parsed = JSON.parse(rawText) as {
      error?: { message?: string }
      message?: string
    }

    return parsed.error?.message || parsed.message || rawText
  } catch {
    return rawText
  }
}

function buildRepairPrompt(input: {
  transcript: string
  conservativeTranscript: string
  surface: VoiceInputTrustSurface
  riskFlags: string[]
  context: string[]
}) {
  return [
    'You repair Chinese ASR drafts for a personal memory companion.',
    'The transcript may contain hallucinated additions, duplicated laughter, emojis, or over-specific event details that the speaker did not actually say.',
    'Return JSON only with fields: trustedTranscript, displayTranscript, trustLevel, riskFlags.',
    '',
    'Rules:',
    '- Be conservative. Keep only the core meaning that is clearly supported by the draft.',
    '- Remove repeated laughter, emojis, and sound-effect tails.',
    '- If a draft mixes a core worry/stress statement with a new social activity or extra event detail, prefer the worry/stress statement and drop the extra event detail.',
    '- Do not add any new people, events, or places.',
    '- displayTranscript should be natural and user-facing, but still conservative.',
    '- trustLevel must be one of: stable, guarded, risky.',
    '',
    `Surface: ${input.surface}`,
    input.context.length > 0 ? `Recent context:\n${input.context.join('\n')}` : 'Recent context: none',
    `Risk flags: ${input.riskFlags.join(', ') || 'none'}`,
    `Original ASR draft: ${input.transcript}`,
    `Conservative baseline: ${input.conservativeTranscript}`,
  ].join('\n')
}

async function repairVoiceTranscriptWithModel(input: {
  transcript: string
  conservativeTranscript: string
  surface: VoiceInputTrustSurface
  riskFlags: string[]
  context: string[]
}) {
  if (!AI_API_KEY) {
    return null
  }

  const response = await fetch(CHAT_COMPLETIONS_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${AI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: ANALYSIS_MODEL,
      messages: [
        {
          role: 'system',
          content: 'You repair noisy Chinese ASR drafts and return compact JSON only.',
        },
        {
          role: 'user',
          content: buildRepairPrompt(input),
        },
      ],
      response_format: {
        type: 'json_object',
      },
      temperature: 0.1,
      max_tokens: 240,
    }),
  })

  if (!response.ok) {
    const errorText = await readErrorPayload(response)
    throw new Error(`Voice transcript repair failed: ${errorText}`)
  }

  const result = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string
      }
    }>
  }

  const text = result.choices?.[0]?.message?.content
  if (!text) {
    return null
  }

  return JSON.parse(text) as {
    trustedTranscript?: string
    displayTranscript?: string
    trustLevel?: VoiceInputTrustLevel
    riskFlags?: string[]
  }
}

export async function stabilizeVoiceInputDraft(input: {
  transcript: string
  surface: VoiceInputTrustSurface
  context?: string[]
}) {
  const transcript = normalizeTranscript(input.transcript)
  const context = (input.context ?? []).map((item) => item.trim()).filter(Boolean).slice(-3)
  const riskFlags = detectRiskFlags(transcript, context)
  const conservativeTranscript = buildConservativeTranscript(transcript)

  if (!ENABLE_VOICE_INPUT_TRUST_PIPELINE) {
    return {
      transcript,
      trustedTranscript: conservativeTranscript || transcript,
      displayTranscript: conservativeTranscript || transcript,
      trustLevel: 'stable',
      riskFlags,
      usedRepair: false,
    } satisfies StabilizedVoiceInput
  }

  if (riskFlags.length === 0) {
    return {
      transcript,
      trustedTranscript: conservativeTranscript || transcript,
      displayTranscript: conservativeTranscript || transcript,
      trustLevel: 'stable',
      riskFlags,
      usedRepair: false,
    } satisfies StabilizedVoiceInput
  }

  try {
    const repaired = await repairVoiceTranscriptWithModel({
      transcript,
      conservativeTranscript,
      surface: input.surface,
      riskFlags,
      context,
    })

    const trustedTranscript = sanitizeVisibleTranscript(
      repaired?.trustedTranscript?.trim() || conservativeTranscript || transcript,
    )
    const displayTranscript = sanitizeVisibleTranscript(
      repaired?.displayTranscript?.trim() || trustedTranscript || transcript,
    )
    const trustLevel = repaired?.trustLevel && ['stable', 'guarded', 'risky'].includes(repaired.trustLevel)
      ? repaired.trustLevel
      : 'guarded'

    return {
      transcript,
      trustedTranscript: trustedTranscript || transcript,
      displayTranscript: displayTranscript || trustedTranscript || transcript,
      trustLevel,
      riskFlags: Array.isArray(repaired?.riskFlags) && repaired?.riskFlags.length > 0 ? repaired.riskFlags : riskFlags,
      usedRepair: true,
    } satisfies StabilizedVoiceInput
  } catch (error) {
    console.error('Voice input stabilization fallback engaged:', error)
    return {
      transcript,
      trustedTranscript: conservativeTranscript || transcript,
      displayTranscript: conservativeTranscript || transcript,
      trustLevel: 'guarded',
      riskFlags,
      usedRepair: false,
    } satisfies StabilizedVoiceInput
  }
}
