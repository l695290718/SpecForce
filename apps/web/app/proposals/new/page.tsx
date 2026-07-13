import { redirect } from "next/navigation";
import { withSearchParams, type RouteSearchParams } from "../../../lib/locale";

export default async function NewProposalPage({ searchParams }: { searchParams: Promise<RouteSearchParams> }) {
  redirect(withSearchParams("/proposals", await searchParams));
}
