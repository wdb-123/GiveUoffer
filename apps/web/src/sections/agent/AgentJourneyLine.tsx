import { useId } from "react";

type AgentJourneyLineProps = {
  ariaLabel?: string;
  className?: string;
  loop?: boolean;
};

export function AgentJourneyLine({ ariaLabel, className = "", loop = false }: AgentJourneyLineProps) {
  const gradientId = useId().replace(/:/g, "");
  const classes = ["agent-journey-line", loop ? "is-looping" : "", className].filter(Boolean).join(" ");

  return (
    <svg
      aria-hidden={ariaLabel ? undefined : true}
      aria-label={ariaLabel}
      className={classes}
      role={ariaLabel ? "img" : undefined}
      viewBox="0 0 480 28"
    >
      <defs>
        <linearGradient id={gradientId} x1="10" y1="14" x2="470" y2="14" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#0b132b" stopOpacity="0.26" />
          <stop offset="0.34" stopColor="#7B61FF" stopOpacity="0.62" />
          <stop offset="0.68" stopColor="#4f8cff" stopOpacity="0.64" />
          <stop offset="1" stopColor="#22d3ee" stopOpacity="0.7" />
        </linearGradient>
      </defs>
      <path
        d="M10 17C70 3 116 24 172 14C222 5 244 5 296 14C350 24 394 20 470 8"
        stroke={`url(#${gradientId})`}
      />
      <circle cx="10" cy="17" r="3" />
      <circle cx="296" cy="14" r="3" />
      <circle cx="470" cy="8" r="3" />
    </svg>
  );
}
