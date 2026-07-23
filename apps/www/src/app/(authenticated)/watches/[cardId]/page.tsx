import { PriceHistoryPageTemplate } from '@/features/watches/components/server/PriceHistoryPageTemplate';

export default async function PriceHistoryPage({
  params,
}: {
  params: Promise<{ cardId: string }>;
}) {
  const { cardId } = await params;
  return <PriceHistoryPageTemplate cardId={cardId} />;
}
