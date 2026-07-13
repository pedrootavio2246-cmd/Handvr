export default async function handler(req, res) {
  const query = String(req.query?.q || "").trim().slice(0, 120);

  if (!query) {
    res.status(200).json({ suggestions: [] });
    return;
  }

  try {
    const url =
      "https://suggestqueries.google.com/complete/search" +
      `?client=firefox&hl=pt-BR&q=${encodeURIComponent(query)}`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "HandFusionVR/0.6"
      }
    });

    if (!response.ok) {
      throw new Error(`Google suggestions: ${response.status}`);
    }

    const payload = await response.json();
    const suggestions = Array.isArray(payload?.[1])
      ? payload[1].slice(0, 5).map(String)
      : [];

    res.setHeader(
      "Cache-Control",
      "s-maxage=60, stale-while-revalidate=300"
    );
    res.status(200).json({ suggestions });
  } catch (error) {
    console.error(error);
    res.status(200).json({
      suggestions: [
        query,
        `${query} youtube`,
        `${query} imagens`
      ]
    });
  }
}
