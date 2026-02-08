export function formatCurrency(value: number): string {
  const manwonValue = value / 10_000;
  const normalized = Math.abs(manwonValue) < 0.005 ? 0 : manwonValue;

  return `${new Intl.NumberFormat("ko-KR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(normalized)}만원`;
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

export function clampNumber(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
