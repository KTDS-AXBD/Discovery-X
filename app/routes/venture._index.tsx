/**
 * Venture Discovery Sprint 메인 페이지
 * /venture → /venture/overview 리다이렉트
 */

import { redirect } from "@remix-run/cloudflare";
import type { LoaderFunctionArgs } from "@remix-run/cloudflare";

export async function loader(_args: LoaderFunctionArgs) {
  return redirect("/venture/overview");
}

export default function VentureIndex() {
  return null;
}
