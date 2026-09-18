"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  LayoutDashboard,
  Building2,
  Fingerprint,
  Sparkles,
  Layers3,
  Megaphone,
  ChartNoAxesCombined,
  ChevronDown,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { signOut } from "@/lib/supabase/auth";
import { useWorkspace } from "./workspace-provider";
const navigation = [
  ["/", "Dashboard", LayoutDashboard],
  ["/businesses", "Businesses", Building2],
  ["/business-dna", "Business DNA", Fingerprint],
  ["/strategist", "Strategist", Sparkles],
  ["/content", "Content", Layers3],
  ["/campaigns", "Campaigns", Megaphone],
  ["/ads-intelligence", "Ads Intelligence", Sparkles],
  ["/analytics", "Analytics", ChartNoAxesCombined],
] as const;
export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { data, business, select } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      {open && (
        <button
          className="nav-overlay"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        />
      )}
      <aside className={`sidebar ${open ? "is-open" : ""}`}>
        <Link className="brand" href="/" onClick={() => setOpen(false)}>
          <span className="brand-mark">
            <ArrowUpRight size={25} />
          </span>
          <span>
            OTR<span className="brand-light">GROWTH</span>
            <small>THE MARKETING WORKSPACE</small>
          </span>
        </Link>
        <button
          className="mobile-close icon-button"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        >
          <X size={20} />
        </button>
        <div className="workspace-label">
          WORKSPACE <span>01</span>
        </div>
        <nav aria-label="Main navigation">
          {navigation.map(([href, label, Icon]) => (
            <Link
              key={href}
              href={href}
              className={path === href ? "active" : ""}
              aria-current={path === href ? "page" : undefined}
              onClick={() => setOpen(false)}
            >
              <Icon size={18} strokeWidth={1.6} />
              {label}
              {label === "Strategist" && <span className="ai-label">AI</span>}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="workspace-status">
            <span className="status-dot" />
            <span>
              Cloud synced<small>Supabase · RLS protected</small>
            </span>
          </div>
          <div className="owner">
            <span className="avatar">OTR</span>
            <div>
              OTR Services<small>Internal command center</small>
            </div>
            <button
              className="icon-button"
              aria-label="Sign out"
              title="Sign out"
              onClick={() => {
                void signOut().finally(() => location.reload());
              }}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <div className="topbar">
          <button
            className="mobile-menu icon-button"
            aria-expanded={open}
            aria-label="Open navigation"
            onClick={() => setOpen(true)}
          >
            <Menu size={21} />
          </button>
          <div className="breadcrumb">
            Workspace <span>/</span>{" "}
            <strong>
              {navigation.find((n) => n[0] === path)?.[1] ?? "OTR Growth"}
            </strong>
          </div>
          <div className="business-switch">
            <span className="status-dot" />
            <label className="sr-only" htmlFor="business-switch">
              Selected business
            </label>
            <select
              id="business-switch"
              value={business.id}
              onChange={(e) => {
                setError("");
                void select(e.target.value).catch(() =>
                  setError("Could not switch business. Check the cloud connection."),
                );
              }}
            >
              {data.businesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.profile.businessName} · #
                  {String(b.number).padStart(3, "0")}
                </option>
              ))}
            </select>
            <ChevronDown size={14} />
          </div>
        </div>
        {error && (
          <p role="alert" className="feedback error">
            {error}
          </p>
        )}
        <main id="main-content" tabIndex={-1} key={business.id}>
          {children}
        </main>
        <footer className="app-footer">
          <span>
            OTR GROWTH <span className="muted">/</span> Built to move business
            forward.
          </span>
          <span>INTERNAL · CLOUD WORKSPACE</span>
        </footer>
      </div>
    </div>
  );
}
