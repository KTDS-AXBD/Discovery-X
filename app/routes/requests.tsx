import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { redirect } from "@remix-run/cloudflare";

export function loader(_args: LoaderFunctionArgs) {
  return redirect("/lab");
}

export default function RequestsRedirect() {
  return null;
}
