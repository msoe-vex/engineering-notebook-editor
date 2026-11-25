import { GitHubIcon } from "@/components/ui/SocialIcons";

/** Compat wrapper — prefer `GitHubIcon` from `@/components/ui`. */
export default function GithubIcon({
  size = 24,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span className={className} style={{ width: size, height: size, display: "inline-flex" }}>
      <GitHubIcon className="h-full w-full" />
    </span>
  );
}
