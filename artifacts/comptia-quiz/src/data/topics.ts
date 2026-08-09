/** CompTIA A+ 220-1201 (Core 1) and 220-1202 (Core 2) exam domain topics.
 *  9 domains total: 5 from Core 1, 4 from Core 2.
 */

export const CORE1_DOMAINS = [
  "1.0 Mobile Devices",
  "2.0 Networking",
  "3.0 Hardware",
  "4.0 Virtualization & Cloud Computing",
  "5.0 Hardware & Network Troubleshooting",
] as const;

export const CORE2_DOMAINS = [
  "1.0 Operating Systems",
  "2.0 Security",
  "3.0 Software Troubleshooting",
  "4.0 Operational Procedures",
] as const;

export const ALL_DOMAINS = [...CORE1_DOMAINS, ...CORE2_DOMAINS] as const;

export type DomainTopic = (typeof ALL_DOMAINS)[number];

export const DOMAIN_METADATA: Record<
  DomainTopic,
  { id: string; label: string; exam: "Core 1" | "Core 2"; keywords: string[] }
> = {
  "1.0 Mobile Devices": {
    id: "core1_mobile",
    label: "Mobile Devices",
    exam: "Core 1",
    keywords: [
      "laptop", "tablet", "smartphone", "mobile", "touchscreen", "stylus", "portable", "docking", "port replicator",
      "wireless charging", "NFC", "bluetooth", "GPS", "e-reader", "wearable", "screen", "keyboard", "trackpad",
      "hotspot", "tether", "MDM", "mobile device", "iOS", "Android", "eSIM", "SIM", "cellular", "LTE", "5G",
    ],
  },
  "2.0 Networking": {
    id: "core1_networking",
    label: "Networking",
    exam: "Core 1",
    keywords: [
      "router", "switch", "firewall", "network", "LAN", "WAN", "WLAN", "IP address", "subnet", "MAC",
      "ethernet", "RJ45", "fiber optic", "coaxial", "CAT", "cable", "DNS", "DHCP", "NAT", "port",
      "TCP", "UDP", "ICMP", "ping", "tracert", "SSID", "Wi-Fi", "wireless", "AP", "access point",
      "bandwidth", "throughput", "VPN", "proxy", "SOHO", "VoIP", "QoS", "NIC", "Bluetooth",
    ],
  },
  "3.0 Hardware": {
    id: "core1_hardware",
    label: "Hardware",
    exam: "Core 1",
    keywords: [
      "motherboard", "CPU", "RAM", "memory", "DIMM", "SSD", "HDD", "storage", "drive", "power supply",
      "PSU", "GPU", "graphics", "PCIe", "expansion", "BIOS", "UEFI", "CMOS", "battery", "firmware",
      "cooling", "fan", "heatsink", "thermal", "case", "form factor", "ATX", "ITX", "connector", "cable",
      "SATA", "NVMe", "M.2", "USB", "HDMI", "DisplayPort", "VGA", "DVI", "optical drive", "POST", "beep",
      "RAID", "multimeter", "ESD", "ground", "crimper", "toner", "cable tester", "PSU tester", "POST card",
    ],
  },
  "4.0 Virtualization & Cloud Computing": {
    id: "core1_virtualization",
    label: "Virtualization & Cloud",
    exam: "Core 1",
    keywords: [
      "virtual", "VM", "hypervisor", "host", "guest", "snapshot", "clone", "template", "container",
      "cloud", "IaaS", "PaaS", "SaaS", "hybrid", "public", "private", "community", "on-premise",
      "resource pooling", "elasticity", "measured service", "VNC", "RDP", "remote desktop", "virtualization",
    ],
  },
  "5.0 Hardware & Network Troubleshooting": {
    id: "core1_troubleshooting",
    label: "Troubleshooting",
    exam: "Core 1",
    keywords: [
      "troubleshoot", "diagnose", "symptom", "cause", "solution", "step", "identify", "resolve", "fix",
      "not working", "fails", "error", "failure", "boot", "no display", "no power", "overheat", "BSOD",
      "slow", "intermittent", "connectivity", "IP conflict", "loopback", "cable", "POST", "POST beep",
      "most likely", "best first step", "verify", "test", "swap", "replace", "check", "restart",
    ],
  },
  "1.0 Operating Systems": {
    id: "core2_os",
    label: "Operating Systems",
    exam: "Core 2",
    keywords: [
      "Windows", "OS", "operating system", "Linux", "macOS", "registry", "syswow", "system32",
      "cmd", "command prompt", "PowerShell", "task manager", "msconfig", "services", "Control Panel",
      "group policy", "gpedit", "UAC", "file system", "NTFS", "FAT32", "exFAT", "ReFS", "APFS",
      "partition", "format", "disk management", "chkdsk", "sfc", "DISM", "diskpart", "boot",
      "BIOS", "UEFI", "Secure Boot", "recovery", "restore", "image", "backup", "update", "patch",
      "driver", "device manager", "compatibility", "sandbox", "file explorer", "path", "environment",
    ],
  },
  "2.0 Security": {
    id: "core2_security",
    label: "Security",
    exam: "Core 2",
    keywords: [
      "security", "password", "authentication", "MFA", "biometric", "encryption", "firewall", "antivirus",
      "malware", "virus", "trojan", "worm", "spyware", "adware", "rootkit", "keylogger", "ransomware",
      "phishing", "social engineering", "brute force", "DOS", "DDOS", "certificate", "SSL", "TLS",
      "VPN", "remote access", "screen lock", "locker", "permissions", "ACL", "inheritance", "UAC",
      "account", "user", "administrator", "guest", "security policy", "audit", "log", "incident",
      "hash", "digital signature", "PKI", "HSM", "TPM", "secure boot", "data destruction", "degauss",
    ],
  },
  "3.0 Software Troubleshooting": {
    id: "core2_software_troubleshooting",
    label: "Software Troubleshooting",
    exam: "Core 2",
    keywords: [
      "software", "application", "program", "app", "browser", "crash", "freeze", "hang", "not responding",
      "install", "uninstall", "compatibility", "app crash", "BSOD", "kernel panic", "memory dump",
      "update", "patch", "service pack", "feature update", "version", "rollback", "revert", "restore",
      "startup", "boot", "safe mode", "clean boot", "system restore", "reimage", "refresh", "reset",
      "service", "dependency", "log file", "event viewer", "application log", "error code", "troubleshoot",
    ],
  },
  "4.0 Operational Procedures": {
    id: "core2_ops",
    label: "Operational Procedures",
    exam: "Core 2",
    keywords: [
      "backup", "restore", "incremental", "differential", "full", "synthetic", "3-2-1", "GFS", "rotation",
      "documentation", "incident report", "change management", "SOP", "SLA", "ticketing", "work order",
      "ESD", "safety", "MSDS", "SDS", "disposal", "battery", "toner", "recycling", "temperature", "humidity",
      "licensing", "EULA", "DRM", "open source", "commercial", "perpetual", "subscription", "AUP", "NDA",
      "professionalism", "communication", "customer", "privacy", "PII", "regulated data", "chain of custody",
      "script", "batch", "PowerShell", "Python", "automation", "RDP", "SSH", "VPN", "remote", "AI",
    ],
  },
};

