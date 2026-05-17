"use client";

import { useEffect, useState } from "react";
import App from "@/components/App";

export default function CatchAll() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      setMounted(true);
    });
  }, []);

  if (!mounted) {
    return null; // Prevent SSR hydration mismatches
  }

  return <App />;
}
