import React, { useState, useEffect, useMemo } from 'react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, RadialBarChart, RadialBar
} from 'recharts';
import {
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle,
  Activity, Clock, Zap, Target, Factory, Layers,
  ArrowUpRight, ArrowDownRight, RefreshCw
} from 'lucide-react';

// ============================================================================
// WIKO DASHBOARD CHARTS MODULE
// Real-time manufacturing analytics visualizations
// ============================================================================

// Color palette
const COLORS = {
  teal: '#14b8a6',
  cyan: '#06b6d4',
  emerald: '#10b981',
  red: '#ef4444',
  orange: '#f97316',
  yellow: '#eab308',
  violet: '#8b5cf6',
  gray: '#6b7280'
};

const SEVERITY_COLORS = {
  critical: '#ef4444',
  major: '#f97316',
  minor: '#eab308',
  cosmetic: '#10b981'
};

// Custom tooltip component
const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 shadow-xl">
        <p className="text-gray-400 text-xs mb-1">{label}</p>
        {payload.map((entry, index) => (
          <p key={index} className="text-sm font-mono" style={{ color: entry.color }}>
            {entry.name}: {entry.value.toLocaleString()}
            {entry.name.includes('Rate') && '%'}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

// ============================================================================
// DEFECT TREND CHART - Area chart showing defects over time
// ============================================================================
export const DefectTrendChart = ({ data, height = 300 }) => {
  // Sample data if none provided
  const chartData = data || [
    { time: '06:00', defects: 2, inspected: 450, rate: 0.44 },
    { time: '07:00', defects: 1, inspected: 520, rate: 0.19 },
    { time: '08:00', defects: 3, inspected: 580, rate: 0.52 },
    { time: '09:00', defects: 0, inspected: 610, rate: 0.00 },
    { time: '10:00', defects: 1, inspected: 590, rate: 0.17 },
    { time: '11:00', defects: 2, inspected: 540, rate: 0.37 },
    { time: '12:00', defects: 0, inspected: 380, rate: 0.00 },
    { time: '13:00', defects: 1, inspected: 520, rate: 0.19 },
    { time: '14:00', defects: 0, inspected: 560, rate: 0.00 },
    { time: '15:00', defects: 1, inspected: 490, rate: 0.20 },
  ];

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="colorDefects" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={COLORS.red} stopOpacity={0.3} />
              <stop offset="95%" stopColor={COLORS.red} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="colorInspected" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={COLORS.teal} stopOpacity={0.3} />
              <stop offset="95%" stopColor={COLORS.teal} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
          <XAxis 
            dataKey="time" 
            stroke="#6b7280" 
            fontSize={11}
            tickLine={false}
            axisLine={false}
          />
          <YAxis 
            stroke="#6b7280" 
            fontSize={11}
            tickLine={false}
            axisLine={false}
            width={40}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="inspected"
            stroke={COLORS.teal}
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#colorInspected)"
            name="Inspected"
          />
          <Area
            type="monotone"
            dataKey="defects"
            stroke={COLORS.red}
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#colorDefects)"
            name="Defects"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

// ============================================================================
// DEFECT BY TYPE CHART - Bar chart showing defect distribution
// ============================================================================
export const DefectByTypeChart = ({ data, height = 300 }) => {
  const chartData = data || [
    { type: 'Rust Spot', count: 12, fill: COLORS.red },
    { type: 'Edge Irreg.', count: 8, fill: COLORS.orange },
    { type: 'Blade Scratch', count: 6, fill: COLORS.yellow },
    { type: 'Polish Defect', count: 4, fill: COLORS.cyan },
    { type: 'Handle Crack', count: 3, fill: COLORS.violet },
    { type: 'Weld Defect', count: 2, fill: COLORS.teal },
  ];

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} layout="vertical" margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={true} vertical={false} />
          <XAxis type="number" stroke="#6b7280" fontSize={11} tickLine={false} axisLine={false} />
          <YAxis 
            type="category" 
            dataKey="type" 
            stroke="#6b7280" 
            fontSize={11} 
            tickLine={false} 
            axisLine={false}
            width={80}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="count" name="Count" radius={[0, 4, 4, 0]}>
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

// ============================================================================
// SEVERITY DISTRIBUTION - Pie/Donut chart
// ============================================================================
export const SeverityPieChart = ({ data, height = 250 }) => {
  const chartData = data || [
    { name: 'Critical', value: 2, color: SEVERITY_COLORS.critical },
    { name: 'Major', value: 5, color: SEVERITY_COLORS.major },
    { name: 'Minor', value: 8, color: SEVERITY_COLORS.minor },
    { name: 'Cosmetic', value: 3, color: SEVERITY_COLORS.cosmetic },
  ];

  const total = chartData.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={90}
            paddingAngle={2}
            dataKey="value"
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} stroke="transparent" />
            ))}
          </Pie>
          <Tooltip 
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const data = payload[0].payload;
                return (
                  <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 shadow-xl">
                    <p className="text-sm font-medium" style={{ color: data.color }}>{data.name}</p>
                    <p className="text-xs text-gray-400">{data.value} defects ({((data.value / total) * 100).toFixed(1)}%)</p>
                  </div>
                );
              }
              return null;
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      {/* Center label */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="text-center">
          <div className="text-3xl font-bold text-white">{total}</div>
          <div className="text-xs text-gray-500">Total</div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// STAGE PERFORMANCE - Horizontal bar showing defects per stage
// ============================================================================
export const StagePerformanceChart = ({ data, height = 350 }) => {
  const chartData = data || [
    { stage: 'Blade Stamp', defects: 1, rate: 0.05 },
    { stage: 'Bolster Weld', defects: 3, rate: 0.15 },
    { stage: 'Edge Polish', defects: 2, rate: 0.10 },
    { stage: 'Taper Grind', defects: 4, rate: 0.20 },
    { stage: 'Heat Treat', defects: 1, rate: 0.05 },
    { stage: 'Vacuum Quench', defects: 8, rate: 0.40 },
    { stage: 'Handle Mold', defects: 2, rate: 0.10 },
    { stage: 'Assembly', defects: 1, rate: 0.05 },
    { stage: 'Polish', defects: 3, rate: 0.15 },
    { stage: 'Hone', defects: 2, rate: 0.10 },
    { stage: 'QC', defects: 0, rate: 0.00 },
    { stage: 'Package', defects: 0, rate: 0.00 },
  ];

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} layout="vertical" margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={true} vertical={false} />
          <XAxis type="number" stroke="#6b7280" fontSize={11} tickLine={false} axisLine={false} />
          <YAxis 
            type="category" 
            dataKey="stage" 
            stroke="#6b7280" 
            fontSize={10} 
            tickLine={false} 
            axisLine={false}
            width={85}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="defects" name="Defects" fill={COLORS.orange} radius={[0, 4, 4, 0]}>
            {chartData.map((entry, index) => (
              <Cell 
                key={`cell-${index}`} 
                fill={entry.defects > 5 ? COLORS.red : entry.defects > 2 ? COLORS.orange : COLORS.teal} 
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

// ============================================================================
// QUALITY GAUGE - Radial progress showing quality score
// ============================================================================
export const QualityGauge = ({ value = 99.82, target = 99.82, height = 200 }) => {
  const data = [
    { name: 'Quality', value: value, fill: value >= target ? COLORS.emerald : COLORS.orange },
  ];

  return (
    <div className="w-full relative" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          cx="50%"
          cy="50%"
          innerRadius="60%"
          outerRadius="90%"
          barSize={12}
          data={data}
          startAngle={180}
          endAngle={0}
        >
          <RadialBar
            background={{ fill: '#374151' }}
            dataKey="value"
            cornerRadius={10}
          />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center mt-8">
          <div className="text-3xl font-bold text-white">{value}%</div>
          <div className="text-xs text-gray-500">Quality Rate</div>
          <div className={`text-xs mt-1 ${value >= target ? 'text-emerald-400' : 'text-orange-400'}`}>
            Target: {target}%
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// HOURLY PRODUCTION - Line chart with inspection volume
// ============================================================================
export const HourlyProductionChart = ({ data, height = 200 }) => {
  const chartData = data || [
    { hour: '6AM', volume: 450, target: 500 },
    { hour: '7AM', volume: 520, target: 500 },
    { hour: '8AM', volume: 580, target: 500 },
    { hour: '9AM', volume: 610, target: 500 },
    { hour: '10AM', volume: 590, target: 500 },
    { hour: '11AM', volume: 540, target: 500 },
    { hour: '12PM', volume: 380, target: 400 },
    { hour: '1PM', volume: 520, target: 500 },
    { hour: '2PM', volume: 560, target: 500 },
    { hour: '3PM', volume: 490, target: 500 },
  ];

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
          <XAxis 
            dataKey="hour" 
            stroke="#6b7280" 
            fontSize={10}
            tickLine={false}
            axisLine={false}
          />
          <YAxis 
            stroke="#6b7280" 
            fontSize={11}
            tickLine={false}
            axisLine={false}
            width={40}
          />
          <Tooltip content={<CustomTooltip />} />
          <Line
            type="monotone"
            dataKey="target"
            stroke="#6b7280"
            strokeWidth={1}
            strokeDasharray="5 5"
            dot={false}
            name="Target"
          />
          <Line
            type="monotone"
            dataKey="volume"
            stroke={COLORS.teal}
            strokeWidth={2}
            dot={{ fill: COLORS.teal, strokeWidth: 0, r: 3 }}
            activeDot={{ r: 5, fill: COLORS.cyan }}
            name="Actual"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

// ============================================================================
// LIVE METRICS CARDS - Real-time stat display with trend
// ============================================================================
export const MetricCard = ({ 
  title, 
  value, 
  unit = '', 
  trend, 
  trendValue, 
  icon: Icon,
  color = 'teal',
  subtitle
}) => {
  const isPositive = trend === 'up';
  const colorClasses = {
    teal: 'from-teal-500/10 to-teal-500/5 border-teal-500/20',
    cyan: 'from-cyan-500/10 to-cyan-500/5 border-cyan-500/20',
    emerald: 'from-emerald-500/10 to-emerald-500/5 border-emerald-500/20',
    red: 'from-red-500/10 to-red-500/5 border-red-500/20',
    orange: 'from-orange-500/10 to-orange-500/5 border-orange-500/20',
    violet: 'from-violet-500/10 to-violet-500/5 border-violet-500/20',
  };

  const iconColorClasses = {
    teal: 'text-teal-400 bg-teal-500/20',
    cyan: 'text-cyan-400 bg-cyan-500/20',
    emerald: 'text-emerald-400 bg-emerald-500/20',
    red: 'text-red-400 bg-red-500/20',
    orange: 'text-orange-400 bg-orange-500/20',
    violet: 'text-violet-400 bg-violet-500/20',
  };

  return (
    <div className={`bg-gradient-to-br ${colorClasses[color]} backdrop-blur border rounded-2xl p-5`}>
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl ${iconColorClasses[color]} flex items-center justify-center`}>
          <Icon className="w-5 h-5" />
        </div>
        {trendValue && (
          <div className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full ${
            isPositive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
          }`}>
            {isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {trendValue}
          </div>
        )}
      </div>
      <div className="text-3xl font-bold text-white mb-1 tabular-nums">
        {typeof value === 'number' ? value.toLocaleString() : value}{unit}
      </div>
      <div className="text-sm text-gray-400">{title}</div>
      {subtitle && <div className="text-xs text-gray-500 mt-1">{subtitle}</div>}
    </div>
  );
};

// ============================================================================
// COMPLETE DASHBOARD COMPONENT
// ============================================================================
export const WikoDashboard = () => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  // Simulated real-time data
  const [metrics, setMetrics] = useState({
    totalInspected: 4521,
    defectsFound: 18,
    defectRate: 0.40,
    qualityRate: 99.60,
    avgResponseTime: 2.3,
    lineUptime: 99.7,
    throughput: 542,
    targetThroughput: 500
  });

  // Refresh data
  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setMetrics(prev => ({
        ...prev,
        totalInspected: prev.totalInspected + Math.floor(Math.random() * 50),
        defectsFound: prev.defectsFound + Math.floor(Math.random() * 2),
      }));
      setLastUpdate(new Date());
      setIsRefreshing(false);
    }, 1000);
  };

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(handleRefresh, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Production Dashboard</h2>
          <p className="text-sm text-gray-500">
            Last updated: {lastUpdate.toLocaleTimeString()}
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-xl text-sm transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Inspected"
          value={metrics.totalInspected}
          icon={Activity}
          color="teal"
          trend="up"
          trendValue="+12%"
          subtitle="Today's shift"
        />
        <MetricCard
          title="Defects Found"
          value={metrics.defectsFound}
          icon={AlertTriangle}
          color="orange"
          trend="down"
          trendValue="-8%"
          subtitle={`${metrics.defectRate.toFixed(2)}% rate`}
        />
        <MetricCard
          title="Avg Response"
          value={metrics.avgResponseTime}
          unit="s"
          icon={Zap}
          color="cyan"
          trend="down"
          trendValue="-15%"
          subtitle="GPT-5.2 inference"
        />
        <MetricCard
          title="Line Uptime"
          value={metrics.lineUptime}
          unit="%"
          icon={CheckCircle}
          color="emerald"
          trend="up"
          trendValue="+0.2%"
          subtitle="24h rolling"
        />
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Defect Trend */}
        <div className="lg:col-span-2 bg-gray-900/50 backdrop-blur border border-gray-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-teal-400" />
              Inspection Volume & Defects
            </h3>
            <span className="text-xs text-gray-500">Today</span>
          </div>
          <DefectTrendChart height={280} />
        </div>

        {/* Quality Gauge */}
        <div className="bg-gray-900/50 backdrop-blur border border-gray-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <Target className="w-5 h-5 text-emerald-400" />
              Quality Score
            </h3>
          </div>
          <div className="relative">
            <QualityGauge value={metrics.qualityRate} target={99.82} height={200} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4 text-center">
            <div>
              <div className="text-lg font-bold text-white">{metrics.defectsFound}</div>
              <div className="text-xs text-gray-500">Total Defects</div>
            </div>
            <div>
              <div className="text-lg font-bold text-emerald-400">0.18%</div>
              <div className="text-xs text-gray-500">Target Rate</div>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Defects by Type */}
        <div className="bg-gray-900/50 backdrop-blur border border-gray-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-orange-400" />
              Defects by Type
            </h3>
            <span className="text-xs text-gray-500">This shift</span>
          </div>
          <DefectByTypeChart height={250} />
        </div>

        {/* Severity Distribution */}
        <div className="bg-gray-900/50 backdrop-blur border border-gray-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              Severity Distribution
            </h3>
          </div>
          <div className="relative">
            <SeverityPieChart height={220} />
          </div>
          {/* Legend */}
          <div className="flex justify-center gap-4 mt-4">
            {[
              { label: 'Critical', color: 'bg-red-500' },
              { label: 'Major', color: 'bg-orange-500' },
              { label: 'Minor', color: 'bg-yellow-500' },
              { label: 'Cosmetic', color: 'bg-emerald-500' },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-1.5">
                <div className={`w-2.5 h-2.5 rounded-full ${item.color}`}></div>
                <span className="text-xs text-gray-400">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Stage Performance - Full Width */}
      <div className="bg-gray-900/50 backdrop-blur border border-gray-800 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-white flex items-center gap-2">
            <Factory className="w-5 h-5 text-violet-400" />
            Defects by Production Stage
          </h3>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500"></div>
              <span className="text-xs text-gray-400">&gt;5 defects</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-orange-500"></div>
              <span className="text-xs text-gray-400">3-5 defects</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-teal-500"></div>
              <span className="text-xs text-gray-400">&lt;3 defects</span>
            </div>
          </div>
        </div>
        <StagePerformanceChart height={350} />
        <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-medium text-red-400">Attention Required: Vacuum Quench Stage</div>
              <div className="text-xs text-gray-400 mt-1">
                8 defects detected - highest in current shift. Recommended: Check cooling rate sensors and chamber pressure.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Hourly Production */}
      <div className="bg-gray-900/50 backdrop-blur border border-gray-800 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-white flex items-center gap-2">
            <Clock className="w-5 h-5 text-cyan-400" />
            Hourly Throughput
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Current:</span>
            <span className={`text-sm font-mono ${metrics.throughput >= metrics.targetThroughput ? 'text-emerald-400' : 'text-orange-400'}`}>
              {metrics.throughput}/hr
            </span>
            <span className="text-xs text-gray-500">Target: {metrics.targetThroughput}/hr</span>
          </div>
        </div>
        <HourlyProductionChart height={200} />
      </div>
    </div>
  );
};

export default WikoDashboard;
