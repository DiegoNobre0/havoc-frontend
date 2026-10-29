import { CheckoutOrder, CheckoutPaymentStatus } from '../../services/storefront.service';

export const STORE_WHATSAPP_NUMBER = '5571993863039';

function currency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function buildStoreWhatsAppUrl(
  order: CheckoutOrder,
  paymentStatus: CheckoutPaymentStatus | null,
) {
  const payment = order.paymentMethod === 'CASH'
    ? 'Dinheiro na retirada'
    : paymentStatus === 'PAID'
      ? `Confirmado via ${order.paymentMethod === 'PIX' ? 'PIX' : 'cartão'}`
      : 'Aguardando confirmação';
  const fulfillment = order.deliveryMethod === 'DELIVERY' ? 'Entrega' : 'Retirada na loja';
  const lines = [
    'Olá, equipe Havoc!',
    '',
    `Pedido #${order.code}`,
    `Cliente: ${order.customerName}`,
    `Pagamento: ${payment}`,
    `Modalidade: ${fulfillment}`,
    ...(order.deliveryMethod === 'DELIVERY' && order.deliveryAddress
      ? [`Endereço: ${order.deliveryAddress}`]
      : []),
    '',
    'Itens:',
    ...order.items.map((item) => `- ${item.quantity}x ${item.name} - ${currency(item.totalPrice)}`),
    '',
    `Total: ${currency(order.total)}`,
    '',
    'Gostaria de encaminhar este pedido para a loja.',
  ];

  return `https://wa.me/${STORE_WHATSAPP_NUMBER}?text=${encodeURIComponent(lines.join('\n'))}`;
}
