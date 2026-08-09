import PageShell from "@/components/PageShell";
import { pageHtml, pageMeta } from "@/lib/pages";

export const metadata = pageMeta.testimoni;

export default function TestimoniPage() {
  return <PageShell active="testimoni" html={pageHtml.testimoni} />;
}
