import { NextResponse } from 'next/server'
import { CompanionProfile, CompanionProfileDelta, ProfileExtractionResult } from '@/types/companion'

const AI_API_KEY = process.env.AI_API_KEY || process.env.OPENAI_API_KEY
const AI_BASE_URL = process.env.AI_BASE_URL || 'https://api.siliconflow.cn/v1'
const ANALYSIS_MODEL = process.env.AI_ANALYSIS_MODEL || 'Qwen/Qwen2.5-7B-Instruct'
const CHAT_COMPLETIONS_ENDPOINT = `${AI_BASE_URL}/chat/completions`

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, { status })
}

function emptyProfileDelta(twinNotes = ''): CompanionProfileDelta {
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

function buildProfilePrompt(transcript: string, profile: CompanionProfile) {
  return [
    'You extract conservative candidate profile traits from one Chinese memory transcript.',
    'Return JSON only. Do not wrap in markdown and do not explain your reasoning.',
    '',
    'Return keys: styleSummary, catchphrases, lexicalHabits, emotionalMarkers, storytellingPatterns, relationshipMentions, memoryThemes, lifeFacts, pacing, pauses, twinNotes',
    'Requirements:',
    '- Extract only candidate traits that are directly grounded in the transcript.',
    '- Do not invent durable preferences, identity facts, or catchphrases from one casual mention.',
    '- Ignore obvious noise, laughter, repeated filler, quoted speech, and playful one-off content.',
    '- Prefer short Chinese phrases in array fields.',
    '- pacing describes speaking rhythm.',
    '- pauses describes pause or hesitation style.',
    '- twinNotes should be a conservative observation useful for a future twin, not a dramatic rewrite.',
    '',
    'Current clean profile projection:',
    JSON.stringify(profile, null, 2),
    '',
    'Transcript:',
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

function parseStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string').slice(0, 12)
    : []
}

export async function POST(request: Request) {
  if (!AI_API_KEY) {
    return jsonResponse(
      { error: 'Missing AI_API_KEY. Please configure the model provider server key first.' },
      503,
    )
  }

  try {
    const body = (await request.json()) as {
      transcript?: string
      profile?: CompanionProfile
    }

    const transcript = body.transcript?.trim()

    if (!transcript) {
      return jsonResponse({ error: 'Transcript is required.' }, 400)
    }

    const profile =
      body.profile || {
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
            content:
              'You extract conservative candidate profile traits for a Chinese-speaking memory companion. Return JSON only.',
          },
          {
            role: 'user',
            content: buildProfilePrompt(transcript, profile),
          },
        ],
        response_format: {
          type: 'json_object',
        },
        temperature: 0.2,
        max_tokens: 900,
      }),
    })

    if (!response.ok) {
      const errorText = await readErrorPayload(response)
      throw new Error(`Profile extraction failed: ${errorText}`)
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
      throw new Error('Profile extraction returned no structured content.')
    }

    const parsed = JSON.parse(text) as Record<string, unknown>

    return jsonResponse({
      profileDelta: {
        styleSummary: typeof parsed.styleSummary === 'string' ? parsed.styleSummary : '',
        catchphrases: parseStringArray(parsed.catchphrases),
        lexicalHabits: parseStringArray(parsed.lexicalHabits),
        emotionalMarkers: parseStringArray(parsed.emotionalMarkers),
        storytellingPatterns: parseStringArray(parsed.storytellingPatterns),
        relationshipMentions: parseStringArray(parsed.relationshipMentions),
        memoryThemes: parseStringArray(parsed.memoryThemes),
        lifeFacts: parseStringArray(parsed.lifeFacts),
        pacing: typeof parsed.pacing === 'string' ? parsed.pacing : '',
        pauses: typeof parsed.pauses === 'string' ? parsed.pauses : '',
        twinNotes: typeof parsed.twinNotes === 'string' ? parsed.twinNotes : '',
      },
    } satisfies ProfileExtractionResult)
  } catch (error) {
    console.error('Companion profile extraction failed:', error)

    return jsonResponse({
      profileDelta: emptyProfileDelta(
        'This transcript did not produce a trusted long-term profile delta. Keep the evidence, but do not promote it directly.',
      ),
    } satisfies ProfileExtractionResult)
  }
}
