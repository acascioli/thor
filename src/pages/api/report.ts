export const prerender = false;
import type { APIRoute } from "astro";

interface ReportPayload {
  location?: string | null;
  accuracy?: number | null;
  phone?: string | null;
  message?: string | null;
  userAgent?: string;
}

function parseLatLon(str?: string | null) {
  if (!str) return null;
  const m = String(str)
    .trim()
    .replace(/\s+/g, "")
    .match(/^(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = parseFloat(m[1]);
  const lon = parseFloat(m[2]);
  if (isNaN(lat) || isNaN(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  try {
    const body = (await request.json()) as ReportPayload;
    const ipHeader = request.headers.get("x-forwarded-for");
    const ip = clientAddress || ipHeader || "unknown";

    const coords = parseLatLon(body.location || undefined);
    const phone =
      body.phone && /^\+?\d{7,16}$/.test(body.phone) ? body.phone : null;
    const message = body.message ? String(body.message).slice(0, 1000) : null;

    // --- Discord webhook integration ---
    const webhookUrl = import.meta.env.DISCORD_WEBHOOK_URL;
    if (webhookUrl) {
      // Build the same display line used on the site
      const usingLine = coords
        ? `Using: ${coords.lat.toFixed(5)}, ${coords.lon.toFixed(5)}${
            typeof body.accuracy === "number"
              ? ` (±${Math.round(body.accuracy)} m)`
              : ""
          } — [Open map](https://maps.google.com/?q=${coords.lat},${coords.lon})`
        : "Using: N/A";

      const embed = {
        title: "🌍 New Thor Report",
        color: 0x2b6cb0,
        description: usingLine,
        fields: [
          { name: "📞 Phone", value: phone || "N/A", inline: true },
          { name: "💬 Message", value: message || "N/A", inline: false },
          { name: "🌐 IP", value: ip, inline: false },
          {
            name: "🧭 User Agent",
            value: body.userAgent || "N/A",
            inline: false,
          },
        ],
        timestamp: new Date().toISOString(),
      };

      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ embeds: [embed] }),
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    console.error("[ThorReport] Invalid payload:", err);
    return new Response(
      JSON.stringify({ success: false, error: "Invalid payload" }),
      { headers: { "Content-Type": "application/json" }, status: 400 },
    );
  }
};
