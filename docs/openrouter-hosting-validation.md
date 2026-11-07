# OpenRouter hosting selection — 2026-11-07

Implemented author-grouped, alphabetically sorted catalogs with search, live endpoint discovery, per-role hosting choices, routing priorities and explicit fallback controls. Settings work for personal keys and central routes. Endpoint choices are validated against the selected model, credentials remain write-only, and host metadata is cached for five minutes. Browser requests are guarded against stale responses after model changes.

The supplied new credential received HTTP 401 from OpenRouter's `/key` endpoint and was not saved. The already configured, previously authorized OpenRouter credential was used for the paid checks below. No image generation was requested.

## Live evidence

The live endpoint API listed 51 endpoint variants for `deepseek/deepseek-v4.1-flash-1017`, including `baseten/fast`. At inspection time the endpoint speed fields were null, so the interface correctly shows “Not reported.” These figures are not an exhaustive or statistically representative speed ranking.

| Check | Result |
| --- | --- |
| Baseten ordinary endpoint, short fiction request | 9.031 s, valid JSON |
| Baseten Fast, first short request | Upstream HTTP 429; confirms the usefulness of fallback |
| Baseten Fast, small token budgets | One response exhausted its 4,000-token cap; reasoning consumed 2,936 tokens |
| Fireworks Ultrafast, second short request | 2.742 s, valid JSON, $0.012982464 |
| Automatic throughput, second short request | Together selected; 4.250 s, valid JSON, $0.001565487 |
| **Actual Vivarium five-minute story step** | **2.691 s end to end, successful database commit on an isolated copy** |

The actual story step used `baseten/fast` with fallback allowed. OpenRouter reported **BaseTen** as the serving provider, 7,541 native input tokens and 1,755 native output tokens (including 308 reasoning tokens), `finish_reason: stop`, and $0.008649234. App model-call time was 2.675 s; OpenRouter's generation record reported 287 ms latency and 2,455 ms generation time. Dividing total output tokens by wall time includes reasoning and is not the same as visible text streaming speed. We do not promise a sustained 400 tokens/s or claim this is universally the fastest host.

The scene responded to the player's question and opening of a letter, updated the present cast and ended in a decision. The user's live world was not advanced by this test. The demo account's model settings were changed after validation; its story state was retained.

## Regression coverage

- `npm run test:providers`: live-response normalization fixtures, alphabetical grouping, authorization, endpoint validity, atomic failure, personal and central persistence, exact endpoint/fallback request payloads for all four modalities, credential isolation and existing BYOK regressions.
- `npm run test:rpg`: ordinary story step, off-screen state preservation, decision stop, library asset selection and image-generation consent.
- `npm run test:provider-hosts-browser` against a disposable server: author search, rapid model switching, endpoint selection, fallback explanation, refresh, save/reload, desktop and 390 px mobile layout, no browser JavaScript exceptions.

Primary API reference: [OpenRouter provider routing](https://openrouter.ai/docs/guides/routing/provider-selection). Live model information: [DeepSeek V4.1 Flash 1017](https://openrouter.ai/deepseek/deepseek-v4.1-flash-1017).
