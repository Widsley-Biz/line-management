"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Network,
  Users,
  CreditCard,
  GitBranch,
  Upload,
  Settings,
  LogOut,
  History,
  Smartphone,
  Database,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const commonItems = [
  { href: "/",         label: "ダッシュボード", icon: LayoutDashboard },
  { href: "/import",   label: "インポート",     icon: Upload },
  { href: "/tenants",  label: "テナント",       icon: Users },
  { href: "/activity", label: "更新履歴",       icon: History },
  { href: "/settings", label: "設定",           icon: Settings },
];

const ipItems = [
  { href: "/billing-accounts", label: "請求アカウント", icon: Network },
  { href: "/billing",          label: "請求管理",       icon: CreditCard },
  { href: "/unit-ch",          label: "ユニットch",     icon: GitBranch },
];

const mobileItems = [
  { href: "/mobile/master",  label: "回線マスタ",   icon: Database },
  { href: "/mobile/billing", label: "請求管理", icon: CreditCard },
  { href: "/mobile/devices", label: "契約端末一覧", icon: Smartphone },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [tab, setTab] = useState<"ip" | "mobile">(
    pathname.startsWith("/mobile") ? "mobile" : "ip"
  );

  const initials = session?.user?.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() ?? "?";

  const tabItems = tab === "ip" ? ipItems : mobileItems;

  return (
    <aside className="flex flex-col w-56 min-h-screen bg-gray-900 text-gray-100">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-gray-700">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="LineHub" width={32} height={32} className="shrink-0" />
          <div className="leading-tight">
            <p className="text-base font-bold tracking-tight text-white">LineHub</p>
            <p className="text-[10px] text-gray-400">IP・携帯回線 統合管理</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <TooltipProvider delay={0}>
          {/* 共通メニュー */}
          {commonItems.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Tooltip key={href}>
                <TooltipTrigger className="block w-full">
                  <Link
                    href={href}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                      active
                        ? "bg-gray-700 text-white"
                        : "text-gray-400 hover:bg-gray-800 hover:text-white"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {label}
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">{label}</TooltipContent>
              </Tooltip>
            );
          })}

          {/* タブ切り替え */}
          <div className="pt-3 mt-2 border-t border-gray-700">
            <div className="flex mb-2 bg-gray-800 rounded-lg p-1">
              <button
                onClick={() => setTab("ip")}
                className={cn(
                  "flex-1 py-1.5 text-[11px] font-medium rounded-md transition-colors",
                  tab === "ip"
                    ? "bg-gray-600 text-white"
                    : "text-gray-400 hover:text-white"
                )}
              >
                IP回線
              </button>
              <button
                onClick={() => setTab("mobile")}
                className={cn(
                  "flex-1 py-1.5 text-[11px] font-medium rounded-md transition-colors",
                  tab === "mobile"
                    ? "bg-gray-600 text-white"
                    : "text-gray-400 hover:text-white"
                )}
              >
                携帯回線
              </button>
            </div>

            {/* タブ別メニュー */}
            {tabItems.map(({ href, label, icon: Icon }) => {
              const active = pathname.startsWith(href);
              return (
                <Tooltip key={href}>
                  <TooltipTrigger className="block w-full">
                    <Link
                      href={href}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                        active
                          ? "bg-gray-700 text-white"
                          : "text-gray-400 hover:bg-gray-800 hover:text-white"
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {label}
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right">{label}</TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </TooltipProvider>
      </nav>

      {/* User footer */}
      <div className="px-3 py-4 border-t border-gray-700">
        <div className="flex items-center gap-3 px-2 mb-2">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-gray-600 text-white text-xs">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">
              {session?.user?.name}
            </p>
            <p className="text-xs text-gray-400 truncate">
              {session?.user?.role}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-gray-400 hover:text-white hover:bg-gray-800"
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          <LogOut className="h-4 w-4 mr-2" />
          ログアウト
        </Button>
      </div>
    </aside>
  );
}
