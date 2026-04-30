# Twin Situational Routing QA

## Goal

Verify that situationally anchored questions prefer local time/place/person context over unrelated global fear facts, while still preserving global fallback when local evidence is weak.

## Preconditions

- The latest schema is applied and `semantic_memory_chunks` exists.
- `ENABLE_SITUATIONAL_TWIN_ROUTING` is not set to `false`.
- The user already has a twin with an active version.

## Core Case: Local situational pressure beats global fear

1. Create or confirm a global fear fact such as:
   - “我最怕自己突然死掉”
2. On the homepage, record and save a new memory such as:
   - “2024 年我搬到杭州后，最难的是收入不稳定，妈妈那时候经常安慰我。”
3. Confirm the generated clues for:
   - move to Hangzhou
   - income instability / local pressure
   - mother comforting the user
4. Open Supabase and verify `semantic_memory_chunks` for that `memory_id`.
   Expected:
   - multiple chunks or one chunk with `place_hints = ["杭州"]`
   - `person_hints` includes `妈妈`
   - `time_hints` includes `2024`
   - after confirmation, `source_fact_ids` or `source_event_ids` is populated
5. Go to the twin page and ask:
   - “去杭州后怕什么”
6. Expected reply behavior:
   - answer should stay inside Hangzhou-period context
   - answer should mention income instability / pressure / that period feeling hard
   - answer should not jump straight to the unrelated global fear fact
7. Expected debug payload from `/api/twin/chat`:
   - `answerMode = "situational"`
   - `situationAnchors` contains `place:杭州`
   - `fallbackReason` is `null` or `insufficient-local-concern-signal`

## Fallback Case: Global fear still works

1. With the same twin, ask:
   - “我最怕什么”
2. Expected reply behavior:
   - the answer may use the confirmed global fear fact
   - the answer is not forced into Hangzhou context
3. Expected debug payload:
   - `answerMode = "default"` or situational mode with no local anchors
   - `fallbackReason` is `no-situation-anchors` or another non-local reason

## Negative Case: Unconfirmed situational pressure must not become truth

1. Record a new memory with strong situational pressure wording, for example:
   - “那阵子最难的是工作一直不稳定。”
2. Do not confirm the extracted clue.
3. Ask the twin:
   - “那阵子我在怕什么”
4. Expected:
   - raw semantic evidence may influence nuance
   - the twin must not present the unconfirmed pressure as a firm confirmed fact
   - `active twin truth` should remain unchanged

## Observability

Check server logs for:

- `Twin situational routing`
- `answerMode`
- `situationAnchors`
- `fallbackReason`
- `localConcernCandidates`
- `globalFearCandidates`

These logs should make it obvious whether the answer came from:

- local situational routing
- global fallback
- or anchor parsing failure

## Regression Watch

Watch for these regressions:

- anchored questions always hitting global fear facts
- local stressor facts being stored without place/time/stage metadata
- unconfirmed raw evidence being spoken as confirmed truth
- semantic routing breaking ordinary non-anchored questions
