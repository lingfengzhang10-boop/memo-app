import { NextResponse } from 'next/server'
import { stabilizeVoiceInputDraft } from '@/lib/voiceInputTrust'
import { CompanionProfile, QuickRecordingReflection, RecordingReflection } from '@/types/companion'

const AI_API_KEY = process.env.AI_API_KEY || process.env.OPENAI_API_KEY
const AI_BASE_URL = process.env.AI_BASE_URL || 'https://api.siliconflow.cn/v1'
const TRANSCRIBE_MODEL = process.env.AI_TRANSCRIBE_MODEL || 'FunAudioLLM/SenseVoiceSmall'
const ANALYSIS_MODEL = process.env.AI_ANALYSIS_MODEL || 'Qwen/Qwen2.5-7B-Instruct'
const TRANSCRIBE_ENDPOINT = `${AI_BASE_URL}/audio/transcriptions`
const CHAT_COMPLETIONS_ENDPOINT = `${AI_BASE_URL}/chat/completions`

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, { status })
}

function emptyProfileDelta(twinNotes = '') {
  return {
    styleSummary: '',
    catchphrases: [],
    lexicalHabits: [],
    emotionalMarkers: [],
    storytellingPatterns: [],
    relationshipMentions: [],
    memoryThemes: [],
    lifeFacts: [],
    pacing: '',
    pauses: '',
    twinNotes,
  }
}

function emptyReflection(
  transcript: string,
  summary: string,
  tags: string[],
  feedback: string,
  followUpPrompt: string,
  twinNotes = '',
  trustLevel: 'stable' | 'guarded' | 'risky' = 'guarded',
  riskFlags: string[] = [],
  usedRepair = false,
  displayTranscript = transcript,
): RecordingReflection {
  return {
    transcript,
    displayTranscript,
    summary,
    tags,
    feedback,
    followUpPrompt,
    profileDelta: emptyProfileDelta(twinNotes),
    trustLevel,
    riskFlags,
    usedRepair,
  }
}

function buildQuickReplyPrompt(transcript: string, profile: CompanionProfile) {
  return [
    '你是“念及”里的记忆陪伴者。',
    '请根据用户刚说完的一段回忆，快速给出即时反馈。',
    '你必须只返回 JSON 对象，不要输出代码块，不要输出解释。',
    '',
    '返回字段：feedback, followUpPrompt, summary, tags',
    '要求：',
    '- feedback: 一句自然、温和、具体的中文回应。',
    '- followUpPrompt: 一个具体追问，帮助用户继续往下说。',
    '- summary: 一句简短摘要。',
    '- tags: 3 到 5 个中文标签数组。',
    '- 不要返回用户画像字段。',
    '',
    '当前已有的用户风格摘要如下：',
    JSON.stringify(profile, null, 2),
    '',
    '刚刚的转写内容如下：',
    transcript,
  ].join('\n')
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

function extractJsonObjectText(value: string) {
  const trimmed = value.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed
  }

  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1)
  }

  return trimmed
}

function parseQuickReplyContent(value: string) {
  const candidate = extractJsonObjectText(value)

  try {
    return JSON.parse(candidate) as Record<string, unknown>
  } catch {
    const repaired = candidate
      .replace(/([{,]\s*)(feedback|followUpPrompt|summary|tags)(\s*:)/g, '$1"$2"$3')
      .replace(/:\s*'([^']*)'/g, (_match, inner: string) => `: ${JSON.stringify(inner)}`)

    return JSON.parse(repaired) as Record<string, unknown>
  }
}

function cleanQuickReplyText(value: unknown, fallback: string) {
  if (typeof value !== 'string') {
    return fallback
  }

  const cleaned = value
    .replace(/(?:followUpPrompt|summary|tags)\s*[:：].*$/i, '')
    .replace(/[，,、\s]+$/u, '')
    .trim()

  return cleaned || fallback
}

function cleanQuickReplyTags(value: unknown) {
  if (!Array.isArray(value)) {
    return ['回忆', '文字记录']
  }

  const tags = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.replace(/[，,、\s]/gu, '').trim())
    .filter(Boolean)
    .slice(0, 5)

  return tags.length > 0 ? tags : ['回忆', '文字记录']
}

