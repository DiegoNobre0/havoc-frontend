import { Component, inject, OnInit, signal, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  NgApexchartsModule, ChartComponent, ApexAxisChartSeries, ApexChart,
  ApexXAxis, ApexDataLabels, ApexTooltip, ApexStroke, ApexGrid, ApexTheme, ApexPlotOptions, ApexLegend, ApexYAxis
} from "ng-apexcharts";
import { LucideAngularModule } from 'lucide-angular';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';

// Imports do Angular Material
import { MatDatepickerModule, MatDatepicker } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatNativeDateModule, provideNativeDateAdapter } from '@angular/material/core';
import { MatInputModule } from '@angular/material/input';
import { DashboardService, RecentOrder } from '../../services/dashboard.service';

export type ChartOptions = {
  series: ApexAxisChartSeries;
  chart: ApexChart;
  xaxis: ApexXAxis;
  yaxis: ApexYAxis;
  stroke: ApexStroke;
  tooltip: ApexTooltip;
  dataLabels: ApexDataLabels;
  grid: ApexGrid;
  theme: ApexTheme;
  colors: string[];
  plotOptions: ApexPlotOptions;
  legend: ApexLegend;
};

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    NgApexchartsModule,
    LucideAngularModule,
    FormsModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatNativeDateModule,
    MatInputModule
  ],
  providers: [provideNativeDateAdapter()],
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.scss']
})
export class Dashboard implements OnInit{
  authService = inject(AuthService);
  dashboardService = inject(DashboardService);

  @ViewChild("areaChart") areaChart!: ChartComponent;
  @ViewChild("barChart") barChart!: ChartComponent;

  public chartOptions: Partial<ChartOptions>;
  public barChartOptions: Partial<ChartOptions>;

  viewTab = signal<'faturamento' | 'despesas'>('faturamento');
  selectedDate = new Date();
  isCurrentWeek = true;

  revenue = signal(0);
  ordersToday = signal(0);
  pendingOrders = signal(0);

  recentOrders = signal<RecentOrder[]>([]);
  currentPage = signal(1);
  totalPages = signal(1);

  statusFilter = signal<string>(''); 
  categoryFilter = signal<string>('');

  // 🏆 Dados Mockados para E-commerce
  topProdutos = [
    { nome: 'Havoc Whey Isolado 1kg', categoria: 'Proteína', qtd: 320, valor: '47.900', trend: '+15%', up: true },
    { nome: 'Creatina Monohidratada 300g', categoria: 'Aminoácido', qtd: 450, valor: '22.500', trend: '+8%', up: true },
    { nome: 'Nuclear Pre-Workout', categoria: 'Energia', qtd: 120, valor: '14.400', trend: '-2%', up: false }
  ];

  ultimosPedidos = [
    { cliente: 'Carlos Silva', status: 'Pago', itens: 3, valor: 'R$ 450,00', avatar: 'CS', cor: '#3B82F6', badge: 'success' },
    { cliente: 'Rafael Souza', status: 'Pendente', itens: 1, valor: 'R$ 120,00', avatar: 'RS', cor: '#F59E0B', badge: 'warning' },
    { cliente: 'Amanda Nunes', status: 'Enviado', itens: 5, valor: 'R$ 890,00', avatar: 'AN', cor: '#10B981', badge: 'info' }
  ];

  constructor() {
    this.chartOptions = this.getAreaConfig();
    this.barChartOptions = this.getBarConfig();
  }


  ngOnInit() {
    this.loadSummary();
    this.loadRecentOrders();
    this.fetchDataForPeriod();
  }


  // ==========================================
  // CHAMADAS PARA A API REAL
  // ==========================================

  loadSummary() {
    this.dashboardService.getSummary().subscribe(res => {
      this.revenue.set(res.revenueToday);
      this.ordersToday.set(res.ordersToday);
      this.pendingOrders.set(res.pendingOrders);
    });
  }

loadRecentOrders(page: number = 1) {
    // Pegamos o valor atual do filtro
    const currentStatus = this.statusFilter();
    
    // Assumindo que você atualizou o service para aceitar status
    this.dashboardService.getRecentOrders(page, 5, currentStatus).subscribe(res => {
      this.recentOrders.set(res.data);
      this.currentPage.set(res.meta.page);
      this.totalPages.set(res.meta.totalPages);
    });
  }