/** Assign a CompTIA A+ domain topic to a question based on its content.
 *  Returns null for non-A+ categories (Network+, Security+).
 */
export function assignTopic(question: string, explanation: string): DomainTopic | null {
  const text = (question + " " + explanation).toLowerCase();
  let bestTopic: DomainTopic | null = null;
  let bestScore = 0;

  for (const [topic, meta] of Object.entries(DOMAIN_METADATA)) {
    const score = meta.keywords.reduce((sum, kw) => {
      const regex = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
      const matches = (text.match(regex) || []).length;
      return sum + matches;
    }, 0);
    if (score > bestScore) {
      bestScore = score;
      bestTopic = topic as DomainTopic;
    }
  }

  // Default to Troubleshooting if no clear match (many questions fit here)
  if (bestScore === 0) {
    return "5.0 Hardware & Network Troubleshooting";
  }

  return bestTopic;
}

export const DOMAIN_COLORS: Record<DomainTopic, string> = {
  "1.0 Mobile Devices": "#3b82f6",
  "2.0 Networking": "#06b6d4",
  "3.0 Hardware": "#8b5cf6",
  "4.0 Virtualization & Cloud Computing": "#ec4899",
  "5.0 Hardware & Network Troubleshooting": "#f97316",
  "1.0 Operating Systems": "#22c55e",
  "2.0 Security": "#ef4444",
  "3.0 Software Troubleshooting": "#eab308",
  "4.0 Operational Procedures": "#a855f7",
};

export function getDomainColor(topic: DomainTopic): string {
  return DOMAIN_COLORS[topic] || "#9ca3af";
}
