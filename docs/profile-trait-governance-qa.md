# Profile Trait Gating QA

## Scope

This checklist verifies that noisy one-off profile extraction no longer pollutes long-term profile projection or twin versions, and that a clean rebuild can replace a polluted active twin version with rollback available.

## Preconditions

- `public.companion_profile_traits` exists in Supabase.
- The current account has an active twin.
- The `/mobile/me` page is accessible while logged in.

## 1. Candidate traits do not directly become long-term profile

1. Record one noisy or playful utterance that should not become a durable trait.
   - Example: repeated laughter, quoted speech, or a joking food preference.
2. Wait for homepage reflection/profile extraction to finish.
3. Inspect `public.companion_profile_traits`.
   - Expected:
     - A candidate trait may be written.
     - `status` should remain `candidate` or `rejected`.
     - `support_count` should stay low.
4. Inspect `public.companion_profiles`.
   - Expected:
     - The noisy item must not appear in `life_facts`, `lexical_habits`, `memory_themes`, or `twin_notes`.

## 2. Stable repeated traits can graduate into projection

1. Record the same meaningful trait across multiple separate memories.
   - Example: a real recurring speaking habit or a repeated life fact.
2. Repeat until support count and trust score cross the threshold.
3. Inspect `public.companion_profile_traits`.
   - Expected:
     - The trait becomes `vetted`.
4. Inspect `public.companion_profiles`.
   - Expected:
     - The vetted trait now appears in the projected profile.

## 3. Twin growth only consumes clean projection

1. Produce a fresh twin growth refresh using confirmed facts/events and recent clean speech.
2. Inspect the new row in `public.twin_versions`.
   - Expected:
     - `persona_snapshot.profile` reflects the clean projection only.
     - obvious noise is absent from `summary`, `coreValues`, `boundaryRules`, and `expression.phrasebook`.

## 4. Rebuild current twin from clean assets

1. Open `/mobile/me`.
2. Use **重建当前分身**.
3. Expected UI result:
   - status message indicates a clean twin version was created and activated.
   - diff items appear if old polluted content was removed.
   - **回滚上一版** becomes available.
4. Inspect `public.twin_versions`.
   - Expected:
     - a new version exists with `change_source = rebuild`.
5. Inspect `public.twin_profiles`.
   - Expected:
     - `active_version_id` points to the new rebuild version.

## 5. Rollback path

1. After a rebuild, click **回滚上一版** on `/mobile/me`.
2. Inspect `public.twin_profiles`.
   - Expected:
     - `active_version_id` returns to the previous version id.
3. Confirm old and new version rows both remain in `public.twin_versions`.

## 6. Suggested spot checks

- Check `public.companion_profile_traits` for:
  - `trait_type`
  - `normalized_key`
  - `support_count`
  - `trust_score`
  - `status`
  - `last_seen_at`
  - `source_memory_ids`
- Compare polluted vs rebuilt version fields:
  - `persona_snapshot.summary`
  - `persona_snapshot.profile.lifeFacts`
  - `persona_snapshot.expression.phrasebook`
  - `prompt_snapshot`

## Expected outcome

- Single noisy transcripts stop at the candidate/rejected layer.
- `companion_profiles` becomes a clean projection of vetted traits only.
- New twin growth stops re-amplifying junk profile content.
- Existing polluted active versions can be rebuilt from clean assets and rolled back safely.
