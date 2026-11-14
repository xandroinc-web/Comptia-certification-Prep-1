/** Terms of Service for Trifecta Quiz.
 *
 *  Plain, honest terms: what the Free and Pro plans include, what the
 *  practice scores do and do not mean, and the 7-day refund policy.
 *  Not wired into App.tsx yet — the integration agent adds the /terms
 *  route.
 */
export function TermsPage() {
  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <a href="/" className="text-gray-500 hover:text-white text-sm transition-colors">
          ← Back to Home
        </a>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 mt-4">
          <h1 className="text-white text-2xl font-bold mb-1">Terms of Service</h1>
          <p className="text-gray-500 text-sm mb-6">Last updated: November 2026</p>

          <h2 className="text-white font-semibold mt-6 mb-2">What Trifecta Quiz is</h2>
          <p className="text-gray-300 text-sm leading-relaxed">
            Trifecta Quiz is a practice tool for CompTIA A+, Network+, and
            Security+ exam preparation. It provides original practice
            questions, timed quizzes, and a 100–900 practice score that
            imitates CompTIA&apos;s scoring scale. Practice scores are a study
            aid only — they do not predict your result on the real exam, and
            passing a practice quiz does not guarantee passing a CompTIA exam.
          </p>

          <h2 className="text-white font-semibold mt-6 mb-2">Free plan</h2>
          <p className="text-gray-300 text-sm leading-relaxed">
            The Free plan lets you try practice quizzes with no account and
            no payment. Some features — such as unlimited practice, hard
            difficulty, and progress tracking across devices — require a
            signed-in account and, where stated, a Practice Membership.
            Full simulations are one paid attempt each (a Full Test or
            Trifecta Tests purchase).
          </p>

          <h2 className="text-white font-semibold mt-6 mb-2">Practice Membership</h2>
          <p className="text-gray-300 text-sm leading-relaxed">
            Practice Membership is a monthly subscription, as shown on the
            pricing page, that unlocks unlimited practice — all tiers, all
            exams, drills, and progress tracking — for as long as your
            subscription is active. It does not include full simulations.
            Prices are shown before checkout. You can cancel a subscription
            at any time from your billing portal; access continues until
            the end of the paid period.
          </p>

          <h2 className="text-white font-semibold mt-6 mb-2">
            One-time test attempts
          </h2>
          <p className="text-gray-300 text-sm leading-relaxed">
            A Full Test covers one subject (A+, Network+, or Security+)
            and grants one attempt at the full 90-question, 90-minute
            simulation for that exam. Trifecta Tests grants one attempt
            per exam, for all three subjects. Both are one-time purchases;
            each attempt is valid for 90 days from the date of purchase.
            An attempt is used when the simulation starts. A subscription
            is not required and no recurring charge applies.
          </p>

          <h2 className="text-white font-semibold mt-6 mb-2">Refund policy</h2>
          <p className="text-gray-300 text-sm leading-relaxed">
            If you request a refund within 7 days of purchase and you have
            not completed an exam in that time, we will refund you in full.
            To request a refund, email{" "}
            <a
              href="mailto:Xandroinc@gmail.com"
              className="text-red-400 hover:text-red-300 underline"
            >
              Xandroinc@gmail.com
            </a>{" "}
            with the email address used for your account.
          </p>

          <h2 className="text-white font-semibold mt-6 mb-2">Fair use</h2>
          <p className="text-gray-300 text-sm leading-relaxed">
            Questions and explanations are for your own study. Do not copy,
            resell, or redistribute the question bank, and do not try to
            bypass the subscription or access controls. Accounts used to abuse
            the service may be suspended.
          </p>

          <h2 className="text-white font-semibold mt-6 mb-2">No affiliation with CompTIA</h2>
          <p className="text-gray-300 text-sm leading-relaxed">
            Trifecta Quiz is not affiliated with or endorsed by CompTIA.
            CompTIA, A+, Network+, and Security+ are trademarks of CompTIA,
            Inc. Our questions are original study material — they are not
            real exam questions.
          </p>

          <h2 className="text-white font-semibold mt-6 mb-2">Contact</h2>
          <p className="text-gray-300 text-sm leading-relaxed">
            Questions about these terms? Email{" "}
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

export default TermsPage;
