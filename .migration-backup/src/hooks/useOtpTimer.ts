"use client";

import { useEffect, useState } from "react";

export function useOtpTimer(initialSeconds = 60) {
  const [secondsRemaining, setSecondsRemaining] = useState(initialSeconds);

  useEffect(() => {
    if (secondsRemaining <= 0) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setSecondsRemaining((current) => current - 1);
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [secondsRemaining]);

  const reset = () => setSecondsRemaining(initialSeconds);

  return {
    secondsRemaining,
    reset
  };
}
