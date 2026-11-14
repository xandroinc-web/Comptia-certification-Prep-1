import { useState } from "react";
import { useAuth } from "../lib/auth";
import {
  useGetProductsWithPrices,
  useCreateCheckout,
  useGetAppSettings,
} from "@workspace/api-client-react";
import { Sparkles, Check, Zap, ArrowLeft, Crown, Layers, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PricingPageProps {
  onBack: () => void;
}

type ExamSubject = "A+" | "Network+" | "Security+";

/** Loose shape of one price as returned by GET /products-with-prices
 *  (the generated client types prices as `{ [key: string]: unknown }[]`).
 *  Price metadata IS returned (grant / exam / plan) — the client uses
 *  it to tell the three Full Test prices apart. */
interface StripePrice {
  id?: string;
  unit_amount?: number;
  currency?: string;
  recurring?: { interval?: string; interval_count?: number } | null;
  active?: boolean;
  metadata?: Record<string, string>;
}

interface StripeProduct {
  id?: string;
  name?: string;
  description?: string;
  prices?: StripePrice[];
}

/** Locked prices (USD). Shown as the fallback label when Stripe has
 *  not returned the price yet, and used to recognise a price by amount. */
const LOCKED = {
  membershipMonthly: 20,
  fullTest: 9.99,
  trifectaTests: 24.99,
} as const;

const SINGLE_SUBJECTS: ExamSubject[] = ["A+", "Network+", "Security+"];

/** Real CompTIA exam prices (US list, June 2026). Retakes cost full price again. */
const REAL_EXAM_PRICE_NOTE: Record<ExamSubject, string> = {
  "A+": "The real CompTIA A+ exam costs $548 (two exams at $274 each) — and a retake costs the same again.",
  "Network+": "The real CompTIA Network+ exam costs $399 — and a retake costs the same again.",
  "Security+": "The real CompTIA Security+ exam costs $439 — and a retake costs the same again.",
};

export default function PricingPage({ onBack }: PricingPageProps) {
  const { isSignedIn } = useAuth();
  const { data: productsData, isLoading } = useGetProductsWithPrices({});
  const checkout = useCreateCheckout();
  const { data: appSettings } = useGetAppSettings();
  const [singleSubject, setSingleSubject] = useState<ExamSubject>("A+");

  const products = (productsData?.data || []) as StripeProduct[];

  const nameOf = (p: StripeProduct) => (p.name || "").toLowerCase();
  const allPrices = products.flatMap((p) =>
    (p.prices || []).map((price) => ({ product: p, price })),
  );
  const isRecurring = (price: StripePrice, interval: string, count?: number) =>
    price.recurring?.interval === interval &&
    (count === undefined || (price.recurring?.interval_count ?? 1) === count);
  const isOneTime = (price: StripePrice) => !price.recurring;
  const amount = (price: StripePrice | undefined, fallback: number) =>
    typeof price?.unit_amount === "number" ? price.unit_amount / 100 : fallback;

  // --- Practice Membership ($20/mo recurring) ---------------------------
  // The Stripe price carries metadata plan=membership. Old Pro prices
  // are archived (inactive) so they never appear here.
  const membershipPrice = (
    allPrices.find(
      ({ product, price }) =>
        nameOf(product).includes("practice") &&
        nameOf(product).includes("membership") &&
        isRecurring(price, "month"),
    ) ||
    allPrices.find(
      ({ price }) => isRecurring(price, "month") && price.unit_amount === 2000,
    )
  )?.price;

  // --- Full Test ($9.99 one-time, one attempt, one subject) --------------
  // Prefer the price whose metadata says exam=<subject> (the server
  // grants the attempt from that same metadata), then a per-subject
  // product name, then any $9.99 one-time "full test" price.
  const findFullTestPrice = (subject: ExamSubject): StripePrice | undefined => {
    const byMetadata = allPrices.find(
      ({ product, price }) =>
        nameOf(product).includes("full test") &&
        isOneTime(price) &&
        price.metadata?.exam === subject,
    );
    if (byMetadata) return byMetadata.price;
    const subjectToken = subject.toLowerCase().replace("+", "plus");
    const byName = allPrices.find(
      ({ product, price }) =>
        nameOf(product).includes("full test") &&
        (nameOf(product).includes(subject.toLowerCase()) ||
          nameOf(product).includes(subjectToken)) &&
        isOneTime(price) &&
        price.unit_amount === 999,
    );
    if (byName) return byName.price;
    return allPrices.find(
      ({ product, price }) =>
        nameOf(product).includes("full test") &&
        isOneTime(price) &&
        price.unit_amount === 999,
    )?.price;
  };
  const fullTestPrice = findFullTestPrice(singleSubject);

  // --- Trifecta Tests ($24.99 one-time, one attempt per exam) ------------
  const trifectaPrice = (
    allPrices.find(
      ({ product, price }) =>
        nameOf(product).includes("trifecta") &&
        nameOf(product).includes("tests") &&
        isOneTime(price),
    ) ||
    allPrices.find(
      ({ price }) => isOneTime(price) && price.unit_amount === 2499,
    )
  )?.price;

  const membershipLabel = appSettings?.monthlyPriceLabel
    ? appSettings.monthlyPriceLabel
    : `$${amount(membershipPrice, LOCKED.membershipMonthly).toFixed(2)}`;

  async function handleCheckout(priceId: string | undefined) {
    if (!isSignedIn) {
      // Navigate to sign-in
      window.location.href = `${import.meta.env.BASE_URL}sign-in`;
      return;
    }
    if (!priceId || typeof priceId !== "string") return;
    const result = await checkout.mutateAsync({ data: { priceId } });
    const url = (result as any)?.url;
    if (url && typeof url === "string") {
      window.location.href = url;
    }
  }

  const checkoutButton = (
    price: StripePrice | undefined,
    label: string,
    missingLabel: string,
  ) => (
    <Button
      onClick={() => handleCheckout(price?.id)}
      disabled={checkout.isPending || isLoading || !price?.id}
      className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 h-auto text-base disabled:bg-gray-800 disabled:text-gray-500"
    >
      {checkout.isPending
        ? "Redirecting to checkout..."
        : !price?.id
          ? missingLabel
          : isSignedIn
            ? label
            : "Sign in to Buy"}
    </Button>
  );

  return (
    <div className="min-h-[100dvh] text-white">
      <div className="max-w-6xl mx-auto px-4 py-10">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-gray-400 hover:text-white transition mb-8"
        >
          <ArrowLeft size={18} />
          Back
        </button>

        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-3">
            {appSettings?.pricingHeadline || "Taste it. Train for it. Prove it."}
          </h1>
          <p className="text-gray-400 text-lg">
            Start free. Pay only for the exam prep you actually need.
          </p>
          <p className="text-amber-300 text-sm mt-3 font-medium">
            This is NOT the real CompTIA exam. Trifecta Quiz is a practice
            simulation built to mirror the real exam — same style, same
            timing, same pressure — so you walk into the real test ready to
            pass it the first time.
          </p>
          <p className="text-amber-400 text-sm mt-3 font-medium">
            Founding pricing — locked in for early buyers. Upgrade now
            before launch pricing ends.
          </p>
        </div>

        {/* Free taste */}
        <div className="rounded-2xl border border-gray-800 bg-gray-900/50 p-6 mb-8">
          <div className="flex items-center gap-2 mb-3">
            <Zap size={20} className="text-gray-400" />
            <h2 className="text-xl font-semibold">Free — try it first</h2>
            <span className="text-gray-500 text-sm">$0 · one-time only</span>
          </div>
          <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-gray-400 text-sm">
            <li className="flex items-start gap-2">
              <Check size={16} className="text-emerald-500 mt-0.5 shrink-0" />
              30 free questions, one time only — 15-question Fast quizzes
            </li>
            <li className="flex items-start gap-2">
              <Check size={16} className="text-emerald-500 mt-0.5 shrink-0" />
              OR one free half-simulation — 45 questions, 45 minutes
              (choose questions or the sim — not both)
            </li>
            <li className="flex items-start gap-2">
              <Check size={16} className="text-emerald-500 mt-0.5 shrink-0" />
              Easy difficulty, Tier 1 exams
            </li>
            <li className="flex items-start gap-2">
              <Check size={16} className="text-emerald-500 mt-0.5 shrink-0" />
              Timed practice (60s/question) with pass/fail scoring
            </li>
          </ul>
          <p className="text-gray-400 text-sm mt-4">
            One free taste, once only: 30 free questions OR one free
            half-simulation (45 questions, 45 minutes) — your choice. When
            it&apos;s used, it&apos;s used. No daily refills, no card
            required to try.
          </p>
        </div>

        {/* Pricing buckets */}
        <div className="grid md:grid-cols-3 gap-6">
          {/* TRAIN — Practice Membership */}
          <div className="rounded-2xl border border-gray-800 bg-gray-900/50 p-6 flex flex-col">
            <div className="flex items-center gap-2 mb-1">
              <Crown size={20} className="text-gray-400" />
              <h2 className="text-xl font-semibold">Practice Membership</h2>
            </div>
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-4">
              Train like it&apos;s real
            </p>

            <div className="text-3xl font-bold mb-1">
              {membershipLabel}
              <span className="text-lg font-normal text-gray-500">/mo</span>
            </div>
            <p className="text-gray-500 text-sm mb-6">
              Billed monthly · Cancel anytime
            </p>
            <ul className="space-y-3 text-gray-300 text-sm mb-6">
              <li className="flex items-start gap-2">
                <Check size={16} className="text-emerald-500 mt-0.5 shrink-0" />
                Unlimited Fast quizzes — no free-trial cap
              </li>
              <li className="flex items-start gap-2">
                <Check size={16} className="text-emerald-500 mt-0.5 shrink-0" />
                All tier exams — Mild, Medium, and HellMode
              </li>
              <li className="flex items-start gap-2">
                <Check size={16} className="text-emerald-500 mt-0.5 shrink-0" />
                Weak-area drills for A+, Network+, and Security+
              </li>
              <li className="flex items-start gap-2">
                <Check size={16} className="text-emerald-500 mt-0.5 shrink-0" />
                Detailed analytics, weak-area tracking, custom study plans
              </li>
              <li className="flex items-start gap-2">
                <Check size={16} className="text-emerald-500 mt-0.5 shrink-0" />
                Every future question bank, included
              </li>
              <li className="flex items-start gap-2">
                <Check size={16} className="text-emerald-500 mt-0.5 shrink-0" />
                Ad-free experience + priority support
              </li>
            </ul>
            <p className="text-gray-300 text-sm italic mb-6">
              Practice only — full simulations are one paid attempt each,
              bought separately. Train as long as you need, cancel anytime.
            </p>
            <div className="mt-auto">
              {checkoutButton(
                membershipPrice,
                "Join Practice Membership — $20/mo",
                "Membership coming soon",
              )}
            </div>
          </div>

          {/* PROVE — Full Test, one exam */}
          <div className="rounded-2xl border border-gray-800 bg-gray-900/50 p-6 flex flex-col">
            <div className="flex items-center gap-2 mb-1">
              <BookOpen size={20} className="text-gray-400" />
              <h2 className="text-xl font-semibold">Full Test</h2>
            </div>
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-4">
              One shot. Prove you&apos;re ready.
            </p>
            <div className="text-3xl font-bold mb-1">$9.99</div>
            <p className="text-gray-500 text-sm mb-4">
              one-time · one exam · one attempt · valid 90 days
            </p>

            {/* Subject picker */}
            <div className="flex rounded-lg bg-gray-800/80 p-1 gap-1 mb-4">
              {SINGLE_SUBJECTS.map((subject) => (
                <button
                  key={subject}
                  onClick={() => setSingleSubject(subject)}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition ${
                    singleSubject === subject
                      ? "bg-red-600 text-white"
                      : "text-gray-400 hover:text-gray-200"
                  }`}
                >
                  {subject}
                </button>
              ))}
            </div>

            <ul className="space-y-3 text-gray-400 text-sm mb-6">
              <li className="flex items-start gap-2">
                <Check size={16} className="text-emerald-500 mt-0.5 shrink-0" />
                One full simulation for {singleSubject} — 90 questions, 90
                minutes, 5 scenario questions
              </li>
              <li className="flex items-start gap-2">
                <Check size={16} className="text-emerald-500 mt-0.5 shrink-0" />
                Real exam conditions — 750 to pass, same pressure as the
                real test
              </li>
              <li className="flex items-start gap-2">
                <Check size={16} className="text-emerald-500 mt-0.5 shrink-0" />
                One payment, one attempt — use it within 90 days
              </li>
              <li className="flex items-start gap-2">
                <Check size={16} className="text-emerald-500 mt-0.5 shrink-0" />
                Fail it and you buy another attempt — just like the real
                exam
              </li>
            </ul>
            <p className="text-gray-300 text-sm italic mb-6">
              {REAL_EXAM_PRICE_NOTE[singleSubject]}
            </p>
            <div className="mt-auto">
              {checkoutButton(
                fullTestPrice,
                `Get ${singleSubject} Full Test — $9.99`,
                "Full Test coming soon",
              )}
            </div>
          </div>

          {/* PROVE IT ALL — Trifecta Tests */}
          <div className="rounded-2xl border-2 border-amber-500/70 bg-gradient-to-b from-gray-900 to-gray-950 p-6 relative flex flex-col">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-500 text-black text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1 whitespace-nowrap">
              <Sparkles size={12} />
              MOST POPULAR · SAVE $5
            </div>
            <div className="flex items-center gap-2 mb-1">
              <Layers size={20} className="text-amber-400" />
              <h2 className="text-xl font-semibold">Trifecta Tests</h2>
            </div>
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-4">
              Prove it all. Save $5.
            </p>
            <div className="text-3xl font-bold mb-1">$24.99</div>
            <p className="text-gray-500 text-sm mb-6">
              one-time · A+, Network+, and Security+ · one attempt each · valid 90 days
            </p>
            <ul className="space-y-3 text-gray-300 text-sm mb-6">
              <li className="flex items-start gap-2">
                <Check size={16} className="text-amber-400 mt-0.5 shrink-0" />
                One full-test attempt for EACH exam — A+, Network+, and
                Security+
              </li>
              <li className="flex items-start gap-2">
                <Check size={16} className="text-amber-400 mt-0.5 shrink-0" />
                Full simulations for every exam — 90 questions, 90 minutes
                each
              </li>
              <li className="flex items-start gap-2">
                <Check size={16} className="text-amber-400 mt-0.5 shrink-0" />
                5 scenario questions per exam, 750 to pass
              </li>
              <li className="flex items-start gap-2">
                <Check size={16} className="text-amber-400 mt-0.5 shrink-0" />
                Each attempt valid 90 days from purchase
              </li>
            </ul>
            <p className="text-gray-300 text-sm italic mb-6">
              Three Full Tests would cost $29.97 — get all three attempts
              for $24.99 and save $5.
            </p>
            <div className="mt-auto">
              {checkoutButton(
                trifectaPrice,
                "Get Trifecta Tests — $24.99",
                "Trifecta Tests coming soon",
              )}
            </div>
          </div>
        </div>

        {/* What the real exam costs */}
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-6 mt-8">
          <h2 className="text-xl font-semibold mb-1">
            What the real exam costs — no room for mistakes
          </h2>
          <p className="text-gray-400 text-sm mb-4">
            US list prices from CompTIA, current as of June 2026. Prices vary
            by country — confirm on CompTIA&apos;s store before you buy.
          </p>
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="rounded-xl bg-gray-900/60 border border-gray-800 p-4">
              <p className="text-white font-semibold">CompTIA A+</p>
              <p className="text-gray-500 text-xs mb-1">
                Core 1 (220-1201) + Core 2 (220-1202)
              </p>
              <p className="text-2xl font-bold">$548</p>
              <p className="text-gray-500 text-xs">total — $274 per exam</p>
            </div>
            <div className="rounded-xl bg-gray-900/60 border border-gray-800 p-4">
              <p className="text-white font-semibold">CompTIA Network+</p>
              <p className="text-gray-500 text-xs mb-1">N10-009</p>
              <p className="text-2xl font-bold">$399</p>
              <p className="text-gray-500 text-xs">one exam</p>
            </div>
            <div className="rounded-xl bg-gray-900/60 border border-gray-800 p-4">
              <p className="text-white font-semibold">CompTIA Security+</p>
              <p className="text-gray-500 text-xs mb-1">SY0-701</p>
              <p className="text-2xl font-bold">$439</p>
              <p className="text-gray-500 text-xs">one exam</p>
            </div>
          </div>
          <p className="text-gray-300 text-sm mt-4 font-medium">
            Fail, and you pay the full price again. Practice here first, take
            the real test once.
          </p>
          <a
            href="https://www.comptia.org/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-3 text-amber-400 hover:text-amber-300 text-sm font-semibold underline"
          >
            Book the real exam at CompTIA.org
          </a>
        </div>

        <p className="text-center text-gray-600 text-xs mt-8">
          Founding pricing locked in for early buyers. Cancel anytime. No
          hidden fees. Payments processed securely by Stripe.
        </p>
      </div>
    </div>
  );
}
