import { useState } from "react";
import { useAuth } from "@clerk/react";
import {
  useGetProductsWithPrices,
  useCreateCheckout,
} from "@workspace/api-client-react";
import { Sparkles, Check, Zap, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PricingPageProps {
  onBack: () => void;
}

export default function PricingPage({ onBack }: PricingPageProps) {
  const { isSignedIn } = useAuth();
  const { data: productsData, isLoading } = useGetProductsWithPrices({});
  const checkout = useCreateCheckout();
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("yearly");

  const products = productsData?.data || [];
  const proProduct = products.find((p) => p.name?.includes("Pro")) || products[0];

  const monthlyPrice = proProduct?.prices?.find(
    (p: any) => p.recurring?.interval === "month"
  );
  const yearlyPrice = proProduct?.prices?.find(
    (p: any) => p.recurring?.interval === "year"
  );

  const selectedPrice = billingCycle === "monthly" ? monthlyPrice : yearlyPrice;
  const unitAmount = selectedPrice?.unit_amount as number | undefined;
  const priceAmount = unitAmount
    ? (unitAmount / 100).toFixed(2)
    : billingCycle === "monthly" ? "9.99" : "79.99";

  async function handleSubscribe() {
    if (!isSignedIn) {
      // Navigate to sign-in
      window.location.href = `${import.meta.env.BASE_URL}sign-in`;
      return;
    }
    const priceId = selectedPrice?.id;
    if (!priceId || typeof priceId !== "string") return;
    const result = await checkout.mutateAsync({ data: { priceId } });
    const url = (result as any)?.url;
    if (url && typeof url === "string") {
      window.location.href = url;
    }
  }

  return (
    <div className="min-h-[100dvh] text-white">
      <div className="max-w-4xl mx-auto px-4 py-10">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-gray-400 hover:text-white transition mb-8"
        >
          <ArrowLeft size={18} />
          Back
        </button>

        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold mb-3">Upgrade to Pro</h1>
          <p className="text-gray-400 text-lg">
            Unlock everything. No limits. Full control.
          </p>
        </div>

        {/* Billing toggle */}
        <div className="flex justify-center mb-10">
          <div className="inline-flex bg-gray-900 rounded-lg p-1 border border-gray-800">
            <button
              onClick={() => setBillingCycle("monthly")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                billingCycle === "monthly"
                  ? "bg-red-600 text-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingCycle("yearly")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition flex items-center gap-2 ${
                billingCycle === "yearly"
                  ? "bg-red-600 text-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              Yearly
              <span className="bg-emerald-500/20 text-emerald-400 text-xs px-2 py-0.5 rounded">
                Save 33%
              </span>
            </button>
          </div>
        </div>

        {/* Pricing cards */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Free tier */}
          <div className="rounded-2xl border border-gray-800 bg-gray-900/50 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Zap size={20} className="text-gray-400" />
              <h2 className="text-xl font-semibold">Free</h2>
            </div>
            <div className="text-3xl font-bold mb-1">$0</div>
            <p className="text-gray-500 text-sm mb-6">forever</p>
            <ul className="space-y-3 text-gray-400 text-sm">
              <li className="flex items-start gap-2">
                <Check size={16} className="text-emerald-500 mt-0.5 shrink-0" />
                270 practice questions
              </li>
              <li className="flex items-start gap-2">
                <Check size={16} className="text-emerald-500 mt-0.5 shrink-0" />
                Basic quiz mode
              </li>
              <li className="flex items-start gap-2">
                <Check size={16} className="text-emerald-500 mt-0.5 shrink-0" />
                Timed practice (60s/question)
              </li>
              <li className="flex items-start gap-2">
                <Check size={16} className="text-emerald-500 mt-0.5 shrink-0" />
                Pass/fail scoring
              </li>
            </ul>
          </div>

          {/* Pro tier */}
          <div className="rounded-2xl border-2 border-red-600 bg-gradient-to-b from-gray-900 to-gray-950 p-6 relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-red-600 text-white text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
              <Sparkles size={12} />
              MOST POPULAR
            </div>
            <div className="flex items-center gap-2 mb-4">
              <Sparkles size={20} className="text-red-500" />
              <h2 className="text-xl font-semibold">CompTIA Pro</h2>
            </div>
            <div className="text-3xl font-bold mb-1">
              ${priceAmount}
              <span className="text-lg font-normal text-gray-500">
                /{billingCycle === "monthly" ? "mo" : "yr"}
              </span>
            </div>
            <p className="text-gray-500 text-sm mb-6">
              {billingCycle === "yearly" ? "Billed annually" : "Billed monthly"}
            </p>
            <ul className="space-y-3 text-gray-300 text-sm mb-6">
              <li className="flex items-start gap-2">
                <Check size={16} className="text-red-500 mt-0.5 shrink-0" />
                Everything in Free
              </li>
              <li className="flex items-start gap-2">
                <Check size={16} className="text-red-500 mt-0.5 shrink-0" />
                Unlimited quiz retakes
              </li>
              <li className="flex items-start gap-2">
                <Check size={16} className="text-red-500 mt-0.5 shrink-0" />
                Detailed analytics dashboard
              </li>
              <li className="flex items-start gap-2">
                <Check size={16} className="text-red-500 mt-0.5 shrink-0" />
                Custom study plans
              </li>
              <li className="flex items-start gap-2">
                <Check size={16} className="text-red-500 mt-0.5 shrink-0" />
                Weak area tracking + reports
              </li>
              <li className="flex items-start gap-2">
                <Check size={16} className="text-red-500 mt-0.5 shrink-0" />
                Ad-free experience
              </li>
              <li className="flex items-start gap-2">
                <Check size={16} className="text-red-500 mt-0.5 shrink-0" />
                Priority support
              </li>
            </ul>
            <Button
              onClick={handleSubscribe}
              disabled={checkout.isPending || isLoading}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 h-auto text-base"
            >
              {checkout.isPending
                ? "Redirecting to checkout..."
                : isSignedIn
                ? "Subscribe Now"
                : "Sign in to Subscribe"}
            </Button>
          </div>
        </div>

        <p className="text-center text-gray-600 text-xs mt-8">
          Cancel anytime. No hidden fees. Payments processed securely by Stripe.
        </p>
      </div>
    </div>
  );
}
