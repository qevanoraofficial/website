import PageShell from "@/components/PageShell";
import { pageHtml, pageMeta } from "@/lib/pages";

export const metadata = pageMeta.home;

export default function HomePage() {
  return <PageShell active="home" home html={pageHtml.home} />;
}
