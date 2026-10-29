import { buildStoreWhatsAppUrl, STORE_WHATSAPP_NUMBER } from './checkout-whatsapp';

describe('checkout WhatsApp handoff', () => {
  it('builds a paid order summary for the store with delivery address', () => {
    const url = buildStoreWhatsAppUrl(
      {
        id: 'order-1',
        code: 'HAV-123',
        status: 'CONFIRMED',
        customerName: 'Cliente Teste',
        customerPhone: '5571999999999',
        deliveryMethod: 'DELIVERY',
        deliveryAddress: 'Rua A, 10 - Centro - Camaçari/BA',
        paymentMethod: 'PIX',
        subtotal: 140,
        shippingCost: 15,
        discount: 0,
        total: 155,
        items: [
          {
            id: 'item-1',
            type: 'product',
            name: 'Creatina 300g',
            quantity: 2,
            unitPrice: 70,
            totalPrice: 140,
          },
        ],
      },
      'PAID',
    );

    expect(url.startsWith(`https://wa.me/${STORE_WHATSAPP_NUMBER}?text=`)).toBe(true);
    const message = decodeURIComponent(url.split('?text=')[1]);
    expect(message).toContain('Pedido #HAV-123');
    expect(message).toContain('Pagamento: Confirmado via PIX');
    expect(message).toContain('2x Creatina 300g');
    expect(message).toContain('Rua A, 10 - Centro - Camaçari/BA');
    expect(message).not.toContain('5571999999999');
  });

  it('identifies cash as payable at pickup instead of paid', () => {
    const message = decodeURIComponent(
      buildStoreWhatsAppUrl(
        {
          id: 'order-2',
          code: 'HAV-456',
          status: 'CONFIRMED',
          customerName: 'Cliente',
          customerPhone: '5571999999999',
          deliveryMethod: 'PICKUP',
          deliveryAddress: null,
          paymentMethod: 'CASH',
          subtotal: 50,
          shippingCost: 0,
          discount: 0,
          total: 50,
          items: [],
        },
        null,
      ).split('?text=')[1],
    );

    expect(message).toContain('Pagamento: Dinheiro na retirada');
    expect(message).not.toContain('Endereço:');
  });
});
