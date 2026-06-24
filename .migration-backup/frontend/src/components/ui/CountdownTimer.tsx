export interface CountdownTimerProps {
  secondsRemaining: number;
  expiredLabel?: string;
  prefix?: string;
}

export function CountdownTimer({
  secondsRemaining,
  expiredLabel = "Resend Code",
  prefix = "Resend Code in"
}: CountdownTimerProps) {
  if (secondsRemaining <= 0) {
    return <span className="font-semibold text-brand-deep">{expiredLabel}</span>;
  }

  const minutes = Math.floor(secondsRemaining / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (secondsRemaining % 60).toString().padStart(2, "0");

  return (
    <span className="font-semibold text-brand-deep">
      {prefix} {minutes}:{seconds}
    </span>
  );
}
