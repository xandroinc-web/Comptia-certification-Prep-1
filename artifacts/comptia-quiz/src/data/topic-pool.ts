/**
 * Topic pools — display counts only (P0-4 follow-up).
 *
 * This module used to build keyword-scored pools from the full question
 * bank at import time, which pulled the entire bank (with answer keys)
 * into the browser bundle. The counts are now frozen literals in
 * `@/lib/bank-meta` (verified against the real bank by script); the
 * server serves topic study as a mixed-exam set, so no client-side
 * pool building is needed anymore. `getMixedTopicQuestions` was removed
 * (no callers — topic study goes through the server).
 */
import { shuffleArray } from "../lib/scoring.js";
import { TOPIC_POOL_COUNTS } from "../lib/bank-meta.js";
import { ALL_DOMAINS, type DomainTopic } from "./topics.js";

export function getTopicPoolCount(topic: DomainTopic): number {
  return TOPIC_POOL_COUNTS[topic] ?? 0;
}

export function getTopicPoolCounts(): Record<DomainTopic, number> {
  return Object.fromEntries(ALL_DOMAINS.map((t) => [t, getTopicPoolCount(t)])) as Record<
    DomainTopic,
    number
  >;
}

/** Return 9 topics in random order for the "random mode" topic study selector. */
export function getTopicsInRandomOrder(): DomainTopic[] {
  return shuffleArray([...ALL_DOMAINS]);
}
