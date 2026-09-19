import rawBank from "./exam-bank.json";
import rawMeta from "./exam-bank-meta.json";
import { questions, scrambleOptions } from "./questions";
import type { Question } from "./questions";

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function categoryFromQuestion(text: string): "A+" | "Network+" | "Security+" | null {
  if (/security\+/i.test(text)) return "Security+";
  if (/network\+/i.test(text)) return "Network+";
  if (/a\+/i.test(text)) return "A+";
  // Some generated networking scenarios omit the exam name.
  if (/packet analyzer|traffic on port|which port|network traffic/i.test(text)) {
    return "Network+";
  }
  return null;
}

export type ExamTier = 1 | 2 | 3;

export interface ExamQuestion {
  id: number | string;
  q: string;
  opts: string[];
  ans: string;
  explanation?: string;
}

export interface ExamBank {
  tier1: ExamQuestion[];
  tier2: ExamQuestion[];
  tier3: ExamQuestion[];
  bonus: ExamQuestion[];
}

export interface ExamMeta {
  tier1: { id: number | string; explanation: string }[];
  tier2: { id: number | string; explanation: string }[];
  tier3: { id: number | string; explanation: string }[];
  bonus: { id: number | string; explanation: string }[];
}

const bank: ExamBank = rawBank as ExamBank;
const meta: ExamMeta = rawMeta as ExamMeta;

const tierMap: Record<ExamTier, ExamQuestion[]> = {
  1: bank.tier1,
  2: bank.tier2,
  3: bank.tier3,
};

const metaMap: Record<ExamTier, { id: number | string; explanation: string }[]> = {
  1: meta.tier1,
  2: meta.tier2,
  3: meta.tier3,
};

// Global distractor pool drawn from all correct answers in the exam bank.
const allCorrectAnswers = Array.from(
  new Set([...bank.tier1, ...bank.tier2, ...bank.tier3, ...bank.bonus].map((eq) => eq.ans)),
).filter(Boolean);

const optionPools: Record<"A+" | "Network+" | "Security+", string[]> = {
  "A+": [],
  "Network+": [],
  "Security+": [],
};

for (const eq of [...bank.tier1, ...bank.tier2, ...bank.tier3, ...bank.bonus]) {
  const category = categoryFromQuestion(eq.q);
  if (!category) continue;
  optionPools[category].push(...eq.opts);
}

function isDefinitionQuestion(q: Question): boolean {
  const questionText = q.question.toLowerCase();
  const correctText = q.options[q.correctIndex].toLowerCase();
  if (questionText.includes(correctText)) return true;
  const words = correctText.split(/\s+/).filter((w) => w.length > 3);
  if (words.length > 0) {
    const matches = words.filter((w) => questionText.includes(w)).length;
    if (matches / words.length >= 0.6) return true;
  }
  if (
    /what does .* stand for|what is the meaning of|what does .* mean|what does .* refer to|what is .* an acronym for|full meaning|full form|abbreviation|acronym/i.test(
      q.question,
    )
  ) {
    return true;
  }
  return false;
}

function replaceDuplicateOptions(
  q: Question,
  categoryOverride?: "A+" | "Network+" | "Security+" | null,
): Question {
  const category = categoryOverride === undefined ? categoryFromQuestion(q.question) : categoryOverride;
  const seen = new Map<string, number>();
  const duplicateIndexes: number[] = [];
  q.options.forEach((option, index) => {
    const previousIndex = seen.get(option);
    if (previousIndex !== undefined) {
      // Preserve the actual correct slot if the source bank duplicated it.
      duplicateIndexes.push(index === q.correctIndex ? previousIndex : index);
    } else {
      seen.set(option, index);
    }
  });
  if (duplicateIndexes.length === 0 || !category) return q;

  const replacements = shuffleArray(
    Array.from(new Set(optionPools[category])).filter((option) => !seen.has(option)),
  );
  const options = [...q.options];
  duplicateIndexes.forEach((index, replacementIndex) => {
    if (replacements[replacementIndex]) options[index] = replacements[replacementIndex];
  });
  return { ...q, options };
}

