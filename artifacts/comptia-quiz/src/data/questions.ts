import { assignTopic } from "./topics";
import type { DomainTopic } from "./topics";
export type { DomainTopic } from "./topics";

export type ExamCategory = "A+" | "Network+" | "Security+";
export type Difficulty = "easy" | "medium" | "hard";

export interface Question {
  id: number;
  category: ExamCategory;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  difficulty?: Difficulty;
  topic?: DomainTopic;
}

const hardMarkers = [
  "most likely", "best practice", "troubleshoot", "scenario", "intermittent",
  "root cause", "multiple steps", "configure", "implementation", "evaluate",
  "comprehensive", "architecture", "integration", "multi-layer", "verify",
  "determine which", "what is the best", "which of the following would",
  "a user reports", "after installing", "following a", "suddenly", "no longer",
  "fails to", "unable to", "not responding", "slow performance", "security incident",
  "phishing", "ransomware", "breach", "exploit", "vulnerability", "penetration",
  "subnetting", "calculate", "aggregate", "summarize", "design a", "plan",
  "compliance", "framework", "nist", "iso", "gdpr", "hipaa", "pci-dss",
];

const mediumMarkers = [
  "difference between", "compare", "how does", "why would", "when should",
  "what happens when", "which type", "which protocol", "which tool",
  "what is the purpose", "what does", "how many", "which port",
  "appropriate", "suitable", "recommended", "preferred", "typically",
  "characteristics", "features", "function", "role", "responsibility",
  "advantage", "disadvantage", "benefit", "limitation", "constraint",
];

const easyMarkers = [
  "what is", "which of the following is", "define", "stands for", "abbreviation",
  "acronym", "full form", "meaning of", "how many pins", "what speed",
  "maximum", "minimum", "default", "standard", "common", "typical value",
];

/** Heuristic difficulty score based on question content.
 *  Higher score = harder. Used to balance the question bank.
 */
function classifyDifficultyScore(q: string): number {
  const low = q.toLowerCase();
  const hardCount = hardMarkers.filter((m) => low.includes(m)).length;
  const mediumCount = mediumMarkers.filter((m) => low.includes(m)).length;
  const easyCount = easyMarkers.filter((m) => low.includes(m)).length;

  const isLong = low.length > 160;
  const isMediumLength = low.length > 100 && low.length <= 160;

  let score = 0;
  score += hardCount * 3;
  score += mediumCount * 1.5;
  score -= easyCount * 1;
  if (isLong) score += 2;
  if (isMediumLength) score += 1;

  return score;
}

/** Assign difficulty so that each category has a balanced 1/3 easy, 1/3 medium, 1/3 hard split.
 *  Questions are sorted by their heuristic score and split into terciles.
 */
function assignDifficulties(qs: Question[]): Question[] {
  // Preserve explicit difficulties by converting them to a score
  const scored = qs.map((q) => ({
    q,
    score: q.difficulty ? { easy: 0, medium: 1, hard: 2 }[q.difficulty] : classifyDifficultyScore(q.question),
  }));

  // Group by category to balance within each exam
  const byCategory: Record<ExamCategory, typeof scored> = {
    "A+": [],
    "Network+": [],
    "Security+": [],
  };
  for (const item of scored) {
    byCategory[item.q.category].push(item);
  }

  const out: Question[] = [];
  for (const cat of ["A+", "Network+", "Security+"] as ExamCategory[]) {
    const items = byCategory[cat];
    items.sort((a, b) => a.score - b.score);
    const n = items.length;
    const easyCount = Math.floor(n / 3);
    const mediumCount = Math.floor(n / 3);
    for (let i = 0; i < n; i++) {
      let diff: Difficulty;
      if (i < easyCount) diff = "easy";
      else if (i < easyCount + mediumCount) diff = "medium";
      else diff = "hard";
      out.push({ ...items[i].q, difficulty: diff });
    }
  }

  // Restore original order so the bank is still readable by domain
  const orderMap = new Map(qs.map((q, i) => [q.id, i]));
  out.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
  return out;
}

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

export const DIFFICULTY_COLORS: Record<Difficulty, string> = {
  easy: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  medium: "text-amber-400 bg-amber-500/10 border-amber-500/30",
  hard: "text-red-400 bg-red-500/10 border-red-500/30",
};

/** Seconds per question by difficulty. */
export const SECONDS_PER_QUESTION: Record<Difficulty, number> = {
  easy: 75,
  medium: 60,
  hard: 45,
};

/** Difficulty weight multiplier for scoring. */
export const DIFFICULTY_WEIGHT: Record<Difficulty, number> = {
  easy: 1.0,
  medium: 1.2,
  hard: 1.5,
};

/** Shuffle an array in place using Fisher-Yates. */
export function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Scramble the answer options of each question so the correct answer lands
 *  in a random position every time a quiz starts. */
export function scrambleOptions(questions: Question[]): Question[] {
  return questions.map((q) => {
    const originalCorrect = q.correctIndex;
    const originalCorrectText = q.options[originalCorrect];
    const shuffled = shuffleArray(q.options);
    const newCorrect = shuffled.indexOf(originalCorrectText);
    return { ...q, options: shuffled, correctIndex: newCorrect };
  });
}

