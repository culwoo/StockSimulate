export type KoreanAliasEntry = {
  alias: string;
  terms: string[];
};

const HANGUL_REGEX = /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/;

export const KOREAN_SEARCH_ALIASES: KoreanAliasEntry[] = [
  { alias: "팔란티어", terms: ["PLTR", "Palantir"] },
  { alias: "로켓랩", terms: ["RKLB", "Rocket Lab"] },
  { alias: "나스닥", terms: ["QQQ", "QQQM", "ONEQ", "NASDAQ 100"] },
  { alias: "나스닥100", terms: ["QQQ", "QQQM", "NASDAQ 100"] },
  { alias: "버크셔", terms: ["BRK-B", "Berkshire Hathaway"] },
  { alias: "워렌버핏", terms: ["BRK-B", "Berkshire Hathaway"] },
  { alias: "버핏", terms: ["BRK-B", "Berkshire Hathaway"] },
  { alias: "반도체", terms: ["SOXX", "SMH", "Semiconductor ETF"] },
  { alias: "애플", terms: ["AAPL", "Apple"] },
  { alias: "마이크로소프트", terms: ["MSFT", "Microsoft"] },
  { alias: "엔비디아", terms: ["NVDA", "NVIDIA"] },
  { alias: "snp500", terms: ["SPY", "VOO", "IVV", "S&P 500"] },
  { alias: "s&p500", terms: ["SPY", "VOO", "IVV", "S&P 500"] }
];

function normalizeAliasText(value: string): string {
  return value.toLowerCase().replaceAll(" ", "").trim();
}

export function containsHangul(value: string): boolean {
  return HANGUL_REGEX.test(value);
}

export function expandKoreanAliasTerms(query: string): string[] {
  const normalized = normalizeAliasText(query);
  if (!normalized) {
    return [];
  }

  const terms = new Set<string>();

  for (const entry of KOREAN_SEARCH_ALIASES) {
    const alias = normalizeAliasText(entry.alias);
    if (!alias) {
      continue;
    }

    if (alias.includes(normalized) || normalized.includes(alias)) {
      for (const term of entry.terms) {
        terms.add(term);
      }
    }
  }

  return [...terms];
}

