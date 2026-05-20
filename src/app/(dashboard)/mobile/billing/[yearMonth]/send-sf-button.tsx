"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Send, Loader2 } from "lucide-react";

interface Props {
  usageIds?: string[];
  tenantId?: string;
  yearMonth?: string;
  bulk?: boolean;
  label?: string;
  onSuccess?: () => void;
}

export function MobileSendSfButton({ usageIds, tenantId, yearMonth, bulk, label, onSuccess }: Props) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSend() {
    setLoading(true);
    setError(null);
    try {
      const body = usageIds
        ? { usageIds }
        : { tenantId, yearMonth };

      const res = await fetch("/api/mobile/send-sf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "送信失敗");
      setDone(true);
      onSuccess?.();
      setTimeout(() => window.location.reload(), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  if (done) return <span className="text-sm text-green-600 font-medium">✓ 送信完了</span>;

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        onClick={handleSend}
        disabled={loading}
        variant={bulk ? "default" : "outline"}
        size="sm"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin mr-1" />
        ) : (
          <Send className="h-4 w-4 mr-1" />
        )}
        {label ?? (bulk ? "一括SF送信" : "SF送信")}
      </Button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}