import React, { useState, useEffect } from 'react';
import { 
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  Cell, PieChart, Pie
} from 'recharts';
import { 
  Activity, Download, Upload, Wifi, AlertTriangle, 
  TrendingUp, TrendingDown, BarChart2, Settings 
} from 'lucide-react';

interface UsageData {
  dailyUsage: Array<{
    date: string;
    download: number;
    upload: number;
    totalBandwidth: number;
  }>;
  monthlyUsage: Array<{
    month: string;
    download: number;
    upload: number;
    totalBandwidth: number;
    limit: number;
  }>;
  hourlyUsage: Array<{
    hour: string;
    bandwidth: number;
    users: number;
  }>;
  deviceDistribution: Array<{
    name: string;
    value: number;
    color: string;
  }>;
  currentStats: {
    downloadSpeed: number;
    uploadSpeed: number;
    latency: number;
    packetLoss: number;
    activeDevices: number;
    monthlyUsage: number;
    monthlyLimit: number;
    peakUsage: number;
    averageUsage: number;
  };
}

const UsageMonitoringDashboard: React.FC = () => {
  const [usageData, setUsageData] = useState<UsageData | null>(null);
  const [timeRange, setTimeRange] = useState('7days');
  const [selectedMetric, setSelectedMetric] = useState('bandwidth');

  // Fetch real usage data from API instead of generating mock data
  useEffect(() => {
    const fetchUsageData = async () => {
      try {
        const userId = localStorage.getItem('userId');
        const token = localStorage.getItem('access_token');
        
        if (!userId || !token) {
          console.error('Missing auth data for usage analytics');
          return;
        }
        
        // Fetch real usage analytics from the API
        const response = await fetch(
          `${process.env.REACT_APP_API_URL || 'http://localhost:5001/api'}/customer/usage-analytics?userId=${userId}&timeRange=${timeRange}`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        if (response.ok) {
          const data = await response.json();
          setUsageData(data);
        } else {
          console.error('Failed to fetch usage data:', response.statusText);
        }
      } catch (error) {
        console.error('Error fetching usage data:', error);
      }
    };
    
    fetchUsageData();
  }, [timeRange]);

  if (!usageData) {
    return <div className="p-6">Loading usage data...</div>;
  }

  const MetricCard = ({ 
    title, 
    value, 
    unit, 
    icon: Icon, 
    trend,
    trendValue,
    trendLabel,
    className = ''
  }: {
    title: string;
    value: number;
    unit: string;
    icon: any;
    trend?: 'up' | 'down';
    trendValue?: number;
    trendLabel?: string;
    className?: string;
  }) => (
    <div className={`bg-white p-6 rounded-lg shadow-sm border border-gray-200 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <Icon className="w-5 h-5 text-gray-500" />
          <h3 className="text-sm font-medium text-gray-900">{title}</h3>
        </div>
        {trend && trendValue && (
          <div className={`flex items-center space-x-1 text-sm ${
            trend === 'up' ? 'text-green-600' : 'text-red-600'
          }`}>
            {trend === 'up' ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            <span>{Math.abs(trendValue)}%</span>
          </div>
        )}
      </div>
      <div className="flex items-end space-x-2">
        <div className="text-2xl font-bold text-gray-900">{value.toFixed(1)}</div>
        <div className="text-sm text-gray-500 mb-1">{unit}</div>
      </div>
      {trendLabel && (
        <p className="text-xs text-gray-500 mt-2">{trendLabel}</p>
      )}
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Usage Monitoring</h1>
          <p className="text-gray-600 mt-1">Track your network usage and performance metrics</p>
        </div>
        <div className="flex items-center space-x-3">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
          >
            <option value="24hours">Last 24 Hours</option>
            <option value="7days">Last 7 Days</option>
            <option value="30days">Last 30 Days</option>
            <option value="6months">Last 6 Months</option>
          </select>
          <button className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            <Download className="w-4 h-4" />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="Download Speed"
          value={usageData.currentStats.downloadSpeed}
          unit="Mbps"
          icon={Download}
          trend="up"
          trendValue={5.2}
          trendLabel="vs last week"
        />
        <MetricCard
          title="Upload Speed"
          value={usageData.currentStats.uploadSpeed}
          unit="Mbps"
          icon={Upload}
          trend="up"
          trendValue={3.8}
          trendLabel="vs last week"
        />
        <MetricCard
          title="Monthly Usage"
          value={(usageData.currentStats.monthlyUsage / usageData.currentStats.monthlyLimit) * 100}
          unit="% Used"
          icon={Activity}
          trendLabel={`${usageData.currentStats.monthlyUsage.toFixed(0)} GB of ${usageData.currentStats.monthlyLimit} GB`}
        />
        <MetricCard
          title="Active Devices"
          value={usageData.currentStats.activeDevices}
          unit="devices"
          icon={Wifi}
          trend="up"
          trendValue={2}
          trendLabel="Currently connected"
        />
      </div>

      {/* Network Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Daily Usage</h3>
            <select
              value={selectedMetric}
              onChange={(e) => setSelectedMetric(e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-2 py-1"
            >
              <option value="bandwidth">Total Bandwidth</option>
              <option value="download">Download</option>
              <option value="upload">Upload</option>
            </select>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={usageData.dailyUsage}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              {selectedMetric === 'bandwidth' ? (
                <Area 
                  type="monotone" 
                  dataKey="totalBandwidth" 
                  stroke="#8884d8" 
                  fill="#8884d8" 
                  name="Total Bandwidth (GB)" 
                />
              ) : (
                <>
                  <Area 
                    type="monotone" 
                    dataKey="download" 
                    stroke="#82ca9d" 
                    fill="#82ca9d" 
                    name="Download (GB)" 
                  />
                  <Area 
                    type="monotone" 
                    dataKey="upload" 
                    stroke="#ffc658" 
                    fill="#ffc658" 
                    name="Upload (GB)" 
                  />
                </>
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Hourly Usage Pattern</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={usageData.hourlyUsage}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="hour" />
              <YAxis yAxisId="left" orientation="left" stroke="#8884d8" />
              <YAxis yAxisId="right" orientation="right" stroke="#82ca9d" />
              <Tooltip />
              <Legend />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="bandwidth"
                stroke="#8884d8"
                name="Bandwidth Usage (Mbps)"
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="users"
                stroke="#82ca9d"
                name="Active Users"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Monthly Usage Trend</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={usageData.monthlyUsage}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="download" name="Download (GB)" fill="#82ca9d" />
              <Bar dataKey="upload" name="Upload (GB)" fill="#ffc658" />
              <Bar dataKey="limit" name="Monthly Limit" fill="#ff7c7c" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Device Distribution</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={usageData.deviceDistribution}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value }) => `${name} ${value}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {usageData.deviceDistribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Network Health Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-900">Network Latency</h3>
            <AlertTriangle className={`w-5 h-5 ${
              usageData.currentStats.latency < 20 ? 'text-green-500' : 
              usageData.currentStats.latency < 50 ? 'text-yellow-500' : 
              'text-red-500'
            }`} />
          </div>
          <div className="text-2xl font-bold text-gray-900 mb-1">
            {usageData.currentStats.latency} ms
          </div>
          <p className="text-xs text-gray-500">
            {usageData.currentStats.latency < 20 ? 'Excellent' :
             usageData.currentStats.latency < 50 ? 'Good' :
             'Poor'} network performance
          </p>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-900">Packet Loss</h3>
            <AlertTriangle className={`w-5 h-5 ${
              usageData.currentStats.packetLoss < 1 ? 'text-green-500' : 
              usageData.currentStats.packetLoss < 2 ? 'text-yellow-500' : 
              'text-red-500'
            }`} />
          </div>
          <div className="text-2xl font-bold text-gray-900 mb-1">
            {usageData.currentStats.packetLoss}%
          </div>
          <p className="text-xs text-gray-500">
            {usageData.currentStats.packetLoss < 1 ? 'Minimal packet loss' :
             usageData.currentStats.packetLoss < 2 ? 'Moderate packet loss' :
             'High packet loss'}
          </p>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-900">Peak Usage</h3>
            <BarChart2 className="w-5 h-5 text-blue-500" />
          </div>
          <div className="text-2xl font-bold text-gray-900 mb-1">
            {usageData.currentStats.peakUsage}%
          </div>
          <p className="text-xs text-gray-500">
            Average: {usageData.currentStats.averageUsage}% utilization
          </p>
        </div>
      </div>

      {/* Settings Button */}
      <div className="flex justify-end">
        <button className="flex items-center space-x-2 px-4 py-2 text-gray-700 hover:text-gray-900">
          <Settings className="w-4 h-4" />
          <span>Configure Alerts</span>
        </button>
      </div>
    </div>
  );
};

export default UsageMonitoringDashboard;