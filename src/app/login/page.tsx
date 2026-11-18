"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const ERROR_MESSAGES: Record<string, string> = {
  DomainNotAllowed: "@widsley.com の社内Googleアカウントでログインしてください。",
  NotRegistered:
    "このアカウントはまだ登録されていません。管理者にユーザーの発行を依頼してください。",
};
const DEFAULT_ERROR = "ログインできませんでした。もう一度お試しください。";

function LoginForm() {
  const params = useSearchParams();
  const [loading, setLoading] = useState(false);
  const error = params.get("error");
  const errorMessage = error ? ERROR_MESSAGES[error] ?? DEFAULT_ERROR : null;
  const callbackUrl = params.get("callbackUrl") ?? "/";

  return (
    <div className="space-y-4">
      {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}
      <Button
        type="button"
        className="w-full"
        disabled={loading}
        onClick={() => {
          setLoading(true);
          // 外部サイトへ飛ばされないよう、戻り先はアプリ内のパスに限る
          const safe = callbackUrl.startsWith("/") && !callbackUrl.startsWith("//") ? callbackUrl : "/";
          signIn("google", { redirectTo: safe });
        }}
      >
        {loading ? "Googleに移動しています..." : "Googleでログイン"}
      </Button>
      <p className="text-xs text-gray-500">
        @widsley.com の社内アカウントで、管理者が発行したユーザーのみログインできます。
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="flex items-center gap-3 mb-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="LineHub" width={36} height={36} />
            <CardTitle className="text-2xl font-bold">LineHub</CardTitle>
          </div>
          <CardDescription>IP・携帯回線 統合管理システム</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense>
            <LoginForm />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
