/**
 * Brave Search — live web results to ground time-sensitive lessons
 * (geopolitics, current tech/news) whose facts fall past the model's cutoff.
 * Snippet-based (title + url + description); no page fetch, so it's fast.
 */

export type Source = { title: string; url: string; description: string };

export async function braveSearch(query: string, count = 6): Promise<Source[]> {
  const key = process.env.BRAVE_SEARCH_API_KEY;
  if (!key) return [];
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(
    query,
  )}&count=${count}`;
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "X-Subscription-Token": key },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      web?: { results?: { title: string; url: string; description?: string }[] };
    };
    return (data.web?.results ?? []).slice(0, count).map((r) => ({
      title: r.title,
      url: r.url,
      description: (r.description ?? "").replace(/<[^>]+>/g, ""), // strip Brave's <strong> tags
    }));
  } catch {
    return [];
  }
}
