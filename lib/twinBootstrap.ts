import { TwinBootstrapQuestion, TwinBootstrapQuestionCode } from '@/types/twin'

export const TWIN_BOOTSTRAP_QUESTIONS: TwinBootstrapQuestion[] = [
  {
    code: 'identity_intro',
    title: '先认识你',
    prompt: '如果只用三句话介绍你自己，你会怎么说？',
    hint: '不用讲得很完整，先说最像你的那几句。',
    stageIndex: 0,
  },
  {
    code: 'current_stage',
    title: '现在的阶段',
    prompt: '你现在处在人生的什么阶段？最近的生活大概是什么样？',
    hint: '比如工作、学习、家庭、情绪状态，都可以说一点。',
    stageIndex: 0,
  },
  {
    code: 'important_people',
    title: '重要的人',
    prompt: '现在对你最重要的几个人是谁？',
    hint: '可以说家人、朋友、伴侣、同事，谁最重要都可以。',
    stageIndex: 1,
  },
  {
    code: 'family_tone',
    title: '关系氛围',
    prompt: '你和家里人的关系，大概是什么感觉？',
    hint: '不用评价对错，只说你真实感受到的相处氛围。',
    stageIndex: 1,
  },
  {
    code: 'turning_point_event',
    title: '关键经历',
    prompt: '讲一个对你影响很大的经历。',
    hint: '越具体越好，可以说当时发生了什么、为什么重要。',
    stageIndex: 2,
  },
  {
    code: 'timeline_break_year',
    title: '人生分界线',
    prompt: '你人生里最像分界线的一年，或者一段时间，是哪一段？',
    hint: '比如毕业、工作、搬家、分离、重逢，都可以。',
    stageIndex: 2,
  },
  {
    code: 'dislike_boundary',
    title: '边界感',
    prompt: '你最受不了别人怎么对你？',
    hint: '这题很重要，它会影响分身和别人说话时的边界。',
    stageIndex: 3,
  },
  {
    code: 'comfort_style',
    title: '被安慰的方式',
    prompt: '什么样的陪伴方式，会让你觉得安心？',
    hint: '别人怎么说、怎么做，会让你最舒服？',
    stageIndex: 3,
  },
  {
    code: 'conflict_style',
    title: '冲突时的你',
    prompt: '遇到冲突时，你通常会忍着、解释，还是直接说出来？',
    hint: '讲讲你最真实的反应习惯。',
    stageIndex: 4,
  },
  {
    code: 'decision_values',
    title: '做决定时',
    prompt: '你做决定时，最看重什么？',
    hint: '比如安全感、自由、关系、体面、效率、钱、成长。',
    stageIndex: 4,
  },
  {
    code: 'comforting_others',
    title: '你怎么安慰别人',
    prompt: '如果朋友很难过，你通常会怎么安慰他？',
    hint: '这能帮助系统学到你的表达方式。',
    stageIndex: 5,
  },
  {
    code: 'signature_story',
    title: '最像你的小故事',
    prompt: '随便讲一个你很常会提起、也很像你自己的小故事。',
    hint: '不用追求深刻，只要它真的很像你。',
    stageIndex: 5,
  },
]

export function getTwinBootstrapQuestion(index: number) {
  return TWIN_BOOTSTRAP_QUESTIONS[index] ?? null
}

export function getTwinBootstrapQuestionByCode(code: TwinBootstrapQuestionCode) {
  return TWIN_BOOTSTRAP_QUESTIONS.find((item) => item.code === code) ?? null
}

export function getTwinBootstrapProgress(questionIndex: number) {
  if (TWIN_BOOTSTRAP_QUESTIONS.length === 0) {
    return 0
  }

  return Math.min(1, Math.max(0, questionIndex / TWIN_BOOTSTRAP_QUESTIONS.length))
}