function coerceQuickReply(
  transcript: string,
  parsed: Record<string, unknown>,
): QuickRecordingReflection {
  return {
    transcript,
    feedback: cleanQuickReplyText(parsed.feedback, '我听到了，这段我先帮你接住。'),
    followUpPrompt: cleanQuickReplyText(
      parsed.followUpPrompt,
      '你愿意接着说说，当时最让你在意的细节是什么吗？',
    ),
    summary: cleanQuickReplyText(parsed.summary, transcript.slice(0, 80) || '一段刚记录下来的内容'),
    tags: cleanQuickReplyTags(parsed.tags),
  }
}

function buildQuickReplyFallback(transcript: string): QuickRecordingReflection {
  return {
    transcript,
    feedback: '我听到了，这段我先帮你记下来。',
    followUpPrompt: '如果你愿意，可以继续说说这里面最重要的细节。',
    summary: transcript.slice(0, 80) || '一段刚记录下来的内容',
    tags: ['回忆', '待整理'],
  }
}

function buildDefaultCompanionProfile(): CompanionProfile {
  return {
    version: 1,
    sessions: 0,
    styleSummary: '',
    catchphrases: [],
    lexicalHabits: [],
    emotionalMarkers: [],
    storytellingPatterns: [],
    relationshipMentions: [],
    memoryThemes: [],
    lifeFacts: [],
    pacing: '',
    pauses: '',
    twinNotes: '',
    lastTranscript: '',
    lastUpdatedAt: '',
  }
}

function parseCompanionProfile(rawValue: FormDataEntryValue | null) {
  if (typeof rawValue !== 'string' || !rawValue.trim()) {
    return buildDefaultCompanionProfile()
  }

  try {
    return JSON.parse(rawValue) as CompanionProfile
  } catch (error) {
    console.warn('Companion reflect received invalid profile JSON, using default profile:', error)
    return buildDefaultCompanionProfile()
  }
}

