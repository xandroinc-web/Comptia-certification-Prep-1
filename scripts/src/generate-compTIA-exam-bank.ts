import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface Acronym {
  acronym: string;
  definition: string;
  source: string;
}

interface PortFact {
  protocol: string;
  port: string;
  source: string;
}

interface ConceptFact {
  term: string;
  description: string;
  source: string;
  category: string;
}

interface Question {
  id: number | string;
  q: string;
  opts: string[];
  ans: string;
  explanation: string;
  source: string;
  tier: number;
}

const PDF_TEXT = {
  core1: path.resolve(__dirname, "../../tmp/pdf-text/core1.txt"),
  core2: path.resolve(__dirname, "../../tmp/pdf-text/core2.txt"),
  network: path.resolve(__dirname, "../../tmp/pdf-text/network.txt"),
  security: path.resolve(__dirname, "../../tmp/pdf-text/security.txt"),
};

const SOURCE_LABEL: Record<string, string> = {
  core1: "A+ Core 1",
  core2: "A+ Core 2",
  network: "Network+",
  security: "Security+",
};

function parseAcronyms(text: string, source: string): Acronym[] {
  const acronyms: Acronym[] = [];
  const lines = text.split("\n");
  let inAcronyms = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes("ACRONYM") && line.includes("DEFINITION")) {
      inAcronyms = true;
      continue;
    }
    if (inAcronyms) {
      if (
        /^CompTIA/.test(line) &&
        (line.includes("Hardware") ||
          line.includes("Software") ||
          line.includes("Exam Objectives") ||
          line.includes("Proposed Hardware"))
      ) {
        inAcronyms = false;
        continue;
      }
      const match = line.match(/^([A-Z][A-Z0-9.\-/]{1,18})\s{2,}(.+)$/);
      if (match) {
        const acronym = match[1].trim();
        let definition = match[2].trim();
        let j = i + 1;
        while (
          j < lines.length &&
          lines[j].startsWith(" ") &&
          !lines[j].match(/^\s+[A-Z][A-Z0-9.\-/]{1,18}\s{2,}/)
        ) {
          definition += " " + lines[j].trim();
          j++;
        }
        if (definition.length > 3 && acronym.length > 1) {
          acronyms.push({ acronym, definition, source: SOURCE_LABEL[source] });
        }
      }
    }
  }
  return acronyms;
}

function parsePortsNetwork(text: string): PortFact[] {
  const ports: PortFact[] = [];
  const lines = text.split("\n");
  const protocols: Record<string, string> = {};
  let inPortTable = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("File Transfer Protocol") && line.includes("20/21")) {
      inPortTable = true;
    }
    if (inPortTable) {
      const match = line.match(/^([A-Za-z][A-Za-z0-9\s()/.\-]{2,60})\s{2,}(\d{2,5}(?:\/\d{2,5})?)\s*$/);
      if (match) {
        const protocol = match[1].trim();
        const port = match[2].trim();
        if (!protocol.includes("Protocol") && !protocol.includes("Ports")) {
          protocols[protocol] = port;
        }
      }
      if (line.includes("Traffic types") || line.includes("Internet Protocol")) {
        inPortTable = false;
      }
    }
  }
  for (const [protocol, port] of Object.entries(protocols)) {
    ports.push({ protocol, port, source: "Network+" });
  }
  return ports;
}

function parsePortsAPlus(text: string, source: string): PortFact[] {
  const ports: PortFact[] = [];
  const lines = text.split("\n");
  const protocolMap: Record<string, string> = {
    "File Transfer Protocol (FTP)": "20-21",
    "Secure Shell (SSH)": "22",
    Telnet: "23",
    "Simple Mail Transfer Protocol (SMTP)": "25",
    "Domain Name System (DNS)": "53",
    "Dynamic Host Configuration Protocol (DHCP)": "67/68",
    "Hypertext Transfer Protocol (HTTP)": "80",
    "Post Office Protocol 3 (POP3)": "110",
    "Internet Mail Access Protocol (IMAP)": "143",
    "Network Basic Input/Output System (NetBIOS)/NetBIOS over TCP/IP (NetBT)": "137-139",
    "Lightweight Directory Access Protocol (LDAP)": "389",
    "Hypertext Transfer Protocol Secure (HTTPS)": "443",
    "Server Message Block (SMB)/Common Internet File System (CIFS)": "445",
    "Remote Desktop Protocol (RDP)": "3389",
  };
  for (const [protocol, port] of Object.entries(protocolMap)) {
    ports.push({ protocol, port, source: SOURCE_LABEL[source] });
  }
  return ports;
}

