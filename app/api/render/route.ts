import { NextRequest } from "next/server";
import { cookies as nextCookies, draftMode } from "next/headers";
import { NextApiRequest } from "next";

const PreviewCookies = {
  PREVIEW_DATA: "__next_preview_data",
  PRERENDER_BYPASS: "__prerender_bypass",
};

export const resolveServerUrl = (req: NextApiRequest | NextRequest) => {
  // to preserve auth headers, use https if we're in our 3 main hosting options
  const useHttps = process.env.VERCEL !== undefined;
  const host = (req.headers as Headers).get
    ? (req.headers as Headers).get("x-forwarded-host") ||
      (req.headers as Headers).get("host")
    : (req as NextApiRequest).headers["x-forwarded-host"] ||
      (req as NextApiRequest).headers.host;

  // use https for requests with auth but also support unsecured http rendering hosts
  return `${useHttps ? "https" : "http"}://${host}`;
};

export const getQueryParamsForPropagation = (
  searchParams: URLSearchParams
): { [key: string]: string } => {
  const params: { [key: string]: string } = {};

  const xVercelProtectionBypass = searchParams.get(
    "x-vercel-protection-bypass"
  );
  const xVercelSetBypassCookie = searchParams.get("x-vercel-set-bypass-cookie");

  if (xVercelProtectionBypass) {
    params["x-vercel-protection-bypass"] = xVercelProtectionBypass;
  }
  if (xVercelSetBypassCookie) {
    params["x-vercel-set-bypass-cookie"] = xVercelSetBypassCookie;
  }

  return params;
};

export async function GET(request: NextRequest) {
  console.log("Render request received");
  try {
    const draft = await draftMode();

    draft.enable();

    const route = request.nextUrl.searchParams.get("route") as string;
    const requestUrl = new URL(route, resolveServerUrl(request));

    const cookieStore = await nextCookies();
    const convertedCookies = cookieStore
      .getAll()
      .map((c: { name: string; value: string }) => `${c.name}=${c.value}`)
      .join(";");

    cookieStore.set(
      PreviewCookies.PRERENDER_BYPASS,
      cookieStore.get(PreviewCookies.PRERENDER_BYPASS)?.value || "",
      {
        httpOnly: true,
        path: "/",
        sameSite: "none",
        secure: true,
      }
    );

    const propagatedQsParams = getQueryParamsForPropagation(
      request.nextUrl.searchParams
    );

    const propagatedHeaders: HeadersInit = {};

    // Get the page URL with the query params

    for (const key in propagatedQsParams) {
      if (
        {}.hasOwnProperty.call(propagatedQsParams, key) &&
        propagatedQsParams[key]
      ) {
        requestUrl.searchParams.append(key, propagatedQsParams[key]);
      }
    }

    requestUrl.searchParams.append("route", route);
    requestUrl.searchParams.append(
      "item_id",
      "{00000000-0000-0000-0000-000000000000}"
    );
    requestUrl.searchParams.append("language", "en");
    requestUrl.searchParams.append("timestamp", Date.now().toString());

    // Grab the Next.js preview cookies to send on to the page render request
    propagatedHeaders["cookie"] = convertedCookies;

    console.log("Internal Request:", {
      url: requestUrl.toString(),
      headers: propagatedHeaders,
    });

    const html = await fetch(requestUrl.toString(), {
      credentials: "include",
      headers: propagatedHeaders,
      method: "GET",
    })
      .then((response) => {
        console.log("Response: ", response);
        return response.text();
      })
      .catch((error) => {
        console.error("Error fetching page: ", error);
        // We need to handle not found error provided by Vercel
        // for `fallback: false` pages
        if (error.response.status === 404) {
          console.error("Page not found: ", error.response);
          return error.response;
        }

        throw error;
      });

    console.log("HTML: ", html);

    if (!html || html.length === 0) {
      throw new Error(`Failed to render html for ${requestUrl.toString()}`);
    }

    console.log("Response headers:", {
      "Content-Type": "text/html; charset=utf-8",
      "Set-Cookie": convertedCookies,
    });

    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Set-Cookie": convertedCookies,
      },
    });
  } catch (error) {
    console.error(error);
    return new Response(null, { status: 500 });
  }
}
