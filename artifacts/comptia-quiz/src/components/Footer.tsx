/** Site footer: Terms / Privacy / Contact links, the CompTIA
 *  non-affiliation disclaimer, and the support email.
 *
 *  Not wired into App.tsx yet — the integration agent mounts this
 *  (e.g. at the bottom of the home page) and adds the /terms and
 *  /privacy routes for TermsPage and PrivacyPage.
 */
export function Footer() {
  return (
    <footer className="border-t border-gray-800 bg-gray-900/60 px-4 py-6 mt-8">
      <div className="max-w-lg mx-auto text-center">
        <nav className="flex items-center justify-center gap-4 mb-3 text-sm">
          <a href="/terms" className="text-gray-400 hover:text-white transition-colors">
            Terms
          </a>
          <span className="text-gray-700">·</span>
          <a href="/privacy" className="text-gray-400 hover:text-white transition-colors">
            Privacy
          </a>
          <span className="text-gray-700">·</span>
          <a
            href="mailto:Xandroinc@gmail.com"
            className="text-gray-400 hover:text-white transition-colors"
          >
            Contact
          </a>
        </nav>
        <p className="text-gray-500 text-xs leading-relaxed mb-2">
          Trifecta Quiz is a practice tool for CompTIA A+, Network+, and
          Security+ exam preparation. Not affiliated with or endorsed by
          CompTIA. CompTIA, A+, Network+, and Security+ are trademarks of
          CompTIA, Inc.
        </p>
        <p className="text-gray-500 text-xs">
          Support:{" "}
          <a
            href="mailto:Xandroinc@gmail.com"
            className="text-gray-400 hover:text-white transition-colors underline"
          >
            Xandroinc@gmail.com
          </a>
        </p>
      </div>
    </footer>
  );
}

export default Footer;