function optionShape(value: string): string {
  const normalized = value.trim().toLowerCase();
  const words = normalized.split(/\s+/).filter(Boolean);
  const kind = /[/:()[\]{}]/.test(normalized)
    ? "syntax"
    : /^[a-z0-9+.#_-]+$/i.test(normalized)
      ? "term"
      : "phrase";
  return `${kind}:${Math.min(6, words.length)}:${Math.min(4, Math.round(normalized.length / 12))}`;
}

function choosePlausibleDistractors(q: Question, pool: string[]): string[] {
  const correct = q.options[q.correctIndex];
  const targetShape = optionShape(correct);
  const sameShape = shuffleArray(
    pool.filter((candidate) => candidate !== correct && optionShape(candidate) === targetShape),
  );
  const nearby = shuffleArray(
    pool.filter((candidate) => candidate !== correct && Math.abs(candidate.length - correct.length) < 18),
  );
  return Array.from(new Set([...sameShape, ...nearby])).slice(0, 3);
}

function enhanceDistractors(q: Question): Question {
  const category = categoryFromQuestion(q.question);
  const sourcePool = category ? optionPools[category] : allCorrectAnswers;
  const plausible = choosePlausibleDistractors(q, sourcePool);
  if (!isDefinitionQuestion(q)) {
    return replaceDuplicateOptions(q);
  }
  const correct = q.options[q.correctIndex];
  const distractors = plausible.length >= 3
    ? plausible
    : shuffleArray(sourcePool.filter((a) => a !== correct)).slice(0, 3);
  if (distractors.length < 3) return replaceDuplicateOptions(q);
  const newOptions = shuffleArray([correct, ...distractors]);
  const newCorrectIndex = newOptions.indexOf(correct);
  return replaceDuplicateOptions({
    ...q,
    options: newOptions,
    correctIndex: newCorrectIndex,
  });
}

function isAcronymRecallQuestion(question: string): boolean {
  return /full meaning|full form|stands? for|acronym|abbreviation/i.test(question);
}

function appliedHellModePrompt(answer: string, category: "A+" | "Network+" | "Security+"): string {
  const normalized = answer.toLowerCase();

  if (/power supply unit/.test(normalized)) {
    return "A workstation shuts down when CPU and storage load rise, even though the operating system is stable. Which component should be tested first because it converts incoming AC into the regulated DC rails used by the system?";
  }
  if (/multifactor authentication/.test(normalized)) {
    return "A security policy must stop a stolen password from being enough to sign in. Which control requires evidence from at least two independent factor categories before access is granted?";
  }
  if (/grandfather.father.son/.test(normalized)) {
    return "A backup policy must retain recent daily copies, longer-lived weekly copies, and a small set of monthly archives. Which rotation model best matches that retention pattern?";
  }
  if (/access control list/.test(normalized)) {
    return "A router must allow one set of source networks and ports while denying another, using ordered rules evaluated at the interface. Which control provides that rule set?";
  }
  if (/false rejection rate/.test(normalized)) {
    return "A biometric system is denying legitimate employees and sending them to manual review. Which measurement captures the rate of valid users being rejected?";
  }
  if (/remote authentication dial.in user (?:server|service)/.test(normalized)) {
    return "A network access device must send centralized authentication, authorization, and accounting requests to a separate identity service. Which service best fits this design?";
  }
  if (/personal identity verification/.test(normalized)) {
    return "A government workstation requires a smart credential that proves an employee's identity for controlled facility and system access. Which credential standard matches this requirement?";
  }
  if (/incident response team|computer emergency response team/.test(normalized)) {
    return "A breach requires a coordinated group to contain the event, preserve evidence, eradicate the threat, and guide recovery. Which team should own that response?";
  }
  if (/lucent connector/.test(normalized)) {
    return "A fiber installation specifies a small, square, push-pull connector that latches into an adapter panel. Which connector should the technician select?";
  }
  if (/single sign.on/.test(normalized)) {
    return "A user should authenticate once and then reach several approved applications without entering separate passwords for each one. Which access pattern provides that experience?";
  }
  if (/serial communications d.shell connector, 9 pins/.test(normalized)) {
    return "A legacy console device requires a compact, D-shaped, nine-contact serial connector. Which physical connector matches the requirement?";
  }
  if (/corrective action report/.test(normalized)) {
    return "An audit finding requires a record of the root cause, remediation owner, due date, and evidence that the issue was fixed. Which document should be created?";
  }
  if (/high.definition media interface/.test(normalized)) {
    return "A laptop must carry uncompressed digital video and audio to a modern display over one cable. Which interface is the best fit?";
  }
  if (/internet key exchange|diffie.hellman/.test(normalized)) {
    return "Two VPN peers need to negotiate cryptographic parameters and derive shared session material before protected traffic can flow. Which mechanism performs that negotiation?";
  }
  if (/hard disk drive/.test(normalized)) {
    return "A storage device uses spinning magnetic platters and a moving head, making it vulnerable to seek latency and mechanical failure. Which device type is being described?";
  }
  if (/mandatory access control/.test(normalized)) {
    return "An organization requires centrally assigned security labels to decide access, and users must not be able to override those decisions. Which access model enforces that policy?";
  }
  if (/internet protocol$/.test(normalized)) {
    return "A packet must carry a logical source and destination address and be forwarded between separate networks. Which protocol family provides that network-layer delivery?";
  }
  if (/layer 2 tunneling protocol/.test(normalized)) {
    return "A remote-access design must carry layer-2 traffic through an IP network so another security mechanism can protect the tunnel. Which tunneling protocol provides that encapsulation?";
  }
  if (/short message service/.test(normalized)) {
    return "A mobile carrier needs to deliver short text messages through its cellular messaging service rather than an IP chat application. Which service is being used?";
  }
  if (/file transfer protocol/.test(normalized)) {
    return "A legacy service needs basic client-to-server file uploads and downloads and does not provide encryption by itself. Which protocol matches that behavior?";
  }
  if (/mean time to recover/.test(normalized)) {
    return "An operations team measures the average time required to restore a failed service to working order. Which availability metric is being calculated?";
  }
  if (/media access control/.test(normalized)) {
    return "A switch uses a hardware address to decide where to forward a frame on the local network. Which addressing concept is involved?";
  }
  if (/application programming interface/.test(normalized)) {
    return "A mobile client needs a documented way to request data and actions from a backend service without knowing how that service is implemented. Which interface provides that contract?";
  }
  if (/virtual private cloud/.test(normalized)) {
    return "A cloud team needs an isolated virtual network with its own subnets, routing, and security boundaries inside a provider environment. Which construct provides it?";
  }
  if (/annualized rate of occurrence/.test(normalized)) {
    return "A risk analyst estimates how often a specific loss event is expected to occur during a year. Which risk value is being calculated?";
  }
  if (/network address translation/.test(normalized)) {
    return "A private host network needs outbound internet access while the boundary device maps internal addresses to a smaller set of public addresses. Which technique performs that translation?";
  }
  if (/software.defined networking/.test(normalized)) {
    return "A network team needs to define forwarding and segmentation policy centrally while switches enforce the resulting rules. Which architecture separates control decisions from packet forwarding in this way?";
  }
  if (/security information and event management/.test(normalized)) {
    return "A security platform collects logs from identity systems, endpoints, and network devices, correlates events, and raises an alert when their combined pattern indicates an attack. Which platform provides this capability?";
  }
  if (/confidentiality, integrity(?:,| and) availability/.test(normalized)) {
    return "A security review must ensure that only authorized people can read data, unauthorized changes are detected or prevented, and approved users can reach the service when needed. Which model captures these three goals?";
  }
  if (/network access control/.test(normalized)) {
    return "A switch should place a device into the network only after checking its identity and security posture. Which control makes that admission decision?";
  }
  if (/user account control/.test(normalized)) {
    return "A Windows user with administrative membership must explicitly approve a privileged change before the process can modify protected system areas. Which feature enforces that prompt?";
  }
  if (/fully qualified domain name/.test(normalized)) {
    return "A DNS record must identify a host using its complete hostname and domain hierarchy rather than a short local label. Which name format is required?";
  }
  if (/wireless lan|virtual lan/.test(normalized)) {
    return "A site needs local network connectivity without requiring every endpoint to use a physical Ethernet cable. Which network type matches that requirement?";
  }
  if (/maximum transmission unit/.test(normalized)) {
    return "A tunnel drops oversized packets because the payload exceeds the largest frame that can cross the path without fragmentation. Which network value must be checked?";
  }
  if (/network interface card/.test(normalized)) {
    return "A workstation needs hardware that provides its physical or wireless connection to a network. Which component should be installed?";
  }
  if (/unshielded twisted pair/.test(normalized)) {
    return "A copper Ethernet run uses pairs of conductors twisted together but has no metallic shielding around the pairs. Which cable type is this?";
  }
  if (/uninterruptible power supply/.test(normalized)) {
    return "A server must keep running briefly through a power outage and shut down cleanly if utility power does not return. Which device provides that protection?";
  }
  if (/wi.fi protected access/.test(normalized)) {
    return "A wireless network needs authenticated and encrypted client traffic using a modern pre-shared-key or enterprise deployment. Which security family fits?";
  }
  if (/data loss prevention/.test(normalized)) {
    return "A company wants to detect and block sensitive records leaving through email, cloud uploads, or removable media. Which control addresses that risk?";
  }
  if (/trusted platform module/.test(normalized)) {
    return "A laptop needs a hardware-backed location to protect cryptographic keys and support measured boot. Which component provides it?";
  }
  if (/revolutions per minute/.test(normalized)) {
    return "A technician compares two spinning drives by the number of platter rotations completed each minute. Which specification is being compared?";
  }
  if (/mean time to repair/.test(normalized)) {
    return "A maintenance team measures the average time needed to restore a failed component after repair work begins. Which metric is being tracked?";
  }
  if (/radio.frequency identification|near.field communication/.test(normalized)) {
    return "A badge system identifies a nearby tagged object without requiring a line-of-sight barcode scan. Which short-range wireless technology best fits?";
  }
  if (/digital encryption standard|international data encryption algorithm|cipher feedback|electronic code book/.test(normalized)) {
    return "A legacy application must transform readable data into ciphertext using a symmetric-key block-cipher mode or algorithm. Which cryptographic technology matches the requirement?";
  }
  if (/master boot record|guid .* partition table/.test(normalized)) {
    return "A technician is choosing the disk-partition structure that stores boot metadata and describes how a drive is divided for an operating system. Which format is being selected?";
  }
  if (/dynamic host configuration protocol/.test(normalized)) {
    return "A client should receive its address, subnet mask, gateway, and DNS settings automatically when it joins the network. Which service provides that configuration?";
  }
  if (/domain name system|start of authority|proxy auto configuration/.test(normalized)) {
    return "A client needs infrastructure-provided name resolution or browser routing behavior rather than a manually hard-coded destination. Which service or record supplies that function?";
  }
  if (/secure shell/.test(normalized)) {
    return "An administrator needs encrypted remote command-line access to a server and wants the session protected against eavesdropping. Which protocol should be used?";
  }
  if (/virtual private network/.test(normalized)) {
    return "A remote worker must send private traffic through an encrypted logical path across an untrusted public network. Which technology provides that path?";
  }
  if (/hypertext transfer protocol secure|secure sockets layer/.test(normalized)) {
    return "A browser must exchange web data with a server while protecting the session against interception and tampering. Which secure web technology is required?";
  }
  if (/cross.site scripting/.test(normalized)) {
    return "An application reflects untrusted input into a page and allows a victim's browser to execute attacker-controlled script. Which vulnerability is present?";
  }
  if (/software development lifecycle/.test(normalized)) {
    return "A team needs a repeatable process that carries software from requirements through design, implementation, testing, release, and maintenance. Which lifecycle model provides that structure?";
  }
  if (/recovery time objective/.test(normalized)) {
    return "A business continuity plan states the maximum acceptable time a service may remain unavailable after a disruption. Which target is being defined?";
  }
  if (/standard operating procedure/.test(normalized)) {
    return "A support team needs a repeatable, approved sequence for handling a common operational task so different technicians produce consistent results. Which document provides it?";
  }

  const domain = category === "Security+" ? "security control" : category === "Network+" ? "network technology" : "technical component or procedure";
  return `A ${category} review presents a requirement with several plausible choices. The correct choice must be selected by understanding its operational behavior, not by recognizing shorthand. Which ${domain} best satisfies the requirement described by the answer choices?`;
}

function applyMediumScenario(q: Question): Question {
  if (q.question.startsWith("Applied constraint:") || q.question.length > 210) {
    return { ...q, difficulty: "medium" };
  }
  return {
    ...q,
    difficulty: "medium",
    question:
      `Applied constraint: a technician must preserve the stated requirement while changing only the affected layer. ` +
      `Evidence has been gathered before remediation. Which answer best fits both the observation and the required outcome? ${q.question}`,
  };
}

function hardenHellModeQuestion(q: Question): Question {
  const category = q.category ?? categoryFromQuestion(q.question);
  const answer = q.options[q.correctIndex];

  const base = replaceDuplicateOptions(q, category);
  const plausibleDistractors = base.options.filter((_, index) => index !== base.correctIndex);
  const options = plausibleDistractors.length >= 3
    ? shuffleArray([base.options[base.correctIndex], ...plausibleDistractors.slice(0, 3)])
    : shuffleArray(base.options);
  const hardened: Question = {
    ...base,
    options,
    correctIndex: options.indexOf(base.options[base.correctIndex]),
    difficulty: "hard",
  };
  if (isAcronymRecallQuestion(q.question) && category) {
    return {
      ...hardened,
      question: appliedHellModePrompt(answer, category),
    };
  }
  if (hardened.question.startsWith("Forensic case:")) return hardened;
  return {
    ...hardened,
    question:
      `HellMode case: two symptoms appeared after a controlled change, but only one is causal. ` +
      `Account for dependencies, evidence order, competing plausible answers, and the least-disruptive corrective action before answering. ` +
      `${hardened.question} Select the single answer that best satisfies the requirement without introducing a new risk.`,
  };
}

export function getExamBank(): ExamBank {
  return bank;
}

export function getTierQuestions(tier: ExamTier): ExamQuestion[] {
  return tierMap[tier] || [];
}

export function getBonusQuestions(): ExamQuestion[] {
  return bank.bonus;
}

export function toQuestion(eq: ExamQuestion): Question {
  const correctIndex = eq.opts.indexOf(eq.ans);
  // Fallback: if ans not in opts, use index 0 (should never happen with valid data)
  const safeIndex = correctIndex >= 0 ? correctIndex : 0;
  return {
    id: typeof eq.id === "string" ? parseInt(eq.id.replace(/\D/g, "") || "0", 10) : eq.id,
    category: "A+",
    question: eq.q,
    options: eq.opts,
    correctIndex: safeIndex,
    explanation: eq.explanation || `The correct answer is: ${eq.ans}`,
    difficulty: "medium",
  };
}

export function toQuestions(eqs: ExamQuestion[]): Question[] {
  return eqs.map(toQuestion);
}

export function getTierAsQuestions(tier: ExamTier): Question[] {
  const questions = toQuestions(getTierQuestions(tier));
  if (tier === 3) {
    const curatedHellModeQuestions = questionsForHellMode();
    return shuffleArray(scrambleOptions(curatedHellModeQuestions.map(hardenHellModeQuestion)));
  }
  if (tier === 2) {
    return shuffleArray(scrambleOptions(questions.map((question) => applyMediumScenario(enhanceDistractors(question)))));
  }
  return shuffleArray(scrambleOptions(questions.map((question) => ({ ...enhanceDistractors(question), difficulty: "easy" }))));
}

function questionsForHellMode(): Question[] {
  return questions.map((question) => ({
    ...question,
    difficulty: "hard",
  }));
}

export function getBonusAsQuestions(): Question[] {
  return shuffleArray(scrambleOptions(toQuestions(getBonusQuestions()).map(enhanceDistractors)));
}

export function getExplanationForQuestion(tier: ExamTier, id: number | string): string {
  const entry = metaMap[tier]?.find((m) => m.id === id);
  return entry?.explanation || "The correct answer is documented in the CompTIA objectives.";
}

export function getBonusExplanation(id: number | string): string {
  const entry = meta.bonus.find((m) => m.id === id);
  return entry?.explanation || "The correct answer is documented in the CompTIA objectives.";
}

export function getTierTimeLimitSeconds(tier: ExamTier): number {
  const count = getTierQuestions(tier).length;
  const secondsPerQuestion = tier === 1 ? 75 : tier === 2 ? 60 : 45;
  return count * secondsPerQuestion;
}

export function allTiersQuestionCount(): number {
  return bank.tier1.length + bank.tier2.length + bank.tier3.length;
}
