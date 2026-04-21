import { cn } from "@/lib/utils";

export interface SlashCommandItem {
  command: string;
  description: string;
}

export const SLASH_COMMANDS: SlashCommandItem[] = [
  {
    command: "/setup",
    description: "First-time onboarding — name, timezone, preferences",
  },
  {
    command: "/new",
    description: "Start a fresh session",
  },
];

/** Entire composer is a slash command fragment (line-start /, no stray text). */
export function getSlashQuery(input: string): string | null {
  if (!/^\/[^\n]*$/.test(input)) return null;
  return input.slice(1);
}

export function filterSlashCommands(query: string): SlashCommandItem[] {
  const q = query.toLowerCase();
  return SLASH_COMMANDS.filter((c) => {
    const name = c.command.slice(1).toLowerCase();
    return q === "" || name.startsWith(q);
  });
}

export function SlashCommandMenu({
  open,
  items,
  selectedIndex,
}: {
  open: boolean;
  items: SlashCommandItem[];
  selectedIndex: number;
}) {
  if (!open || items.length === 0) return null;

  return (
    <div
      className="absolute bottom-full left-0 right-0 z-50 mb-1 rounded-md border bg-popover text-popover-foreground shadow-md overflow-hidden"
      role="listbox"
      aria-label="Slash commands"
    >
      <ul className="max-h-48 overflow-y-auto py-1">
        {items.map((item, i) => (
          <li key={item.command}>
            <div
              role="option"
              aria-selected={i === selectedIndex}
              className={cn(
                "px-3 py-2 text-sm cursor-default",
                i === selectedIndex ? "bg-accent text-accent-foreground" : ""
              )}
            >
              <div className="font-mono text-xs">{item.command}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {item.description}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
