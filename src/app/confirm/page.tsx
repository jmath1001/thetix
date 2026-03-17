"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function ConfirmPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState("loading");

  useEffect(() => {
    if (!token) {
      setStatus("invalid");
      return;
    }

    const confirmSession = async () => {
      const { data, error } = await supabase
        .from("slake_session_students")
        .update({
          status: "confirmed",
          confirmed_at: new Date().toISOString(),
        })
        .eq("confirmation_token", token)
        .select();

      if (error || !data || data.length === 0) {
        setStatus("error");
        return;
      }

      setStatus("success");
    };

    confirmSession();
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 p-6">
      <div className="bg-white border rounded-2xl p-8 max-w-md text-center">
        {status === "loading" && <p>Confirming...</p>}

        {status === "success" && (
          <>
            <h1 className="text-xl font-bold mb-2">Session Confirmed ✔</h1>
            <p className="text-sm text-gray-600">
              Thank you. Your session is confirmed.
            </p>
          </>
        )}

        {status === "invalid" && <p>Invalid link.</p>}
        {status === "error" && <p>Unable to confirm session.</p>}
      </div>
    </div>
  );
}