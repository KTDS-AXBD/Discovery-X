import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { redirect } from "@remix-run/cloudflare";

export function loader(_args: LoaderFunctionArgs) {
  return redirect("/dashboard/recall", 301);
}