function parseConcepts(text: string, source: string): ConceptFact[] {
  const concepts: ConceptFact[] = [];
  const lines = text.split("\n");
  const bullets: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^[•\-◦գ–]\s/.test(trimmed)) {
      const clean = trimmed.replace(/^[•\-◦գ–\s]+/, "").replace(/\s+/g, " ").trim();
      if (clean.length > 5 && clean.length < 120) {
        bullets.push(clean);
      }
    }
  }
  for (const bullet of bullets) {
    if (bullet.includes("=") || bullet.includes("–") || bullet.includes("is a")) {
      continue;
    }
    concepts.push({
      term: bullet,
      description: bullet,
      source: SOURCE_LABEL[source],
      category: "concept",
    });
  }
  return concepts;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickDistractors<T>(items: T[], exclude: T, count: number, getter: (item: T) => string): string[] {
  const candidates = shuffle(items.filter((item) => getter(item) !== getter(exclude)));
  const selected = candidates.slice(0, count);
  return selected.map(getter);
}

function generateAcronymQuestion(acronym: Acronym, allAcronyms: Acronym[], id: number | string, tier: number): Question {
  const q = tier === 1
    ? `What does "${acronym.acronym}" stand for?`
    : tier === 2
    ? `In a ${acronym.source} context, the acronym "${acronym.acronym}" refers to which concept?`
    : `A technician sees "${acronym.acronym}" in ${acronym.source} documentation. What is the full meaning?`;
  const correct = acronym.definition;
  const sameSource = allAcronyms.filter((a) => a.source === acronym.source && a.acronym !== acronym.acronym);
  const wrong = pickDistractors(sameSource, acronym, 3, (a) => a.definition);
  const opts = shuffle([correct, ...wrong]);
  return {
    id,
    q,
    opts,
    ans: correct,
    explanation: `"${acronym.acronym}" stands for "${acronym.definition}" (${acronym.source}).`,
    source: acronym.source,
    tier,
  };
}

function generatePortQuestion(port: PortFact, allPorts: PortFact[], id: number, tier: number): Question {
  const q = tier === 1
    ? `Which port number is associated with ${port.protocol}?`
    : tier === 2
    ? `A firewall rule must allow ${port.protocol} traffic. Which port should be opened?`
    : `A packet analyzer shows traffic on port ${port.port}. Which service is most likely in use?`;
  const correct = tier === 3 ? port.protocol : port.port;
  const wrongPool = allPorts.filter((p) => p.protocol !== port.protocol);
  const wrongKey = tier === 3 ? "port" : "protocol";
  const getter = (p: PortFact) => (wrongKey === "port" ? p.port : p.protocol);
  const wrong = pickDistractors(wrongPool, port, 3, getter);
  const opts = shuffle([correct, ...wrong]);
  return {
    id,
    q,
    opts,
    ans: correct,
    explanation: `${port.protocol} uses port ${port.port} (source: ${port.source}).`,
    source: port.source,
    tier,
  };
}

function generateConceptQuestion(concept: ConceptFact, allConcepts: ConceptFact[], id: number, tier: number): Question {
  const q = `Which ${concept.source} concept is described as "${concept.description}"?`;
  const correct = concept.term;
  const sameSource = allConcepts.filter((c) => c.source === concept.source && c.term !== concept.term);
  const wrong = pickDistractors(sameSource, concept, 3, (c) => c.term);
  const opts = shuffle([correct, ...wrong]);
  return {
    id,
    q,
    opts,
    ans: correct,
    explanation: `"${concept.term}" is a ${concept.source} concept related to ${concept.description}.`,
    source: concept.source,
    tier,
  };
}

