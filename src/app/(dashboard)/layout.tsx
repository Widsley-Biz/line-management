export const dynamic = "force-dynamic";

import { AppSidebar } from "@/components/app-sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <AppSidebar />
      <main className="flex-1 overflow-auto">
        <div className="p-8">{children}</div>
      </main>
    </div>
  );
}
