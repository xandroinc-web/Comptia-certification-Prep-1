import { useState } from "react";
import { Activity, AlertTriangle, Beaker, Play, ShieldCheck } from "lucide-react";
import {
  DEFAULT_ADMIN_SIMULATION,
  type AdminSimulationConfig,
  type AdminSimulationFlags,
  type AdminSimulationProfile,
} from "@/lib/admin-simulation";

type SimulationLog = {
  id: number;
  action: string;
  targetId: string | null;
  createdAt: string | Date;
};

const profiles: { id: AdminSimulationProfile; label: string; detail: string }[] = [
  { id: "free", label: "Free learner", detail: "Trial count and locked premium features" },
  { id: "pro", label: "Pro learner", detail: "Premium access and unlimited trial bypass" },
  { id: "hellmode", label: "HellMode learner", detail: "Premium access with all exam tiers unlocked" },
  { id: "restricted", label: "Restricted account", detail: "Blocked learner route; no real account is restricted" },
];

const flagLabels: { id: keyof AdminSimulationFlags; label: string; detail: string }[] = [
  { id: "timedSimulations", label: "Timed simulations", detail: "Show or hide the timed exam simulator" },
  { id: "topicStudy", label: "Topic study", detail: "Show or hide topic-based study controls" },
  { id: "tierProgression", label: "Tier progression", detail: "Enable learner progression from Tier 1 to Tier 3" },
  { id: "bonusQuestions", label: "Bonus questions", detail: "Show the bonus round after qualifying results" },
];

export default function AdminSimulationPanel({
  logs,
  onStart,
  starting,
}: {
  logs: SimulationLog[];
  onStart: (config: AdminSimulationConfig) => void;
  starting: boolean;
}) {
  const [config, setConfig] = useState<AdminSimulationConfig>(DEFAULT_ADMIN_SIMULATION);

  function setFlag(flag: keyof AdminSimulationFlags, value: boolean) {
    setConfig((current) => ({
      ...current,
      featureFlags: { ...current.featureFlags, [flag]: value },
    }));
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
      <section className="rounded-2xl border border-white/10 bg-[#0c111b]/90 p-5 shadow-xl shadow-black/10">
        <div className="flex items-start gap-3">
          <div className="rounded-xl border border-violet-400/20 bg-violet-400/10 p-2 text-violet-300">
            <Beaker size={19} />
          </div>
          <div>
            <h2 className="font-semibold">Learner journey simulator</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-400">
              Preview the learner experience with isolated test profiles. These settings live only in this browser tab and do not change a real account, subscription, or production limit.
            </p>
          </div>
        </div>

        <label className="mt-6 block text-sm font-medium text-slate-300">
          Test profile
          <select
            className="mt-2 w-full rounded-lg border border-white/10 bg-[#080c14] px-3 py-2.5 text-sm text-white outline-none focus:border-violet-400/60"
            value={config.profile}
            onChange={(event) =>
              setConfig((current) => ({
                ...current,
                profile: event.target.value as AdminSimulationProfile,
              }))
            }
          >
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.label} — {profile.detail}
              </option>
            ))}
          </select>
        </label>

        <label className="mt-4 block max-w-xs text-sm font-medium text-slate-300">
          Quiz starts allowed in this test session
          <input
            type="number"
            min={0}
            max={100}
            className="mt-2 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-400/60"
            value={config.dailyQuizLimit}
            onChange={(event) =>
              setConfig((current) => ({
                ...current,
                dailyQuizLimit: Math.max(0, Math.min(100, Number(event.target.value) || 0)),
              }))
            }
          />
          <span className="mt-1 block text-xs font-normal text-slate-500">Set to 0 for no session limit.</span>
        </label>

        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Test feature flags</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {flagLabels.map((flag) => (
              <label key={flag.id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-black/20 p-3">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-violet-500"
                  checked={config.featureFlags[flag.id]}
                  onChange={(event) => setFlag(flag.id, event.target.checked)}
                />
                <span>
                  <span className="block text-sm font-medium text-slate-200">{flag.label}</span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">{flag.detail}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        {config.profile === "restricted" && (
          <div className="mt-4 flex gap-2 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-xs leading-5 text-amber-200">
            <AlertTriangle className="mt-0.5 shrink-0" size={15} />
            This profile only displays a simulated restricted-access screen. It does not ban, lock, or otherwise modify any Clerk user.
          </div>
        )}

        <button
          type="button"
          disabled={starting}
          onClick={() => onStart(config)}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:cursor-wait disabled:opacity-60"
        >
          <Play size={16} />
          {starting ? "Preparing test session…" : "Start simulated learner session"}
        </button>
      </section>

      <section className="rounded-2xl border border-white/10 bg-[#0c111b]/90 p-5 shadow-xl shadow-black/10">
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-2 text-emerald-300">
            <ShieldCheck size={19} />
          </div>
          <div>
            <h2 className="font-semibold">Access boundaries</h2>
            <p className="mt-1 text-sm text-slate-500">The simulator changes only the owner’s test view.</p>
          </div>
        </div>
        <div className="mt-5 space-y-3 text-sm leading-6 text-slate-400">
          <p>Admin API permissions remain based on the signed-in Clerk identity and server-side role assignment.</p>
          <p>Simulated Free, Pro, HellMode, and Restricted states are not written to subscriptions, user metadata, or account records.</p>
          <p>Simulation starts and learner journey events are recorded in the protected admin audit log.</p>
        </div>
        <div className="mt-7 border-t border-white/10 pt-5">
          <div className="flex items-center gap-2">
            <Activity size={15} className="text-violet-300" />
            <h3 className="text-sm font-semibold">Recent simulation events</h3>
          </div>
          <div className="mt-3 max-h-[360px] space-y-2 overflow-y-auto">
            {logs.map((log) => (
              <div key={log.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-black/20 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm text-slate-300">{log.action.replace("simulation.", "").replaceAll("_", " ")}</p>
                  <p className="mt-0.5 text-xs capitalize text-slate-600">{log.targetId ?? "unknown profile"}</p>
                </div>
                <time className="shrink-0 text-[11px] text-slate-600">
                  {new Date(log.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </time>
              </div>
            ))}
            {!logs.length && (
              <p className="rounded-lg border border-dashed border-white/10 px-3 py-5 text-center text-xs text-slate-600">No simulation sessions logged yet.</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
