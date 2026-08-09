import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Disclaimer QEVANORA OFFICIAL",
  description: "Disclaimer resmi QEVANORA OFFICIAL.",
};

export default function DisclaimerPage() {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
      <h1 className="text-xl font-semibold text-gray-800 dark:text-white/90 sm:text-2xl">
        𝗗𝗜𝗦𝗖𝗟𝗔𝗜𝗠𝗘𝗥 QEVANORA OFFICIAL
      </h1>

      <div className="mt-5 space-y-5 text-sm leading-7 text-gray-600 dark:text-gray-300">
        <p>
          QEVANORA OFFICIAL akan senantiasa berusaha memberikan pelayanan yang terbaik
          dan berupaya untuk selalu menyediakan data dan informasi pada website ini
          secara tepat dan akurat.
        </p>

        <p>
          Namun demikian tidak tertutup kemungkinan terjadi kesalahan ataupun
          kekurangan data dan informasi yang tersedia karena faktor manusia, teknis
          maupun faktor lainnya.
        </p>

        <p>
          Kami tidak bertanggung jawab atas segala kerugian yang mungkin Anda
          derita jika membeli produk selain dari website resmi kami / transaksi di
          luar QEVANORA OFFICIAL.
        </p>

        <p>
          Seluruh informasi yang disajikan pada situs Webiste Klien kami merupakan
          murni informasi pemilik situs website tersebut, oleh karena itu QEVANORA OFFICIAL tidak bertanggung jawab atas segala kerugian yang mungkin terjadi
          pada pihak-pihak yang menggunakan data ataupun informasi dalam bentuk dan
          cara apapun.
        </p>

        <p>
          Kami menghargai segala masukan yang diberikan kepada kami, untuk
          menghindari segala kesalahpahaman, dan apapun yang anda kirimkan kepada
          kami, baik ide, saran, usul dan sebagainya, akan menjadi milik kami tanpa
          diberikan kompensasi dan tidak ada klaim untuk hal tersebut.
        </p>
      </div>
    </section>
  );
}
