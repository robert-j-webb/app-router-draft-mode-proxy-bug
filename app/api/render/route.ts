import { cookies as nextCookies, draftMode } from "next/headers";
import { redirect } from "next/navigation";

export async function GET(request: Request) {
  const draft = await draftMode();

  draft.enable();

  redirect(`/test?language=en&timestamp=${Date.now()}`);
}
