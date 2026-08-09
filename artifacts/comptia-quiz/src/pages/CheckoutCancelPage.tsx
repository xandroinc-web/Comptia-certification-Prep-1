import { XCircle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CheckoutCancelPageProps {
  onHome: () => void;
  onPricing: () => void;
}

export default function CheckoutCancelPage({ onHome, onPricing }: CheckoutCancelPageProps) {
  return (
    <div className="min-h-[100dvh] text-white flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <div className="w-20 h-20 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-6">
          <XCircle size={40} className="text-gray-400" />
        </div>
        <h1 className="text-2xl font-bold mb-3">Checkout Cancelled</h1>
        <p className="text-gray-400 mb-8">
          No worries — your card was not charged. You can upgrade anytime when you're ready.
        </p>
        <div className="flex gap-3 justify-center">
          <Button
            variant="outline"
            onClick={onHome}
            className="border-gray-700 text-gray-300 hover:bg-gray-800"
          >
            <ArrowLeft size={18} className="mr-2" />
            Home
          </Button>
          <Button
            onClick={onPricing}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            See Plans
          </Button>
        </div>
      </div>
    </div>
  );
}
