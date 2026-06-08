import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 bg-sand-25/80 backdrop-blur border-b border-sand-150">
      <div className="max-w-6xl mx-auto px-6 md:px-8 h-16 flex items-center justify-between">
        <Link to="/" className="font-serif text-2xl text-bark">
          Burke Road Compounding
        </Link>
        <nav className="hidden md:flex items-center gap-8 text-sm text-text-secondary">
          <Link to="/" className="hover:text-bark transition-colors">Overview</Link>
          <Link to="/quote/new" className="hover:text-bark transition-colors">New quote</Link>
          <Link to="/admin/products" className="hover:text-bark transition-colors">Products</Link>
        </nav>

        <Link
          to="/quote/new"
          className="inline-flex items-center rounded-full bg-bark text-text-inverted px-5 py-2 text-sm font-medium hover:bg-bark/90 transition-colors"
        >
          Start a quote
        </Link>
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
