---
name: HellMode quality
description: Durable rules for keeping the highest-difficulty quiz tier genuinely challenging.
---

The hardest quiz tier must enforce difficulty in three places: question metadata, scoring weights, and time limits. Generated banks also need runtime validation for duplicate answer choices and predictable definition-only prompts.

**Why:** A tier label alone can leave every question running with medium scoring and timing, making a nominally difficult mode feel easy even when the source bank is larger.

**How to apply:** When changing the highest tier, audit the produced Question objects and verify their difficulty distribution, time limit, answer-index distribution, duplicate choices, and the proportion of direct definition prompts.