const rawQuestions: Question[] = [
  {
    id: 1, category: "A+",
    question: "Which component directly converts AC power from a wall outlet into DC power used by computer components?",
    options: ["Voltage Regulator Module (VRM)", "Power Supply Unit (PSU)", "UPS", "Motherboard"],
    correctIndex: 1, explanation: "The PSU converts AC from the wall into the DC voltages (+3.3V, +5V, +12V) required by internal components.",
  },
  {
    id: 2, category: "A+",
    question: "A technician needs to upgrade RAM in a laptop. Which RAM form factor is MOST likely required?",
    options: ["SO-DIMM", "DIMM", "RIMM", "SIMM"],
    correctIndex: 0, explanation: "Laptops use SO-DIMM, which is physically smaller than DIMM modules used in desktops.",
  },
  {
    id: 3, category: "A+",
    question: "Which RAID level provides disk mirroring with NO striping and requires a minimum of 2 drives?",
    options: ["RAID 10", "RAID 5", "RAID 0", "RAID 1"],
    correctIndex: 3, explanation: "RAID 1 mirrors data across two drives. It offers redundancy but no performance gain from striping.",
  },
  {
    id: 4, category: "A+",
    question: "A user's Windows PC displays 'No boot device found' after a power outage. What is the FIRST thing to check?",
    options: ["Update the NIC driver", "Replace the hard drive", "Reinstall Windows", "Check BIOS/UEFI boot order settings"],
    correctIndex: 3, explanation: "A BIOS reset during a power outage can change the boot order. Verifying and correcting the boot order is the quickest first step.",
  },
  {
    id: 5, category: "A+",
    question: "Which display connector carries ONLY a video signal (no audio) and uses a 15-pin analog connector?",
    options: ["DVI-D", "HDMI", "DisplayPort", "VGA"],
    correctIndex: 3, explanation: "VGA transmits only analog video. HDMI and DisplayPort carry both audio and video; DVI-D is digital-only.",
  },
  {
    id: 6, category: "A+",
    question: "What is the purpose of thermal paste applied between a CPU and its heatsink?",
    options: ["To electrically insulate the CPU from the heatsink", "To lubricate the heatsink fan", "To fill microscopic air gaps and improve heat transfer", "To secure the heatsink mechanically"],
    correctIndex: 2, explanation: "Thermal paste fills microscopic surface imperfections, eliminating air gaps that act as insulators and dramatically improving heat conduction.",
  },
  {
    id: 7, category: "A+",
    question: "A technician is connecting a SATA SSD to a motherboard. Which cable type carries DATA between the drive and motherboard?",
    options: ["Molex", "SATA power cable (15-pin)", "SATA data cable (7-pin)", "PCIe x4 cable"],
    correctIndex: 2, explanation: "SATA uses a 7-pin data cable for data transfer and a separate 15-pin power cable for power delivery.",
  },
  {
    id: 8, category: "A+",
    question: "Which Windows tool should a technician use to view and manage device drivers and identify hardware with issues?",
    options: ["Task Manager", "Registry Editor", "Disk Management", "Device Manager"],
    correctIndex: 3, explanation: "Device Manager (devmgmt.msc) shows all installed hardware and flags driver errors with a yellow exclamation mark or a red X.",
  },
  {
    id: 9, category: "A+",
    question: "Which type of connector is used by most modern desktop CPUs to receive dedicated power directly from the PSU?",
    options: ["24-pin ATX", "8-pin EPS/ATX12V", "6-pin PCIe", "4-pin Molex"],
    correctIndex: 1, explanation: "Modern CPUs use an 8-pin EPS/ATX12V connector for dedicated CPU power, while the motherboard itself uses the 24-pin ATX connector.",
  },
  {
    id: 10, category: "A+",
    question: "A laser printer is producing faded or light prints. Which component is MOST likely causing this issue?",
    options: ["Transfer belt", "Imaging drum", "Fuser assembly", "Toner cartridge"],
    correctIndex: 3, explanation: "Low or depleted toner in the cartridge is the most common cause of faded output. Shaking the cartridge can temporarily redistribute remaining toner.",
  },
  {
    id: 11, category: "A+",
    question: "Which CPU socket type, used by Intel LGA platforms, has pins located on the MOTHERBOARD rather than the processor?",
    options: ["BGA", "LGA", "ZIF", "PGA"],
    correctIndex: 1, explanation: "LGA sockets have pins on the motherboard socket; the CPU has flat contact pads. Intel desktop CPUs (e.g., LGA1700) use this.",
  },
  {
    id: 12, category: "A+",
    question: "A Windows workstation fails to start and shows 'BOOTMGR is missing.' Which recovery command repairs the boot manager?",
    options: ["msconfig", "chkdsk", "bootrec /fixmbr and bootrec /fixboot", "sfc /scannow"],
    correctIndex: 2, explanation: "bootrec.exe with /fixmbr and /fixboot, run from WinRE, repairs the MBR and boot sector.",
  },
  {
    id: 13, category: "A+",
    question: "Which partitioning scheme supports drives larger than 2 TB and allows up to 128 primary partitions in Windows?",
    options: ["MBR", "EBR", "GPT", "VBR"],
    correctIndex: 2, explanation: "GPT supports volumes larger than 2 TB and allows up to 128 primary partitions on Windows with UEFI.",
  },
  {
    id: 14, category: "A+",
    question: "Which file system is the default for modern Windows installations and supports permissions and encryption?",
    options: ["exFAT", "FAT32", "NTFS", "ext4"],
    correctIndex: 2, explanation: "NTFS supports large volumes, file-level permissions, EFS encryption, journaling, and compression.",
  },
  {
    id: 15, category: "A+",
    question: "What is the maximum theoretical data transfer speed of USB 3.2 Gen 2 (SuperSpeed USB 10 Gbps)?",
    options: ["40 Gbps", "10 Gbps", "480 Mbps", "5 Gbps"],
    correctIndex: 1, explanation: "USB 3.2 Gen 2 runs at 10 Gbps. Gen 1 is 5 Gbps, and USB4 can reach 40 Gbps.",
  },
  {
    id: 16, category: "A+",
    question: "Which precaution BEST prevents electrostatic discharge (ESD) damage when handling a RAM module?",
    options: ["Working near a running fan", "Wearing an anti-static wrist strap connected to ground", "Keeping the module in sunlight", "Holding the module by its gold contacts"],
    correctIndex: 1, explanation: "An anti-static wrist strap continuously drains static charge from the body to ground, preventing ESD damage.",
  },
  {
    id: 17, category: "A+",
    question: "A technician installs a second RAM stick to enable dual-channel mode. In which slots should both sticks be installed?",
    options: ["Slot 4 only", "Any two slots", "Slots 1 and 3 (matching color-coded slots)", "Slots 1 and 2 (adjacent)"],
    correctIndex: 2, explanation: "Dual-channel mode requires RAM in matching (same-colored) slots — typically A1+B1 or A2+B2 per the motherboard manual.",
  },
  {
    id: 18, category: "A+",
    question: "What does TPM (Trusted Platform Module) provide in a Windows environment?",
    options: ["Hardware-based security chip for cryptographic key storage", "A secondary power supply", "A cooling solution", "Additional CPU cores"],
    correctIndex: 0, explanation: "TPM is a dedicated security chip storing cryptographic keys and certificates. Windows 11 requires TPM 2.0; it enables BitLocker.",
  },
  {
    id: 19, category: "A+",
    question: "Which Windows command-line tool scans and repairs corrupt system files?",
    options: ["diskpart", "sfc /scannow", "chkdsk", "defrag"],
    correctIndex: 1, explanation: "SFC (System File Checker) scans protected files and replaces corrupt or missing files from a cached copy.",
  },
  {
    id: 20, category: "A+",
    question: "A laptop battery no longer holds a charge. After confirming the AC adapter works, what is the BEST next step?",
    options: ["Update the BIOS", "Replace the battery", "Reinstall the OS", "Replace the motherboard"],
    correctIndex: 1, explanation: "Lithium-ion batteries have limited cycle life. If the adapter is confirmed working and the battery won't charge, replace the battery.",
  },
  {
    id: 21, category: "A+",
    question: "What is the role of UEFI compared to legacy BIOS?",
    options: ["UEFI replaces CPU microcode", "UEFI only manages USB devices during POST", "UEFI supports GPT, Secure Boot, and drives larger than 2 TB", "UEFI is a software bootloader"],
    correctIndex: 2, explanation: "UEFI replaces legacy BIOS and adds GPT support, Secure Boot, large drive support, and a graphical setup interface.",
  },
  {
    id: 22, category: "A+",
    question: "Which Windows feature allows multiple operating systems to run simultaneously on one physical machine?",
    options: ["BitLocker", "Remote Desktop", "Windows Sandbox", "Hyper-V / Virtualization"],
    correctIndex: 3, explanation: "Hyper-V is Windows' built-in hypervisor. Type-1 and Type-2 hypervisors allow multiple virtual machines on one host.",
  },
  {
    id: 23, category: "A+",
    question: "A laser printer produces pages with faint duplicate ghost images. Which component MOST likely needs replacement?",
    options: ["Fuser assembly", "Transfer roller", "Toner cartridge", "Paper feed roller"],
    correctIndex: 0, explanation: "Ghosting is typically caused by a worn fuser assembly that fails to fully discharge the toner drum, leaving residual images.",
  },
  {
    id: 24, category: "A+",
    question: "A user installs new RAM and the PC emits beep codes on boot with no video. What does this MOST likely indicate?",
    options: ["CPU is overheating", "RAM is not seated properly or is incompatible", "Monitor cable is loose", "RAM is correctly installed"],
    correctIndex: 1, explanation: "POST beep codes related to RAM indicate memory errors, often from improperly seated or incompatible RAM modules.",
  },
  {
    id: 25, category: "A+",
    question: "Which command opens the Disk Management utility from the Windows Run dialog?",
    options: ["services.msc", "compmgmt.msc", "diskmgmt.msc", "devmgmt.msc"],
    correctIndex: 2, explanation: "diskmgmt.msc opens Disk Management for creating, deleting, formatting, and managing disk partitions.",
  },
  {
    id: 26, category: "A+",
    question: "A desktop powers on but there is no display output. The GPU fan spins. What should the technician check FIRST?",
    options: ["Replace the PSU", "Reinstall the OS", "Check that the monitor cable is connected to the GPU (not motherboard)", "Replace the CPU"],
    correctIndex: 2, explanation: "With a discrete GPU, the monitor must connect to its port, not the motherboard's integrated video output.",
  },
  {
    id: 27, category: "A+",
    question: "Which Windows administrative tool provides a centralized view of Application, Security, and System event logs?",
    options: ["Performance Monitor", "Resource Monitor", "Task Manager", "Event Viewer"],
    correctIndex: 3, explanation: "Event Viewer (eventvwr.msc) consolidates Application, Security, and System logs for diagnosing crashes and errors.",
  },
  {
    id: 28, category: "A+",
    question: "An M.2 slot supports both SATA and NVMe drives. How can a technician determine which protocol an M.2 SSD uses?",
    options: ["By the physical length of the card", "By the number of NAND chips", "By checking whether it uses a PCIe (NVMe) or SATA controller in the drive specs", "By the color of the connector"],
    correctIndex: 2, explanation: "NVMe M.2 uses PCIe (~3.5 GB/s+); SATA M.2 uses the SATA interface (~550 MB/s). The spec sheet indicates the protocol.",
  },
  {
    id: 29, category: "A+",
    question: "What is the appropriate PPE when replacing a cracked smartphone display assembly?",
    options: ["Safety glasses and cut-resistant gloves", "No PPE is required", "Ear protection only", "Hard hat and steel-toed boots"],
    correctIndex: 0, explanation: "Cracked glass produces sharp fragments. Safety glasses protect eyes and cut-resistant gloves protect hands.",
  },
  {
    id: 30, category: "A+",
    question: "Which Windows recovery tool lets a user restore the system to a previous point in time without affecting personal files?",
    options: ["System Restore", "Factory Reset", "chkdsk", "diskpart"],
    correctIndex: 0, explanation: "System Restore reverts system files, drivers, and registry to a restore point while leaving personal files untouched.",
  },
  {
    id: 31, category: "A+",
    question: "A technician notices a swollen capacitor on a motherboard. What is the BEST course of action?",
    options: ["Ignore it if the system still boots", "Apply thermal paste to the capacitor", "Re-solder the capacitor", "Replace the entire motherboard"],
    correctIndex: 3, explanation: "Swollen or leaking capacitors indicate failure. They cannot be safely or reliably replaced in the field; the motherboard should be replaced.",
  },
  {
    id: 32, category: "A+",
    question: "Which Windows feature encrypts an entire drive to prevent unauthorized access if the drive is physically stolen?",
    options: ["EFS (Encrypting File System)", "Windows Defender", "BitLocker", "AppLocker"],
    correctIndex: 2, explanation: "BitLocker encrypts entire volumes at the disk level. EFS encrypts individual files. BitLocker protects against physical theft of the drive.",
  },
  {
    id: 33, category: "A+",
    question: "A user's laptop trackpad is not responding. After checking that it is not disabled via a function key, what should be checked next?",
    options: ["Reinstall the BIOS", "Replace the LCD screen", "Check Device Manager for driver issues or disabled device", "Replace the hard drive"],
    correctIndex: 2, explanation: "Device Manager reveals whether the trackpad is disabled, missing a driver, or reporting an error. This is the logical next diagnostic step.",
  },
  {
    id: 34, category: "A+",
    question: "Which type of cable is used to connect a modern internal SSD using the NVMe protocol directly to the motherboard?",
    options: ["PCIe slot (M.2 or add-in card)", "SATA data cable", "IDE ribbon cable", "USB-C internal header"],
    correctIndex: 0, explanation: "NVMe SSDs connect via PCIe lanes — most commonly through an M.2 slot on the motherboard or as a PCIe add-in card (AIC).",
  },
  {
    id: 35, category: "A+",
    question: "What is the primary advantage of an NVMe SSD over a SATA SSD?",
    options: ["Faster data transfer speeds via PCIe lanes", "Smaller physical size", "Lower power consumption", "Longer lifespan"],
    correctIndex: 0, explanation: "NVMe uses PCIe lanes and achieves speeds of 3,500+ MB/s, while SATA III maxes out at ~550 MB/s. Speed is the primary advantage.",
  },
  {
    id: 36, category: "A+",
    question: "A computer boots but the keyboard and mouse do not work. The user recently installed a new USB 3.0 expansion card. What is the MOST likely cause?",
    options: ["The USB card requires an external power cable that was not connected", "The USB card is seated in a PCI (not PCIe) slot", "The keyboard and mouse are Bluetooth", "The USB card driver is not installed"],
    correctIndex: 0, explanation: "Many USB expansion cards require a supplemental power connection (Molex or SATA) to supply sufficient current for connected peripherals.",
  },
  {
    id: 37, category: "A+",
    question: "Which Windows tool allows a technician to view currently running processes, their CPU and memory usage, and force-close unresponsive applications?",
    options: ["Task Manager", "System Configuration (msconfig)", "Event Viewer", "Resource Monitor"],
    correctIndex: 0, explanation: "Task Manager (Ctrl+Shift+Esc) shows running processes, resource usage, startup items, and lets you end unresponsive tasks.",
  },
  {
    id: 38, category: "A+",
    question: "What is the maximum amount of RAM that a 64-bit version of Windows 10 Home can officially support?",
    options: ["16 GB", "4 GB", "8 GB", "128 GB"],
    correctIndex: 3, explanation: "Windows 10 Home 64-bit officially supports up to 128 GB of RAM. Pro and Enterprise support even more (up to 2 TB on some editions).",
  },
  {
    id: 39, category: "A+",
    question: "A user reports that their workstation is very slow, and Task Manager shows the disk usage at 100%. What is a likely cause?",
    options: ["A failing hard drive or excessive background I/O from indexing/AV scans", "The CPU is overclocked", "The monitor refresh rate is too high", "Too many browser tabs open"],
    correctIndex: 0, explanation: "100% disk usage is commonly caused by failing HDD sectors, Windows Search indexing, antivirus scans, or background updates hammering the disk.",
  },
  {
    id: 40, category: "A+",
    question: "Which connector is typically used for the front panel power switch, reset button, and LED indicators on a desktop motherboard?",
    options: ["PCIe x1 slot", "Front panel header (small pin block)", "USB 3.0 header", "24-pin ATX"],
    correctIndex: 1, explanation: "The front panel header is a small block of pins where power switch, reset, HDD LED, and power LED connectors plug in. It is documented in the motherboard manual.",
  },
  {
    id: 41, category: "A+",
    question: "A Windows PC displays a BSOD with the error code 'CRITICAL_PROCESS_DIED.' What should the technician investigate FIRST?",
    options: ["Reinstall the browser", "Replace the keyboard", "Replace the monitor", "Check for corrupt system files, bad RAM, or failing boot drive"],
    correctIndex: 3, explanation: "CRITICAL_PROCESS_DIED indicates a core Windows process terminated unexpectedly. Common causes are corrupt system files, failing RAM, or a dying boot drive.",
  },
  {
    id: 42, category: "A+",
    question: "What is the purpose of a CMOS battery on a motherboard?",
    options: ["To power the CPU when AC is disconnected", "To provide backup power for the hard drive", "To maintain BIOS/UEFI settings and real-time clock when the PC is unplugged", "To charge USB devices when the PC is off"],
    correctIndex: 2, explanation: "The CMOS battery (CR2032) keeps the BIOS/UEFI configuration and real-time clock powered when the computer is unplugged. A dead CMOS battery causes lost BIOS settings.",
  },
  {
    id: 43, category: "A+",
    question: "Which Windows Update type includes new features and significant enhancements and is released roughly every 6 months?",
    options: ["Driver Update", "Quality Update (cumulative)", "Feature Update", "Definition Update"],
    correctIndex: 2, explanation: "Feature Updates are the major biannual releases that add new functionality. Quality Updates are the monthly cumulative security patches.",
  },
  {
    id: 44, category: "A+",
    question: "A technician needs to disable a specific program from starting automatically with Windows. Which tool is the BEST choice?",
    options: ["Task Manager > Startup tab", "Event Viewer", "Disk Cleanup", "Control Panel > Programs and Features"],
    correctIndex: 0, explanation: "Task Manager's Startup tab shows all programs configured to start with Windows and allows you to enable or disable them.",
  },
  {
    id: 45, category: "A+",
    question: "Which command-line tool in Windows is used to test network connectivity by sending ICMP echo requests?",
    options: ["tracert", "nslookup", "ipconfig", "ping"],
    correctIndex: 3, explanation: "ping tests basic IP connectivity using ICMP echo requests. tracert traces the route; nslookup queries DNS; ipconfig shows adapter configuration.",
  },
  {
    id: 46, category: "A+",
    question: "What is the main difference between a Type 1 and Type 2 hypervisor?",
    options: ["Type 2 has no guest OS support", "Type 1 is slower", "Type 1 runs directly on hardware (bare metal); Type 2 runs on top of a host OS", "Type 1 requires no RAM"],
    correctIndex: 2, explanation: "Type 1 (bare metal) hypervisors like Hyper-V, ESXi, and Xen run directly on hardware. Type 2 (hosted) like VMware Workstation run on top of a host OS.",
  },
  {
    id: 47, category: "A+",
    question: "A user wants to extend their desktop workspace across two monitors. What Windows setting should they configure?",
    options: ["Power Options", "Display Settings > Multiple Displays > Extend these displays", "Network and Sharing Center", "Ease of Access settings"],
    correctIndex: 1, explanation: "Display Settings allows you to choose between 'Duplicate' (mirror) and 'Extend' (independent desktop across multiple monitors).",
  },
  {
    id: 48, category: "A+",
    question: "A computer makes a loud grinding noise when powered on. Which component is MOST likely the source?",
    options: ["USB keyboard", "Hard drive (mechanical HDD)", "RAM module", "Wi-Fi antenna"],
    correctIndex: 1, explanation: "Mechanical hard drives with spinning platters and moving read/write heads can produce grinding or clicking noises when failing. SSDs are silent.",
  },
  {
    id: 49, category: "A+",
    question: "Which Windows PowerShell command restarts a remote computer?",
    options: ["Stop-Process", "shutdown /s", "ipconfig /release", "Restart-Computer"],
    correctIndex: 3, explanation: "Restart-Computer is the PowerShell cmdlet for rebooting a local or remote system. shutdown /s is CMD syntax for shutdown (not restart).",
  },
  {
    id: 50, category: "A+",
    question: "What is the purpose of POST (Power-On Self-Test)?",
    options: ["To scan for viruses", "To install the operating system", "To test critical hardware components before booting", "To update BIOS firmware automatically"],
    correctIndex: 2, explanation: "POST checks essential hardware — CPU, RAM, GPU, storage — during startup. Beep codes or error messages indicate which component failed POST.",
  },
  {
    id: 51, category: "A+",
    question: "A laptop keyboard types the wrong characters when certain keys are pressed. What is the MOST likely cause?",
    options: ["The keyboard layout is set to a different language", "The CPU is overheating", "The hard drive is full", "The screen resolution is too low"],
    correctIndex: 0, explanation: "Incorrect keyboard layouts (e.g., AZERTY instead of QWERTY) cause wrong characters. This can be changed in Windows Settings > Time & Language > Language.",
  },
  {
    id: 52, category: "A+",
    question: "Which type of malware replicates itself across a network WITHOUT requiring a host file or user interaction?",
    options: ["Worm", "Spyware", "Virus", "Trojan"],
    correctIndex: 0, explanation: "Worms self-replicate across networks without attaching to host files. Viruses require host files; Trojans require user execution; spyware monitors activity.",
  },
  {
    id: 53, category: "A+",
    question: "A technician notices that a Windows PC has very high memory usage even with only one application open. What should be checked first?",
    options: ["Install a larger monitor", "Replace the CPU", "Check Task Manager for background processes, startup items, and memory leaks", "Reinstall the application"],
    correctIndex: 2, explanation: "High idle memory usage is often caused by background services, startup programs, or memory leaks from poorly coded applications.",
  },
  {
    id: 54, category: "A+",
    question: "Which Windows administrative tool is used to create, format, and manage hard drive partitions and volumes?",
    options: ["Event Viewer", "Disk Management", "Device Manager", "Task Manager"],
    correctIndex: 1, explanation: "Disk Management (diskmgmt.msc) handles partition creation, formatting, drive letter assignment, and volume extension/shrinking.",
  },
  {
    id: 55, category: "A+",
    question: "What is the purpose of an air gap when working inside a computer case?",
    options: ["To block Wi-Fi signals", "To prevent ESD", "To separate the hard drive from the motherboard", "To provide space for cooling airflow between components"],
    correctIndex: 3, explanation: "Proper spacing (air gaps) between components inside the case ensures adequate airflow, which is critical for thermal management and preventing overheating.",
  },
  {
    id: 56, category: "A+",
    question: "A Windows 10 machine is stuck in a boot loop after a bad Windows Update. Which recovery option should be used?",
    options: ["System Restore to a point before the update", "Replace the RAM", "Upgrade to Windows 11", "Reinstall Windows from scratch immediately"],
    correctIndex: 0, explanation: "System Restore rolls back system files, drivers, and registry to a known-good restore point, often resolving issues caused by updates.",
  },
  {
    id: 57, category: "A+",
    question: "Which port is commonly used to connect a modern external hard drive or SSD for high-speed data transfer?",
    options: ["Serial (RS-232)", "Parallel (LPT)", "PS/2", "USB-C / USB 3.x"],
    correctIndex: 3, explanation: "USB-C and USB 3.x ports are the modern standard for connecting external storage devices with high throughput and power delivery.",
  },
  {
    id: 58, category: "A+",
    question: "What is the function of the chipset on a motherboard?",
    options: ["To provide Wi-Fi connectivity", "To cool the CPU", "To manage communication between the CPU, RAM, storage, and peripherals", "To power the CPU"],
    correctIndex: 2, explanation: "The chipset (PCH) manages data flow between the CPU, memory, storage, USB, PCIe, and other I/O. It is the motherboard's traffic controller.",
  },
  {
    id: 59, category: "A+",
    question: "A technician is replacing a mechanical hard drive with an SSD. Which cloning method ensures the new drive is bootable with all data intact?",
    options: ["Copy and paste all files using File Explorer", "Use disk cloning software to create an exact sector-by-sector copy", "Format the SSD and reinstall Windows", "Use a USB hub to transfer data"],
    correctIndex: 1, explanation: "Disk cloning software creates an exact replica of the source drive, including the boot sector and hidden partitions, ensuring the new drive is fully bootable.",
  },
  {
    id: 60, category: "A+",
    question: "Which Windows tool is BEST for analyzing which applications and processes are using the most network bandwidth?",
    options: ["Event Viewer", "Disk Cleanup", "System Restore", "Task Manager > Performance > Wi-Fi or Ethernet"],
    correctIndex: 3, explanation: "Task Manager's Performance tab shows real-time network usage. The Processes tab also shows network usage per application.",
  },
  {
    id: 61, category: "A+",
    question: "What is the MAIN purpose of a UPS (Uninterruptible Power Supply) in a home office setup?",
    options: ["To cool the computer", "To charge mobile devices", "To increase internet speed", "To provide temporary battery backup during power outages so the user can save work and shut down safely"],
    correctIndex: 3, explanation: "A UPS provides battery backup during short power outages, giving the user time to save work and perform a clean shutdown to prevent data loss.",
  },
  {
    id: 62, category: "A+",
    question: "A technician needs to boot a PC from a USB flash drive containing Windows installation media. What setting must be changed FIRST?",
    options: ["Boot order in BIOS/UEFI to prioritize USB", "Screen resolution", "Uninstall antivirus", "Disable Wi-Fi"],
    correctIndex: 0, explanation: "The BIOS/UEFI boot order must be configured so the USB drive is checked before the internal hard drive. This is done in the Boot menu of the firmware setup.",
  },
  {
    id: 63, category: "A+",
    question: "Which feature in Windows allows multiple users to use the same computer while keeping their files, settings, and applications separate?",
    options: ["Remote Desktop", "Disk Management", "User Accounts / Profiles", "BitLocker"],
    correctIndex: 2, explanation: "Each Windows user account has an independent profile containing personal files, desktop settings, and application data, keeping users isolated from each other.",
  },
  {
    id: 64, category: "A+",
    question: "What is the function of the Northbridge (or the modern CPU-integrated equivalent) on a motherboard?",
    options: ["Manages low-speed peripherals like USB and SATA", "Controls fan speeds only", "Provides Wi-Fi", "Handles high-speed communication between CPU, RAM, and graphics (PCIe)"],
    correctIndex: 3, explanation: "The Northbridge historically managed high-speed pathways (CPU-RAM-GPU). In modern CPUs, these functions are integrated directly into the processor die.",
  },
  {
    id: 65, category: "A+",
    question: "A user wants to improve airflow inside their desktop case to reduce CPU temperatures. Which action is MOST effective?",
    options: ["Painting the case black", "Installing additional intake and exhaust case fans, ensuring unobstructed airflow paths", "Adding a decorative LED strip", "Replacing the monitor"],
    correctIndex: 1, explanation: "Proper case ventilation with intake fans at the front/bottom and exhaust fans at the top/rear creates airflow that removes hot air and draws in cool air.",
  },
  {
    id: 66, category: "A+",
    question: "What does the Windows command 'ipconfig /release' followed by 'ipconfig /renew' accomplish?",
    options: ["Releases the current DHCP lease and requests a new IP address", "Scans for viruses", "Updates the BIOS", "Formats the hard drive"],
    correctIndex: 0, explanation: "ipconfig /release drops the current DHCP-assigned IP. ipconfig /renew sends a new DHCP Discover to obtain a fresh IP address from the server.",
  },
  {
    id: 67, category: "A+",
    question: "Which component on a motherboard stores the BIOS/UEFI firmware itself?",
    options: ["Flash ROM / EEPROM chip", "CPU cache", "CMOS battery", "RAM module"],
    correctIndex: 0, explanation: "The BIOS/UEBI firmware is stored in a flash ROM (EEPROM) chip on the motherboard. The CMOS battery only keeps settings and the clock alive, not the firmware.",
  },
  {
    id: 68, category: "A+",
    question: "A Windows PC displays 'BOOTMGR is compressed' on startup. What caused this and how can it be fixed?",
    options: ["The PSU is failing; replace it", "The CPU is overheating; clean the fans", "The boot partition was accidentally compressed; boot from recovery media and uncompress the boot partition", "The monitor cable is loose; replace it"],
    correctIndex: 2, explanation: "If the system partition is compressed (e.g., by checking 'Compress this drive' on C:), BOOTMGR cannot read the compressed boot files. Use WinRE to uncompress the boot files.",
  },
  {
    id: 69, category: "A+",
    question: "Which Windows utility provides detailed information about hardware resources, components, and software environment?",
    options: ["Paint", "System Information (msinfo32)", "Calculator", "Notepad"],
    correctIndex: 1, explanation: "msinfo32.exe (System Information) provides a comprehensive overview of hardware resources, components, BIOS version, drivers, and running services.",
  },
  {
    id: 70, category: "A+",
    question: "What does the SMART (Self-Monitoring, Analysis, and Reporting Technology) status of a hard drive indicate?",
    options: ["The drive's internet connectivity", "The drive's health and likelihood of imminent failure based on internal diagnostics", "The drive's color temperature", "The drive's warranty expiration date"],
    correctIndex: 1, explanation: "SMART monitors internal drive parameters like reallocated sectors, temperature, and read/write errors. A 'SMART failure predicted' warning means the drive is likely to fail soon.",
  },
  {
    id: 71, category: "A+",
    question: "A user reports that after moving their computer to a new desk, the Ethernet connection no longer works. What should be checked FIRST?",
    options: ["Verify the Ethernet cable is securely connected and test with a known-good cable", "Replace the CPU", "Replace the monitor", "Reinstall Windows"],
    correctIndex: 0, explanation: "Physical layer issues (loose cable, damaged RJ45 connector, bad cable) are the most common cause of sudden Ethernet failures after moving equipment.",
  },
  {
    id: 72, category: "A+",
    question: "Which type of printer uses a print head with tiny nozzles that spray liquid ink onto paper?",
    options: ["Dot matrix printer", "Laser printer", "Inkjet printer", "Thermal printer"],
    correctIndex: 2, explanation: "Inkjet printers use liquid ink sprayed through microscopic nozzles. Laser printers use toner and heat; dot matrix uses impact pins; thermal uses heat-sensitive paper.",
  },
  {
    id: 73, category: "A+",
    question: "What is the function of the Windows Registry?",
    options: ["It stores user documents", "It stores the operating system and application configuration settings", "It acts as the web browser", "It provides antivirus protection"],
    correctIndex: 1, explanation: "The Windows Registry is a hierarchical database storing configuration data for the OS, hardware, drivers, services, and applications. Regedit is the tool to view and modify it.",
  },
  {
    id: 74, category: "A+",
    question: "Which command in Windows opens the System Configuration utility, allowing control of startup programs and boot options?",
    options: ["services.msc", "appwiz.cpl", "msconfig", "devmgmt.msc"],
    correctIndex: 2, explanation: "msconfig (System Configuration) lets you manage startup items, boot options, services, and startup diagnostics like Safe Mode boot.",
  },
  {
    id: 75, category: "A+",
    question: "A user wants to run an older Windows 7 application on Windows 11, but it fails to install. Which feature might help?",
    options: ["Compatibility Mode (right-click > Properties > Compatibility)", "Windows Sandbox", "Disk Defragmenter", "Windows Memory Diagnostic"],
    correctIndex: 0, explanation: "Compatibility Mode allows a program to run with settings from a previous Windows version, often resolving issues with legacy applications.",
  },
  {
    id: 76, category: "A+",
    question: "What is the difference between a docking station and a port replicator?",
    options: ["A port replicator provides charging; a docking station does not", "A docking station provides additional ports and may include power/charging; a port replicator only adds ports", "A docking station only works with laptops", "They are identical terms"],
    correctIndex: 1, explanation: "A docking station typically replicates ports AND provides power delivery for charging. A port replicator only expands port availability without power.",
  },
  {
    id: 77, category: "A+",
    question: "Which Windows feature creates a complete image of the system drive for disaster recovery?",
    options: ["File History", "System Restore", "Disk Cleanup", "System Image Backup"],
    correctIndex: 3, explanation: "System Image Backup creates a snapshot of the entire system drive, which can be restored from external media to recover from catastrophic failures.",
  },
  {
    id: 78, category: "A+",
    question: "A computer intermittently shuts down without warning during heavy gaming. What is the MOST likely cause?",
    options: ["The speakers are too loud", "The keyboard is malfunctioning", "The CPU or GPU is overheating, triggering a thermal shutdown", "The monitor is too bright"],
    correctIndex: 2, explanation: "Gaming generates significant heat. If cooling is inadequate (blocked vents, failed fans, dried thermal paste), the CPU/GPU hits thermal limits and the system shuts down to protect itself.",
  },
  {
    id: 79, category: "A+",
    question: "Which type of expansion slot is used by most modern discrete graphics cards?",
    options: ["PCIe x16", "ISA", "AGP", "PCI (legacy 32-bit)"],
    correctIndex: 0, explanation: "Modern GPUs use a PCIe x16 slot, providing the high-bandwidth connection needed for modern graphics workloads. AGP and PCI are obsolete for graphics.",
  },
  {
    id: 80, category: "A+",
    question: "A user accidentally deleted an important file from their Desktop. Assuming File History is enabled, where can they recover it from?",
    options: ["They cannot recover it", "The Recycle Bin first, then File History restore", "The CMOS battery stores deleted files", "They must reinstall Windows"],
    correctIndex: 1, explanation: "Check the Recycle Bin first. If emptied, File History (if configured) maintains previous versions of files and allows restoring from backup.",
  },
  {
    id: 81, category: "A+",
    question: "What is the primary advantage of an All-in-One (AIO) desktop computer over a traditional tower desktop?",
    options: ["Higher gaming performance", "Better cooling capacity", "Compact design with the computer built into the monitor, saving desk space", "More expansion slots"],
    correctIndex: 2, explanation: "AIOs integrate the motherboard, CPU, and storage behind the display panel. They save space but typically offer limited upgrade paths compared to tower desktops.",
  },
  {
    id: 82, category: "A+",
    question: "A technician is upgrading a desktop and needs to determine the maximum RAM capacity. Where is this information BEST found?",
    options: ["The monitor resolution", "The CPU brand logo", "The motherboard manual or manufacturer's website specifications", "The power supply wattage rating"],
    correctIndex: 2, explanation: "The motherboard manual or manufacturer's spec page lists supported RAM type, speed, maximum capacity, and slot configuration.",
  },
  {
    id: 83, category: "A+",
    question: "Which Windows feature allows an administrator to run a program with elevated privileges?",
    options: ["Guest account", "Sleep mode", "Run as administrator", "Hibernate"],
    correctIndex: 2, explanation: "Right-clicking a program and choosing 'Run as administrator' launches it with elevated UAC privileges, allowing changes to protected system areas.",
  },
  {
    id: 84, category: "A+",
    question: "What is the purpose of a loopback plug when troubleshooting a network port?",
    options: ["To test whether a network port can send and receive its own signal, verifying the port hardware", "To increase internet speed", "To encrypt network traffic", "To connect two computers directly"],
    correctIndex: 0, explanation: "A loopback plug connects the transmit and receive pins of a network port, allowing the NIC to test itself by sending and receiving its own signal.",
  },
  {
    id: 85, category: "A+",
    question: "Which Windows command displays all active TCP connections and listening ports?",
    options: ["netstat -an", "nslookup", "tracert", "ipconfig"],
    correctIndex: 0, explanation: "netstat -an shows all active connections, listening ports, and their associated protocol (TCP/UDP) and state. Add -b to show the owning process.",
  },
  {
    id: 86, category: "A+",
    question: "A technician is replacing a CMOS battery. What tool is typically required?",
    options: ["Small flathead screwdriver or plastic spudger to pop the CR2032 out of the clip", "Wrench", "Hammer", "Soldering iron"],
    correctIndex: 0, explanation: "CMOS batteries (CR2032 coin cells) are held in a spring clip. A small flathead or plastic spudger gently releases the clip to remove the battery.",
  },
  {
    id: 87, category: "A+",
    question: "Which Windows Update troubleshooting step can resolve a stuck or failed update?",
    options: ["Run the Windows Update troubleshooter from Settings > System > Troubleshoot > Other troubleshooters", "Replace the monitor", "Disable the firewall permanently", "Delete all user files"],
    correctIndex: 0, explanation: "The built-in Windows Update troubleshooter detects and automatically resolves common update issues like corrupted update files or service problems.",
  },
  {
    id: 88, category: "A+",
    question: "What does an SSD's TBW (Terabytes Written) rating indicate?",
    options: ["The total amount of data the drive is rated to write over its lifetime before potential failure", "The warranty period in years", "The drive's read speed", "The drive's temperature limit"],
    correctIndex: 0, explanation: "TBW is the manufacturer's endurance rating — the total terabytes of data the SSD is designed to write before wear-out. Higher TBW = longer lifespan for write-heavy workloads.",
  },
  {
    id: 89, category: "A+",
    question: "A technician needs to run a memory diagnostic on a PC that crashes randomly. Which built-in Windows tool is designed for this?",
    options: ["Calculator", "Windows Memory Diagnostic", "Notepad", "Disk Cleanup"],
    correctIndex: 1, explanation: "Windows Memory Diagnostic performs a thorough test of RAM modules on the next reboot, detecting errors that cause random crashes and blue screens.",
  },
  {
    id: 90, category: "A+",
    question: "Which Windows security feature prevents unauthorized applications from making changes to protected system areas?",
    options: ["Sleep mode", "User Account Control (UAC)", "Remote Desktop", "Disk Defragmenter"],
    correctIndex: 1, explanation: "UAC prompts the user for elevation when a program attempts to make system-level changes, preventing unauthorized or accidental modifications to protected areas.",
  },
  {
    id: 91, category: "Network+",
    question: "Which OSI layer is responsible for logical addressing (IP addresses) and routing packets across networks?",
    options: ["Layer 7 – Application", "Layer 2 – Data Link", "Layer 4 – Transport", "Layer 3 – Network"],
    correctIndex: 3, explanation: "Layer 3 (Network) handles logical addressing using IP and routes packets between different networks via routers.",
  },
  {
    id: 92, category: "Network+",
    question: "What is the default subnet mask for a Class C IP address?",
    options: ["255.255.255.0", "255.255.255.128", "255.0.0.0", "255.255.0.0"],
    correctIndex: 0, explanation: "Class C networks default to a /24 subnet mask (255.255.255.0), providing up to 254 usable host addresses.",
  },
  {
    id: 93, category: "Network+",
    question: "Which protocol dynamically assigns IP addresses to hosts on a network?",
    options: ["ARP", "SNMP", "DHCP", "DNS"],
    correctIndex: 2, explanation: "DHCP (port 67/68) automatically assigns IP addresses, subnet masks, default gateways, and DNS server addresses to clients.",
  },
  {
    id: 94, category: "Network+",
    question: "A network administrator wants to segment a single physical LAN into multiple logical broadcast domains. Which technology accomplishes this?",
    options: ["STP", "NAT", "VLAN", "QoS"],
    correctIndex: 2, explanation: "VLANs logically segment a switched network into separate broadcast domains without requiring additional physical hardware.",
  },
  {
    id: 95, category: "Network+",
    question: "Which routing protocol uses hop count as its only metric and has a maximum hop count of 15?",
    options: ["BGP", "RIP", "EIGRP", "OSPF"],
    correctIndex: 1, explanation: "RIP uses hop count as its sole metric and treats any destination more than 15 hops away as unreachable.",
  },
  {
    id: 96, category: "Network+",
    question: "What does NAT stand for, and what is its primary function?",
    options: ["Network Allocation Table", "Network Access Token", "Node Assignment Table", "Network Address Translation — maps private IPs to a public IP"],
    correctIndex: 3, explanation: "NAT translates private (RFC 1918) IP addresses to public IPs, allowing multiple internal hosts to share a single public IP.",
  },
  {
    id: 97, category: "Network+",
    question: "Which wireless standard introduced MU-MIMO and operates exclusively on 5 GHz with theoretical speeds up to 3.5 Gbps?",
    options: ["802.11ac (Wi-Fi 5)", "802.11a", "802.11n", "802.11ax (Wi-Fi 6)"],
    correctIndex: 0, explanation: "802.11ac introduced MU-MIMO, operates only on 5 GHz, and achieves theoretical speeds up to ~3.5 Gbps.",
  },
  {
    id: 98, category: "Network+",
    question: "Which port number does HTTPS use by default?",
    options: ["80", "143", "443", "8080"],
    correctIndex: 2, explanation: "HTTPS uses port 443. HTTP uses port 80.",
  },
  {
    id: 99, category: "Network+",
    question: "A network engineer wants to prevent switching loops in a redundant LAN topology. Which protocol should be implemented?",
    options: ["LLDP", "CDP", "LACP", "STP (802.1D)"],
    correctIndex: 3, explanation: "STP prevents switching loops by placing redundant ports in a blocking state while maintaining a loop-free path.",
  },
  {
    id: 100, category: "Network+",
    question: "Which cable type is required for Gigabit Ethernet (1000BASE-T) at distances up to 100 meters?",
    options: ["Cat 6 UTP", "Cat 5e UTP", "Cat 5 UTP", "Cat 3 UTP"],
    correctIndex: 1, explanation: "1000BASE-T requires Cat 5e or better UTP cabling, which supports all four wire pairs at up to 100 m.",
  },
  {
    id: 101, category: "Network+",
    question: "What type of DNS record maps a hostname to an IPv4 address?",
    options: ["AAAA record", "CNAME record", "MX record", "A record"],
    correctIndex: 3, explanation: "An A record maps a domain name to a 32-bit IPv4 address. AAAA records map to 128-bit IPv6 addresses.",
  },
  {
    id: 102, category: "Network+",
    question: "An administrator needs to connect two geographically separated offices over the public internet with an encrypted tunnel. Which technology is BEST suited?",
    options: ["DHCP relay", "VLAN", "VPN", "STP"],
    correctIndex: 2, explanation: "A VPN creates an encrypted tunnel over a public network, effectively linking two remote sites as if they were on the same private network.",
  },
  {
    id: 103, category: "Network+",
    question: "Which IPv6 address type is equivalent to an IPv4 private address and is only routable within a local network segment?",
    options: ["Loopback (::1/128)", "Multicast (FF00::/8)", "Link-local (FE80::/10)", "Global unicast (2000::/3)"],
    correctIndex: 2, explanation: "Link-local addresses (FE80::/10) are automatically assigned to every IPv6 interface and are only valid on the local segment.",
  },
  {
    id: 104, category: "Network+",
    question: "Which protocol sends ICMP Echo Request packets to test reachability and measure round-trip time to a remote host?",
    options: ["nslookup", "netstat", "ping", "traceroute"],
    correctIndex: 2, explanation: "ping uses ICMP Echo Request/Reply to test connectivity and measure latency.",
  },
  {
    id: 105, category: "Network+",
    question: "A network uses the address 192.168.10.0/26. How many usable host addresses does this subnet provide?",
    options: ["30", "62", "126", "254"],
    correctIndex: 1, explanation: "A /26 mask has 6 host bits, providing 2^6 = 64 addresses. Subtract 2 (network and broadcast), leaving 62 usable hosts.",
  },
  {
    id: 106, category: "Network+",
    question: "Which network device operates at Layer 2 and makes forwarding decisions based on MAC addresses?",
    options: ["Hub", "Firewall", "Layer 2 Switch", "Router"],
    correctIndex: 2, explanation: "A Layer 2 switch builds a MAC address table and forwards frames based on destination MAC, reducing unnecessary broadcast traffic.",
  },
  {
    id: 107, category: "Network+",
    question: "What does PoE (Power over Ethernet) allow?",
    options: ["Providing redundant power paths for switches", "Transferring data at higher speeds using power line frequencies", "Delivering electrical power to devices over standard Ethernet cabling", "Encrypting Ethernet frames automatically"],
    correctIndex: 2, explanation: "PoE (IEEE 802.3af/at/bt) delivers DC power over Ethernet cables, eliminating separate power adapters for IP phones, cameras, and APs.",
  },
  {
    id: 108, category: "Network+",
    question: "Which DHCP process step does a client use to officially request the IP address offered by a DHCP server?",
    options: ["Offer", "Acknowledge", "Request", "Discover"],
    correctIndex: 2, explanation: "DORA: Discover → Offer → Request (client formally requests the offered IP) → Acknowledge (server confirms).",
  },
  {
    id: 109, category: "Network+",
    question: "Which routing protocol is used between autonomous systems on the internet?",
    options: ["RIP", "OSPF", "BGP", "EIGRP"],
    correctIndex: 2, explanation: "BGP is the exterior gateway protocol used between autonomous systems and is the routing protocol of the internet.",
  },
  {
    id: 110, category: "Network+",
    question: "A switch port receives more MAC address entries than it can hold and begins flooding traffic to all ports. What attack is this characteristic of?",
    options: ["MAC flooding", "Man-in-the-middle", "VLAN hopping", "ARP poisoning"],
    correctIndex: 0, explanation: "MAC flooding overwhelms a switch's CAM table, causing it to fail open and flood traffic to all ports.",
  },
  {
    id: 111, category: "Network+",
    question: "Which fiber optic cable type uses a very narrow core and is designed for long-distance transmission using a single light mode?",
    options: ["Multimode OM1", "Plenum-rated", "Single-mode OS2", "Multimode OM4"],
    correctIndex: 2, explanation: "Single-mode fiber has a very small core (~8–10 µm) and supports transmission distances of up to 100 km+.",
  },
  {
    id: 112, category: "Network+",
    question: "Which protocol is used to monitor and manage network devices and can send traps to alert administrators of events?",
    options: ["FTP", "LDAP", "SMTP", "SNMP"],
    correctIndex: 3, explanation: "SNMP (ports 161/162) monitors network devices. Agents send traps to an NMS when events occur.",
  },
  {
    id: 113, category: "Network+",
    question: "Which wireless security protocol introduced SAE to prevent offline dictionary attacks?",
    options: ["WPA2-Personal", "WEP", "WPA", "WPA3"],
    correctIndex: 3, explanation: "WPA3 replaced WPA2 and introduced SAE, providing stronger protection against brute-force and offline dictionary attacks.",
  },
  {
    id: 114, category: "Network+",
    question: "A company deploys multiple servers behind a single IP address to distribute incoming traffic. Which technology is being used?",
    options: ["Load balancer", "NAT", "Proxy server", "VLAN"],
    correctIndex: 0, explanation: "A load balancer distributes incoming requests across multiple backend servers for performance and high availability.",
  },
  {
    id: 115, category: "Network+",
    question: "Which port does the SSH protocol use by default?",
    options: ["23", "21", "25", "22"],
    correctIndex: 3, explanation: "SSH uses TCP port 22. It provides encrypted terminal access, replacing insecure Telnet (port 23).",
  },
  {
    id: 116, category: "Network+",
    question: "Which network topology provides the HIGHEST redundancy where every node is connected to every other node?",
    options: ["Star", "Full mesh", "Ring", "Bus"],
    correctIndex: 1, explanation: "In a full mesh topology, every device has a direct point-to-point link to every other device, providing maximum redundancy at the highest cost.",
  },
  {
    id: 117, category: "Network+",
    question: "Which standard provides port-based Network Access Control, requiring devices to authenticate before accessing the network?",
    options: ["802.1X", "802.11i", "802.3af", "802.1Q"],
    correctIndex: 0, explanation: "IEEE 802.1X enforces port-based NAC: a device must authenticate via EAP/RADIUS before the switch port grants network access.",
  },
  {
    id: 118, category: "Network+",
    question: "A technician runs 'ipconfig /all' and sees an IP address of 169.254.x.x. What does this indicate?",
    options: ["Static IP is configured correctly", "The device is on a public network", "The device failed to receive an IP from a DHCP server and assigned itself an APIPA address", "The DNS server is unreachable"],
    correctIndex: 2, explanation: "169.254.0.0/16 is the APIPA range. Windows assigns an APIPA address when a DHCP server cannot be reached.",
  },
  {
    id: 119, category: "Network+",
    question: "Which command on a Windows system displays the current routing table?",
    options: ["netstat -r (or route print)", "arp -a", "ipconfig /all", "nslookup"],
    correctIndex: 0, explanation: "netstat -r (or route print) displays the IP routing table, showing destinations, subnet masks, gateways, and interfaces.",
  },
  {
    id: 120, category: "Network+",
    question: "A network technician connects two switches using a port that can carry traffic from multiple VLANs. What type of port is this called?",
    options: ["Mirror port", "Access port", "Trunk port", "Hybrid port"],
    correctIndex: 2, explanation: "A trunk port carries traffic from multiple VLANs between switches, tagging frames with 802.1Q headers.",
  },
  {
    id: 121, category: "Network+",
    question: "Which layer of the OSI model is responsible for establishing, managing, and terminating sessions between applications?",
    options: ["Layer 4 – Transport", "Layer 3 – Network", "Layer 6 – Presentation", "Layer 5 – Session"],
    correctIndex: 3, explanation: "Layer 5 (Session) manages dialog control, synchronization, and session establishment/termination between applications.",
  },
  {
    id: 122, category: "Network+",
    question: "What is the maximum length of a Cat 6 Ethernet cable run for reliable 1 Gbps operation?",
    options: ["300 meters", "50 meters", "150 meters", "100 meters"],
    correctIndex: 3, explanation: "The maximum recommended length for twisted-pair Ethernet cabling (Cat 5e, Cat 6, Cat 6a) is 100 meters for reliable signal integrity.",
  },
  {
    id: 123, category: "Network+",
    question: "Which network device repeats and regenerates signals to extend the maximum distance of a network segment?",
    options: ["Hub", "Switch", "Repeater", "Router"],
    correctIndex: 2, explanation: "A repeater amplifies and regenerates signals at the physical layer, extending the maximum distance of a cable segment beyond standard limits.",
  },
  {
    id: 124, category: "Network+",
    question: "Which protocol is responsible for resolving IP addresses to MAC addresses on a local network segment?",
    options: ["ICMP", "ARP", "DNS", "DHCP"],
    correctIndex: 1, explanation: "ARP (Address Resolution Protocol) resolves a known IP address to its corresponding MAC address for Layer 2 communication on the local segment.",
  },
  {
    id: 125, category: "Network+",
    question: "A network uses the address range 10.0.0.0/8. What type of IP address range is this?",
    options: ["Loopback range", "Public IP range", "Multicast range", "Private IP range (RFC 1918)"],
    correctIndex: 3, explanation: "10.0.0.0/8 is one of the three RFC 1918 private IP ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16) used for internal networks.",
  },
  {
    id: 126, category: "Network+",
    question: "Which tool is used to trace the route packets take across multiple routers to reach a destination?",
    options: ["nslookup", "ping", "ipconfig", "tracert (traceroute)"],
    correctIndex: 3, explanation: "tracert (Windows) or traceroute (Linux/macOS) traces the path through each router hop to a destination, showing latency at each step.",
  },
  {
    id: 127, category: "Network+",
    question: "What is the primary purpose of a default gateway in a TCP/IP configuration?",
    options: ["To block unauthorized traffic", "To assign IP addresses automatically", "To route traffic destined for remote networks outside the local subnet", "To provide DNS resolution"],
    correctIndex: 2, explanation: "The default gateway is the router's IP on the local subnet. Traffic destined for other networks is forwarded to the default gateway for routing.",
  },
  {
    id: 128, category: "Network+",
    question: "Which protocol and port combination is used for sending email from a client to a mail server?",
    options: ["HTTP / port 80", "SMTP / port 25", "POP3 / port 110", "IMAP / port 143"],
    correctIndex: 1, explanation: "SMTP (Simple Mail Transfer Protocol, port 25) is used for sending email. POP3 (110) and IMAP (143) are for receiving mail.",
  },
  {
    id: 129, category: "Network+",
    question: "Which wireless channel width does 802.11n support to achieve higher throughput?",
    options: ["20 MHz only", "160 MHz", "80 MHz", "40 MHz (channel bonding)"],
    correctIndex: 3, explanation: "802.11n introduced 40 MHz channel bonding, combining two 20 MHz channels to double throughput. 80/160 MHz were introduced in 802.11ac/ax.",
  },
  {
    id: 130, category: "Network+",
    question: "A technician configures a switch port to belong to only ONE VLAN and does not carry 802.1Q tags. What type of port is this?",
    options: ["Dynamic port", "Native port", "Trunk port", "Access port"],
    correctIndex: 3, explanation: "An access port is assigned to a single VLAN and does not tag frames. End-user devices connect to access ports.",
  },
  {
    id: 131, category: "Network+",
    question: "Which WAN technology uses existing telephone lines to provide broadband internet access?",
    options: ["Satellite", "DSL (Digital Subscriber Line)", "Metro Ethernet", "Fiber optic"],
    correctIndex: 1, explanation: "DSL uses standard copper telephone lines to transmit digital data at broadband speeds over the same line used for voice calls.",
  },
  {
    id: 132, category: "Network+",
    question: "What is the purpose of a DNS CNAME record?",
    options: ["To map a domain to an IPv4 address", "To create an alias that points one hostname to another hostname", "To specify a mail server", "To specify an IPv6 address"],
    correctIndex: 1, explanation: "A CNAME (Canonical Name) record creates an alias. For example, 'www.example.com' can be a CNAME pointing to 'server.example.com'.",
  },
  {
    id: 133, category: "Network+",
    question: "Which device can inspect packet contents and make forwarding decisions based on application-layer data?",
    options: ["Repeater", "Hub", "Layer 7 switch / Application Delivery Controller (ADC)", "Layer 2 switch"],
    correctIndex: 2, explanation: "A Layer 7 switch (or ADC/Load Balancer) can inspect application-layer data (HTTP headers, SSL certificates) to make intelligent routing decisions.",
  },
  {
    id: 134, category: "Network+",
    question: "What does the term 'collision domain' refer to in networking?",
    options: ["A group of devices that can receive broadcast frames", "A network segment where data packets can collide with each other", "A VLAN configured for guest access", "A secure zone protected by a firewall"],
    correctIndex: 1, explanation: "A collision domain is a network segment where simultaneous transmissions can collide. Switches isolate each port into its own collision domain; hubs create one shared collision domain.",
  },
  {
    id: 135, category: "Network+",
    question: "Which WAN technology provides dedicated, symmetrical bandwidth over fiber and is often used by businesses?",
    options: ["Cable internet", "DSL", "Metro Ethernet / Leased Line", "Dial-up"],
    correctIndex: 2, explanation: "Metro Ethernet and dedicated leased lines provide symmetrical, guaranteed-bandwidth fiber connections ideal for business environments.",
  },
  {
    id: 136, category: "Network+",
    question: "Which command on a Cisco router displays the current configuration stored in volatile memory?",
    options: ["show version", "show running-config", "show startup-config", "show interfaces"],
    correctIndex: 1, explanation: "show running-config displays the active configuration in RAM. show startup-config shows the saved config in NVRAM that loads on boot.",
  },
  {
    id: 137, category: "Network+",
    question: "A technician needs to combine multiple physical network links between two switches to increase bandwidth and provide redundancy. Which technology does this?",
    options: ["NAT", "Link Aggregation (LACP/802.3ad)", "VLAN", "STP"],
    correctIndex: 1, explanation: "Link Aggregation (LACP, 802.3ad) bundles multiple physical links into a single logical link, increasing bandwidth and providing failover redundancy.",
  },
  {
    id: 138, category: "Network+",
    question: "Which wireless frequency band offers more non-overlapping channels but has shorter range and poorer wall penetration?",
    options: ["900 MHz", "60 GHz", "5 GHz", "2.4 GHz"],
    correctIndex: 2, explanation: "5 GHz offers up to 24+ non-overlapping channels and less interference, but signals attenuate faster through walls and cover shorter distances than 2.4 GHz.",
  },
  {
    id: 139, category: "Network+",
    question: "What is the purpose of an MTU (Maximum Transmission Unit) in networking?",
    options: ["To define the largest packet size that can be transmitted without fragmentation", "To limit the number of VLANs on a switch", "To restrict the number of DHCP leases", "To set the maximum number of MAC addresses"],
    correctIndex: 0, explanation: "MTU defines the maximum packet size a network can transmit. The default Ethernet MTU is 1500 bytes. Jumbo frames use 9000 bytes.",
  },
  {
    id: 140, category: "Network+",
    question: "Which protocol does a web browser use to securely retrieve a web page from a server?",
    options: ["Telnet", "HTTP", "HTTPS", "FTP"],
    correctIndex: 2, explanation: "HTTPS (HTTP Secure) uses TLS/SSL encryption to protect data in transit between the browser and the web server.",
  },
  {
    id: 141, category: "Network+",
    question: "Which device operates at Layer 3 and makes forwarding decisions based on IP addresses?",
    options: ["Router", "Hub", "Bridge", "Layer 2 switch"],
    correctIndex: 0, explanation: "Routers operate at Layer 3 (Network layer) and forward packets between networks based on destination IP addresses.",
  },
  {
    id: 142, category: "Network+",
    question: "A technician needs to test if a specific TCP port on a remote server is open and listening. Which tool is BEST for this?",
    options: ["arp -a", "ping", "telnet or Test-NetConnection", "nslookup"],
    correctIndex: 2, explanation: "telnet or Test-NetConnection (PowerShell) can test whether a specific TCP port is open on a remote host, confirming the service is listening.",
  },
  {
    id: 143, category: "Network+",
    question: "What does the term 'jitter' refer to in network performance?",
    options: ["Variation in packet arrival time / latency inconsistency", "Packet loss percentage", "Total data transmitted", "Maximum bandwidth"],
    correctIndex: 0, explanation: "Jitter measures the variation in packet delay. High jitter causes problems for real-time applications like VoIP and video conferencing.",
  },
  {
    id: 144, category: "Network+",
    question: "Which TCP/IP protocol provides reliable, connection-oriented data delivery with acknowledgments and retransmissions?",
    options: ["TCP", "ARP", "ICMP", "UDP"],
    correctIndex: 0, explanation: "TCP provides reliable, connection-oriented delivery with sequence numbers, acknowledgments, retransmissions, and flow control. UDP is connectionless and unreliable.",
  },
  {
    id: 145, category: "Network+",
    question: "A company wants to prioritize VoIP traffic over web browsing traffic during network congestion. Which technology accomplishes this?",
    options: ["VLAN", "NAT", "STP", "QoS (Quality of Service)"],
    correctIndex: 3, explanation: "QoS marks and prioritizes traffic types (e.g., DSCP markings for VoIP), ensuring critical applications receive bandwidth during congestion.",
  },
  {
    id: 146, category: "Network+",
    question: "What is the purpose of a subnet mask in IP addressing?",
    options: ["To assign MAC addresses", "To determine which portion of an IP address represents the network and which represents the host", "To encrypt network traffic", "To provide DNS resolution"],
    correctIndex: 1, explanation: "The subnet mask separates the network portion (left side, all 1s) from the host portion (right side, all 0s) of an IP address.",
  },
  {
    id: 147, category: "Network+",
    question: "Which tool is commonly used to analyze network traffic by capturing packets from a network interface?",
    options: ["Paint", "Wireshark", "Notepad", "Calculator"],
    correctIndex: 1, explanation: "Wireshark is a network protocol analyzer that captures and inspects packets at a granular level for troubleshooting and security analysis.",
  },
  {
    id: 148, category: "Network+",
    question: "A technician needs to allow a specific service through a firewall. What configuration is required?",
    options: ["Replace the network card", "Disable the firewall entirely", "Reinstall the operating system", "Create an access rule / port rule allowing the specific port or application"],
    correctIndex: 3, explanation: "A firewall rule explicitly allows traffic on the required port/protocol or for the specific application, maintaining security while permitting legitimate traffic.",
  },
  {
    id: 149, category: "Network+",
    question: "Which standard defines the physical and data link layers for Ethernet networking?",
    options: ["IEEE 802.15", "IEEE 802.11", "IEEE 802.1X", "IEEE 802.3"],
    correctIndex: 3, explanation: "IEEE 802.3 defines Ethernet standards for physical cabling, signaling, and MAC layer operation. 802.11 is Wi-Fi.",
  },
  {
    id: 150, category: "Network+",
    question: "A network has run out of available IPv4 addresses. Which technology can extend the lifespan of the IPv4 address space?",
    options: ["Switch to IPv6", "Implement NAT", "Disable DHCP", "Use Class A addresses only"],
    correctIndex: 1, explanation: "NAT allows multiple private IP devices to share a single public IP, dramatically reducing the number of public IPv4 addresses needed.",
  },
  {
    id: 151, category: "Network+",
    question: "Which layer of the OSI model is responsible for encrypting, compressing, and translating data formats?",
    options: ["Layer 4 – Transport", "Layer 6 – Presentation", "Layer 5 – Session", "Layer 7 – Application"],
    correctIndex: 1, explanation: "Layer 6 (Presentation) handles data translation, encryption, and compression so the Application layer receives readable data.",
  },
  {
    id: 152, category: "Network+",
    question: "What is the primary function of a proxy server?",
    options: ["To act as an intermediary between clients and destination servers, providing caching, filtering, and anonymity", "To amplify Wi-Fi signals", "To assign IP addresses", "To route between VLANs"],
    correctIndex: 0, explanation: "A proxy server forwards client requests, can cache content for faster access, filter traffic, and hide client IP addresses.",
  },
  {
    id: 153, category: "Network+",
    question: "Which wireless encryption standard was the first to use AES encryption instead of RC4?",
    options: ["WEP", "WPA2", "WPA (TKIP)", "WPA3"],
    correctIndex: 1, explanation: "WPA2 was the first to mandate AES-CCMP encryption, replacing the weaker RC4/TKIP used in WPA. WEP is the oldest and weakest.",
  },
  {
    id: 154, category: "Network+",
    question: "Which term describes the amount of data that can be transmitted over a network in a given time period?",
    options: ["Bandwidth", "Latency", "Jitter", "Packet loss"],
    correctIndex: 0, explanation: "Bandwidth is the maximum data transfer capacity of a network link, measured in bits per second (Mbps, Gbps).",
  },
  {
    id: 155, category: "Network+",
    question: "A technician is configuring a router and needs to set the interface's IP address and subnet mask. Which configuration mode is used?",
    options: ["Privileged EXEC mode", "Interface configuration mode", "User EXEC mode", "Global configuration mode"],
    correctIndex: 1, explanation: "Interface configuration mode (e.g., interface gi0/0/1) is where you assign IP addresses, enable interfaces, and set interface-specific parameters.",
  },
  {
    id: 156, category: "Network+",
    question: "Which type of DNS record specifies the mail server responsible for accepting email on behalf of a domain?",
    options: ["CNAME record", "A record", "TXT record", "MX record"],
    correctIndex: 3, explanation: "MX (Mail Exchange) records specify the mail servers that handle email for a domain, including priority values for failover.",
  },
  {
    id: 157, category: "Network+",
    question: "What does the acronym SDN stand for in modern networking?",
    options: ["Serial Data Node", "Static Domain Name", "Secure Data Network", "Software-Defined Networking"],
    correctIndex: 3, explanation: "SDN (Software-Defined Networking) separates the control plane from the data plane, allowing centralized, programmable network management.",
  },
  {
    id: 158, category: "Network+",
    question: "Which networking concept divides a network into smaller, isolated segments to improve security and performance?",
    options: ["Bridging", "Subnetting", "Repeating", "Multicasting"],
    correctIndex: 1, explanation: "Subnetting divides a larger network into smaller subnets, reducing broadcast domains, improving security, and optimizing routing.",
  },
  {
    id: 159, category: "Network+",
    question: "Which wireless security mode is the WEAKEST and should NEVER be used?",
    options: ["WEP", "WPA2", "WPA3", "WPA"],
    correctIndex: 0, explanation: "WEP (Wired Equivalent Privacy) uses a weak RC4 implementation and static keys that can be cracked in minutes. It is considered obsolete and insecure.",
  },
  {
    id: 160, category: "Network+",
    question: "Which network device can translate between different network protocols at the application layer?",
    options: ["Gateway", "Router", "Bridge", "Hub"],
    correctIndex: 0, explanation: "A gateway can translate between different protocols (e.g., email to SMS, IPv4 to IPv6) and connect networks with different architectures.",
  },
  {
    id: 161, category: "Network+",
    question: "What is the primary purpose of a patch panel in a structured cabling system?",
    options: ["To provide internet access", "To organize and terminate cable runs from wall jacks, enabling easy moves, adds, and changes", "To amplify Wi-Fi signals", "To assign IP addresses"],
    correctIndex: 1, explanation: "A patch panel terminates structured cabling from wall outlets. Patch cables then connect these ports to switches, making network changes simple.",
  },
  {
    id: 162, category: "Network+",
    question: "Which TCP/IP protocol is connectionless, has low overhead, and is commonly used for DNS queries and streaming media?",
    options: ["TCP", "UDP", "FTP", "HTTP"],
    correctIndex: 1, explanation: "UDP is connectionless with minimal overhead. It is used for DNS, VoIP, video streaming, and gaming where speed matters more than reliability.",
  },
  {
    id: 163, category: "Network+",
    question: "A company needs to connect a remote branch office to the corporate headquarters securely over the internet. Which WAN technology is BEST?",
    options: ["Public Wi-Fi", "Site-to-Site VPN", "Bluetooth", "Dial-up"],
    correctIndex: 1, explanation: "A site-to-site VPN creates an encrypted tunnel between two locations over the internet, providing secure connectivity as if on the same LAN.",
  },
  {
    id: 164, category: "Network+",
    question: "Which network topology connects all devices to a central connection point (like a switch), and failure of one device does not affect others?",
    options: ["Star", "Bus", "Ring", "Mesh"],
    correctIndex: 0, explanation: "In a star topology, all devices connect to a central switch/hub. Failure of one endpoint does not affect other devices.",
  },
  {
    id: 165, category: "Network+",
    question: "What is the function of the Network Time Protocol (NTP)?",
    options: ["To synchronize the clocks of computers over a network", "To encrypt network traffic", "To assign IP addresses automatically", "To resolve domain names to IP addresses"],
    correctIndex: 0, explanation: "NTP synchronizes device clocks over a network, ensuring accurate timestamps for logs, certificates, and coordinated operations.",
  },
  {
    id: 166, category: "Network+",
    question: "Which WAN technology uses coaxial cable to deliver high-speed internet and shares bandwidth among neighborhood subscribers?",
    options: ["Cable internet (DOCSIS)", "DSL", "Fiber optic", "Satellite"],
    correctIndex: 0, explanation: "Cable internet uses DOCSIS over coaxial cable. Bandwidth is shared among subscribers in the same neighborhood, so speeds can vary during peak hours.",
  },
  {
    id: 167, category: "Network+",
    question: "Which command displays the MAC address table on a Cisco switch?",
    options: ["show ip route", "show version", "show running-config", "show mac address-table"],
    correctIndex: 3, explanation: "show mac address-table displays the CAM table, mapping MAC addresses to switch ports and VLANs for Layer 2 forwarding.",
  },
  {
    id: 168, category: "Network+",
    question: "Which network troubleshooting methodology involves working from the physical layer up to the application layer?",
    options: ["Bottom-up", "Top-down", "Trial and error", "Divide-and-conquer"],
    correctIndex: 0, explanation: "The bottom-up approach starts at Layer 1 (cables, power, hardware) and works upward. It is effective when the issue is suspected to be physical.",
  },
  {
    id: 169, category: "Network+",
    question: "Which protocol does an email client use to download email messages from a server while leaving a copy on the server?",
    options: ["IMAP", "POP3", "SMTP", "SNMP"],
    correctIndex: 0, explanation: "IMAP (port 143) allows clients to access and manage email on the server. POP3 typically downloads and deletes messages from the server.",
  },
  {
    id: 170, category: "Network+",
    question: "A network engineer sees excessive broadcast traffic on a flat network. Which solution BEST reduces broadcast domains?",
    options: ["Implement VLANs or subnetting", "Add more hubs", "Disable DHCP", "Increase the MTU"],
    correctIndex: 0, explanation: "VLANs and subnetting divide a large broadcast domain into smaller segments, reducing unnecessary broadcast traffic.",
  },
  {
    id: 171, category: "Network+",
    question: "Which network device inspects incoming traffic and permits or denies it based on a defined security policy?",
    options: ["Repeater", "Firewall", "Hub", "Switch"],
    correctIndex: 1, explanation: "A firewall enforces security policies by inspecting traffic and blocking unauthorized connections based on rules (IP, port, protocol, application).",
  },
  {
    id: 172, category: "Network+",
    question: "What is the primary purpose of a DMZ (Demilitarized Zone) in network architecture?",
    options: ["To provide Wi-Fi for guests only", "To encrypt all internal emails", "To block all internet traffic", "To host publicly accessible services (like web servers) in an isolated zone between the internal network and the internet"],
    correctIndex: 3, explanation: "A DMZ is a perimeter network hosting public-facing servers. It is isolated from the internal LAN by a firewall, limiting breach impact.",
  },
  {
    id: 173, category: "Network+",
    question: "Which 802.11 amendment introduced OFDMA, Target Wake Time, and improved efficiency for dense environments?",
    options: ["802.11n", "802.11be (Wi-Fi 7)", "802.11ac", "802.11ax (Wi-Fi 6)"],
    correctIndex: 3, explanation: "802.11ax (Wi-Fi 6) introduced OFDMA for better spectrum efficiency, Target Wake Time for IoT battery savings, and BSS Coloring for dense deployments.",
  },
  {
    id: 174, category: "Network+",
    question: "A network uses both IPv4 and IPv6 simultaneously during a transition period. What is this practice called?",
    options: ["Dual-stack", "NAT64", "Tunneling", "Translation"],
    correctIndex: 0, explanation: "Dual-stack means a device runs both IPv4 and IPv6 protocols concurrently, allowing gradual migration without breaking existing IPv4 services.",
  },
  {
    id: 175, category: "Network+",
    question: "Which type of network cable is specifically rated for use in air handling spaces (ceilings/walls) due to its low-smoke, low-toxicity jacket?",
    options: ["Riser-rated (CMR)", "Outdoor-rated", "Direct burial", "Plenum-rated (CMP)"],
    correctIndex: 3, explanation: "Plenum-rated (CMP) cable has a fire-resistant, low-smoke jacket suitable for air handling spaces. Using non-plenum cable in plenum spaces is a fire code violation.",
  },
  {
    id: 176, category: "Network+",
    question: "Which protocol allows a network device to automatically discover its IP address, subnet mask, and default gateway without manual configuration?",
    options: ["DHCP", "NTP", "DNS", "ARP"],
    correctIndex: 0, explanation: "DHCP automates IP configuration. Devices broadcast a DHCP Discover and receive IP, mask, gateway, and DNS settings from a DHCP server.",
  },
  {
    id: 177, category: "Network+",
    question: "Which term describes the delay between when a packet is sent and when it is received?",
    options: ["Latency", "Bandwidth", "Throughput", "Jitter"],
    correctIndex: 0, explanation: "Latency is the time delay for a packet to travel from source to destination. Lower latency is critical for real-time applications like gaming and VoIP.",
  },
  {
    id: 178, category: "Network+",
    question: "What does the acronym RADIUS stand for, and what is its purpose?",
    options: ["Remote Authentication Dial-In User Service — central authentication for network access", "Router Address Data Input Utility System", "Remote Access Domain Integration Unified Service", "Regional Address Distribution for Internal User Security"],
    correctIndex: 0, explanation: "RADIUS is a central authentication, authorization, and accounting (AAA) server for network access. It validates credentials for VPNs, Wi-Fi (802.1X), and dial-in.",
  },
  {
    id: 179, category: "Network+",
    question: "Which wireless antenna type radiates signal equally in all directions (360 degrees) and is commonly used for indoor APs?",
    options: ["Sector", "Directional (Yagi or parabolic)", "Patch", "Omni-directional"],
    correctIndex: 3, explanation: "Omni-directional antennas radiate equally in all horizontal directions, providing 360-degree coverage ideal for indoor ceiling-mounted access points.",
  },
  {
    id: 180, category: "Network+",
    question: "A technician notices a network interface is set to half-duplex while the switch port is full-duplex. What symptom will this mismatch cause?",
    options: ["No connection at all", "Excessive collisions and poor performance", "Faster speeds", "Improved reliability"],
    correctIndex: 1, explanation: "A duplex mismatch (one half, one full) causes the half-duplex side to detect collisions from the full-duplex side's simultaneous transmissions, degrading performance severely.",
  },
  {
    id: 181, category: "Security+",
    question: "Which attack involves an attacker intercepting and potentially altering communications between two parties without their knowledge?",
    options: ["Phishing", "Man-in-the-Middle (MitM)", "SQL Injection", "Denial of Service (DoS)"],
    correctIndex: 1, explanation: "A MitM attack positions the attacker between two parties, allowing them to eavesdrop, intercept, or alter messages in real time.",
  },
  {
    id: 182, category: "Security+",
    question: "What does the CIA Triad stand for in information security?",
    options: ["Cryptography, Identity, Access", "Control, Integrity, Authentication", "Compliance, Investigation, Authorization", "Confidentiality, Integrity, Availability"],
    correctIndex: 3, explanation: "The CIA Triad — Confidentiality, Integrity, and Availability — is the foundational model of information security.",
  },
  {
    id: 183, category: "Security+",
    question: "A user receives a targeted email appearing to come from their bank, asking them to click a link to verify credentials. This is BEST described as:",
    options: ["Smishing", "Spear phishing", "Whaling", "Vishing"],
    correctIndex: 1, explanation: "Spear phishing is a targeted phishing attack directed at a specific individual, often using personalized information.",
  },
  {
    id: 184, category: "Security+",
    question: "Which encryption algorithm is asymmetric and widely used for secure key exchange and digital signatures?",
    options: ["SHA-256", "3DES", "AES-256", "RSA"],
    correctIndex: 3, explanation: "RSA is an asymmetric algorithm using a public/private key pair. AES and 3DES are symmetric; SHA-256 is a hash function.",
  },
  {
    id: 185, category: "Security+",
    question: "Which security control type is a firewall BEST classified as?",
    options: ["Corrective control", "Preventive control", "Compensating control", "Detective control"],
    correctIndex: 1, explanation: "A firewall is a preventive control because it blocks unauthorized traffic BEFORE it reaches a target system.",
  },
  {
    id: 186, category: "Security+",
    question: "What is the purpose of multi-factor authentication (MFA)?",
    options: ["To encrypt data at rest", "To allow multiple users to share a single account", "To log all authentication attempts", "To require users to prove identity using two or more independent factors"],
    correctIndex: 3, explanation: "MFA requires at least two of three factor types — something you know, have, or are — making compromise significantly harder.",
  },
  {
    id: 187, category: "Security+",
    question: "Which technology BEST ensures an attacker with a stolen password cannot access systems without a physical device?",
    options: ["Account lockout policy", "Password complexity policy", "Hardware security key (FIDO2/WebAuthn)", "RBAC"],
    correctIndex: 2, explanation: "FIDO2 hardware security keys provide phishing-resistant MFA — the physical key is required alongside credentials.",
  },
  {
    id: 188, category: "Security+",
    question: "Which type of malware disguises itself as legitimate software but performs malicious actions in the background?",
    options: ["Ransomware", "Rootkit", "Worm", "Trojan horse"],
    correctIndex: 3, explanation: "A Trojan masquerades as useful software to trick users into installing it, then performs unauthorized actions.",
  },
  {
    id: 189, category: "Security+",
    question: "What is the MAIN purpose of a penetration test?",
    options: ["Enforce password policies", "Install monitoring agents", "Simulate an attack and identify exploitable vulnerabilities before real attackers do", "Scan for malware"],
    correctIndex: 2, explanation: "A pen test simulates real-world attacks to find and validate vulnerabilities for proactive remediation.",
  },
  {
    id: 190, category: "Security+",
    question: "Which protocol provides secure, encrypted remote command-line access to a server and uses TCP port 22?",
    options: ["RDP", "FTP", "SSH (Secure Shell)", "Telnet"],
    correctIndex: 2, explanation: "SSH uses port 22 and provides encrypted terminal access, replacing insecure Telnet.",
  },
  {
    id: 191, category: "Security+",
    question: "Which principle limits user rights to only what is needed for their role?",
    options: ["Zero trust", "Separation of duties", "Least privilege", "Defense in depth"],
    correctIndex: 2, explanation: "Least privilege limits user rights to only what is needed for their role, minimizing damage from errors or attacks.",
  },
  {
    id: 192, category: "Security+",
    question: "Which describes a zero-day vulnerability?",
    options: ["Exists only on systems with zero security", "Unknown to the vendor with no available patch", "Completes in under one day", "Patched within 24 hours"],
    correctIndex: 1, explanation: "A zero-day is a security flaw unknown to the vendor with no patch, making it especially dangerous.",
  },
  {
    id: 193, category: "Security+",
    question: "Which attack exploits insufficient input validation to inject malicious SQL commands into a database query?",
    options: ["LDAP injection", "SQL injection", "XSS", "Buffer overflow"],
    correctIndex: 1, explanation: "SQL injection inserts malicious SQL into input fields, manipulating queries to extract data or bypass authentication.",
  },
  {
    id: 194, category: "Security+",
    question: "A hacker calls an employee pretending to be from IT support asking for login credentials. This is:",
    options: ["Smishing", "Phishing", "Pretexting", "Vishing"],
    correctIndex: 3, explanation: "Vishing (voice phishing) uses phone calls. Pretexting creates a fabricated scenario — vishing often uses pretexting.",
  },
  {
    id: 195, category: "Security+",
    question: "Which device monitors network traffic and generates alerts for suspicious activity but does NOT actively block traffic?",
    options: ["WAF", "Firewall", "IDS", "IPS"],
    correctIndex: 2, explanation: "An IDS passively monitors and alerts (detect-only). An IPS actively blocks malicious traffic in-line.",
  },
  {
    id: 196, category: "Security+",
    question: "What is the purpose of adding salt to a password before hashing?",
    options: ["Encrypt the password", "Prevent identical passwords from producing the same hash and defeat rainbow tables", "Allow password recovery", "Make the hash shorter"],
    correctIndex: 1, explanation: "Salting appends a random value to each password before hashing, ensuring identical passwords produce different hashes and defeating rainbow tables.",
  },
  {
    id: 197, category: "Security+",
    question: "A SIEM collects, correlates, and analyzes log data from across the enterprise to detect threats. What does SIEM stand for?",
    options: ["Secure Internet Email Messaging", "Security Information and Event Management", "System Integrity Evaluation Module", "Secure Information Encryption Method"],
    correctIndex: 1, explanation: "SIEM (Security Information and Event Management) aggregates logs, correlates events, and generates alerts for security incidents.",
  },
  {
    id: 198, category: "Security+",
    question: "During a security incident, which step comes FIRST in the incident response lifecycle?",
    options: ["Eradication", "Recovery", "Containment", "Identification/Detection"],
    correctIndex: 3, explanation: "The incident response process: Preparation → Identification/Detection → Containment → Eradication → Recovery → Lessons Learned.",
  },
  {
    id: 199, category: "Security+",
    question: "A company purchases cyber insurance to cover losses from a data breach. Which risk management strategy is this?",
    options: ["Risk acceptance", "Risk mitigation", "Risk transference", "Risk avoidance"],
    correctIndex: 2, explanation: "Risk transference shifts financial impact to a third party (insurance company) without eliminating the risk.",
  },
  {
    id: 200, category: "Security+",
    question: "Which technology prevents sensitive data from leaving the organization's network?",
    options: ["DLP (Data Loss Prevention)", "NAC", "IPS", "SIEM"],
    correctIndex: 0, explanation: "DLP monitors, detects, and blocks unauthorized transmission of sensitive data on endpoints and across the network.",
  },
  {
    id: 201, category: "Security+",
    question: "A decoy system designed to attract attackers and study their techniques is called a:",
    options: ["Jump server", "Bastion host", "DMZ", "Honeypot"],
    correctIndex: 3, explanation: "A honeypot is a decoy system that attracts attackers, observes their techniques, and gathers threat intelligence.",
  },
  {
    id: 202, category: "Security+",
    question: "An attacker intercepts DNS responses and replaces legitimate IPs with malicious ones. This is called:",
    options: ["ARP poisoning", "DNS poisoning (cache poisoning)", "IP spoofing", "BGP hijacking"],
    correctIndex: 1, explanation: "DNS cache poisoning injects fraudulent DNS records, redirecting users to attacker-controlled servers.",
  },
  {
    id: 203, category: "Security+",
    question: "Which attack injects malicious scripts into web pages viewed by other users?",
    options: ["CSRF", "Buffer overflow", "SQL injection", "XSS (Cross-Site Scripting)"],
    correctIndex: 3, explanation: "XSS injects client-side scripts into web pages served to other users, enabling session hijacking and credential theft.",
  },
  {
    id: 204, category: "Security+",
    question: "In PKI, which entity issues and signs digital certificates, vouching for the identity of certificate holders?",
    options: ["Registration Authority (RA)", "CRL server", "OCSP Responder", "Certificate Authority (CA)"],
    correctIndex: 3, explanation: "A CA is the trusted entity that issues, signs, and revokes digital certificates, binding a public key to a verified identity.",
  },
  {
    id: 205, category: "Security+",
    question: "Which vulnerability allows an attacker to write data beyond an allocated buffer, potentially executing arbitrary code?",
    options: ["Integer overflow", "Buffer overflow", "SQL injection", "Race condition"],
    correctIndex: 1, explanation: "A buffer overflow writes beyond a buffer's bounds, overwriting adjacent memory — exploited to execute shellcode or alter program flow.",
  },
  {
    id: 206, category: "Security+",
    question: "A network isolated from all external connections to protect highly sensitive systems uses:",
    options: ["Air gap", "Zero trust", "Network segmentation", "DMZ"],
    correctIndex: 0, explanation: "An air gap physically isolates a system from all external connections, making remote attacks impossible.",
  },
  {
    id: 207, category: "Security+",
    question: "Which malware hides within the OS at a privileged level, concealing its presence and providing persistent access?",
    options: ["Rootkit", "Worm", "Trojan", "Adware"],
    correctIndex: 0, explanation: "A rootkit operates at the kernel or hypervisor level, hiding files, processes, and network connections for stealthy persistent access.",
  },
  {
    id: 208, category: "Security+",
    question: "Which security framework describes and categorizes adversary tactics, techniques, and procedures (TTPs)?",
    options: ["NIST CSF", "ISO 27001", "MITRE ATT&CK", "PCI DSS"],
    correctIndex: 2, explanation: "MITRE ATT&CK is a knowledge base of adversary TTPs based on real-world observations, used for threat modeling and detection.",
  },
  {
    id: 209, category: "Security+",
    question: "A user receives a text message with a link claiming their bank account is locked. This is called:",
    options: ["Spear phishing", "Smishing", "Vishing", "Phishing"],
    correctIndex: 1, explanation: "Smishing (SMS phishing) uses text messages to trick victims into clicking malicious links or providing sensitive information.",
  },
  {
    id: 210, category: "Security+",
    question: "Which access control model assigns permissions based on a user's job function or role?",
    options: ["DAC", "ABAC", "RBAC", "MAC"],
    correctIndex: 2, explanation: "RBAC grants permissions based on predefined roles (e.g., 'HR Manager'). Users are assigned to roles, simplifying permission management.",
  },
  {
    id: 211, category: "Security+",
    question: "Which cryptographic hash function produces a 256-bit digest and is considered secure for integrity verification?",
    options: ["SHA-256", "RC4", "SHA-1", "MD5"],
    correctIndex: 0, explanation: "SHA-256 is a secure hash function from the SHA-2 family producing a 256-bit digest. MD5 and SHA-1 are considered broken for security purposes.",
  },
  {
    id: 212, category: "Security+",
    question: "Which type of attack floods a target server with excessive traffic to make it unavailable to legitimate users?",
    options: ["SQL injection", "DDoS (Distributed Denial of Service)", "XSS", "Phishing"],
    correctIndex: 1, explanation: "DDoS uses multiple compromised systems (botnets) to flood a target with traffic, exhausting resources and denying service to legitimate users.",
  },
  {
    id: 213, category: "Security+",
    question: "What is the purpose of a digital signature?",
    options: ["To assign IP addresses", "To compress data", "To encrypt the entire message", "To verify the sender's identity and ensure message integrity"],
    correctIndex: 3, explanation: "A digital signature uses the sender's private key to sign a hash of the message. The recipient verifies with the sender's public key, confirming identity and integrity.",
  },
  {
    id: 214, category: "Security+",
    question: "Which security principle states that no user or device should be trusted by default, regardless of location?",
    options: ["Defense in depth", "Least privilege", "Zero trust", "Separation of duties"],
    correctIndex: 2, explanation: "Zero trust assumes breach and verifies every access request, regardless of whether the user is inside or outside the network perimeter.",
  },
  {
    id: 215, category: "Security+",
    question: "A security team needs to verify that an application does not have known vulnerabilities in its dependencies. Which tool type is BEST?",
    options: ["Vulnerability scanner / SCA (Software Composition Analysis)", "Antivirus", "Network firewall", "Load balancer"],
    correctIndex: 0, explanation: "SCA tools scan application dependencies for known vulnerabilities (CVEs) in libraries and frameworks, flagging outdated or compromised components.",
  },
  {
    id: 216, category: "Security+",
    question: "Which protocol encrypts email in transit between mail servers using TLS on port 587?",
    options: ["IMAPS", "POP3S", "SMTPS / STARTTLS on SMTP submission", "HTTP"],
    correctIndex: 2, explanation: "SMTP submission (port 587) with STARTTLS encrypts email in transit between clients and servers. Port 465 is SMTPS (deprecated but still used).",
  },
  {
    id: 217, category: "Security+",
    question: "What is the purpose of an ACL (Access Control List) in networking?",
    options: ["To define which users or systems are permitted or denied access to resources", "To assign IP addresses", "To monitor CPU usage", "To encrypt network traffic"],
    correctIndex: 0, explanation: "ACLs are rules that permit or deny traffic based on source/destination IP, port, protocol, or user identity.",
  },
  {
    id: 218, category: "Security+",
    question: "Which type of backup copies only the files that have changed since the last backup of any type?",
    options: ["Full backup", "Incremental backup", "Differential backup", "Snapshot backup"],
    correctIndex: 1, explanation: "Incremental backups copy only files changed since the last backup (full or incremental). They are fast and use less storage but require the full chain to restore.",
  },
  {
    id: 219, category: "Security+",
    question: "Which symmetric encryption algorithm is widely used and considered secure for protecting data at rest and in transit?",
    options: ["AES-256", "RC4", "3DES", "DES"],
    correctIndex: 0, explanation: "AES-256 is the current gold standard for symmetric encryption. DES and 3DES are obsolete. RC4 is broken and deprecated.",
  },
  {
    id: 220, category: "Security+",
    question: "A security analyst discovers a device on the network with a default administrator password still set. This represents a failure of which security practice?",
    options: ["Load balancing", "Patch management", "Secure configuration / hardening", "Network segmentation"],
    correctIndex: 2, explanation: "Secure configuration/hardening requires changing default passwords, disabling unnecessary services, and applying security baselines.",
  },
  {
    id: 221, category: "Security+",
    question: "Which authentication protocol is commonly used for Wi-Fi networks with enterprise authentication and RADIUS backend?",
    options: ["WEP", "WPA2-Enterprise with 802.1X/EAP", "Open network", "WPA-Personal (PSK)"],
    correctIndex: 1, explanation: "WPA2-Enterprise with 802.1X/EAP uses a RADIUS server for per-user authentication, providing far stronger security than shared PSK.",
  },
  {
    id: 222, category: "Security+",
    question: "What is the purpose of a WAF (Web Application Firewall)?",
    options: ["To provide DNS resolution", "To assign IP addresses", "To block all internet traffic", "To inspect and filter HTTP/HTTPS traffic to protect web applications from attacks like SQL injection and XSS"],
    correctIndex: 3, explanation: "A WAF sits in front of web applications, analyzing HTTP/HTTPS requests and blocking malicious patterns like SQL injection, XSS, and CSRF.",
  },
  {
    id: 223, category: "Security+",
    question: "Which type of malware encrypts a victim's files and demands payment for the decryption key?",
    options: ["Spyware", "Ransomware", "Trojan", "Worm"],
    correctIndex: 1, explanation: "Ransomware encrypts files and demands a ransom (usually cryptocurrency) for the decryption key. Regular offline backups are the best defense.",
  },
  {
    id: 224, category: "Security+",
    question: "A company separates the duties of requesting, approving, and executing financial transactions. This demonstrates:",
    options: ["Single sign-on", "Least privilege", "Defense in depth", "Separation of duties"],
    correctIndex: 3, explanation: "Separation of duties divides critical tasks among multiple people to prevent fraud and errors — no single person can complete a sensitive process alone.",
  },
  {
    id: 225, category: "Security+",
    question: "Which security concept involves implementing multiple layers of security controls so that if one fails, others still protect the system?",
    options: ["Defense in depth", "Obfuscation", "Least privilege", "Zero trust"],
    correctIndex: 0, explanation: "Defense in depth uses multiple overlapping security layers (firewall, IDS, encryption, MFA, physical security) so a single breach does not compromise everything.",
  },
  {
    id: 226, category: "Security+",
    question: "Which standard defines requirements for organizations that handle credit card data?",
    options: ["SOX", "HIPAA", "PCI DSS", "GDPR"],
    correctIndex: 2, explanation: "PCI DSS (Payment Card Industry Data Security Standard) defines security requirements for any organization that stores, processes, or transmits cardholder data.",
  },
  {
    id: 227, category: "Security+",
    question: "What does steganography accomplish in cybersecurity?",
    options: ["Deletes data permanently", "Compresses data", "Encrypts data", "Hides data within another file (like an image) so it is not obvious the data exists"],
    correctIndex: 3, explanation: "Steganography hides data within files (images, audio, video) so the existence of the hidden data is concealed. It differs from cryptography, which protects data but reveals its existence.",
  },
  {
    id: 228, category: "Security+",
    question: "Which type of security testing involves examining source code for vulnerabilities without executing the program?",
    options: ["Fuzzing", "Penetration testing", "Dynamic analysis", "Static analysis (SAST)"],
    correctIndex: 3, explanation: "Static Application Security Testing (SAST) analyzes source code or binaries without executing them, finding vulnerabilities like injection flaws and buffer overflows early in development.",
  },
  {
    id: 229, category: "Security+",
    question: "An attacker sends a fraudulent email that appears to come from a CEO, instructing the CFO to wire funds urgently. This specific social engineering attack is called:",
    options: ["Vishing", "Whaling", "Smishing", "Spear phishing"],
    correctIndex: 1, explanation: "Whaling is a highly targeted phishing attack aimed at senior executives (C-suite). It uses personalized, high-pressure scenarios involving large sums of money.",
  },
  {
    id: 230, category: "Security+",
    question: "Which technology allows a mobile device to store credentials in a secure hardware-backed container for enterprise authentication?",
    options: ["Trusted Execution Environment (TEE) / Secure Element", "Bluetooth", "Biometric scanner", "NFC payment"],
    correctIndex: 0, explanation: "A TEE (Trusted Execution Environment) or Secure Element is a hardware-isolated area on a mobile device that stores cryptographic keys and credentials securely.",
  },
  {
    id: 231, category: "Security+",
    question: "A security team needs to ensure a web application is not vulnerable to CSRF (Cross-Site Request Forgery). Which control BEST mitigates this?",
    options: ["Use HTTP instead of HTTPS", "Disable JavaScript entirely", "Input validation only", "Anti-CSRF tokens (synchronizer tokens) and SameSite cookies"],
    correctIndex: 3, explanation: "Anti-CSRF tokens ensure the request originated from the legitimate application. SameSite cookie attributes prevent cross-origin cookie transmission.",
  },
  {
    id: 232, category: "Security+",
    question: "Which type of log analysis technique uses statistical methods to detect anomalies that deviate from normal behavior patterns?",
    options: ["Whitelist-only detection", "Signature-based detection", "Heuristic / Anomaly-based detection", "Manual log review"],
    correctIndex: 2, explanation: "Anomaly-based detection establishes a baseline of normal behavior and flags deviations. It can detect zero-day attacks that signature-based methods miss.",
  },
  {
    id: 233, category: "Security+",
    question: "What is the primary purpose of a certificate revocation list (CRL)?",
    options: ["To list certificates that have been revoked before their expiration date", "To encrypt data", "To list all issued certificates", "To assign IP addresses"],
    correctIndex: 0, explanation: "A CRL is a list of certificates that have been revoked by the CA before their expiration (due to compromise, employee departure, etc.). Clients check CRLs before trusting a certificate.",
  },
  {
    id: 234, category: "Security+",
    question: "Which US government regulation protects the privacy and security of patient health information?",
    options: ["GDPR", "HIPAA", "PCI DSS", "SOX"],
    correctIndex: 1, explanation: "HIPAA (Health Insurance Portability and Accountability Act) sets standards for protecting sensitive patient health information in the US.",
  },
  {
    id: 235, category: "Security+",
    question: "Which attack exploits a race condition by forcing a program to execute code between the time a check is made and the time the resource is used?",
    options: ["TOCTOU (Time-of-Check to Time-of-Use)", "SQL injection", "XSS", "Buffer overflow"],
    correctIndex: 0, explanation: "TOCTOU is a race condition vulnerability where an attacker changes a resource between the verification check and its actual use, bypassing security controls.",
  },
  {
    id: 236, category: "Security+",
    question: "A company needs to ensure that all data on a lost or stolen laptop cannot be read. Which technology BEST achieves this?",
    options: ["Password-protected screensaver", "Antivirus software", "Full-disk encryption (BitLocker/FileVault)", "Firewall"],
    correctIndex: 2, explanation: "Full-disk encryption ensures all data on the drive is encrypted. Without the decryption key, a thief cannot read the data even with physical access to the drive.",
  },
  {
    id: 237, category: "Security+",
    question: "Which term describes the practice of tricking users into revealing sensitive information by creating a fake website that mimics a legitimate one?",
    options: ["DDoS", "Phishing / Domain spoofing", "DoS", "Brute force"],
    correctIndex: 1, explanation: "Phishing uses deceptive emails, websites, or messages to trick users into entering credentials or personal information on attacker-controlled sites.",
  },
  {
    id: 238, category: "Security+",
    question: "Which cloud security model places the MOST security responsibility on the cloud provider?",
    options: ["IaaS (Infrastructure as a Service)", "SaaS (Software as a Service)", "PaaS (Platform as a Service)", "All models share equal responsibility"],
    correctIndex: 1, explanation: "In SaaS, the provider manages everything from infrastructure to application. The customer is responsible mainly for data and user access. In IaaS, the customer manages more layers.",
  },
  {
    id: 239, category: "Security+",
    question: "Which type of security control is a CCTV camera monitoring an entrance BEST classified as?",
    options: ["Corrective control", "Preventive control", "Detective control", "Deterrent control"],
    correctIndex: 2, explanation: "CCTV is a detective control because it records and detects events after they occur, rather than preventing them in real time.",
  },
  {
    id: 240, category: "Security+",
    question: "A security administrator needs to ensure that only approved applications can run on corporate endpoints. Which technology is BEST?",
    options: ["Application whitelisting / AppLocker", "Antivirus", "Firewall", "Load balancer"],
    correctIndex: 0, explanation: "Application whitelisting (e.g., AppLocker, Windows Defender Application Control) allows only explicitly approved applications to execute, blocking all unauthorized software including unknown malware.",
  },
  {
    id: 241, category: "Security+",
    question: "Which technique involves sending malformed or random data to an application to find crashes and vulnerabilities?",
    options: ["Social engineering", "Fuzzing", "Static analysis", "Cryptanalysis"],
    correctIndex: 1, explanation: "Fuzzing sends malformed, unexpected, or random input to software to trigger crashes, memory leaks, or exploitable vulnerabilities.",
  },
  {
    id: 242, category: "Security+",
    question: "What is the MAIN difference between a threat and a vulnerability?",
    options: ["A threat only exists in software", "A vulnerability only exists in hardware", "They are the same thing", "A threat is a potential danger; a vulnerability is a weakness that can be exploited"],
    correctIndex: 3, explanation: "A threat is any potential danger (malicious actor, natural disaster). A vulnerability is a weakness that could be exploited. Risk = Threat × Vulnerability × Impact.",
  },
  {
    id: 243, category: "Security+",
    question: "Which key agreement protocol allows two parties to securely establish a shared secret key over an insecure channel without prior shared secrets?",
    options: ["AES", "Diffie-Hellman", "MD5", "RSA"],
    correctIndex: 1, explanation: "Diffie-Hellman allows two parties to generate a shared secret key over an insecure channel, which is then used for symmetric encryption.",
  },
  {
    id: 244, category: "Security+",
    question: "Which security framework provides a structured approach for organizations to manage cybersecurity risk?",
    options: ["Windows Update", "NIST Cybersecurity Framework (CSF)", "DNS", "SMTP"],
    correctIndex: 1, explanation: "NIST CSF provides five core functions — Identify, Protect, Detect, Respond, Recover — to help organizations manage and reduce cybersecurity risk.",
  },
  {
    id: 245, category: "Security+",
    question: "An attacker embeds a small, transparent image in an email that loads when the recipient opens it, revealing their IP and email-open time. This is called:",
    options: ["A rootkit", "A web beacon / tracking pixel", "A worm", "A DDoS attack"],
    correctIndex: 1, explanation: "A web beacon (tracking pixel) is a tiny invisible image that loads from a remote server when an email is opened, allowing the sender to track opens, IPs, and timing.",
  },
  {
    id: 246, category: "Security+",
    question: "Which authentication factor type is 'something you are'?",
    options: ["Biometric (fingerprint, retina scan)", "Security token", "PIN", "Password"],
    correctIndex: 0, explanation: "Biometric factors (fingerprint, facial recognition, retina scan) are 'something you are' — an inherent physical characteristic.",
  },
  {
    id: 247, category: "Security+",
    question: "Which type of backup copies all files that have changed since the last FULL backup?",
    options: ["Differential backup", "Incremental backup", "Full backup", "Mirror backup"],
    correctIndex: 0, explanation: "Differential backups copy all files changed since the last full backup. They grow larger over time but require only the full backup plus the latest differential to restore.",
  },
  {
    id: 248, category: "Security+",
    question: "A security team performs a review of firewall rules and finds overly permissive rules allowing unnecessary traffic. What risk does this create?",
    options: ["Slower internet speed", "Monitor flickering", "Expanded attack surface and potential unauthorized access", "Increased power consumption"],
    correctIndex: 2, explanation: "Overly permissive firewall rules increase the attack surface by allowing more traffic than necessary, creating pathways for attackers to exploit.",
  },
  {
    id: 249, category: "Security+",
    question: "Which protocol is used to securely transfer files between systems over an encrypted channel?",
    options: ["HTTP", "FTP", "TFTP", "SFTP (SSH File Transfer Protocol)"],
    correctIndex: 3, explanation: "SFTP runs over SSH (port 22) and provides encrypted file transfers. FTP (port 21) and TFTP are unencrypted. HTTP is for web pages.",
  },
  {
    id: 250, category: "Security+",
    question: "A company wants to verify that a downloaded software update file has not been tampered with in transit. Which cryptographic mechanism should they check?",
    options: ["Hash value / checksum published by the vendor", "Digital certificate of the CA", "The file size only", "The file creation date"],
    correctIndex: 0, explanation: "Comparing the SHA-256 or similar hash of the downloaded file against the vendor's published hash verifies the file's integrity — any tampering changes the hash.",
  },
  {
    id: 251, category: "Security+",
    question: "Which type of security assessment is conducted with the organization's full knowledge and cooperation, often to meet compliance requirements?",
    options: ["Black-box test", "Red team exercise without consent", "Gray-box test", "White-box test"],
    correctIndex: 3, explanation: "White-box testing is performed with full knowledge of the system architecture, source code, and credentials. It is common for compliance audits and in-depth security reviews.",
  },
  {
    id: 252, category: "Security+",
    question: "An attacker uses a known vulnerability in an unpatched web server to gain access. What security practice would have prevented this?",
    options: ["Increasing screen brightness", "Installing a larger monitor", "Using a faster CPU", "Regular patch management and vulnerability scanning"],
    correctIndex: 3, explanation: "Regular patch management closes known vulnerabilities. Vulnerability scanning identifies missing patches and misconfigurations before attackers exploit them.",
  },
  {
    id: 253, category: "Security+",
    question: "Which mobile device security feature can remotely locate, lock, or wipe a lost or stolen device?",
    options: ["MDM (Mobile Device Management) or built-in remote wipe (Find My Device / Find My iPhone)", "NFC", "Bluetooth", "Airplane mode"],
    correctIndex: 0, explanation: "MDM solutions and built-in features like Find My Device (Android) or Find My (iOS) allow remote location tracking, locking, and data wiping to protect lost devices.",
  },
  {
    id: 254, category: "Security+",
    question: "Which cloud deployment model provides resources exclusively for a single organization?",
    options: ["Hybrid cloud", "Community cloud", "Public cloud", "Private cloud"],
    correctIndex: 3, explanation: "A private cloud is dedicated to a single organization, offering maximum control, customization, and security, though at higher cost than public cloud.",
  },
  {
    id: 255, category: "Security+",
    question: "A security analyst notices repeated failed login attempts from the same IP. What defensive measure should be enabled?",
    options: ["Disable the firewall", "Increase screen resolution", "Remove antivirus", "Account lockout policy"],
    correctIndex: 3, explanation: "An account lockout policy temporarily disables an account after a defined number of failed login attempts, preventing brute-force password attacks.",
  },
  {
    id: 256, category: "Security+",
    question: "Which technique involves tricking a user into performing an action they did not intend by exploiting their trust in a legitimate website?",
    options: ["SQL injection", "DNS poisoning", "CSRF (Cross-Site Request Forgery)", "XSS"],
    correctIndex: 2, explanation: "CSRF tricks an authenticated user into performing unintended actions on a trusted site by embedding malicious requests (e.g., via a malicious email link).",
  },
  {
    id: 257, category: "Security+",
    question: "Which type of attack involves an attacker sending packets with a forged source IP address?",
    options: ["IP spoofing", "DNS amplification", "ARP poisoning", "Man-in-the-middle"],
    correctIndex: 0, explanation: "IP spoofing involves forging the source IP address in packet headers to disguise the attacker's identity or bypass IP-based access controls.",
  },
  {
    id: 258, category: "Security+",
    question: "What is the purpose of a Security Operations Center (SOC)?",
    options: ["To design network cables", "To manage employee payroll", "To develop software", "To monitor, detect, analyze, and respond to cybersecurity incidents in real time"],
    correctIndex: 3, explanation: "A SOC is a centralized facility where security analysts monitor networks 24/7, detect threats, investigate alerts, and coordinate incident response.",
  },
  {
    id: 259, category: "Security+",
    question: "Which encryption mode provides both confidentiality and authentication by combining an encryption algorithm with a message authentication code?",
    options: ["CBC (Cipher Block Chaining)", "ECB (Electronic Codebook)", "CFB (Cipher Feedback)", "GCM (Galois/Counter Mode)"],
    correctIndex: 3, explanation: "AES-GCM provides authenticated encryption with associated data (AEAD), ensuring both confidentiality and integrity without a separate MAC.",
  },
  {
    id: 260, category: "Security+",
    question: "A company implements a policy requiring employees to use unique passwords for every account and store them in an encrypted vault. This is an example of:",
    options: ["Password reuse", "Password manager / strong credential hygiene", "Kerberos delegation", "Single sign-on"],
    correctIndex: 1, explanation: "A password manager generates and stores unique, complex passwords for each account in an encrypted vault, preventing password reuse and credential stuffing attacks.",
  },
  {
    id: 261, category: "Security+",
    question: "Which wireless attack involves an attacker creating a fake access point with the same SSID as a legitimate network to capture credentials?",
    options: ["MAC flooding", "BGP hijacking", "VLAN hopping", "Evil twin attack"],
    correctIndex: 3, explanation: "An evil twin is a rogue access point mimicking a legitimate network's SSID. Users connect to it, and the attacker intercepts traffic and captures credentials.",
  },
  {
    id: 262, category: "Security+",
    question: "Which European regulation governs data protection and privacy for individuals within the EU and EEA?",
    options: ["PCI DSS", "HIPAA", "SOX", "GDPR (General Data Protection Regulation)"],
    correctIndex: 3, explanation: "GDPR mandates strict data protection rules for organizations handling EU residents' personal data, with heavy fines for non-compliance.",
  },
  {
    id: 263, category: "Security+",
    question: "A security team is reviewing firewall logs and notices outbound traffic to a known command-and-control (C2) server. What does this indicate?",
    options: ["Normal Windows Update traffic", "Legitimate cloud backup", "Printer driver update", "A compromised endpoint communicating with an attacker's infrastructure"],
    correctIndex: 3, explanation: "Outbound connections to known C2 servers strongly indicate a compromised endpoint running malware that is receiving instructions or exfiltrating data.",
  },
  {
    id: 264, category: "Security+",
    question: "Which cryptographic operation converts plaintext into unreadable ciphertext?",
    options: ["Encoding (Base64)", "Encryption", "Hashing", "Compression"],
    correctIndex: 1, explanation: "Encryption transforms plaintext into ciphertext using an algorithm and key. Only authorized parties with the correct key can decrypt it back to plaintext.",
  },
  {
    id: 265, category: "Security+",
    question: "Which practice involves documenting and tracking all hardware and software assets to identify unauthorized devices or applications?",
    options: ["Load balancing", "Data deduplication", "Asset management / Asset inventory", "Network segmentation"],
    correctIndex: 2, explanation: "Asset management maintains an inventory of all authorized hardware and software, enabling the detection of rogue devices and unapproved applications.",
  },
  {
    id: 266, category: "Security+",
    question: "Which type of malware replicates across a network by exploiting vulnerabilities without needing a host file or user action?",
    options: ["Virus", "Trojan", "Worm", "Spyware"],
    correctIndex: 2, explanation: "Worms self-replicate across networks without requiring host files. Viruses attach to files; Trojans need user execution; spyware monitors silently.",
  },
  {
    id: 267, category: "Security+",
    question: "Which technique helps prevent shoulder surfing when entering passwords in a public space?",
    options: ["Type louder", "Use a privacy screen and shield the keyboard with your body", "Use a larger monitor", "Disable password masking"],
    correctIndex: 1, explanation: "Privacy screens limit viewing angles, and physically shielding the keyboard prevents bystanders from seeing keystrokes or the screen.",
  },
  {
    id: 268, category: "Security+",
    question: "Which security control ensures that a person who initiates a transaction cannot also approve it?",
    options: ["Separation of duties", "Defense in depth", "Need to know", "Least privilege"],
    correctIndex: 0, explanation: "Separation of duties divides transaction initiation and approval among different individuals, preventing fraud and unauthorized actions.",
  },
  {
    id: 269, category: "Security+",
    question: "Which cloud security responsibility model places the MOST burden on the customer?",
    options: ["PaaS", "IaaS", "All are equal", "SaaS"],
    correctIndex: 1, explanation: "In IaaS, the customer manages the operating system, applications, data, and security configurations. The provider only manages the physical infrastructure.",
  },
  {
    id: 270, category: "Security+",
    question: "A security team is implementing controls to ensure data cannot be altered without detection. Which goal of the CIA Triad does this address?",
    options: ["Integrity", "Non-repudiation", "Availability", "Confidentiality"],
    correctIndex: 0, explanation: "Integrity ensures data is accurate and unaltered. Hashing, digital signatures, and file integrity monitoring detect unauthorized modifications.",
  },
];

