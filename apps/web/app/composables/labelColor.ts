export const LABEL_COLORS: string[] = [
  'bg-blue-500/20 text-blue-300',
  'bg-emerald-500/20 text-emerald-300',
  'bg-amber-500/20 text-amber-300',
  'bg-purple-500/20 text-purple-300',
  'bg-rose-500/20 text-rose-300',
  'bg-cyan-500/20 text-cyan-300',
  'bg-orange-500/20 text-orange-300',
  'bg-indigo-500/20 text-indigo-300',
];

export function labelColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = Math.trunc(hash * 31 + (name.codePointAt(i) ?? 0));
  }
  return LABEL_COLORS[Math.abs(hash) % LABEL_COLORS.length] ?? '';
}
