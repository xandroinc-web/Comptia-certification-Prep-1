import { useEffect, useMemo, useState } from "react";
import { useUser } from "@clerk/react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ArrowLeft,
  Ban,
  Check,
  ClipboardList,
  ExternalLink,
  Link2,
  Loader2,
  LockKeyhole,
  LogOut,
  MonitorPlay,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  Video,
  X,
} from "lucide-react";
import {
  AdminMedia,
  AdminUser,
  getGetAdminOverviewQueryKey,
  getGetAdminUsersQueryKey,
  useApplyAdminUserAction,
  useCreateAdminMedia,
  useCreateAdminUser,
  useDeleteAdminMedia,
  useGetAdminOverview,
  useGetAdminUsers,
  useUpdateAdminMedia,
  useUpdateAdminSettings,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";

type Section = "overview" | "testing" | "pricing" | "media" | "users" | "settings" | "audit";

const sections: { id: Section; label: string; icon: typeof Activity }[] = [
  { id: "overview", label: "Overview", icon: Activity },
  { id: "testing", label: "Quiz lab", icon: MonitorPlay },
  { id: "pricing", label: "Pricing", icon: ClipboardList },
  { id: "media", label: "Videos & links", icon: Video },
  { id: "users", label: "Users", icon: Users },
  { id: "settings", label: "App settings", icon: Settings },
  { id: "audit", label: "Audit history", icon: LockKeyhole },
];

const inputClass =
  "w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none transition focus:border-red-500/70";
const cardClass = "rounded-2xl border border-white/10 bg-[#0c111b]/90 p-5 shadow-xl shadow-black/10";

function errorText(error: unknown): string {
  const data = (error as any)?.data;
  return typeof data?.error === "string" ? data.error : "Something went wrong. Try again.";
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function StatCard({ label, value, detail }: { label: string; value: number | string; detail: string }) {
  return (
    <div className={cardClass}>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-bold text-white">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-slate-500">{children}</div>;
}

export default function AdminPage() {
  const [, setLocation] = useLocation();
  const { user, isLoaded, isSignedIn } = useUser();
  const queryClient = useQueryClient();
  const [section, setSection] = useState<Section>("overview");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [newMedia, setNewMedia] = useState({ kind: "video", title: "", url: "", description: "" });
  const [newUser, setNewUser] = useState({ email: "", firstName: "", lastName: "" });
  const [settings, setSettings] = useState({
    announcement: "",
    maintenanceMode: false,
    pricingHeadline: "Upgrade to Pro",
    monthlyPriceLabel: "",
    yearlyPriceLabel: "",
    defaultTimeLimitSeconds: 60,
    anonymousTrialLimit: 1,
    freeTrialLimit: 3,
  });

  const overview = useGetAdminOverview({
    query: {
      enabled: Boolean(isLoaded && isSignedIn),
      retry: false,
    },
  });
  const users = useGetAdminUsers(
    { query: search.trim() || undefined, limit: 50 },
    { query: { enabled: Boolean(overview.data && section === "users"), retry: false } },
  );
  const updateSettings = useUpdateAdminSettings();
  const createMedia = useCreateAdminMedia();
  const updateMedia = useUpdateAdminMedia();
  const deleteMedia = useDeleteAdminMedia();
  const createUser = useCreateAdminUser();
  const userAction = useApplyAdminUserAction();

  const isAuthorized = Boolean(overview.data);
  const settingsValue = useMemo(
    () => overview.data?.settings.find((setting) => setting.key === "app")?.value,
    [overview.data?.settings],
  );

  useEffect(() => {
    if (settingsValue) {
      setSettings((current) => ({
        ...current,
        announcement: typeof settingsValue.announcement === "string" ? settingsValue.announcement : "",
        maintenanceMode: settingsValue.maintenanceMode === true,
        pricingHeadline: typeof settingsValue.pricingHeadline === "string" ? settingsValue.pricingHeadline : "Upgrade to Pro",
        monthlyPriceLabel: typeof settingsValue.monthlyPriceLabel === "string" ? settingsValue.monthlyPriceLabel : "",
        yearlyPriceLabel: typeof settingsValue.yearlyPriceLabel === "string" ? settingsValue.yearlyPriceLabel : "",
        defaultTimeLimitSeconds: Number(settingsValue.defaultTimeLimitSeconds) || 60,
        anonymousTrialLimit: Number(settingsValue.anonymousTrialLimit) || 1,
        freeTrialLimit: Number(settingsValue.freeTrialLimit) || 3,
      }));
    }
  }, [settingsValue]);

  function invalidateOverview() {
    queryClient.invalidateQueries({ queryKey: getGetAdminOverviewQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetAdminUsersQueryKey() });
  }

  function notify(text: string) {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 3200);
  }

  async function saveSettings() {
    try {
      await updateSettings.mutateAsync({ data: settings });
      invalidateOverview();
      notify("App settings saved.");
    } catch (error) {
      notify(errorText(error));
    }
  }

  async function addMedia(event: React.FormEvent) {
    event.preventDefault();
    try {
      await createMedia.mutateAsync({ data: { ...newMedia, active: true } });
      setNewMedia({ kind: "video", title: "", url: "", description: "" });
      invalidateOverview();
      notify("Media item added.");
    } catch (error) {
      notify(errorText(error));
    }
  }

  async function toggleMedia(item: AdminMedia) {
    try {
      await updateMedia.mutateAsync({ id: item.id, data: { active: !item.active } });
      invalidateOverview();
      notify(item.active ? "Item hidden." : "Item published.");
    } catch (error) {
      notify(errorText(error));
    }
  }

  async function removeMedia(item: AdminMedia) {
    if (!window.confirm(`Delete “${item.title}”? This cannot be undone.`)) return;
    try {
      await deleteMedia.mutateAsync({ id: item.id });
      invalidateOverview();
      notify("Media item deleted.");
    } catch (error) {
      notify(errorText(error));
    }
  }

  async function addUser(event: React.FormEvent) {
    event.preventDefault();
    try {
      await createUser.mutateAsync({ data: newUser });
      setNewUser({ email: "", firstName: "", lastName: "" });
      invalidateOverview();
      notify("User created in Clerk.");
    } catch (error) {
      notify(errorText(error));
    }
  }

  async function applyUserAction(target: AdminUser, action: "ban" | "unban" | "delete" | "cancel_subscription") {
    const labels = {
      ban: "block",
      unban: "unblock",
      delete: "delete",
      cancel_subscription: "cancel the subscription for",
    };
    if (!window.confirm(`Are you sure you want to ${labels[action]} ${target.email ?? target.id}?`)) return;
    try {
      await userAction.mutateAsync({ userId: target.id, data: { action } });
      invalidateOverview();
      notify(`User action “${action.replace("_", " ")}” completed.`);
    } catch (error) {
      notify(errorText(error));
    }
  }

  if (!isLoaded || overview.isLoading) {
    return (
      <div className="min-h-screen bg-[#060910] px-6 py-20 text-center text-slate-400">
        <Loader2 className="mx-auto animate-spin text-red-500" />
        <p className="mt-3 text-sm">Checking admin access…</p>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="min-h-screen bg-[#060910] px-6 py-20 text-center text-white">
        <ShieldCheck className="mx-auto text-red-500" size={42} />
        <h1 className="mt-4 text-2xl font-bold">Admin sign-in required</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">Sign in with the protected owner account to continue.</p>
        <Button className="mt-6 bg-red-600 hover:bg-red-500" onClick={() => setLocation("/sign-in")}>Sign in</Button>
      </div>
    );
  }

  if (!isAuthorized) {
    const notConfigured = (overview.error as any)?.data?.code === "ADMIN_NOT_ALLOWED";
    return (
      <div className="min-h-screen bg-[#060910] px-6 py-20 text-white">
        <div className="mx-auto max-w-xl rounded-3xl border border-red-500/20 bg-[#0c111b] p-8 text-center shadow-2xl shadow-red-950/20">
          <LockKeyhole className="mx-auto text-red-500" size={42} />
          <h1 className="mt-5 text-2xl font-bold">{notConfigured ? "Owner access is not enabled" : "Admin panel unavailable"}</h1>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            {notConfigured
              ? "Add this Clerk user ID to the server-side ADMIN_USER_IDS environment variable, then reload this page."
              : errorText(overview.error)}
          </p>
          {notConfigured && (
            <div className="mt-5 rounded-xl border border-white/10 bg-black/20 p-3 text-left">
              <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-500">Your Clerk user ID</p>
              <code className="mt-2 block break-all text-sm text-red-300">{user?.id}</code>
            </div>
          )}
          <Button variant="outline" className="mt-6" onClick={() => setLocation("/")}>
            <ArrowLeft size={16} /> Back to quiz
          </Button>
        </div>
      </div>
    );
  }

  const stats = overview.data.stats;
  const title = section === "overview" ? "Command center" : sections.find((item) => item.id === section)?.label;

  return (
    <div className="min-h-screen bg-[#060910] text-white">
      <div className="mx-auto flex min-h-screen max-w-[1500px]">
        <aside className="hidden w-64 shrink-0 border-r border-white/10 bg-[#090d15] p-5 lg:block">
          <button className="mb-10 flex items-center gap-3 text-left" onClick={() => setLocation("/")}>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-600/15 text-red-500"><ShieldCheck size={22} /></div>
            <div><p className="font-bold">CompTIA</p><p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Owner console</p></div>
          </button>
          <nav className="space-y-1">
            {sections.map((item) => {
              const Icon = item.icon;
              return (
                <button key={item.id} onClick={() => setSection(item.id)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${section === item.id ? "bg-red-600/15 text-red-300" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}>
                  <Icon size={17} /> {item.label}
                </button>
              );
            })}
          </nav>
          <div className="mt-auto pt-12">
            <button onClick={() => setLocation("/")} className="flex items-center gap-2 px-3 py-2 text-sm text-slate-500 hover:text-white"><LogOut size={16} /> Exit console</button>
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-4 py-5 sm:px-7 lg:px-10">
          <header className="mb-7 flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
            <div className="flex items-center gap-3">
              <button className="text-slate-500 hover:text-white lg:hidden" onClick={() => setLocation("/")}><ArrowLeft size={18} /></button>
              <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-400">Admin / {section}</p><h1 className="mt-1 text-2xl font-bold">{title}</h1></div>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span className="hidden sm:inline">{user?.primaryEmailAddress?.emailAddress}</span>
              <Button variant="outline" size="sm" onClick={() => overview.refetch()}><RefreshCw size={14} /> Refresh</Button>
            </div>
          </header>

          {message && <div className="mb-5 flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300"><Check size={16} /> {message}</div>}

          {section === "overview" && (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard label="Accounts" value={stats.users} detail="Managed by Clerk" />
                <StatCard label="Quiz attempts" value={stats.quizResults} detail="Saved result records" />
                <StatCard label="Pro subscribers" value={stats.activeSubscriptions} detail="Active or trialing" />
                <StatCard label="Live media" value={stats.activeMedia} detail="Videos and links" />
              </div>
              <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                <div className={cardClass}>
                  <div className="flex items-center justify-between"><div><h2 className="font-semibold">Owner shortcuts</h2><p className="mt-1 text-sm text-slate-500">Safe entry points for testing the real product.</p></div><Activity className="text-red-500" size={20} /></div>
                  <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    {[["Run a quiz", "/", "Open learner view"], ["/progress", "/progress", "Check progress"], ["/pricing", "/pricing", "Preview pricing"]].map(([label, path, detail]) => (
                      <button key={path} onClick={() => setLocation(path)} className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-left hover:border-red-500/40"><ExternalLink className="text-red-400" size={16} /><p className="mt-3 text-sm font-medium">{label}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></button>
                    ))}
                  </div>
                </div>
                <div className={cardClass}>
                  <h2 className="font-semibold">Latest activity</h2>
                  <div className="mt-4 space-y-3">
                    {overview.data.auditLogs.slice(0, 5).map((log) => <div key={log.id} className="flex items-start justify-between gap-3 text-sm"><div><p className="text-slate-300">{log.action}</p><p className="text-xs text-slate-600">{log.targetType} {log.targetId ?? ""}</p></div><time className="shrink-0 text-xs text-slate-600">{formatDate(log.createdAt)}</time></div>)}
                    {!overview.data.auditLogs.length && <EmptyState>No admin actions yet.</EmptyState>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {section === "testing" && (
            <div className="grid gap-6 xl:grid-cols-2">
              <div className={cardClass}><h2 className="font-semibold">Quiz lab</h2><p className="mt-2 text-sm leading-6 text-slate-400">Test the production learner flows without a questionnaire bypass. These buttons open the same routes a learner uses.</p><div className="mt-5 space-y-3">{[["Full practice", "/", "Mixed difficulty and timed flow"], ["Progress history", "/progress", "Saved scores and weak areas"], ["Pricing checkout", "/pricing", "Stripe products and subscription CTA"]].map(([label, path, detail]) => <button key={path} onClick={() => setLocation(path)} className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-black/20 p-4 text-left hover:border-red-500/40"><span><span className="block text-sm font-medium">{label}</span><span className="mt-1 block text-xs text-slate-500">{detail}</span></span><ExternalLink size={16} className="text-red-400" /></button>)}</div></div>
              <div className={cardClass}><h2 className="font-semibold">Guardrails</h2><div className="mt-5 space-y-4 text-sm text-slate-400"><p className="flex gap-3"><Check className="shrink-0 text-emerald-400" size={17} /> Tier locks and trial limits still apply in the learner flow.</p><p className="flex gap-3"><Check className="shrink-0 text-emerald-400" size={17} /> Admin API access is server-authorized, not route-hidden.</p><p className="flex gap-3"><Check className="shrink-0 text-emerald-400" size={17} /> Every content and account action is written to audit history.</p><p className="flex gap-3"><Check className="shrink-0 text-emerald-400" size={17} /> Clerk credentials never enter the browser.</p></div></div>
            </div>
          )}

          {section === "pricing" && (
            <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
              <div className={cardClass}><h2 className="font-semibold">Public pricing copy</h2><p className="mt-2 text-sm text-slate-500">Control the learner-facing labels without changing Stripe objects.</p><div className="mt-5 space-y-4"><label className="block text-sm text-slate-300">Headline<input className={`${inputClass} mt-2`} value={settings.pricingHeadline} onChange={(e) => setSettings({ ...settings, pricingHeadline: e.target.value })} /></label><label className="block text-sm text-slate-300">Monthly display override<input className={`${inputClass} mt-2`} placeholder="Leave blank to use Stripe" value={settings.monthlyPriceLabel} onChange={(e) => setSettings({ ...settings, monthlyPriceLabel: e.target.value })} /></label><label className="block text-sm text-slate-300">Yearly display override<input className={`${inputClass} mt-2`} placeholder="Leave blank to use Stripe" value={settings.yearlyPriceLabel} onChange={(e) => setSettings({ ...settings, yearlyPriceLabel: e.target.value })} /></label><Button onClick={saveSettings} disabled={updateSettings.isPending} className="bg-red-600 hover:bg-red-500"><Save size={16} /> Save pricing copy</Button></div></div>
              <div className={cardClass}><h2 className="font-semibold">Stripe catalog</h2><p className="mt-2 text-sm text-slate-500">Live products and prices currently available for checkout.</p><div className="mt-5 space-y-3">{overview.data.products.map((product: any) => <div key={product.id} className="rounded-xl border border-white/10 p-4"><div className="flex items-center justify-between"><p className="font-medium">{product.name ?? "Untitled product"}</p><span className={product.active ? "text-emerald-400" : "text-slate-600"}>{product.active ? "Active" : "Archived"}</span></div><div className="mt-3 grid gap-2 sm:grid-cols-2">{(product.prices ?? []).map((price: any) => <div key={price.id} className="rounded-lg bg-black/20 px-3 py-2 text-xs text-slate-400"><span className="font-semibold text-white">{price.amount != null ? `${(price.amount / 100).toFixed(2)} ${(price.currency ?? "").toUpperCase()}` : "No amount"}</span><span className="ml-2">{price.recurring?.interval ?? "one-time"}</span></div>)}</div></div>)}{!overview.data.products.length && <EmptyState>No Stripe products available.</EmptyState>}</div></div>
            </div>
          )}

          {section === "media" && (
            <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
              <form className={cardClass} onSubmit={addMedia}><h2 className="font-semibold">Add a media item</h2><p className="mt-2 text-sm text-slate-500">Keep learner resources in one controlled place.</p><div className="mt-5 space-y-4"><label className="block text-sm text-slate-300">Type<select className={`${inputClass} mt-2`} value={newMedia.kind} onChange={(e) => setNewMedia({ ...newMedia, kind: e.target.value })}><option value="video">Video</option><option value="link">External link</option></select></label><label className="block text-sm text-slate-300">Title<input required className={`${inputClass} mt-2`} value={newMedia.title} onChange={(e) => setNewMedia({ ...newMedia, title: e.target.value })} /></label><label className="block text-sm text-slate-300">URL<input required type="url" className={`${inputClass} mt-2`} placeholder="https://" value={newMedia.url} onChange={(e) => setNewMedia({ ...newMedia, url: e.target.value })} /></label><label className="block text-sm text-slate-300">Description<textarea className={`${inputClass} mt-2 min-h-20`} value={newMedia.description} onChange={(e) => setNewMedia({ ...newMedia, description: e.target.value })} /></label><Button disabled={createMedia.isPending} className="bg-red-600 hover:bg-red-500"><Plus size={16} /> Add item</Button></div></form>
              <div className={cardClass}><div className="flex items-center justify-between"><div><h2 className="font-semibold">Published resources</h2><p className="mt-1 text-sm text-slate-500">Hide an item to preserve it without deleting it.</p></div><Link2 className="text-red-400" size={20} /></div><div className="mt-5 space-y-3">{overview.data.media.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/10 p-4"><div className="flex min-w-0 items-center gap-3"><div className="rounded-lg bg-red-500/10 p-2 text-red-400">{item.kind === "video" ? <Video size={17} /> : <Link2 size={17} />}</div><div className="min-w-0"><p className="truncate text-sm font-medium">{item.title}</p><p className="truncate text-xs text-slate-500">{item.url}</p></div></div><div className="flex items-center gap-2"><button onClick={() => toggleMedia(item)} className={`rounded-lg px-2.5 py-1.5 text-xs ${item.active ? "bg-emerald-500/10 text-emerald-300" : "bg-white/5 text-slate-500"}`}>{item.active ? "Live" : "Hidden"}</button><a href={item.url} target="_blank" rel="noreferrer" className="rounded-lg p-2 text-slate-500 hover:bg-white/5 hover:text-white"><ExternalLink size={15} /></a><button onClick={() => removeMedia(item)} className="rounded-lg p-2 text-slate-500 hover:bg-red-500/10 hover:text-red-300"><Trash2 size={15} /></button></div></div>)}{!overview.data.media.length && <EmptyState>No videos or links yet.</EmptyState>}</div></div>
            </div>
          )}

          {section === "users" && (
            <div className="space-y-6">
              <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
                <form className={cardClass} onSubmit={addUser}><h2 className="font-semibold">Add user</h2><p className="mt-2 text-sm text-slate-500">Creates the account in Clerk. The user completes sign-in setup through the normal auth flow.</p><div className="mt-5 space-y-3"><input required type="email" className={inputClass} placeholder="Email address" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} /><input className={inputClass} placeholder="First name" value={newUser.firstName} onChange={(e) => setNewUser({ ...newUser, firstName: e.target.value })} /><input className={inputClass} placeholder="Last name" value={newUser.lastName} onChange={(e) => setNewUser({ ...newUser, lastName: e.target.value })} /><Button disabled={createUser.isPending} className="bg-red-600 hover:bg-red-500"><UserPlus size={16} /> Create user</Button></div></form>
                <div className={cardClass}><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Account directory</h2><p className="mt-1 text-sm text-slate-500">{users.data?.totalCount ?? 0} matching accounts</p></div><div className="relative"><Search size={15} className="absolute left-3 top-2.5 text-slate-500" /><input className={`${inputClass} w-64 pl-9`} placeholder="Search email or name" value={search} onChange={(e) => setSearch(e.target.value)} /></div></div><div className="mt-5 space-y-3">{users.isLoading && <div className="py-8 text-center text-sm text-slate-500"><Loader2 className="mx-auto animate-spin" size={18} /></div>}{users.data?.data.map((target) => <div key={target.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 p-4"><div><div className="flex items-center gap-2"><p className="text-sm font-medium">{[target.firstName, target.lastName].filter(Boolean).join(" ") || "Unnamed user"}</p>{target.banned && <span className="rounded bg-red-500/10 px-2 py-0.5 text-[10px] text-red-300">Blocked</span>}</div><p className="mt-1 text-xs text-slate-500">{target.email ?? target.id}</p></div><div className="flex flex-wrap gap-2"><button onClick={() => applyUserAction(target, target.banned ? "unban" : "ban")} className="rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-slate-400 hover:border-red-500/40 hover:text-white">{target.banned ? <><Check size={13} className="mr-1 inline" />Unblock</> : <><Ban size={13} className="mr-1 inline" />Block</>}</button><button onClick={() => applyUserAction(target, "cancel_subscription")} className="rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-slate-400 hover:border-amber-500/40 hover:text-white">Cancel Pro</button><button onClick={() => applyUserAction(target, "delete")} className="rounded-lg border border-red-500/20 px-2.5 py-1.5 text-xs text-red-300 hover:bg-red-500/10"><Trash2 size={13} className="mr-1 inline" />Delete</button></div></div>)}{!users.isLoading && !users.data?.data.length && <EmptyState>No users found.</EmptyState>}</div></div>
              </div>
            </div>
          )}

          {section === "settings" && (
            <div className="max-w-2xl">
              <div className={cardClass}><h2 className="font-semibold">App-wide configuration</h2><p className="mt-2 text-sm leading-6 text-slate-500">These controls affect public copy and operational defaults. They do not unlock quiz content or bypass learner limits.</p><div className="mt-6 space-y-5"><label className="block text-sm text-slate-300">Announcement banner<textarea className={`${inputClass} mt-2 min-h-24`} placeholder="Optional message shown on the home screen" value={settings.announcement} onChange={(e) => setSettings({ ...settings, announcement: e.target.value })} /></label><label className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-slate-300"><input type="checkbox" checked={settings.maintenanceMode} onChange={(e) => setSettings({ ...settings, maintenanceMode: e.target.checked })} className="h-4 w-4 accent-red-600" /> Show maintenance mode notice</label><div className="grid gap-4 sm:grid-cols-3"><label className="text-sm text-slate-300">Default timer (sec)<input type="number" min={10} className={`${inputClass} mt-2`} value={settings.defaultTimeLimitSeconds} onChange={(e) => setSettings({ ...settings, defaultTimeLimitSeconds: Number(e.target.value) })} /></label><label className="text-sm text-slate-300">Anonymous trials<input type="number" min={0} className={`${inputClass} mt-2`} value={settings.anonymousTrialLimit} onChange={(e) => setSettings({ ...settings, anonymousTrialLimit: Number(e.target.value) })} /></label><label className="text-sm text-slate-300">Free trials<input type="number" min={0} className={`${inputClass} mt-2`} value={settings.freeTrialLimit} onChange={(e) => setSettings({ ...settings, freeTrialLimit: Number(e.target.value) })} /></label></div><Button onClick={saveSettings} disabled={updateSettings.isPending} className="bg-red-600 hover:bg-red-500"><Save size={16} /> Save settings</Button></div></div>
            </div>
          )}

          {section === "audit" && (
            <div className={cardClass}><div className="flex items-center justify-between"><div><h2 className="font-semibold">Audit history</h2><p className="mt-1 text-sm text-slate-500">A server-recorded trail of admin mutations.</p></div><LockKeyhole className="text-red-400" size={20} /></div><div className="mt-5 overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead className="text-xs uppercase tracking-wider text-slate-600"><tr><th className="pb-3">Action</th><th className="pb-3">Target</th><th className="pb-3">Actor</th><th className="pb-3">When</th></tr></thead><tbody>{overview.data.auditLogs.map((log) => <tr key={log.id} className="border-t border-white/5"><td className="py-3 text-slate-300">{log.action}</td><td className="py-3 text-slate-500">{log.targetType} {log.targetId ?? "—"}</td><td className="py-3 font-mono text-xs text-slate-600">{log.actorUserId}</td><td className="py-3 text-slate-500">{formatDate(log.createdAt)}</td></tr>)}</tbody></table>{!overview.data.auditLogs.length && <EmptyState>No audit events yet.</EmptyState>}</div></div>
          )}
        </main>
      </div>
    </div>
  );
}