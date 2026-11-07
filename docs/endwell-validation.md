# Endwell authored scenario validation

Validated on 7 November 2026. The authored endpoint is Saturday, 29 August, 20:35 on the fictional clock, before Kevin answers Sarah's request. The installed live story remains at scene 4. A separate database copy was used for continuation testing.

## Contents and boundaries

- Six adults (21–24), Kevin as the player character, ten connected locations and 26 directed bonds.
- Four authored, replayable scenes, with individual perceptions, emotion blends, intentions and private memories at the endpoint.
- Reviewed library templates and their expression variants: 94 imported image records; no paid image generation or LLM call during installation.
- The supplied outline is adapted as a nonsexual mystery. The characters experience unease and uncertainty; supernatural influence cannot produce sexual compulsion or consent. This is stated in the scenario instructions and README.
- Hidden wish timing is stored with Kevin, rather than placed in the other characters' beliefs. Their memories record what they witnessed. Sarah does not acquire knowledge of conversations she missed.
- Artwork approximates the described setting and clothing. It is existing library art, not a newly illustrated rendition of Hawthorne Hall.

## Checks

The RPG regression suite passed, including a new check that standing instructions beyond 500 characters survive the builder. The builder and Game Master direction editor now retain up to 20,000 characters.

Playwright checked the opening in a desktop viewport and at 390 px: all six sprite images loaded; the player identity, pending decision, Sarah's Director-mode profile, four-scene timeline, Cast, Bonds and World opened without browser errors. It also verified one visible speech bubble, clickable timeline controls and the 20:35 fictional clock in a browser configured for New York. Fictional time is now formatted consistently in the client, storyteller context and story exports rather than shifted by machine timezone.

Reproduce browser checks against an installed, unadvanced opening:

```bash
ENDWELL_BASE=http://127.0.0.1:8890 \
ENDWELL_WORLD=your-world-id ENDWELL_PLAYER=your-player-id \
RPG_TEST_EMAIL=your-account@example.com RPG_TEST_PASSWORD=your-password \
node scripts/test-authored-scenario-browser.mjs
```

The browser check disables speech generation and does not advance the story. It temporarily enables Director mode in its own isolated browser context to inspect Sarah's mind.

## Live continuation test

On the disposable copy, Kevin asked Sarah to secure the box and explain what she had observed, explicitly withholding permission for a room search and using neither power. One OpenRouter completion produced the next scene and stopped at a new choice: whether to join Sarah for a private conversation. It did not consent to or complete the room search for Kevin.

The request used `deepseek/deepseek-v4.1-flash-1017` with preferred endpoint `baseten/fast` and fallback enabled. OpenRouter reported **Relace** as the serving host. Provider duration was **26.057 seconds**, with **16,548 input tokens**, **3,991 completion tokens** (including **1,222 reasoning tokens**) and reported cost **$0.00207384012**. These are one observed request, not a latency guarantee. The output contained one explicitly marked NPC thought; ordinary player mode filters such thoughts from text and speech, while Director mode can show them.

The disposable copy was rewound for visual checks. Its generated continuation was not copied into the live opening. The previous *Letter at Closing Time* story remained at its existing scene 1.
