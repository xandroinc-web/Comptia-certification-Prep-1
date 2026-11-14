/** Privacy Policy for Trifecta Quiz.
 *
 *  Plain, honest privacy terms: what is collected (account, quiz
 *  results, payments via Stripe), what is not sold, and how to ask for
 *  deletion. Not wired into App.tsx yet — the integration agent adds
 *  the /privacy route.
 */
export function PrivacyPage() {
  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <a href="/" className="text-gray-500 hover:text-white text-sm transition-colors">
          ← Back to Home
        </a>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 mt-4">
          <h1 className="text-white text-2xl font-bold mb-1">Privacy Policy</h1>
          <p className="text-gray-500 text-sm mb-6">Last updated: November 2026</p>

          <h2 className="text-white font-semibold mt-6 mb-2">What we collect</h2>
          <p className="text-gray-300 text-sm leading-relaxed">
            If you create an account, we store the account details needed to
            sign you in (handled by our login provider, Supabase Auth) and your quiz
            results so your progress can be shown back to you. If you
            subscribe to Pro, payment is processed by Stripe — we never see
            or store your card number. Anonymous visitors can take practice
            quizzes without an account; in that case progress is kept only in
            your own browser and is not sent to us.
          </p>

          <h2 className="text-white font-semibold mt-6 mb-2">What we do with it</h2>
          <p className="text-gray-300 text-sm leading-relaxed">
            Your data is used only to run the service: signing you in,
            saving and showing your progress, and managing your subscription.
            We do not sell your personal information to anyone, and we do not
            share it with advertisers.
          </p>

          <h2 className="text-white font-semibold mt-6 mb-2">Cookies and local storage</h2>
          <p className="text-gray-300 text-sm leading-relaxed">
            We use your browser&apos;s local storage to remember quiz
            progress, tier unlocks, and free-simulation use on your device.
            Clearing your browser data removes those local records. Our login
            and payment providers use their own cookies as described in their
            policies.
          </p>

          <h2 className="text-white font-semibold mt-6 mb-2">Your choices</h2>
          <p className="text-gray-300 text-sm leading-relaxed">
            You can use the free practice quizzes without creating an account.
            You can ask us to delete your account and saved quiz results at
            any time by emailing{" "}
            <a
              href="mailto:Xandroinc@gmail.com"
              className="text-red-400 hover:text-red-300 underline"
            >
              Xandroinc@gmail.com
            </a>
            . Payment records that Stripe is legally required to keep are
            outside our control.
          </p>

          <h2 className="text-white font-semibold mt-6 mb-2">Contact</h2>
          <p className="text-gray-300 text-sm leading-relaxed">
            Privacy questions? Email{" "}
            <a
              href="mailto:Xandroinc@gmail.com"
              className="text-red-400 hover:text-red-300 underline"
            >
              Xandroinc@gmail.com
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}

export default PrivacyPage;
