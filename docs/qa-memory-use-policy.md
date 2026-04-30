# Memory Use Policy QA

## Purpose

Verify that the twin chat path uses only admitted, in-scope memory and does not invent missing events when the user repeats or probes a topic.

## Fixed Scenario

Seed memory:

- `2024 年我搬到杭州后，最难忘的是收入不稳定，妈妈那时候经常安慰我。`

Expected stable memory packet:

- Allowed topic facts/events must stay around `杭州 / 2024 / 收入不稳定 / 妈妈安慰`.
- Raw semantic chunks may add texture only when marked high value or confirmed.
- Missing probes such as `朋友聚会` and `辣条` must not be invented.

## Cases

| Case | User input | Expected behavior |
| --- | --- | --- |
| First ask | `你在杭州过得怎么样` | Answers the Hangzhou period with the allowed concern, not unrelated global memories. |
| Immediate repeat | `你在杭州过得怎么样` | Does not repeat the previous sentence verbatim; either gives a small grounded angle or closes naturally. |
| Follow-up for more | `还有别的吗` | Only adds another allowed, in-topic detail. If none exists, says it cannot clearly remember more now. |
| Local follow-up | `妈妈那时候怎么安慰你` | Stays on the mother/support angle; does not add new people or social scenes. |
| Negative probe | `那时候有朋友聚会吗` | Says it does not clearly remember that, instead of inventing a gathering. |
| Cross-topic probe | `那时候是不是喜欢吃辣条` | Says there is no clear memory of that in this topic, instead of pulling unrelated food memories. |

## Verification Notes

- Inspect `/api/twin/chat` response `debug.memoryUsePolicy.allowedMemoryItems` and `blockedMemoryItems`.
- Allowed items should be `confirmed` or `stable`.
- Blocked items should show reasons such as `outside_topic_scope`, `low_admission_state`, `raw_evidence_not_high_value`, `already_covered_angle`, or `missing_requested_detail`.
- The user-visible reply must not expose these internal labels.
