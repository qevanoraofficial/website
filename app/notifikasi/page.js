import PageShell from "@/components/PageShell";
import { pageHtml, pageMeta } from "@/lib/pages";

export const metadata = pageMeta.notifikasi;

export default function NotifikasiPage() {
  return <PageShell active="notifikasi" html={pageHtml.notifikasi} />;
}