async function transcribeAudio(file: File) {
  const formData = new FormData()
  formData.append('file', file, file.name || 'recording.webm')
  formData.append('model', TRANSCRIBE_MODEL)
  formData.append('language', 'zh')

  const response = await fetch(TRANSCRIBE_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${AI_API_KEY}`,
    },
    body: formData,
  })

  if (!response.ok) {
    const errorText = await readErrorPayload(response)
    throw new Error(
      `Transcription failed (${response.status}) via ${TRANSCRIBE_ENDPOINT} with model ${TRANSCRIBE_MODEL}, file ${file.type || 'unknown'} ${file.size} bytes: ${errorText}`,
    )
  }

  const result = (await response.json()) as {
    text?: string
    transcript?: string
    result?: string
  }

  return result.text?.trim() || result.transcript?.trim() || result.result?.trim() || ''
}

async function generateQuickReply(transcript: string, profile: CompanionProfile) {
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
          content: '你擅长做中文即时反馈。你必须只输出 JSON 对象，不要输出代码块，不要输出解释。',
        },
        {
          role: 'user',
          content: buildQuickReplyPrompt(transcript, profile),
        },
      ],
      response_format: {
        type: 'json_object',
      },
      temperature: 0.4,
      max_tokens: 320,
    }),
  })

  if (!response.ok) {
    const errorText = await readErrorPayload(response)
    throw new Error(`Quick reply failed: ${errorText}`)
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
    throw new Error('Quick reply returned no structured content.')
  }

  const parsed = parseQuickReplyContent(text)

  return {
    transcript,
    feedback:
      typeof parsed.feedback === 'string'
        ? parsed.feedback
        : '我听见了这段话，也先把它好好接住了。',
    followUpPrompt:
      typeof parsed.followUpPrompt === 'string'
        ? parsed.followUpPrompt
        : '如果你愿意，可以继续往下说一个更具体的细节。',
    summary: typeof parsed.summary === 'string' ? parsed.summary : '一段刚被记下来的回忆',
    tags: Array.isArray(parsed.tags)
      ? parsed.tags.filter((item): item is string => typeof item === 'string').slice(0, 5)
      : ['回忆', '语音'],
  } satisfies QuickRecordingReflection
}

function getTranscriptionFallbackCopy(error: unknown) {
  const message = error instanceof Error ? error.message : ''

  if (/balance is insufficient/i.test(message)) {
    return emptyReflection(
      '',
      '一段因服务额度不足而未完成转写的录音',
      ['录音', '转写失败', '额度不足'],
      '这段声音我已经先替你收好了，但当前服务端 ASR 账户额度不足，暂时还没法完成转写。',
      '你可以先继续录音，或者等服务额度恢复后再回来补转写。',
      '当前录音已保存，但服务端 ASR 因账户额度不足失败，暂时无法从内容中提取稳定画像。',
    )
  }

  return emptyReflection(
    '',
    '一段尚未完成转写的录音',
    ['录音', '待转写'],
    '这段声音我已经先替你收好了，但这次转写没有成功。',
    '你可以再用一句话补充一下，刚才最想留下来的细节是什么？',
    '当前录音已保存，但转写失败，暂时无法从内容中提取稳定画像。',
  )
}

function buildEmptyTranscriptFallback() {
  return emptyReflection(
    '',
    '一段较短的录音',
    ['录音', '内容较少'],
    '我收到了这段声音，不过这次能辨认出来的内容还不够多。',
    '你可以再慢一点，从一个具体的人、地点或动作重新讲起。',
    '这次录音内容较少，暂时不更新长期画像。',
  )
}

export async function POST(request: Request) {
  if (!AI_API_KEY) {
    return jsonResponse(
      { error: 'Missing AI_API_KEY. Please configure the model provider server key first.' },
      503,
    )
  }

  try {
    const formData = await request.formData()
    const audio = formData.get('audio')
    const profileRaw = formData.get('profile')
    const transcriptRaw = formData.get('transcript')

    if (!(audio instanceof File) && typeof transcriptRaw !== 'string') {
      return jsonResponse({ error: 'Audio file is required.' }, 400)
    }

    const profile = parseCompanionProfile(profileRaw)

    let transcript = typeof transcriptRaw === 'string' ? transcriptRaw.trim() : ''

    if (!transcript) {
      try {
        transcript = await transcribeAudio(audio as File)
      } catch (error) {
        console.error('Transcription provider failed:', error)
        return jsonResponse(getTranscriptionFallbackCopy(error))
      }
    }

    if (!transcript) {
      return jsonResponse(buildEmptyTranscriptFallback())
    }

    const stabilized = await stabilizeVoiceInputDraft({
      transcript,
      surface: 'memory-reflect',
    })

    console.info('Memory reflection voice draft stabilized', {
      trustLevel: stabilized.trustLevel,
      riskFlags: stabilized.riskFlags,
      usedRepair: stabilized.usedRepair,
      transcript,
      trustedTranscript: stabilized.trustedTranscript,
    })

    let quickReply: QuickRecordingReflection
    try {
      quickReply = await generateQuickReply(stabilized.trustedTranscript, profile)
    } catch (error) {
      console.warn('Companion quick reply fallback used:', error)
      quickReply = buildQuickReplyFallback(stabilized.trustedTranscript)
    }

    return jsonResponse({
      ...quickReply,
      transcript: stabilized.trustedTranscript,
      displayTranscript: stabilized.displayTranscript,
      trustLevel: stabilized.trustLevel,
      riskFlags: stabilized.riskFlags,
      usedRepair: stabilized.usedRepair,
      profileDelta: emptyProfileDelta(
        stabilized.trustLevel === 'stable'
          ? '长期画像将在后台继续补充。'
          : '这段语音先经过了静默纠偏，长期画像将优先使用修复后的核心内容。',
      ),
    } satisfies RecordingReflection)
  } catch (error) {
    console.error('Companion reflection failed:', error)

    return jsonResponse(
      {
        error: error instanceof Error ? error.message : 'Companion reflection failed.',
      },
      500,
    )
  }
}
