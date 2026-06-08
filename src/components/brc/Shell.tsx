import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

function useUserEmail() {
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (active) setEmail(data.user?.email ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setEmail(session?.user?.email ?? null);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);
  return email;
}

export function SiteHeader() {
  const email = useUserEmail();
  const navigate = useNavigate();
  const router = useRouter();
  const signedIn = !!email;

  async function signOut() {
    await supabase.auth.signOut();
    router.invalidate();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <header className="sticky top-0 z-30 bg-sand-25/80 backdrop-blur border-b border-sand-150">
      <div className="max-w-6xl mx-auto px-6 md:px-8 h-16 flex items-center justify-between">
        <Link to="/" className="font-serif text-2xl text-bark">
          Burke Road Compounding
        </Link>
        {signedIn && (
          <nav className="hidden md:flex items-center gap-8 text-sm text-text-secondary">
            <Link to="/" className="hover:text-bark transition-colors">Overview</Link>
            <Link to="/quote/new" className="hover:text-bark transition-colors">New quote</Link>
            <Link to="/formulations" className="hover:text-bark transition-colors">Library</Link>
            <Link to="/admin/products" className="hover:text-bark transition-colors">Products</Link>
            <Link to="/admin/import" className="hover:text-bark transition-colors">Import</Link>
          </nav>
        )}

        {signedIn ? (
          <div className="flex items-center gap-4">
            <span className="hidden md:inline text-xs text-text-tertiary">
              Signed in as <span className="text-text-secondary">{email}</span>
            </span>
            <button
              onClick={signOut}
              className="inline-flex items-center rounded-full border border-bark/20 text-bark px-4 py-2 text-sm hover:bg-sand-100 transition-colors"
            >
              Sign out
            </button>
          </div>
        ) : (
          <Link
            to="/auth"
            className="inline-flex items-center rounded-full bg-bark text-text-inverted px-5 py-2 text-sm font-medium hover:bg-bark/90 transition-colors"
          >
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}

export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-sand-25 text-bark">
      <SiteHeader />
      <main>{children}</main>
      <footer className="border-t border-sand-150 mt-24">
        <div className="max-w-6xl mx-auto px-6 md:px-8 py-10 text-sm text-text-tertiary flex flex-wrap items-center justify-between gap-4">
          <span>Burke Road Compounding · Internal pricing tool</span>
          <span>Estimates are reviewed by the pharmacist before quoting.</span>
        </div>
      </footer>
    </div>
  );
}
