import PageShell from "@/components/PageShell";
import { pageHtml, pageMeta } from "@/lib/pages";

export const metadata = pageMeta.akun;

export default function AkunPage() {
  return <PageShell active="akun" html={pageHtml.akun} />;
}
