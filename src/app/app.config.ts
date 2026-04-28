import { APP_INITIALIZER, ApplicationConfig, importProvidersFrom, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { authInterceptor } from './interceptors/auth.interceptor';
import { errorInterceptor } from './interceptors/error.interceptor';
import { loadingInterceptor } from './interceptors/loading.interceptor';
import { provideEnvironmentNgxMask } from 'ngx-mask';

import {
  LucideAngularModule,
  LayoutDashboard, ShoppingCart, Trello, Package, ChevronDown, ChevronRight,
  Users, MessageSquare, Menu, Search, Bell, ShoppingBag, AlertTriangle, RefreshCw,
  Settings,
  TrendingUp,
  Clock,
  DollarSign,
  Calendar,
  MoreVertical,
  FileText,
  Download,
  Plus,
  PackagePlus,
  Pencil,
  Eye,
  Trash2,
  EyeOff,
  X,
  ImagePlus,
  Save,
  ChevronUp,
  Tag,
  Gift,
  MessageCircle,
  User,
  Bot,
  Hand,
  Paperclip,
  Mic,
  Send
} from 'lucide-angular';
import { AuthService } from './services/auth.service';
import { firstValueFrom } from 'rxjs';

// 1. Criamos a função que "Trava" o Angular até o login silencioso terminar
export function initializeApp(authService: AuthService) {
  return () => {
    // firstValueFrom transforma o Observable em uma Promise (Faz o Angular esperar acabar)
    return firstValueFrom(authService.autoLogin());
  };
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor, errorInterceptor, loadingInterceptor])),
    provideEnvironmentNgxMask(),


    // 2. Registramos a trava de inicialização aqui!
    {
      provide: APP_INITIALIZER,
      useFactory: initializeApp,
      deps: [AuthService],
      multi: true
    },

    importProvidersFrom(
      LucideAngularModule.pick({
        LayoutDashboard, ShoppingCart, Trello, Package, ChevronDown, ChevronRight,
        Users, MessageSquare, Menu, Search, Bell, ShoppingBag, AlertTriangle, RefreshCw,
        Settings, TrendingUp, Clock, DollarSign, Calendar, MoreVertical, FileText, Download,
        Plus, PackagePlus, Pencil, Eye, Trash2, EyeOff, X, ImagePlus, Save, ChevronUp, Tag,
        Gift, MessageCircle, User, Bot, Hand, Paperclip, Mic, Send
      })
    )
  ]
};
