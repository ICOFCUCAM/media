import { NextResponse, type NextRequest } from "next/server";

/**
 * Ads Studio on its own domain (docs/47). When a request's host is listed in
 * ADS_STUDIO_HOSTS (comma-separated, e.g. "adstudio.example.com"), the root
 * of that domain serves /ads. Every other host — the main CineForge site —
 * is untouched. Nothing happens while the variable is unset.
 */
export function middleware(req: NextRequest) {
  const hosts = (process.env.ADS_STUDIO_HOSTS ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
  const host = (req.headers.get("host") ?? "").split(":")[0]!.toLowerCase();
  if (hosts.length && hosts.includes(host)) {
    const url = req.nextUrl.clone();
    url.pathname = "/ads";
    return NextResponse.rewrite(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/"] };
