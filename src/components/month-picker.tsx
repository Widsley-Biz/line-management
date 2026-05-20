"use client";
import { useRouter } from "next/navigation";
export function MonthPicker({
  yearMonth,
  basePath = "/billing",
}: {
  yearMonth: string;
  basePath?: string;
}) {
  const router = useRouter();
  return (
    <input
      type="month"
      defaultValue={yearMonth}
      onChange={(e) => {
        if (e.target.value) {
          if (basePath.includes("?")) {
            router.push(`${basePath}${e.target.value}`);
          } else {
            router.push(`${basePath}/${e.target.value}`);
          }
        }
      }}
      className="h-8 rounded-md border border-input bg-background px-2 text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/30"
    />
  );
}