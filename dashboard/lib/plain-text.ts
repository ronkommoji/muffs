/** Best-effort Markdown → plain text for SMS-style surfaces (assistant messages). */

export function stripSimpleMarkdown(input: string): string {
  let t = input;
  t = t.replace(/```(?:\w*\n)?([\s\S]*?)```/g, (_, inner: string) => inner.trim());
  t = t.replace(/`([^`]+)`/g, "$1");
  t = t.replace(/\*\*([^*]+)\*\*/g, "$1");
  t = t.replace(/__([^_]+)__/g, "$1");
  t = t.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "$1");
  t = t.replace(/_(?!_)([^_]+)_(?!_)/g, "$1");
  t = t.replace(/^#{1,6}\s*(.+)$/gm, "$1");
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)");
  t = t.replace(/^---+$/gm, "");
  t = t.replace(/\n{3,}/g, "\n\n");
  return t.trim();
}