  onFilterChange() {
    this.currentPage.set(1); // Volta pra página 1
    this.loadRecentOrders(); // Recarrega os dados com os filtros novos
  }

  nextPage() {
    if (this.currentPage() < this.totalPages()) this.loadRecentOrders(this.currentPage() + 1);
  }

  prevPage() {
    if (this.currentPage() > 1) this.loadRecentOrders(this.currentPage() - 1);
  }

  exportToCSV() {
    const data = this.recentOrders();
    if (!data || data.length === 0) {
      alert('Não há dados para exportar neste período.');
      return;
    }

    // O "\uFEFF" é o BOM (Byte Order Mark). Ele diz ao Excel que o arquivo é UTF-8 (para ler acentos como ã, ç)
    const headers = ['Código do Pedido', 'Cliente', 'Qtd Itens', 'Valor Total', 'Status', 'Data'];
    
    // Mapeia os dados usando Ponto e Vírgula (padrão do Excel no Brasil)
    const rows = data.map(order => [
      order.code,
      order.customer,
      order.itemsCount,
      order.total.toString().replace('.', ','), // Troca ponto por vírgula no dinheiro
      order.status,
      new Date(order.createdAt).toLocaleDateString('pt-BR')
    ]);

    // Junta cabeçalho e linhas
    const csvContent = "\uFEFF" + headers.join(";") + "\n" + rows.map(e => e.join(";")).join("\n");

    // Cria um arquivo virtual (Blob) e dispara o download invisível
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    
    // Nome do arquivo com a data de hoje
    const today = new Date().toISOString().split('T')[0];
    link.download = `Relatorio_Vendas_Havoc_${today}.csv`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // ==========================================
  // LÓGICA DO GRÁFICO COM API
  // ==========================================

  fetchDataForPeriod() {
    let startDate: string | undefined;
    let endDate: string | undefined;

    if (this.isCurrentWeek) {
      // Pega os últimos 7 dias usando ISO String para a API
      const pastWeek = new Date();
      pastWeek.setDate(pastWeek.getDate() - 7);
      startDate = pastWeek.toISOString();
      endDate = new Date().toISOString();
    } else {
      // Pega o mês selecionado no calendário
      const year = this.selectedDate.getFullYear();
      const month = this.selectedDate.getMonth();
      startDate = new Date(year, month, 1).toISOString();
      endDate = new Date(year, month + 1, 0).toISOString(); // Último dia do mês
    }

    this.dashboardService.getSalesReport(startDate, endDate).subscribe(data => {
      // A API devolve [{ date: '2026-04-20', revenue: 1500 }]
      const categorias = data.map(d => {
        // Formata '2026-04-20' para '20/04'
        const [ano, mes, dia] = d.date.split('-');
        return `${dia}/${mes}`;
      });
      const faturamentoData = data.map(d => d.revenue);

      // Atualiza o gráfico de Área (Faturamento)
      this.chartOptions = {
        ...this.chartOptions,
        series: [{ name: "Faturamento", data: faturamentoData }],
        xaxis: { ...this.chartOptions.xaxis, categories: categorias }
      };

      // Simulação rápida para o gráfico de barras (Lucro = 75% da receita)
      const lucroData = faturamentoData.map(v => v * 0.75);
      const despesaData = faturamentoData.map(v => v * 0.25);

      this.barChartOptions = {
        ...this.barChartOptions,
        series: [{ name: "Lucro", data: lucroData }, { name: "Despesa", data: despesaData }],
        xaxis: { ...this.barChartOptions.xaxis, categories: categorias }
      };
    });
  }
 

  setTab(tab: 'faturamento' | 'despesas') {
    this.viewTab.set(tab);
  }

  onMonthSelected(event: Date, picker: MatDatepicker<Date>) {
    this.selectedDate = event;
    this.isCurrentWeek = false;
    picker.close();
    this.fetchDataForPeriod();
  }

  get displayMonthYear(): string {
    const texto = this.selectedDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  }

  setSemanaAtual() {
    this.selectedDate = new Date();
    this.isCurrentWeek = true;
    this.fetchDataForPeriod();
  }

  // Cores Havoc aplicadas aos gráficos
  private getAreaConfig(): Partial<ChartOptions> {
    return {
      series: [],
      chart: { height: 320, type: "area", toolbar: { show: false }, fontFamily: 'Inter, sans-serif', background: 'transparent' },
      colors: ["#F2B90F"], // Amarelo Havoc
      dataLabels: { enabled: false },
      stroke: { curve: "smooth", width: 3 },
      xaxis: { categories: [], labels: { style: { colors: "#8C8C8C" } }, axisBorder: { show: false }, axisTicks: { show: false } },
      yaxis: { labels: { style: { colors: "#8C8C8C" }, formatter: (val) => "R$ " + val.toLocaleString('pt-BR') } },
      grid: { borderColor: "#333333", strokeDashArray: 4 },
      theme: { mode: "dark" },
      tooltip: { theme: "dark", x: { show: false }, y: { formatter: (val) => "R$ " + val.toLocaleString('pt-BR') } }
    };
  }

  private getBarConfig(): Partial<ChartOptions> {
    return {
      series: [],
      chart: { type: "bar", height: 320, stacked: false, toolbar: { show: false }, background: 'transparent' },
      colors: ["#17B169", "#D93838"], // Verde Havoc e Vermelho Havoc
      plotOptions: { bar: { horizontal: false, columnWidth: '55%', borderRadius: 4 } },
      dataLabels: { enabled: false },
      stroke: { show: true, width: 2, colors: ['transparent'] },
      xaxis: { categories: [], labels: { style: { colors: "#8C8C8C" } } },
      yaxis: { labels: { style: { colors: "#8C8C8C" }, formatter: (val) => "R$ " + val.toLocaleString('pt-BR') } },
      grid: { borderColor: "#333333", strokeDashArray: 4 },
      theme: { mode: "dark" },
      legend: { position: 'top', labels: { colors: '#F2F2F2' } },
      tooltip: { theme: "dark", y: { formatter: (val) => "R$ " + val.toLocaleString('pt-BR') } }
    };
  }

  exportRealReport(period: string) {
    // 1. Calculamos a data de corte com base no select
    const dataCorte = new Date();
    if (period === 'hoje') {
      dataCorte.setHours(0, 0, 0, 0); // Hoje meia noite
    } else if (period === 'semana') {
      dataCorte.setDate(dataCorte.getDate() - 7);
    } else if (period === 'mes') {
      dataCorte.setDate(dataCorte.getDate() - 30);
    }

    // 2. Buscamos um "lote grande" no backend silenciosamente (Ex: 1000 pedidos)
    this.dashboardService.getRecentOrders(1, 1000).subscribe(res => {
      
      // 3. Filtramos pela data escolhida
      const filteredData = res.data.filter(order => {
        const orderDate = new Date(order.createdAt);
        return orderDate >= dataCorte;
      });

      if (filteredData.length === 0) {
        alert(`Nenhuma venda encontrada para o período: ${period}`);
        return;
      }

      // 4. Monta o CSV perfeito para o Contador
      const headers = ['Data', 'Código', 'Cliente', 'Qtd Itens', 'Status', 'Valor Total'];
      
      const rows = filteredData.map(order => [
        new Date(order.createdAt).toLocaleDateString('pt-BR'),
        order.code,
        order.customer,
        order.itemsCount,
        order.status,
        order.total.toString().replace('.', ',') // Padrão Brasil
      ]);

      const csvContent = "\uFEFF" + headers.join(";") + "\n" + rows.map(e => e.join(";")).join("\n");
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `Relatorio_Havoc_${period}.csv`;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  }
}