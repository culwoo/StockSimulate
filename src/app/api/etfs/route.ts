import { ETF_UNIVERSE, searchEtfs } from "@/lib/data/etfs";
import { containsHangul, expandKoreanAliasTerms } from "@/lib/data/korean-aliases";
import { EtfInfo } from "@/lib/types";
import { searchSymbols, YahooDataError } from "@/lib/yahoo";
import { NextResponse } from "next/server";

function dedupeByTicker(items: EtfInfo[]): EtfInfo[] {
  return items.filter((item, index, array) => {
    return array.findIndex((candidate) => candidate.ticker === item.ticker) === index;
  });
}

function collectLocalMatches(terms: string[]): EtfInfo[] {
  const merged: EtfInfo[] = [];
  for (const term of terms) {
    merged.push(...searchEtfs(term));
  }
  return dedupeByTicker(merged);
}

function toYahooTerms(query: string, aliasTerms: string[]): string[] {
  const terms = new Set<string>();
  if (!containsHangul(query)) {
    terms.add(query);
  }

  for (const term of aliasTerms) {
    if (!containsHangul(term)) {
      terms.add(term);
    }
  }

  return [...terms].filter((term) => term.trim().length > 0).slice(0, 4);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("query") ?? "";
  const normalizedQuery = query.trim();

  if (!normalizedQuery) {
    const items = ETF_UNIVERSE.slice(0, 50);
    return NextResponse.json({
      query,
      count: items.length,
      items
    });
  }

  const aliasTerms = expandKoreanAliasTerms(normalizedQuery);
  const localTerms = [normalizedQuery, ...aliasTerms];
  const localMatches = collectLocalMatches(localTerms).slice(0, 30);

  const yahooTerms = toYahooTerms(normalizedQuery, aliasTerms);
  const yahooMatches: EtfInfo[] = [];

  for (const term of yahooTerms) {
    try {
      const items = await searchSymbols(term, 40);
      yahooMatches.push(...items);
    } catch (error) {
      if (error instanceof YahooDataError) {
        continue;
      }

      throw error;
    }
  }

  const merged = dedupeByTicker([...localMatches, ...yahooMatches]).slice(0, 60);

  return NextResponse.json({
    query,
    count: merged.length,
    items: merged
  });
}

