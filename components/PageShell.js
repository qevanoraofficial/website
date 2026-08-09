import Header from "./Header";
import Footer from "./Footer";
import MobileNav from "./MobileNav";
import ClientEffects from "./ClientEffects";

export default function PageShell({ active, html, home = false }) {
  return (
    <>
      <Header home={home} />
      <div dangerouslySetInnerHTML={{ __html: html }} />
      <Footer home={home} />
      <MobileNav active={active} />
      <div className="toast" id="toast" />
      <ClientEffects />
    </>
  );
}
