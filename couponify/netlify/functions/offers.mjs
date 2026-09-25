/*
 * GET /api/offers — live promo codes and deals from your affiliate networks.
 * Netlify caches the response for 6 hours, so the networks are asked at most
 * a few times a day no matter how many people visit.
 */
import { collectOffers } from "../../lib/feeds.mjs";

export default async () => {
  const { networks, offers } = await collectOffers(process.env);
  const anyOk = Object.values(networks).some((n) => n.ok);
  return new Response(JSON.stringify({ updated: new Date().toISOString(), networks, offers }), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      // Cache at Netlify's edge: 6h when a network answered, 5 min when none did (so fixes show up fast).
      "Netlify-CDN-Cache-Control": anyOk
        ? "public, durable, s-maxage=21600, stale-while-revalidate=86400"
        : "public, s-maxage=300"
    }
  });
};

export const config = { path: "/api/offers" };
