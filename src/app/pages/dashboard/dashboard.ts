import { Component, inject, OnInit, signal, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  NgApexchartsModule, ChartComponent, ApexAxisChartSeries, ApexChart,
  ApexXAxis, ApexDataLabels, ApexTooltip, ApexStroke, ApexGrid, ApexTheme, ApexPlotOptions, ApexLegend, ApexYAxis
} from "ng-apexcharts";
import { LucideAngularModule } from 'lucide-angular';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';

import { MatDatepickerModule, MatDatepicker } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatNativeDateModule, provideNativeDateAdapter } from '@angular/material/core';
import { MatInputModule } from '@angular/material/input';
import { DashboardService, RecentOrder, TopProduct } from '../../services/dashboard.service';

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
export class Dashboard implements OnInit {
  authService = inject(AuthService);
  dashboardService = inject(DashboardService);

  @ViewChild("areaChart") areaChart!: ChartComponent;

  public chartOptions: Partial<ChartOptions>;

  viewTab = signal<'faturamento' | 'despesas'>('faturamento');
  selectedDate = new Date();
  isCurrentWeek = true;

  // Sinais de métricas
  revenue = signal(0);
  ordersToday = signal(0);
  pendingOrders = signal(0);
  newCustomers = signal(0);

  // Sinais de listas
  recentOrders = signal<RecentOrder[]>([]);
  topProdutos = signal<TopProduct[]>([]);

  // Sinais de controle e paginação
  currentPage = signal(1);
  totalPages = signal(1);
  statusFilter = signal<string>(''); 

  constructor() {
    this.chartOptions = this.getAreaConfig();
  }

  ngOnInit() {
    this.loadSummary();
    this.loadRecentOrders();
    this.fetchDataForPeriod();
    this.loadTopProducts();
  }

  // ==========================================
  // CHAMADAS PARA A API REAL
  // ==========================================

  loadSummary() {
    this.dashboardService.getSummary().subscribe({
      next: (res) => {
        this.revenue.set(Number(res.revenueToday) || 0);
        this.ordersToday.set(res.ordersToday || 0);
        this.pendingOrders.set(res.pendingOrders || 0);
        this.newCustomers.set(res.newCustomers || 0);
      },
      error: (err) => console.error('Erro ao carregar resumo:', err)
    });
  }

  loadTopProducts() {
    this.dashboardService.getTopProducts().subscribe({
      next: (res) => this.topProdutos.set(res),
      error: (err) => console.error('Erro ao carregar top produtos:', err)
    });
  }

  loadRecentOrders(page: number = 1) {
    const currentStatus = this.statusFilter();
    
    this.dashboardService.getRecentOrders(page, 5, currentStatus).subscribe({
      next: (res) => {
        this.recentOrders.set(res.data);   
        this.currentPage.set(res.meta.page);
        this.totalPages.set(res.meta.totalPages);
      },
      error: (err) => console.error('Erro ao carregar pedidos recentes:', err)
    });
  }

  onFilterChange() {
    this.currentPage.set(1);
    this.loadRecentOrders(); 
  }

  nextPage() {
    if (this.currentPage() < this.totalPages()) {
      this.loadRecentOrders(this.currentPage() + 1);
    }
  }

  prevPage() {
    if (this.currentPage() > 1) {
      this.loadRecentOrders(this.currentPage() - 1);
    }
  }

  // ==========================================
  // LÓGICA DO GRÁFICO (APEX CHARTS)
  // ==========================================

  fetchDataForPeriod() {
    let startDate: string | undefined;
    let endDate: string | undefined;

    if (this.isCurrentWeek) {
      const pastWeek = new Date();
      pastWeek.setDate(pastWeek.getDate() - 7);
      startDate = pastWeek.toISOString();
      endDate = new Date().toISOString();
    } else {
      const year = this.selectedDate.getFullYear();
      const month = this.selectedDate.getMonth();
      startDate = new Date(year, month, 1).toISOString();
      endDate = new Date(year, month + 1, 0).toISOString();
    }

    this.dashboardService.getSalesReport(startDate, endDate).subscribe({
      next: (data) => {
        const categorias = data.map(d => {
          const [ano, mes, dia] = d.date.split('-');
          return `${dia}/${mes}`;
        });
        
        // Garante que o ApexCharts receba números exatos para evitar crash
        const faturamentoData = data.map(d => Number(d.revenue));

        this.chartOptions = {
          ...this.chartOptions,
          series: [{ name: "Faturamento", data: faturamentoData }],
          xaxis: { ...this.chartOptions.xaxis, categories: categorias }
        };
      },
      error: (err) => console.error('Erro ao carregar gráfico:', err)
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

  // ==========================================
  // EXPORTAÇÃO CSV
  // ==========================================

  exportRealReport(period: string) {
    const dataCorte = new Date();
    if (period === 'hoje') {
      dataCorte.setHours(0, 0, 0, 0);
    } else if (period === 'semana') {
      dataCorte.setDate(dataCorte.getDate() - 7);
    } else if (period === 'mes') {
      dataCorte.setDate(dataCorte.getDate() - 30);
    }

    // Busca os pedidos mais recentes (limite alto para exportação)
    this.dashboardService.getRecentOrders(1, 1000).subscribe(res => {
      
      const filteredData = res.data.filter(order => {
        const orderDate = new Date(order.createdAt);
        return orderDate >= dataCorte;
      });

      if (filteredData.length === 0) {
        alert(`Nenhuma venda encontrada para o período: ${period}`);
        return;
      }

      const headers = ['Data', 'Código', 'Cliente', 'Qtd Itens', 'Status', 'Valor Total'];
      
      const rows = filteredData.map(order => [
        new Date(order.createdAt).toLocaleDateString('pt-BR'),
        order.code,
        order.customer,
        order.itemsCount,
        order.status,
        Number(order.total).toFixed(2).replace('.', ',') // Garante o padrão decimal do Brasil no Excel
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

  // ==========================================
  // CONFIGURAÇÕES VISUAIS DOS GRÁFICOS
  // ==========================================

  private getAreaConfig(): Partial<ChartOptions> {
    return {
      series: [],
      chart: { height: 320, type: "area", toolbar: { show: false }, fontFamily: 'Inter, sans-serif', background: 'transparent' },
      colors: ["#F2B90F"], // Amarelo Havoc
      dataLabels: { enabled: false },
      stroke: { curve: "smooth", width: 3 },
      xaxis: { categories: [], labels: { style: { colors: "#8C8C8C" } }, axisBorder: { show: false }, axisTicks: { show: false } },
      yaxis: { labels: { style: { colors: "#8C8C8C" }, formatter: (val) => "R$ " + Number(val).toLocaleString('pt-BR') } },
      grid: { borderColor: "#333333", strokeDashArray: 4 },
      theme: { mode: "dark" },
      tooltip: { theme: "dark", x: { show: false }, y: { formatter: (val) => "R$ " + Number(val).toLocaleString('pt-BR') } }
    };
  }
}