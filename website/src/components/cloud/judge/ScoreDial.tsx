"use client";

type Props = {
  points: number;
  maxPoints: number;
  /** Outer diameter in px */
  size?: number;
  className?: string;
};

export function ScoreDial({ points, maxPoints, size = 112, className }: Props) {
  const ratio =
    maxPoints > 0 ? Math.max(0, Math.min(1, points / maxPoints)) : 0;
  const stroke = Math.max(6, Math.round(size * 0.08));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - ratio);
  const pct = Math.round(ratio * 100);

  return (
    <div
      className={`relative inline-flex shrink-0 items-center justify-center ${className || ""}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${points} of ${maxPoints} points (${pct}%)`}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-nb-outline-variant/35"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className="text-nb-primary transition-[stroke-dashoffset] duration-500 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center px-2 text-center">
        <span className="text-nb-title font-bold leading-none tabular-nums text-nb-on-surface">
          {points}
          <span className="text-nb-caption font-medium text-nb-on-surface-variant">
            /{maxPoints}
          </span>
        </span>
        <span className="mt-0.5 text-[10px] font-semibold tabular-nums text-nb-on-surface-variant">
          {pct}%
        </span>
      </div>
    </div>
  );
}
