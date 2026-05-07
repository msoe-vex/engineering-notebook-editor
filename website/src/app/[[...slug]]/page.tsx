"use client";

import { useEffect, useState } from "react";
import App from "@/components/App";

export default function CatchAll() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Avoid synchronous cascading render warning
    const timeout = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(timeout);
  }, []);

  if (!mounted) {
    return null; // Prevent SSR hydration mismatches
  }

  return <App />;
}
