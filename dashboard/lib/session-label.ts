export function sessionDisplayName(s: {
  title: string | null | undefined;
  first_message: string | null | undefined;
}): string {
  if (s.title?.trim()) return s.title.trim();
  const first = s.first_message?.trim();
  if (first) {
    const single = first.replace(/\s+/g, " ");
    return single.length > 60 ? `${single.slice(0, 57)}...` : single;
  }
  return "New chat";
}
