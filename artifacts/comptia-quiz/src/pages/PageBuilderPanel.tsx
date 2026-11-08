import { useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  Check,
  Clock3,
  Eye,
  LockKeyhole,
  RotateCcw,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Timer,
} from "lucide-react";
import type { PageBuilderSettings, TierNumber } from "@/lib/page-builder";

interface PageBuilderPanelProps {
  settings: PageBuilderSettings;
  onChange: (next: PageBuilderSettings) => void;
  onSave: () => void;
  onReset: () => void;
  onPreview: () => void;
  onTestTier: (tier: TierNumber) => void;
  previewKey: number;
  isSaving: boolean;
  isDirty: boolean;
  lastSavedAt: string | null;
}

const fieldClass =
  "mt-1.5 w-full rounded-lg border border-slate-700/80 bg-[#101923] px-3 py-2.5 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-400/70 focus:ring-2 focus:ring-cyan-400/10";
const cardClass =
  "rounded-xl border border-slate-700/70 bg-[#111a24]/90 shadow-[0_14px_40px_-28px_rgba(0,0,0,0.85)]";
const accentButton =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#d84c38] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#ed6049] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff8975] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b1118] disabled:cursor-not-allowed disabled:opacity-55";
const quietButton =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-700 bg-[#121b25] px-3.5 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:bg-[#192531] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b1118]";

const copyFields = [
  { key: "eyebrow", label: "Eyebrow", hint: "Short label above the main title", maxLength: 48 },
  { key: "title", label: "Page title", hint: "Primary learner-facing heading", maxLength: 60 },
  { key: "subtitle", label: "Subtitle", hint: "Supporting line beneath the title", maxLength: 100 },
  { key: "tagline", label: "Tagline", hint: "A concise statement of learner value", maxLength: 120 },
] as const;

const colorFields = [
  { key: "primaryColor", label: "Primary", note: "Main action and emphasis" },
  { key: "accentColor", label: "Accent", note: "Secondary highlights" },
  { key: "backgroundColor", label: "Page background", note: "Learner canvas" },
  { key: "panelColor", label: "Panel", note: "Cards and content surfaces" },
  { key: "textColor", label: "Text", note: "Primary learner text" },
] as const;

const tierNumbers: TierNumber[] = [1, 2, 3];
const tierFallbackNames: Record<TierNumber, string> = {
  1: "Mild",
  2: "Medium",
  3: "HellMode",
};

function readableSavedTime(value: string | null): string {
  if (!value) return "No saved version recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function changedSettings(current: PageBuilderSettings, baseline: PageBuilderSettings): string[] {
  const changed: string[] = [];
  const topFields: { key: keyof PageBuilderSettings; label: string }[] = [
    { key: "eyebrow", label: "Eyebrow" },
    { key: "title", label: "Page title" },
    { key: "subtitle", label: "Subtitle" },
    { key: "tagline", label: "Tagline" },
    { key: "disclaimerTitle", label: "Disclaimer title" },
    { key: "disclaimerText", label: "Disclaimer body" },
    { key: "primaryColor", label: "Primary color" },
    { key: "accentColor", label: "Accent color" },
    { key: "backgroundColor", label: "Page background" },
    { key: "panelColor", label: "Panel color" },
    { key: "textColor", label: "Text color" },
  ];

  topFields.forEach(({ key, label }) => {
    if (current[key] !== baseline[key]) changed.push(label);
  });

  tierNumbers.forEach((tier) => {
    const currentTier = current.tiers[String(tier) as "1" | "2" | "3"];
    const baselineTier = baseline.tiers[String(tier) as "1" | "2" | "3"];
    const tierLabel = currentTier.name.trim() || tierFallbackNames[tier];
    const tierFields: { key: keyof typeof currentTier; label: string }[] = [
      { key: "name", label: "name" },
      { key: "description", label: "description" },
      { key: "questionCount", label: "question count" },
      { key: "secondsPerQuestion", label: "time per question" },
      { key: "passingScore", label: "pass score" },
      { key: "color", label: "color" },
    ];
    const differences = tierFields
      .filter(({ key }) => currentTier[key] !== baselineTier[key])
      .map(({ label }) => label);
    if (differences.length) changed.push(`Tier ${tier} ${tierLabel}: ${differences.join(", ")}`);
  });

  return changed;
}

function FieldLabel({
  htmlFor,
  children,
  hint,
}: {
  htmlFor: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <span className="block text-sm font-medium text-slate-200">
      <label htmlFor={htmlFor}>{children}</label>
      {hint && <span className="mt-0.5 block text-xs font-normal leading-5 text-slate-500">{hint}</span>}
    </span>
  );
}

export default function PageBuilderPanel({
  settings,
  onChange,
  onSave,
  onReset,
  onPreview,
  onTestTier,
  previewKey,
  isSaving,
  isDirty,
  lastSavedAt,
}: PageBuilderPanelProps) {
  const baselineRef = useRef<PageBuilderSettings>(settings);

  useEffect(() => {
    if (!isDirty) baselineRef.current = settings;
  }, [isDirty, settings]);

  const changed = useMemo(
    () => changedSettings(settings, baselineRef.current),
    [settings],
  );

  const previewSrc = `${import.meta.env.BASE_URL}?pageBuilderPreview=1`;
  const statusText = isSaving
    ? "Saving changes"
    : isDirty
      ? `Unsaved changes · ${changed.length} ${changed.length === 1 ? "control" : "controls"} changed`
      : `All changes saved · ${readableSavedTime(lastSavedAt)}`;

  function updateCopy(key: (typeof copyFields)[number]["key"], value: string) {
    onChange({ ...settings, [key]: value });
  }

  function updateTier(
    tier: TierNumber,
    field: "name" | "description" | "questionCount" | "secondsPerQuestion" | "passingScore" | "color",
    value: string | number,
  ) {
    if (tier === 3 && field === "secondsPerQuestion") return;
    const tierKey = String(tier) as "1" | "2" | "3";
    onChange({
      ...settings,
      tiers: {
        ...settings.tiers,
        [tierKey]: { ...settings.tiers[tierKey], [field]: value },
      },
    });
  }

  function updateNumber(
    tier: TierNumber,
    field: "questionCount" | "secondsPerQuestion" | "passingScore",
    rawValue: string,
  ) {
    if (!rawValue || (tier === 3 && field === "secondsPerQuestion")) return;
    const value = Number(rawValue);
    if (!Number.isFinite(value)) return;
    const bounds =
      field === "questionCount" ? [1, 270] : field === "passingScore" ? [50, 100] : [15, 180];
    if (value < bounds[0] || value > bounds[1]) return;
    updateTier(tier, field, Math.round(value));
  }

  return (
    <section className="min-h-[100dvh] bg-[#0b1118] px-3 py-5 text-slate-100 sm:px-5 lg:px-8">
      <div className="mx-auto max-w-[1440px]">
        <header className="mb-5 flex flex-col gap-4 border-b border-slate-800 pb-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-300">
              <ShieldCheck size={14} aria-hidden="true" />
              Owner console / learner experience
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-50 sm:text-3xl">
              Landing page builder
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-400">
              Tune public copy, palette, and exam tiers. Review the real learner page before publishing.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={quietButton}
              onClick={onReset}
              data-testid="button-reset-page-builder"
            >
              <RotateCcw size={15} aria-hidden="true" />
              Reset
            </button>
            <button
              type="button"
              className={quietButton}
              onClick={onPreview}
              data-testid="button-open-page-preview"
            >
              <Eye size={15} aria-hidden="true" />
              Open preview
            </button>
            <button
              type="button"
              className={accentButton}
              onClick={onSave}
              disabled={!isDirty || isSaving}
              data-testid="button-save-page-builder"
            >
              <Save size={15} aria-hidden="true" />
              {isSaving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </header>

        <div
          className={`mb-5 flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
            isDirty
              ? "border-amber-400/25 bg-amber-400/[0.07]"
              : "border-emerald-400/20 bg-emerald-400/[0.055]"
          }`}
          role="status"
          aria-live="polite"
          data-testid="status-page-builder-save"
        >
          <div className="flex items-start gap-3">
            {isSaving ? (
              <Clock3 className="mt-0.5 shrink-0 text-cyan-300" size={17} aria-hidden="true" />
            ) : isDirty ? (
              <AlertTriangle className="mt-0.5 shrink-0 text-amber-300" size={17} aria-hidden="true" />
            ) : (
              <Check className="mt-0.5 shrink-0 text-emerald-300" size={17} aria-hidden="true" />
            )}
            <div>
              <p className="text-sm font-semibold text-slate-100">{statusText}</p>
              <p className="mt-0.5 text-xs text-slate-400">
                {isDirty ? "Preview freely; edits are not live until saved." : "Live settings are unchanged until you save a new version."}
              </p>
            </div>
          </div>
          <span className="shrink-0 text-xs text-slate-400" data-testid="text-last-saved-time">
            Last saved: {readableSavedTime(lastSavedAt)}
          </span>
        </div>

        {isDirty && (
          <div className="mb-5 rounded-xl border border-amber-400/15 bg-[#131a21] px-4 py-3" data-testid="summary-changed-controls">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-amber-200">
              <SlidersHorizontal size={14} aria-hidden="true" />
              Changed controls
            </div>
            {changed.length ? (
              <ul className="mt-2 flex flex-wrap gap-2">
                {changed.map((item) => (
                  <li
                    key={item}
                    className="rounded-md border border-slate-700/80 bg-[#0b1118] px-2.5 py-1 text-xs text-slate-300"
                    data-testid={`changed-control-${item.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                  >
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1.5 text-xs text-slate-400">Pending edits are being synchronized with the builder.</p>
            )}
          </div>
        )}

        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(390px,0.82fr)]">
          <div className="space-y-5">
            <section className={`${cardClass} p-4 sm:p-5`} aria-labelledby="copy-section-title">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.19em] text-cyan-300">01 / Messaging</p>
                  <h2 id="copy-section-title" className="mt-1 text-lg font-semibold text-slate-100">Learner page copy</h2>
                </div>
                <Sparkles size={18} className="mt-1 text-slate-500" aria-hidden="true" />
              </div>

              <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
                {copyFields.map(({ key, label, hint, maxLength }) => (
                  <div key={key}>
                    <FieldLabel htmlFor={`builder-${key}`} hint={hint}>{label}</FieldLabel>
                    <input
                      id={`builder-${key}`}
                      className={fieldClass}
                      value={settings[key]}
                      maxLength={maxLength}
                      onChange={(event) => updateCopy(key, event.target.value)}
                      data-testid={`input-page-copy-${key}`}
                    />
                    <div className="mt-1 text-right text-[10px] tabular-nums text-slate-600" aria-live="polite">
                      {settings[key].length}/{maxLength}
                    </div>
                  </div>
                ))}
                <div>
                  <FieldLabel htmlFor="builder-disclaimer-title">Disclaimer title</FieldLabel>
                  <input
                    id="builder-disclaimer-title"
                    className={fieldClass}
                    value={settings.disclaimerTitle}
                    maxLength={48}
                    onChange={(event) => onChange({ ...settings, disclaimerTitle: event.target.value })}
                    data-testid="input-page-copy-disclaimer-title"
                  />
                </div>
                <div className="sm:col-span-2">
                  <FieldLabel htmlFor="builder-disclaimer-body" hint="Practice notice shown to learners · up to 700 characters">
                    Disclaimer body
                  </FieldLabel>
                  <textarea
                    id="builder-disclaimer-body"
                    className={`${fieldClass} min-h-28 resize-y leading-6`}
                    value={settings.disclaimerText}
                    maxLength={700}
                    onChange={(event) => onChange({ ...settings, disclaimerText: event.target.value })}
                    data-testid="input-page-copy-disclaimer-body"
                  />
                  <div className="mt-1 text-right text-[10px] tabular-nums text-slate-600">
                    {settings.disclaimerText.length}/700
                  </div>
                </div>
              </div>
            </section>

            <section className={`${cardClass} p-4 sm:p-5`} aria-labelledby="palette-section-title">
              <div className="mb-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.19em] text-cyan-300">02 / Visual system</p>
                <h2 id="palette-section-title" className="mt-1 text-lg font-semibold text-slate-100">Page palette</h2>
                <p className="mt-1 text-xs text-slate-500">Hex color values are applied to the public learner page.</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {colorFields.map(({ key, label, note }) => (
                  <label
                    key={key}
                    htmlFor={`builder-${key}`}
                    className="flex min-w-0 items-center gap-3 rounded-lg border border-slate-800 bg-[#0d151e] p-3 transition hover:border-slate-700"
                  >
                    <input
                      id={`builder-${key}`}
                      type="color"
                      value={settings[key]}
                      onChange={(event) => onChange({ ...settings, [key]: event.target.value })}
                      className="h-10 w-11 shrink-0 cursor-pointer rounded-md border border-slate-700 bg-transparent p-1"
                      aria-label={`${label} color`}
                      data-testid={`input-color-${key}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-slate-200">{label}</span>
                      <span className="block truncate text-xs text-slate-500">{note}</span>
                    </span>
                    <code className="text-xs font-medium uppercase tabular-nums text-slate-400" data-testid={`text-color-value-${key}`}>
                      {settings[key]}
                    </code>
                  </label>
                ))}
              </div>
            </section>

            <section className="space-y-3" aria-labelledby="tiers-section-title">
              <div className="flex items-end justify-between gap-3 px-1">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.19em] text-cyan-300">03 / Exam structure</p>
                  <h2 id="tiers-section-title" className="mt-1 text-lg font-semibold text-slate-100">Tier configuration</h2>
                </div>
                <span className="hidden items-center gap-1.5 text-xs text-slate-500 sm:flex">
                  <Timer size={14} aria-hidden="true" /> Timed learner tests
                </span>
              </div>

              {tierNumbers.map((tier) => {
                const tierKey = String(tier) as "1" | "2" | "3";
                const item = settings.tiers[tierKey];
                const hellMode = tier === 3;
                return (
                  <article
                    key={tier}
                    className={`${cardClass} overflow-hidden`}
                    style={{ borderLeftColor: item.color, borderLeftWidth: "3px" }}
                    aria-labelledby={`tier-heading-${tier}`}
                  >
                    <div className="flex flex-col gap-3 border-b border-slate-800/90 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-slate-500">TIER 0{tier}</span>
                          <span className="h-1 w-1 rounded-full bg-slate-600" />
                          <h3 id={`tier-heading-${tier}`} className="text-sm font-semibold text-slate-100">
                            {item.name || tierFallbackNames[tier]}
                          </h3>
                          {hellMode && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-red-400/20 bg-red-400/[0.08] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-200">
                              <LockKeyhole size={10} aria-hidden="true" /> HellMode rule
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {hellMode ? "Fixed 45-second clock; the HellMode rule cannot be overridden." : "Configure learner-facing challenge settings."}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="inline-flex min-h-9 items-center justify-center gap-2 self-start rounded-lg border border-slate-700 bg-[#0c141d] px-3 text-xs font-semibold text-slate-200 transition hover:border-cyan-400/50 hover:text-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70 sm:self-auto"
                        onClick={() => onTestTier(tier)}
                        data-testid={`button-test-tier-${tier}`}
                      >
                        Test tier {tier}
                      </button>
                    </div>
                    <div className="grid gap-x-4 gap-y-3 p-4 sm:grid-cols-2 sm:px-5">
                      <div>
                        <FieldLabel htmlFor={`tier-${tier}-name`}>Tier name</FieldLabel>
                        <input
                          id={`tier-${tier}-name`}
                          className={fieldClass}
                          value={item.name}
                          maxLength={32}
                          onChange={(event) => updateTier(tier, "name", event.target.value)}
                          data-testid={`input-tier-${tier}-name`}
                        />
                      </div>
                      <div>
                        <FieldLabel htmlFor={`tier-${tier}-description`}>Description</FieldLabel>
                        <input
                          id={`tier-${tier}-description`}
                          className={fieldClass}
                          value={item.description}
                          maxLength={80}
                          onChange={(event) => updateTier(tier, "description", event.target.value)}
                          data-testid={`input-tier-${tier}-description`}
                        />
                      </div>
                      <div>
                        <FieldLabel htmlFor={`tier-${tier}-questions`}>Question count <span className="text-slate-500">(1–270)</span></FieldLabel>
                        <input
                          id={`tier-${tier}-questions`}
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={270}
                          step={1}
                          className={fieldClass}
                          value={item.questionCount}
                          onChange={(event) => updateNumber(tier, "questionCount", event.target.value)}
                          data-testid={`input-tier-${tier}-question-count`}
                        />
                      </div>
                      <div>
                        <FieldLabel htmlFor={`tier-${tier}-seconds`}>
                          Seconds per question
                          {hellMode && <span className="ml-1.5 inline-flex items-center gap-1 font-normal text-red-200"><LockKeyhole size={11} aria-hidden="true" /> locked</span>}
                        </FieldLabel>
                        {hellMode ? (
                          <div
                            id={`tier-${tier}-seconds`}
                            className="mt-1.5 flex min-h-[42px] items-center justify-between rounded-lg border border-red-400/20 bg-red-400/[0.06] px-3 text-sm text-red-100"
                            aria-label="Tier 3 seconds per question, locked at 45 seconds by the HellMode rule"
                            data-testid="locked-tier-3-seconds"
                          >
                            <span className="inline-flex items-center gap-2"><LockKeyhole size={14} aria-hidden="true" /> 45 seconds</span>
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-red-200/65">Fixed</span>
                          </div>
                        ) : (
                          <input
                            id={`tier-${tier}-seconds`}
                            type="number"
                            inputMode="numeric"
                            min={15}
                            max={180}
                            step={1}
                            className={fieldClass}
                            value={item.secondsPerQuestion}
                            onChange={(event) => updateNumber(tier, "secondsPerQuestion", event.target.value)}
                            data-testid={`input-tier-${tier}-seconds-per-question`}
                          />
                        )}
                      </div>
                      <div>
                        <FieldLabel htmlFor={`tier-${tier}-pass-score`}>Pass score <span className="text-slate-500">(50–100%)</span></FieldLabel>
                        <div className="relative">
                          <input
                            id={`tier-${tier}-pass-score`}
                            type="number"
                            inputMode="numeric"
                            min={50}
                            max={100}
                            step={1}
                            className={`${fieldClass} pr-9`}
                            value={item.passingScore}
                            onChange={(event) => updateNumber(tier, "passingScore", event.target.value)}
                            data-testid={`input-tier-${tier}-passing-score`}
                          />
                          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">%</span>
                        </div>
                      </div>
                      <div>
                        <span className="block text-sm font-medium text-slate-200">Tier color</span>
                        <label
                          htmlFor={`tier-${tier}-color`}
                          className="mt-1.5 flex min-h-[42px] items-center gap-3 rounded-lg border border-slate-700/80 bg-[#101923] px-3 py-1.5"
                        >
                          <input
                            id={`tier-${tier}-color`}
                            type="color"
                            value={item.color}
                            onChange={(event) => updateTier(tier, "color", event.target.value)}
                            className="h-8 w-9 cursor-pointer rounded border border-slate-700 bg-transparent p-0.5"
                            aria-label={`Tier ${tier} color`}
                            data-testid={`input-tier-${tier}-color`}
                          />
                          <code className="text-xs uppercase text-slate-400">{item.color}</code>
                        </label>
                      </div>
                    </div>
                  </article>
                );
              })}
            </section>
          </div>

          <aside className="xl:sticky xl:top-4">
            <section className={`${cardClass} overflow-hidden`} aria-labelledby="preview-section-title">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3.5 sm:px-5">
                <div>
                  <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-300">
                    <Eye size={13} aria-hidden="true" /> Live learner surface
                  </div>
                  <h2 id="preview-section-title" className="mt-1 text-base font-semibold text-slate-100">Real page preview</h2>
                </div>
                <span className="rounded-md border border-slate-700 bg-[#0d151e] px-2 py-1 font-mono text-[10px] text-slate-400">
                  / · preview mode
                </span>
              </div>
              <div className="border-b border-slate-800 bg-[#0c141d] px-4 py-2.5 sm:px-5">
                <p className="flex items-start gap-2 text-xs leading-5 text-slate-400">
                  <Eye size={14} className="mt-0.5 shrink-0 text-cyan-300" aria-hidden="true" />
                  This is the actual learner homepage in an isolated preview route, not a recreated mockup.
                </p>
              </div>
              <div className="relative bg-[#080d13] p-2 sm:p-3">
                <iframe
                  key={previewKey}
                  src={previewSrc}
                  title="Actual CompTIA learner homepage preview"
                  className="h-[560px] w-full rounded-lg border border-slate-700/80 bg-[#080d13] sm:h-[700px] xl:h-[calc(100dvh-270px)] xl:min-h-[600px]"
                  loading="lazy"
                  data-testid="iframe-learner-page-preview"
                />
                <span className="sr-only" data-testid="text-preview-key">Preview revision {previewKey}</span>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-slate-800 px-4 py-3 sm:px-5">
                <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
                  <LockKeyhole size={12} aria-hidden="true" /> No changes publish until saved
                </span>
                <span className="font-mono text-[10px] text-slate-600" data-testid="text-preview-revision">
                  REV {String(previewKey).padStart(3, "0")}
                </span>
              </div>
            </section>
          </aside>
        </div>

        <div className="mt-6 flex flex-col items-start justify-between gap-3 border-t border-slate-800 pt-4 sm:flex-row sm:items-center">
          <p className="flex items-center gap-2 text-xs text-slate-500" data-testid="text-builder-safety-note">
            <ShieldCheck size={14} className="text-emerald-400" aria-hidden="true" />
            Owner changes are staged here; saving is an explicit action.
          </p>
          <button
            type="button"
            className={`${accentButton} w-full sm:w-auto`}
            onClick={onSave}
            disabled={!isDirty || isSaving}
            data-testid="button-save-page-builder-footer"
          >
            <Save size={15} aria-hidden="true" />
            {isSaving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </section>
  );
}
