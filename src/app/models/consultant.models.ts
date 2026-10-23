import { StorefrontItemType } from './storefront.models';

export type ConsultantSurface = 'catalog' | 'product-detail' | 'kit-detail';

export interface ConsultantContext {
  surface: ConsultantSurface;
  item?: {
    type: StorefrontItemType;
    id: string;
    slug: string;
  };
}

export interface ConsultantSession {
  sessionId: string;
  sessionToken: string;
  expiresAt: string;
  clientId: string;
}

export interface ConsultantRecommendation {
  type: StorefrontItemType;
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  imageUrl: string | null;
  price: number;
  available: boolean;
}

export interface ConsultantMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  recommendations?: ConsultantRecommendation[];
  requestId?: string;
  deliveryStatus?: 'pending' | 'sent' | 'failed';
  inputKind?: 'text' | 'audio';
  deliveryError?: string;
}

export interface ConsultantSessionResponse {
  session: ConsultantSession;
  messages: ConsultantMessage[];
}

export interface ConsultantMessageResponse {
  message: ConsultantMessage;
}

export interface ConsultantAudioResponse extends ConsultantMessageResponse {
  transcript: string;
}
