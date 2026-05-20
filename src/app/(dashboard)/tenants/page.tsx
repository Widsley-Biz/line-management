import { db } from "@/lib/db";
import { tenants, users, tenantAssignments, tenantPacks } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Plus } from "lucide-react";
import { TenantsTable } from "@/components/tenants-table";
import { TenantImportButton } from "./import-button";

export default async function TenantsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const statusFilter = status === "churned" ? "churned" : status === "all" ? undefined : "active";

  const rows = await db
    .select({
      id: tenants.id,
      slug: tenants.slug,
      companyName: tenants.companyName,
      status: tenants.status,
      assigneeName: users.name,
      packCount: sql<number>`count(distinct ${tenantPacks.id})`,
      allocatedCh: sql<number>`coalesce(sum(${tenantAssignments.allocatedCh}), 0)`,
    })
    .from(tenants)
    .leftJoin(users, eq(tenants.assigneeId, users.id))
    .leftJoin(tenantPacks, eq(tenantPacks.tenantId, tenants.id))
    .leftJoin(tenantAssignments, eq(tenantAssignments.tenantId, tenants.id))
    .where(
      statusFilter
        ? eq(tenants.status, statusFilter as "active" | "churned")
        : undefined
    )
    .groupBy(tenants.id)
    .orderBy(tenants.companyName);

  const tableRows = rows.map((r) => ({
    ...r,
    assigneeName: r.assigneeName ?? null,
    packCount: Number(r.packCount),
    allocatedCh: Number(r.allocatedCh),
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">テナント一覧</h1>
          <p className="text-sm text-gray-500 mt-1">{rows.length}件</p>
        </div>
        <div className="flex items-center gap-2">
          <TenantImportButton />
          <Link
            href="/tenants/new"
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground rounded-lg px-3 py-2 text-sm font-medium hover:bg-primary/80 transition-colors"
          >
            <Plus className="h-4 w-4" />
            新規登録
          </Link>
        </div>
      </div>

      <div className="flex gap-2">
        {[
          { label: "有効", value: undefined },
          { label: "解約", value: "churned" },
          { label: "すべて", value: "all" },
        ].map(({ label, value }) => {
          const href = value ? `/tenants?status=${value}` : "/tenants";
          const active = statusFilter === value || (!statusFilter && !value);
          return (
            <Link
              key={label}
              href={href}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <TenantsTable rows={tableRows} />
        </CardContent>
      </Card>
    </div>
  );
}