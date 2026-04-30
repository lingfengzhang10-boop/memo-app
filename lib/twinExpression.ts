import { CompanionProfile } from '@/types/companion'
import { TwinBootstrapAnswer, TwinExpressionSnapshot } from '@/types/twin'

const AI_STYLE_PATTERNS = [
  '作为',
  '我会从',
  '以下几个方面',
  '首先',
  '其次',
  '总的来说',
  '你可以考虑',
  '建议你',
]

function dedupe(values: string[], limit = 6) {
  return Array.from(
    new Set(
      values
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ).slice(0, limit)
}

function normalizeExpressionLine(value: string) {
  return value
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
}

function isNoisyExpressionLine(value: string) {
  const normalized = normalizeExpressionLine(value)
  if (!normalized) {
    return true
  }

  if (normalized.length < 2) {
    return true
  }

  if (/^(?:[^\p{L}\p{N}\u4e00-\u9fff]+)$/u.test(normalized)) {
    return true
  }

  if (/(.)\1{3,}/u.test(normalized)) {
    return true
  }

  if (/(嘿嘿嘿|哈哈哈|我我|嗯嗯嗯|辣条)/u.test(normalized)) {
    return true
  }

  return false
}

export function splitSentences(transcript: string) {
  return transcript
    .split(/[。！？!?；;\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

export function shortNaturalLines(transcript: string, maxLength = 28) {
  return splitSentences(transcript)
    .map(normalizeExpressionLine)
    .filter((line) => line.length >= 4 && line.length <= maxLength && !isNoisyExpressionLine(line))
}

function linesFromAnswers(answers: TwinBootstrapAnswer[], codes: TwinBootstrapAnswer['questionCode'][]) {
  return answers
    .filter((answer) => codes.includes(answer.questionCode))
    .flatMap((answer) => shortNaturalLines(answer.transcript))
}

function buildSpeakingTraits(profile: CompanionProfile, extraTraits: string[] = []) {
  return dedupe(
    [
      profile.styleSummary,
      profile.pacing,
      profile.pauses,
      ...profile.catchphrases,
      ...profile.lexicalHabits,
      ...profile.storytellingPatterns,
      ...extraTraits,
    ].filter((item) => !isNoisyExpressionLine(item)),
    8,
  )
}

function buildExpressionSummary(
  traits: string[],
  phrasebook: string[],
  comfortExamples: string[],
  conflictExamples: string[],
) {
  const parts: string[] = []

  if (traits.length > 0) {
    parts.push(`说话习惯接近：${traits.slice(0, 3).join('；')}`)
  }

  if (phrasebook.length > 0) {
    parts.push(`代表性说法包括：${phrasebook.slice(0, 3).join(' / ')}`)
  }

  if (comfortExamples.length > 0) {
    parts.push(`安慰别人时更像：${comfortExamples[0]}`)
  }

  if (conflictExamples.length > 0) {
    parts.push(`表达不满时更像：${conflictExamples[0]}`)
  }

  return parts.join('。')
}

export function buildTwinExpressionSnapshot(
  answers: TwinBootstrapAnswer[],
  profile: CompanionProfile,
): TwinExpressionSnapshot {
  const phrasebook = dedupe(
    [
      ...profile.catchphrases,
      ...linesFromAnswers(answers, ['identity_intro', 'comforting_others', 'signature_story']),
    ],
    8,
  )

  const comfortExamples = dedupe(
    linesFromAnswers(answers, ['comfort_style', 'comforting_others']),
    4,
  )

  const conflictExamples = dedupe(
    linesFromAnswers(answers, ['conflict_style', 'dislike_boundary']),
    4,
  )

  const storytellingExamples = dedupe(
    linesFromAnswers(answers, ['signature_story', 'turning_point_event', 'timeline_break_year']),
    4,
  )

  const speakingTraits = buildSpeakingTraits(
    profile,
    answers
      .filter((answer) => answer.questionCode === 'identity_intro' || answer.questionCode === 'signature_story')
      .map((answer) => `常会这样组织表达：${answer.transcript.slice(0, 40)}`),
  )

  return {
    summary: buildExpressionSummary(speakingTraits, phrasebook, comfortExamples, conflictExamples),
    speakingTraits,
    phrasebook,
    comfortExamples,
    conflictExamples,
    storytellingExamples,
    forbiddenPatterns: AI_STYLE_PATTERNS,
  }
}

export function buildLiveTwinExpression(
  profile: CompanionProfile,
  recentTranscripts: string[],
): TwinExpressionSnapshot {
  const recentLines = dedupe(
    recentTranscripts.flatMap((transcript) => shortNaturalLines(transcript, 32)),
    10,
  )

  const phrasebook = dedupe(
    [...profile.catchphrases, ...profile.lexicalHabits, ...recentLines],
    10,
  )

  const storytellingExamples = dedupe(
    recentTranscripts
      .slice(0, 6)
      .flatMap((transcript) => shortNaturalLines(transcript, 40)),
    6,
  )

  const speakingTraits = buildSpeakingTraits(
    profile,
    recentTranscripts.slice(0, 3).map((transcript) => `最近常这样说：${transcript.slice(0, 36)}`),
  )

  return {
    summary: buildExpressionSummary(speakingTraits, phrasebook, [], []),
    speakingTraits,
    phrasebook,
    comfortExamples: [],
    conflictExamples: [],
    storytellingExamples,
    forbiddenPatterns: AI_STYLE_PATTERNS,
  }
}

export function mergeTwinExpressionSnapshots(
  base: TwinExpressionSnapshot | null | undefined,
  live: TwinExpressionSnapshot | null | undefined,
): TwinExpressionSnapshot | null {
  if (!base && !live) {
    return null
  }

  const merged = {
    summary: '',
    speakingTraits: dedupe([...(base?.speakingTraits ?? []), ...(live?.speakingTraits ?? [])], 8),
    phrasebook: dedupe([...(base?.phrasebook ?? []), ...(live?.phrasebook ?? [])], 10),
    comfortExamples: dedupe([...(base?.comfortExamples ?? []), ...(live?.comfortExamples ?? [])], 4),
    conflictExamples: dedupe([...(base?.conflictExamples ?? []), ...(live?.conflictExamples ?? [])], 4),
    storytellingExamples: dedupe([...(base?.storytellingExamples ?? []), ...(live?.storytellingExamples ?? [])], 6),
    forbiddenPatterns: dedupe([...(base?.forbiddenPatterns ?? []), ...(live?.forbiddenPatterns ?? []), ...AI_STYLE_PATTERNS], 10),
  } satisfies TwinExpressionSnapshot

  merged.summary =
    buildExpressionSummary(
      merged.speakingTraits,
      merged.phrasebook,
      merged.comfortExamples,
      merged.conflictExamples,
    ) || base?.summary || live?.summary || ''

  return merged
}
