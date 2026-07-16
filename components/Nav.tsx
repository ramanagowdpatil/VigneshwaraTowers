"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { displayLogin } from "@/lib/auth";
import { useRole } from "./RoleProvider";
import type { UserRole } from "@/lib/types";

const ALL_ITEMS = [
  { href: "/", label: "Home" },
  { href: "/readings", label: "Readings" },
  { href: "/rents", label: "Rents" },
  { href: "/bills", label: "Bills" },
  { href: "/invoices", label: "Invoices" },
  { href: "/setup", label: "Setup" },
];

// Which tabs each role can see
const NAV_BY_ROLE: Record<UserRole, string[]> = {
  admin: ["/", "/readings", "/rents", "/bills", "/invoices", "/setup"],
  editor: ["/readings"],
  viewer: ["/", "/readings", "/rents", "/invoices"],
};

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const { role, fullName } = useRole();

  const items = ALL_ITEMS.filter((i) => NAV_BY_ROLE[role].includes(i.href));

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-10 print:hidden">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex items-center justify-between h-14">
          <Link href="/" className="font-bold text-slate-900">
            Vigneshwara Towers
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500 hidden sm:inline">
              {displayLogin(fullName)} · {role}
            </span>
            <button
              onClick={signOut}
              className="text-sm text-slate-600 hover:text-slate-900 border border-slate-300 rounded-lg px-3 py-1.5"
            >
              Sign out
            </button>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto pb-2 -mx-1 px-1">
          {items.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium ${
                  active
                    ? "bg-blue-600 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