export const EXAMS: ExamCategory[] = ["A+", "Network+", "Security+"];

export const EXAM_DESCRIPTIONS: Record<ExamCategory, string> = {
  "A+": "Hardware, operating systems, networking, and troubleshooting",
  "Network+": "Network infrastructure, protocols, and operations",
  "Security+": "Cybersecurity concepts, threats, and risk management",
};

export const EXAM_COUNTS: Record<ExamCategory | "all", number> = {
  "A+": 90,
  "Network+": 90,
  "Security+": 90,
  "all": 270,
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function assignTopics(qs: Question[]): Question[] {
  return qs.map((q) => {
    const topic = assignTopic(q.question, q.explanation);
    return topic ? { ...q, topic } : q;
  });
}

export const questions: Question[] = assignTopics(assignDifficulties(rawQuestions));

export function getQuestionsByTopic(topic: DomainTopic, count?: number): Question[] {
  let qs = questions.filter((q) => q.topic === topic);
  const result = count ? shuffle(qs).slice(0, count) : qs;
  return scrambleOptions(result);
}

export function getQuestionsByCategory(category: ExamCategory, count?: number, difficulty?: Difficulty): Question[] {
  let qs = questions.filter((q) => q.category === category);
  if (difficulty) {
    qs = qs.filter((q) => q.difficulty === difficulty);
  }
  const result = count ? shuffle(qs).slice(0, count) : qs;
  return scrambleOptions(result);
}

export function getAllQuestions(count?: number, difficulty?: Difficulty): Question[] {
  let qs = [...questions];
  if (difficulty) {
    qs = qs.filter((q) => q.difficulty === difficulty);
  }
  const result = count ? shuffle(qs).slice(0, count) : qs;
  return scrambleOptions(result);
}

export function getDifficultyCount(difficulty?: Difficulty): number {
  if (!difficulty) return questions.length;
  return questions.filter((q) => q.difficulty === difficulty).length;
}

export function getDifficultyBreakdown(category?: ExamCategory): Record<Difficulty, number> {
  let qs = questions;
  if (category) qs = qs.filter((q) => q.category === category);
  return {
    easy: qs.filter((q) => q.difficulty === "easy").length,
    medium: qs.filter((q) => q.difficulty === "medium").length,
    hard: qs.filter((q) => q.difficulty === "hard").length,
  };
}

export function getTopicBreakdown(category: ExamCategory): Record<string, number> {
  const qs = questions.filter((q) => q.category === category);
  const counts: Record<string, number> = {};
  for (const q of qs) {
    const key = q.topic || "Untagged";
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

// ══════════════════════════════════════════════════════════
//  CompTIA Scoring & Timing
// ══════════════════════════════════════════════════════════

/** CompTIA uses a 100–900 scale. Passing score is 750. */
export const COMPTIA_PASS_SCORE = 750;
export const COMPTIA_MIN_SCORE = 100;
export const COMPTIA_MAX_SCORE = 900;

/** Convert raw percentage (0–100) to CompTIA scaled score (100–900).
 *  Formula: 100 + floor(pct × 8).  750 = pass (roughly 81.25% raw). */
export function comptiaScaledScore(rawPct: number): number {
  return Math.max(COMPTIA_MIN_SCORE, Math.min(COMPTIA_MAX_SCORE, Math.round(100 + rawPct * 8)));
}

/** Is a scaled score a pass? */
export function isCompTiaPass(scaled: number): boolean {
  return scaled >= COMPTIA_PASS_SCORE;
}

/** Compute total allowed seconds for a given question count and difficulty. */
export function getTimeLimitSeconds(questionCount: number, difficulty?: Difficulty): number {
  const perQ = difficulty ? SECONDS_PER_QUESTION[difficulty] : 60;
  return questionCount * perQ;
}

/** Weighted scoring based on difficulty. */
export function weightedScore(questions: Question[], answers: (number | null)[]): number {
  let correctPoints = 0;
  let totalPoints = 0;
  questions.forEach((q, i) => {
    const w = DIFFICULTY_WEIGHT[q.difficulty || "easy"];
    totalPoints += w;
    if (answers[i] === q.correctIndex) correctPoints += w;
  });
  return Math.round((correctPoints / totalPoints) * 100);
}

/** Legacy pass threshold (kept for reference) */
export const PASS_THRESHOLD = 0.75;