function generateTier(
  acronyms: Acronym[],
  ports: PortFact[],
  concepts: ConceptFact[],
  startId: number,
  tier: number,
  targetCount: number
): Question[] {
  const questions: Question[] = [];
  let id = startId;
  const shuffledAcronyms = shuffle(acronyms);
  const acronymCount = Math.floor(targetCount * 0.6);
  for (let i = 0; i < acronymCount && i < shuffledAcronyms.length; i++) {
    questions.push(generateAcronymQuestion(shuffledAcronyms[i], acronyms, id++, tier));
  }
  const shuffledPorts = shuffle(ports);
  const portCount = Math.floor(targetCount * 0.25);
  for (let i = 0; i < portCount && i < shuffledPorts.length; i++) {
    questions.push(generatePortQuestion(shuffledPorts[i], ports, id++, tier));
  }
  const shuffledConcepts = shuffle(concepts);
  while (questions.length < targetCount && shuffledConcepts.length > 0) {
    const concept = shuffledConcepts[questions.length % shuffledConcepts.length];
    questions.push(generateConceptQuestion(concept, concepts, id++, tier));
  }
  return questions.slice(0, targetCount);
}

function main() {
  const allAcronyms: Acronym[] = [];
  const allPorts: PortFact[] = [];
  const allConcepts: ConceptFact[] = [];

  for (const [source, file] of Object.entries(PDF_TEXT)) {
    const text = fs.readFileSync(file, "utf8");
    const acronyms = parseAcronyms(text, source);
    const ports = source === "network" ? parsePortsNetwork(text) : parsePortsAPlus(text, source);
    const concepts = parseConcepts(text, source);
    allAcronyms.push(...acronyms);
    allPorts.push(...ports);
    allConcepts.push(...concepts);
  }

  console.log(`Parsed ${allAcronyms.length} acronyms, ${allPorts.length} ports, ${allConcepts.length} concepts`);

  const tier1 = generateTier(allAcronyms, allPorts, allConcepts, 1, 1, 270);
  const tier2 = generateTier(allAcronyms, allPorts, allConcepts, 271, 2, 270);
  const tier3 = generateTier(allAcronyms, allPorts, allConcepts, 541, 3, 270);

  const bonusPool = shuffle(allAcronyms).slice(0, 30);
  const bonus: Question[] = [];
  for (let i = 0; i < 10; i++) {
    const a = bonusPool[i];
    if (!a) continue;
    bonus.push(generateAcronymQuestion(a, allAcronyms, `B${i + 1}`, 3));
  }

  const output = {
    tier1: tier1.map(({ id, q, opts, ans }) => ({ id, q, opts, ans })),
    tier2: tier2.map(({ id, q, opts, ans }) => ({ id, q, opts, ans })),
    tier3: tier3.map(({ id, q, opts, ans }) => ({ id, q, opts, ans })),
    bonus: bonus.map(({ id, q, opts, ans }) => ({ id, q, opts, ans })),
  };

  const outPath = path.resolve(__dirname, "../../artifacts/comptia-quiz/src/data/exam-bank.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`Wrote ${outPath}`);
  console.log(`Tier 1: ${output.tier1.length}, Tier 2: ${output.tier2.length}, Tier 3: ${output.tier3.length}, Bonus: ${output.bonus.length}`);

  // Write metadata with explanations for gamification
  const metaPath = path.resolve(__dirname, "../../artifacts/comptia-quiz/src/data/exam-bank-meta.json");
  const meta = {
    tier1: tier1.map(({ id, explanation }) => ({ id, explanation })),
    tier2: tier2.map(({ id, explanation }) => ({ id, explanation })),
    tier3: tier3.map(({ id, explanation }) => ({ id, explanation })),
    bonus: bonus.map(({ id, explanation }) => ({ id, explanation })),
  };
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  console.log(`Wrote ${metaPath}`);
}

main();
