"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart3,
  Search,
  Users,
  Mail,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "Dashboard", href: "/", icon: BarChart3 },
  { label: "Live Runs", href: "/runs", icon: Activity },
  { label: "Discover", href: "/discover", icon: Search },
  { label: "Leads", href: "/leads", icon: Users },
  { label: "Outreach", href: "/outreach", icon: Mail },
  { label: "Settings", href: "/settings", icon: Settings },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col bg-slate-900">
        {/* Logo */}
        <div className="flex h-16 items-center px-6">
          <Link href="/" className="text-xl font-bold text-white">
            Trawl
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3 py-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-slate-700 px-6 py-4">
          <p className="text-xs text-slate-400">Trawl v1.0</p>
        </div>
      </aside>

      {/* Main content */}
      <main className="ml-64 min-h-screen flex-1 bg-gray-50 p-6">
        {children}
      </main>
    </div>
  );
}
