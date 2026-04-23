import { Component, inject, signal, ViewChild } from '@angular/core';
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
export class Dashboard {
  authService = inject(AuthService);

  @ViewChild("areaChart") areaChart!: ChartComponent;
  @ViewChild("barChart") barChart!: ChartComponent;

  public chartOptions: Partial<ChartOptions>;
  public barChartOptions: Partial<ChartOptions>;

  viewTab = signal<'faturamento' | 'despesas'>('faturamento');
  selectedDate = new Date();
  isCurrentWeek = true; 

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
    this.fetchDataForPeriod();
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

  fetchDataForPeriod() {
    let novasCategorias: string[] = [];
    let faturamentoData: number[] = [];
    let lucroData: number[] = [];
    let despesaData: number[] = [];

    if (this.isCurrentWeek) {
      novasCategorias = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
      faturamentoData = [1200, 1800, 1100, 2500, 2100, 2800, 1280];
      lucroData = [1000, 1500, 900, 2000, 1700, 2300, 1000];
      despesaData = [200, 300, 200, 500, 400, 500, 280];
    } else {
      const diasNoMes = new Date(this.selectedDate.getFullYear(), this.selectedDate.getMonth() + 1, 0).getDate();
      novasCategorias = Array.from({ length: diasNoMes }, (_, i) => (i + 1).toString());
      const variacao = this.selectedDate.getMonth() % 2 === 0 ? 0.8 : 1.2;

      for (let i = 0; i < diasNoMes; i++) {
        const baseFaturamento = Math.floor((Math.random() * 800 + 400) * variacao);
        faturamentoData.push(baseFaturamento);
        lucroData.push(Math.floor(baseFaturamento * 0.75)); 
        despesaData.push(Math.floor(baseFaturamento * 0.25)); 
      }
    }

    this.chartOptions = {
      ...this.chartOptions,
      series: [{ name: "Faturamento", data: faturamentoData }],
      xaxis: { ...this.chartOptions.xaxis, categories: novasCategorias }
    };

    this.barChartOptions = {
      ...this.barChartOptions,
      series: [{ name: "Lucro", data: lucroData }, { name: "Despesa", data: despesaData }],
      xaxis: { ...this.barChartOptions.xaxis, categories: novasCategorias }
    };
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
}