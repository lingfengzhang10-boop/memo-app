# Twin Topic Interaction Memory QA

## Goal

Verify that the twin can remember how a topic was discussed with the same asker, avoid mechanical repetition, and keep that interaction memory separate from autobiographical truth.

## Preconditions

- The latest schema is applied and `twin_topic_interactions` exists.
- The user already has an active twin.
- The twin already has at least one stable autobiographical topic, for example:
  - a Hangzhou period
  - income instability
  - mother comforting the user
- The browser has local storage available. Topic interaction memory now uses local persistence first, then best-effort remote sync.

## Core Case: Immediate follow-up should not repeat verbatim

1. Ask the twin:
   - "去杭州后你感觉怎么样"
2. Note the core angle of the answer. Example:
   - income instability
   - mother as emotional support
3. Immediately ask a follow-up such as:
   - "还有什么让你印象深刻的吗"
   - "除此之外呢"
4. Expected:
   - the twin should not restate the same core sentence line by line
   - the twin should either:
     - deepen the answer with a new grounded facet
     - switch to another grounded angle
     - or honestly close with a natural "currently nothing more comes up" style response
   - it should stay inside the same topic scope instead of pulling in unrelated global facts, foods, habits, or hobbies
5. Expected `/api/twin/chat` debug:
   - `topicKey` is present
   - `askerScope = "same_asker"`
   - `topicRecencyBand = "immediate"`
   - `scopeLockedFromTopicInteraction = true`
   - no unrelated global prompt snapshot content should leak into the answer
   - `answerProgressionMode` is one of:
      - `deepen_answer`
      - `diversify_answer`
      - `graceful_close`

## Same Asker, Same Day: light recall instead of exact replay

1. Ask a topic question once and let the twin answer.
2. Wait long enough to move past the "immediate" band, or simulate by updating `last_discussed_at` for that row.
3. Ask again within the same day:
   - "我今天是不是问过杭州那段"
   - or reopen the same topic naturally
4. Expected:
   - the twin may acknowledge prior discussion
   - the wording should feel light and natural
   - it should not sound like an exact log reminder
5. Expected debug:
   - `askerScope = "same_asker"`
   - `topicRecencyBand = "same_day"`
   - `answerProgressionMode` is usually `deepen_answer` or `fuzzy_recall`

## Same Asker, Days Later: fuzzy recall

1. Use the same topic after several days, or simulate by backdating `last_discussed_at` to 2-7 days ago.
2. Ask again:
   - "那段时间后来还有什么感觉"
3. Expected:
   - the twin may say something like "我记得你好像问过这段"
   - it should feel approximate, not exact
   - it may retell the topic, but not as a hard reset with no recall at all
4. Expected debug:
   - `askerScope = "same_asker"`
   - `topicRecencyBand = "recent"` or `stale`
   - `answerProgressionMode = "fuzzy_recall"` for recent follow-up

## Different Asker: no cross-asker leakage

Current product surfaces still use the signed-in user as the effective asker key, so this is mainly a structure check unless shared twin access is enabled.

1. Inspect `public.twin_topic_interactions`.
2. Verify records are scoped by:
   - `twin_id`
   - `asker_key`
   - `topic_key`
3. Expected:
   - no interaction memory is stored inside `twin_versions`
   - no interaction memory is written into `memory_facts` or `memory_events`
   - future alternate askers will create their own rows instead of reusing another asker's row

## Storage Checks

1. After a successful topic answer, first verify repeated follow-up behavior in the same browser session.
2. Then inspect `public.twin_topic_interactions` if remote sync is expected in the current environment.
3. Expected columns to update when remote sync succeeds:
   - `last_discussed_at`
   - `discuss_count`
   - `last_answer_summary`
   - `last_answer_angle`
   - `last_answer_mode`
   - `last_response_excerpt`
4. Expected unique scope:
   - one row per `(twin_id, asker_key, topic_key)`
5. If the table stays empty but same-browser follow-up behavior still improves, local fallback is working and remote sync is the remaining gap rather than the interaction model itself.

## Regression Watch

Watch for these regressions:

- immediate follow-up still repeats the prior answer almost verbatim
- "还有什么" style follow-ups do not trigger progression logic
- the twin always acts like this is the first time the topic is discussed
- the twin always acts like it remembers exactly, even days later
- topic interaction memory starts polluting `twin_versions`, `memory_facts`, or `memory_events`
- different askers would inherit each other's interaction traces
