export function Wordmark({ size = "base" }: { size?: "base" | "lg" }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="inline-flex items-center gap-0.5">
        <span className="size-2 rounded-full bg-yes" />
        <span className="size-2 rounded-full bg-no" />
      </span>
      <span
        className={`font-display font-bold tracking-tight text-ink ${
          size === "lg" ? "text-xl" : "text-base"
        }`}
      >
        Steply
      </span>
    </span>
  );
}
