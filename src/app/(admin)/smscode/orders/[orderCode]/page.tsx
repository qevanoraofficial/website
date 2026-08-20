import SMSCodeOrderStatus from "@/components/products/SMSCodeOrderStatus";

type Props = { params: Promise<{ orderCode: string }> };

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SMSCodeOrderPage({ params }: Props) {
  const { orderCode } = await params;
  return <SMSCodeOrderStatus orderCode={orderCode} />;
}
