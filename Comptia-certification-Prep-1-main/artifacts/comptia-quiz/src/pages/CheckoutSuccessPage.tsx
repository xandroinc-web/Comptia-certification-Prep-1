import { useEffect } from "react";
import { CheckCircle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CheckoutSuccessPageProps {
  onHome: () => void;
}

export default function CheckoutSuccessPage({ onHome }: CheckoutSuccessPageProps) {
  useEffect(() => {
    // Clear any cached subscription state
    window.dispatchEvent(new Event("subscription-changed"));
  }, []);

  return (
    <div className="min-h-[100dvh] text-white flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle size={40} className="text-emerald-500" />
        </div>
        <h1 className="text-2xl font-bold mb-3">Welcome to Pro!</h1>
        <p className="text-gray-400 mb-8">
          Your subscription is active. You now have unlimited access to all CompTIA Pro features.
        </p>
        <Button
          onClick={onHome}
          className="bg-red-600 hover:bg-red-700 text-white px-8"
        >
          <ArrowLeft size={18} className="mr-2" />
          Go to Dashboard
        </Button>
      </div>
    </div>
  );
}
