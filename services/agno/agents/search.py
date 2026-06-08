"""
Ajino v5 — Search Agent
SerpAPI Google search skill (serpapi.com).
"""

import httpx


async def web_search(query: str, api_key: str) -> list[dict]:
    """Perform web search via SerpAPI."""
    if not api_key:
        return []

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                "https://serpapi.com/search.json",
                params={
                    "q": query,
                    "engine": "google",
                    "api_key": api_key,
                    "num": 5,
                },
            )
            data = resp.json()

            results = []
            for item in data.get("organic_results", [])[:5]:
                results.append(
                    {
                        "title": item.get("title", ""),
                        "snippet": item.get("snippet", ""),
                        "link": item.get("link", ""),
                    }
                )
            return results
    except Exception as e:
        print(f"Search error: {e}")
        return []
