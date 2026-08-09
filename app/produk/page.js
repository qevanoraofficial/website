import PageShell from "@/components/PageShell";
import { pageHtml, pageMeta } from "@/lib/pages";

export const metadata = pageMeta.produk;

export default function ProdukPage() {
  return <PageShell active="produk" html={pageHtml.produk} />;
}
