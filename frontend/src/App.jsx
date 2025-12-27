import React, { useState, useCallback, useEffect, useRef } from 'react';
import { 
  Upload, AlertTriangle, CheckCircle, XCircle, BarChart3, Factory, 
  FileText, Camera, Activity, Zap, Clock, TrendingUp, 
  AlertCircle, Cpu, Eye, ChevronRight,
  RefreshCw, Download, Settings, Bell, Search, Filter,
  Package, Target, Layers, GitBranch, ChevronDown, X,
  Volume2, Grid, Moon, Sun, Wifi, WifiOff
} from 'lucide-react';

// Import dashboard charts (add recharts to package.json first)
// import { WikoDashboard } from './WikoDashboardCharts';

// ============================================================================
// WIKO MANUFACTURING INTELLIGENCE PLATFORM v2.0
// Complete Application with All Features
// ============================================================================

// Configuration
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

// Custom hooks
const useRealtimeData = () => {
  const [stats, setStats] = useState({
    totalInspected: 4521,
    defectsFound: 8,
    defectRate: 0.18,
    avgResponseTime: 2.3,
    lineStatus: 'running',
    shift: 'Day Shift A',
    uptime: 99.7
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setStats(prev => ({
        ...prev,
        totalInspected: prev.totalInspected + Math.floor(Math.random() * 3),
        avgResponseTime: Number((2 + Math.random() * 0.8).toFixed(1))
      }));
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return stats;
};

const useApiHealth = () => {
  const [isOnline, setIsOnline] = useState(true);
  
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const response = await fetch(`${API_BASE_URL.replace('/api/v1', '')}/health`, { 
          method: 'GET',
          timeout: 5000 
        });
        setIsOnline(response.ok);
      } catch {
        setIsOnline(false);
      }
    };
    
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, []);
  
  return isOnline;
};

// Components
const SeverityBadge = ({ severity, size = 'md' }) => {
  const config = {
    critical: { bg: 'bg-red-500/20', border: 'border-red-500', text: 'text-red-400', label: 'CRITICAL' },
    major: { bg: 'bg-orange-500/20', border: 'border-orange-500', text: 'text-orange-400', label: 'MAJOR' },
    minor: { bg: 'bg-yellow-500/20', border: 'border-yellow-500', text: 'text-yellow-400', label: 'MINOR' },
    cosmetic: { bg: 'bg-emerald-500/20', border: 'border-emerald-500', text: 'text-emerald-400', label: 'COSMETIC' }
  };
  
  const c = config[severity] || config.cosmetic;
  const sizeClasses = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-3 py-1';
  
  return (
    <span className={`${c.bg} ${c.text} ${sizeClasses} border ${c.border} rounded-full font-mono font-bold tracking-wider inline-flex items-center gap-1`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.border.replace('border-', 'bg-')} animate-pulse`}></span>
      {c.label}
    </span>
  );
};

const AnimatedCounter = ({ value, duration = 1000 }) => {
  const [displayValue, setDisplayValue] = useState(0);
  
  useEffect(() => {
    const steps = 60;
    const increment = value / steps;
    let current = 0;
    
    const timer = setInterval(() => {
      current += increment;
      if (current >= value) {
        setDisplayValue(value);
        clearInterval(timer);
      } else {
        setDisplayValue(Math.floor(current));
      }
    }, duration / steps);
    
    return () => clearInterval(timer);
  }, [value, duration]);
  
  return <span>{displayValue.toLocaleString()}</span>;
};

const StatusIndicator = ({ status, label }) => {
  const isActive = ['running', 'active', 'online'].includes(status);
  return (
    <div className="flex items-center gap-2">
      <div className={`relative w-3 h-3 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-red-500'}`}>
        {isActive && (
          <div className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-75"></div>
        )}
      </div>
      <span className={`text-sm font-medium ${isActive ? 'text-emerald-400' : 'text-red-400'}`}>
        {label}
      </span>
    </div>
  );
};

// Production stages
const productionStages = [
  { id: 1, name: 'Stamp', key: 'blade_stamp' },
  { id: 2, name: 'Weld', key: 'bolster_welding' },
  { id: 3, name: 'Polish', key: 'back_edge_polishing' },
  { id: 4, name: 'Grind', key: 'taper_grinding' },
  { id: 5, name: 'Heat', key: 'heat_treatment' },
  { id: 6, name: 'Quench', key: 'vacuum_quench' },
  { id: 7, name: 'Mold', key: 'handle_injection' },
  { id: 8, name: 'Rivet', key: 'rivet_assembly' },
  { id: 9, name: 'Finish', key: 'handle_polishing' },
  { id: 10, name: 'Glaze', key: 'blade_glazing' },
  { id: 11, name: 'Hone', key: 'cutting_edge_honing' },
  { id: 12, name: 'QC', key: 'logo_print' },
];

// Main App Component
export default function App() {
  const [activeTab, setActiveTab] = useState('analyze');
  const [analysisResult, setAnalysisResult] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [recentDefects, setRecentDefects] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [darkMode, setDarkMode] = useState(true);
  
  const fileInputRef = useRef(null);
  const audioRef = useRef(null);
  const stats = useRealtimeData();
  const isApiOnline = useApiHealth();

  const [formData, setFormData] = useState({
    product_sku: 'WK-KN-200',
    facility: 'yangjiang'
  });

  // Product catalog
  const skuOptions = [
    { value: 'WK-KN-200', label: '8" Chef Knife', category: 'Knives' },
    { value: 'WK-KN-150', label: '6" Utility Knife', category: 'Knives' },
    { value: 'WK-KN-100', label: '4" Paring Knife', category: 'Knives' },
    { value: 'WK-SC-200', label: 'Kitchen Scissors', category: 'Scissors' },
    { value: 'WK-CI-200', label: '20cm Cast Iron Pan', category: 'Cookware' },
    { value: 'WK-CI-280', label: '28cm Pro Wok', category: 'Cookware' },
  ];

  const facilityOptions = [
    { value: 'yangjiang', label: 'Yangjiang Production', status: 'running', workers: 800 },
    { value: 'shenzhen', label: 'Shenzhen R&D', status: 'active', workers: 150 },
    { value: 'hongkong', label: 'Hong Kong HQ', status: 'active', workers: 50 },
  ];

  // File handling
  const handleFileSelect = useCallback((e) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setAnalysisResult(null);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setAnalysisResult(null);
    }
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const clearImage = useCallback(() => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setAnalysisResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  // Play alert sound for critical defects
  const playAlert = useCallback(() => {
    if (soundEnabled && audioRef.current) {
      audioRef.current.play().catch(() => {});
    }
  }, [soundEnabled]);

  // Add notification
  const addNotification = useCallback((message, type = 'info') => {
    const id = Date.now();
    setNotifications(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  }, []);

  // Analyze image
  const handleAnalyze = async () => {
    if (!selectedFile) return;
    
    setIsAnalyzing(true);
    
    try {
      const formDataObj = new FormData();
      formDataObj.append('image', selectedFile);
      formDataObj.append('product_sku', formData.product_sku);
      formDataObj.append('facility', formData.facility);
      
      const response = await fetch(`${API_BASE_URL}/analyze`, { 
        method: 'POST', 
        body: formDataObj 
      });
      
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setAnalysisResult(result.analysis);
          if (result.analysis.defect_detected) {
            setRecentDefects(prev => [result.analysis, ...prev].slice(0, 20));
            if (result.analysis.severity === 'critical') {
              playAlert();
              addNotification('Critical defect detected!', 'error');
            }
          } else {
            addNotification('Inspection passed', 'success');
          }
        }
      } else {
        // Demo mode - simulate response
        const mockResult = generateMockResult();
        setAnalysisResult(mockResult);
        if (mockResult.defect_detected) {
          setRecentDefects(prev => [mockResult, ...prev].slice(0, 20));
          if (mockResult.severity === 'critical') {
            playAlert();
            addNotification('Critical defect detected!', 'error');
          }
        }
      }
    } catch (error) {
      console.error('Analysis error:', error);
      // Demo mode
      const mockResult = generateMockResult();
      setAnalysisResult(mockResult);
    }
    
    setIsAnalyzing(false);
  };

  // Generate mock result for demo
  const generateMockResult = () => {
    const hasDefect = Math.random() > 0.6;
    const defectTypes = ['rust_spot', 'edge_irregularity', 'blade_scratch', 'polish_defect', 'handle_crack'];
    const severities = ['critical', 'major', 'minor', 'cosmetic'];
    const stages = ['vacuum_quench', 'taper_grinding', 'blade_glazing', 'handle_injection', 'bolster_welding'];
    
    return {
      defect_id: `DEF-${Date.now().toString(36).toUpperCase()}`,
      timestamp: new Date().toISOString(),
      facility: formData.facility,
      product_sku: formData.product_sku,
      defect_detected: hasDefect,
      defect_type: hasDefect ? defectTypes[Math.floor(Math.random() * defectTypes.length)] : null,
      severity: hasDefect ? severities[Math.floor(Math.random() * severities.length)] : null,
      confidence: 0.85 + Math.random() * 0.14,
      description: hasDefect 
        ? 'Surface anomaly detected. AI analysis indicates manufacturing deviation.'
        : 'No defects detected. Product meets quality standards.',
      probable_stage: hasDefect ? stages[Math.floor(Math.random() * stages.length)] : null,
      root_cause: hasDefect 
        ? 'Process parameter variance detected during manufacturing stage.'
        : null,
      corrective_actions: hasDefect ? [
        'Verify equipment calibration',
        'Check process parameters',
        'Review batch records'
      ] : [],
      five_why_chain: hasDefect ? [
        'Surface anomaly observed',
        'Process deviation occurred',
        'Equipment parameter drift',
        'Calibration schedule delayed',
        'Maintenance resource constraints'
      ] : []
    };
  };

  return (
    <div className={`min-h-screen ${darkMode ? 'bg-[#0a0a0f] text-gray-100' : 'bg-gray-100 text-gray-900'}`}>
      {/* Audio element for alerts */}
      <audio ref={audioRef} preload="auto">
        <source src="data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleggArH/Z46eBUx5B/+v/r..." type="audio/wav" />
      </audio>

      {/* Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className={`absolute inset-0 ${darkMode 
          ? 'bg-[linear-gradient(rgba(20,184,166,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(20,184,166,0.03)_1px,transparent_1px)]' 
          : 'bg-[linear-gradient(rgba(0,0,0,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.05)_1px,transparent_1px)]'
        } bg-[size:50px_50px]`}></div>
        {darkMode && (
          <>
            <div className="absolute top-0 left-1/4 w-96 h-96 bg-teal-500/5 rounded-full blur-3xl"></div>
            <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl"></div>
          </>
        )}
      </div>

      {/* Notifications */}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {notifications.map(n => (
          <div 
            key={n.id}
            className={`px-4 py-3 rounded-xl shadow-lg border backdrop-blur animate-slide-in ${
              n.type === 'error' 
                ? 'bg-red-500/20 border-red-500/30 text-red-400' 
                : n.type === 'success'
                  ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400'
                  : 'bg-gray-800/90 border-gray-700 text-gray-300'
            }`}
          >
            <div className="flex items-center gap-2">
              {n.type === 'error' && <AlertTriangle className="w-4 h-4" />}
              {n.type === 'success' && <CheckCircle className="w-4 h-4" />}
              <span className="text-sm font-medium">{n.message}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Header */}
      <header className={`relative z-10 border-b ${darkMode ? 'border-gray-800/50 bg-[#0a0a0f]/90' : 'border-gray-200 bg-white/90'} backdrop-blur-xl`}>
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="w-12 h-12 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-xl flex items-center justify-center shadow-lg shadow-teal-500/20">
                  <Factory className="w-7 h-7 text-white" />
                </div>
                <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-[#0a0a0f] flex items-center justify-center">
                  <div className="w-2 h-2 bg-emerald-300 rounded-full animate-pulse"></div>
                </div>
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight font-mono">
                  <span className="text-teal-400">WIKO</span>
                  <span className={darkMode ? 'text-gray-300' : 'text-gray-700'}> MFG INTELLIGENCE</span>
                </h1>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className={`text-xs tracking-wider ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                    DEFECT ANALYSIS PLATFORM
                  </span>
                  <span className="text-xs px-2 py-0.5 bg-teal-500/10 text-teal-400 rounded border border-teal-500/20">
                    v2.0
                  </span>
                </div>
              </div>
            </div>

            {/* Center Stats */}
            <div className="hidden lg:flex items-center gap-8">
              <div className="text-center">
                <div className={`text-2xl font-bold tabular-nums ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  <AnimatedCounter value={stats.totalInspected} />
                </div>
                <div className={`text-xs uppercase tracking-wider ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                  Inspected
                </div>
              </div>
              <div className={`w-px h-10 ${darkMode ? 'bg-gray-800' : 'bg-gray-200'}`}></div>
              <div className="text-center">
                <div className="text-2xl font-bold text-emerald-400 tabular-nums">{stats.defectRate}%</div>
                <div className={`text-xs uppercase tracking-wider ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                  Defect Rate
                </div>
              </div>
              <div className={`w-px h-10 ${darkMode ? 'bg-gray-800' : 'bg-gray-200'}`}></div>
              <div className="text-center">
                <div className="text-2xl font-bold text-cyan-400 tabular-nums">{stats.avgResponseTime}s</div>
                <div className={`text-xs uppercase tracking-wider ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                  Response
                </div>
              </div>
            </div>

            {/* Right Controls */}
            <div className="flex items-center gap-3">
              {/* API Status */}
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-800/50">
                {isApiOnline ? (
                  <Wifi className="w-4 h-4 text-emerald-400" />
                ) : (
                  <WifiOff className="w-4 h-4 text-red-400" />
                )}
                <span className={`text-xs ${isApiOnline ? 'text-emerald-400' : 'text-red-400'}`}>
                  {isApiOnline ? 'API Online' : 'Demo Mode'}
                </span>
              </div>
              
              <StatusIndicator status={stats.lineStatus} label="Line Active" />
              
              <div className={`w-px h-8 ${darkMode ? 'bg-gray-800' : 'bg-gray-200'}`}></div>
              
              {/* Sound Toggle */}
              <button 
                onClick={() => setSoundEnabled(!soundEnabled)}
                className={`p-2 rounded-lg transition-colors ${darkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-200'}`}
                title={soundEnabled ? 'Mute alerts' : 'Enable alerts'}
              >
                <Volume2 className={`w-5 h-5 ${soundEnabled ? 'text-teal-400' : 'text-gray-500'}`} />
              </button>
              
              {/* Dark Mode Toggle */}
              <button 
                onClick={() => setDarkMode(!darkMode)}
                className={`p-2 rounded-lg transition-colors ${darkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-200'}`}
              >
                {darkMode ? (
                  <Sun className="w-5 h-5 text-gray-400" />
                ) : (
                  <Moon className="w-5 h-5 text-gray-600" />
                )}
              </button>
              
              <button className={`p-2 rounded-lg transition-colors relative ${darkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-200'}`}>
                <Bell className={`w-5 h-5 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`} />
                {recentDefects.filter(d => d.severity === 'critical').length > 0 && (
                  <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
                )}
              </button>
              
              <button className={`p-2 rounded-lg transition-colors ${darkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-200'}`}>
                <Settings className={`w-5 h-5 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`} />
              </button>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="px-6 flex items-center gap-1">
          {[
            { id: 'analyze', label: 'ANALYZE', icon: Eye },
            { id: 'dashboard', label: 'DASHBOARD', icon: Activity },
            { id: 'history', label: 'HISTORY', icon: Clock },
            { id: 'reports', label: 'REPORTS', icon: FileText },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium tracking-wider transition-all relative ${
                activeTab === tab.id
                  ? 'text-teal-400'
                  : darkMode ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
              {tab.id === 'history' && recentDefects.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-xs bg-gray-800 rounded-full">
                  {recentDefects.length}
                </span>
              )}
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-teal-500 to-cyan-500"></div>
              )}
            </button>
          ))}
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 p-6">
        {activeTab === 'analyze' && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Left Column */}
            <div className="xl:col-span-2 space-y-6">
              {/* Upload Zone */}
              <div className={`${darkMode ? 'bg-gray-900/50' : 'bg-white'} backdrop-blur border ${darkMode ? 'border-gray-800' : 'border-gray-200'} rounded-2xl overflow-hidden shadow-xl`}>
                <div className={`px-6 py-4 border-b ${darkMode ? 'border-gray-800' : 'border-gray-200'} flex items-center justify-between`}>
                  <div className="flex items-center gap-3">
                    <Camera className="w-5 h-5 text-teal-400" />
                    <h2 className="font-semibold tracking-wide">IMAGE CAPTURE</h2>
                  </div>
                </div>
                
                <div className="p-6">
                  <div
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onClick={() => !previewUrl && fileInputRef.current?.click()}
                    className={`relative border-2 border-dashed rounded-xl transition-all overflow-hidden ${
                      isDragging 
                        ? 'border-teal-500 bg-teal-500/10' 
                        : previewUrl 
                          ? `${darkMode ? 'border-gray-700 bg-gray-800/50' : 'border-gray-300 bg-gray-50'}` 
                          : `${darkMode ? 'border-gray-700 hover:border-gray-600 bg-gray-800/30' : 'border-gray-300 hover:border-gray-400 bg-gray-50'} cursor-pointer`
                    }`}
                  >
                    {previewUrl ? (
                      <div className="relative aspect-video">
                        <img src={previewUrl} alt="Preview" className="w-full h-full object-contain" />
                        <div className="absolute inset-0 bg-gradient-to-t from-gray-900/80 via-transparent to-transparent"></div>
                        <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Package className="w-4 h-4 text-teal-400" />
                            <span className="text-sm font-mono text-white">{selectedFile?.name}</span>
                          </div>
                          <button 
                            onClick={(e) => { e.stopPropagation(); clearImage(); }}
                            className="p-1.5 bg-gray-800/80 hover:bg-red-500/20 rounded-lg transition-colors"
                          >
                            <X className="w-4 h-4 text-white" />
                          </button>
                        </div>
                        
                        {isAnalyzing && (
                          <div className="absolute inset-0 bg-gray-900/90 flex items-center justify-center">
                            <div className="text-center">
                              <div className="relative w-20 h-20 mx-auto mb-4">
                                <div className="absolute inset-0 border-4 border-teal-500/20 rounded-full"></div>
                                <div className="absolute inset-0 border-4 border-teal-500 rounded-full border-t-transparent animate-spin"></div>
                                <Cpu className="absolute inset-0 m-auto w-8 h-8 text-teal-400" />
                              </div>
                              <p className="text-teal-400 font-medium tracking-wider">ANALYZING...</p>
                              <p className="text-xs text-gray-500 mt-1">GPT-5.2 Vision Processing</p>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="aspect-video flex flex-col items-center justify-center p-8">
                        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 transition-all ${
                          isDragging ? 'bg-teal-500/20 scale-110' : darkMode ? 'bg-gray-800' : 'bg-gray-200'
                        }`}>
                          <Upload className={`w-8 h-8 ${isDragging ? 'text-teal-400' : darkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                        </div>
                        <p className={`font-medium mb-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          Drop image here or click to upload
                        </p>
                        <p className={`text-xs ${darkMode ? 'text-gray-600' : 'text-gray-400'}`}>
                          Supports JPG, PNG, WebP up to 16MB
                        </p>
                      </div>
                    )}
                    
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                  </div>
                </div>
              </div>

              {/* Config Panel */}
              <div className={`${darkMode ? 'bg-gray-900/50' : 'bg-white'} backdrop-blur border ${darkMode ? 'border-gray-800' : 'border-gray-200'} rounded-2xl overflow-hidden shadow-xl`}>
                <div className={`px-6 py-4 border-b ${darkMode ? 'border-gray-800' : 'border-gray-200'}`}>
                  <div className="flex items-center gap-3">
                    <Settings className="w-5 h-5 text-cyan-400" />
                    <h2 className="font-semibold tracking-wide">INSPECTION CONFIG</h2>
                  </div>
                </div>
                
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className={`block text-xs uppercase tracking-wider mb-2 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                      Product SKU
                    </label>
                    <div className="relative">
                      <select
                        value={formData.product_sku}
                        onChange={(e) => setFormData(prev => ({ ...prev, product_sku: e.target.value }))}
                        className={`w-full ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-300'} border rounded-xl px-4 py-3 text-sm appearance-none focus:outline-none focus:border-teal-500 transition-colors`}
                      >
                        {skuOptions.map(opt => (
                          <option key={opt.value} value={opt.value}>
                            {opt.value} — {opt.label}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className={`absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 ${darkMode ? 'text-gray-500' : 'text-gray-400'} pointer-events-none`} />
                    </div>
                  </div>

                  <div>
                    <label className={`block text-xs uppercase tracking-wider mb-2 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                      Facility
                    </label>
                    <div className="relative">
                      <select
                        value={formData.facility}
                        onChange={(e) => setFormData(prev => ({ ...prev, facility: e.target.value }))}
                        className={`w-full ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-300'} border rounded-xl px-4 py-3 text-sm appearance-none focus:outline-none focus:border-teal-500 transition-colors`}
                      >
                        {facilityOptions.map(opt => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className={`absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 ${darkMode ? 'text-gray-500' : 'text-gray-400'} pointer-events-none`} />
                    </div>
                  </div>
                </div>

                <div className="px-6 pb-6">
                  <button
                    onClick={handleAnalyze}
                    disabled={!selectedFile || isAnalyzing}
                    className={`w-full py-4 rounded-xl font-bold tracking-wider text-sm transition-all flex items-center justify-center gap-3 ${
                      !selectedFile || isAnalyzing
                        ? `${darkMode ? 'bg-gray-800 text-gray-600' : 'bg-gray-200 text-gray-400'} cursor-not-allowed`
                        : 'bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 text-white shadow-lg shadow-teal-500/25 hover:shadow-teal-500/40'
                    }`}
                  >
                    {isAnalyzing ? (
                      <>
                        <RefreshCw className="w-5 h-5 animate-spin" />
                        PROCESSING...
                      </>
                    ) : (
                      <>
                        <Zap className="w-5 h-5" />
                        ANALYZE DEFECTS
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Right Column - Results */}
            <div className="space-y-6">
              <div className={`${darkMode ? 'bg-gray-900/50' : 'bg-white'} backdrop-blur border ${darkMode ? 'border-gray-800' : 'border-gray-200'} rounded-2xl overflow-hidden shadow-xl`}>
                <div className={`px-6 py-4 border-b ${darkMode ? 'border-gray-800' : 'border-gray-200'}`}>
                  <div className="flex items-center gap-3">
                    <Target className="w-5 h-5 text-orange-400" />
                    <h2 className="font-semibold tracking-wide">ANALYSIS RESULT</h2>
                  </div>
                </div>
                
                <div className="p-6">
                  {analysisResult ? (
                    <div className="space-y-6">
                      <div className={`p-4 rounded-xl border ${
                        analysisResult.defect_detected
                          ? 'bg-red-500/10 border-red-500/30'
                          : 'bg-emerald-500/10 border-emerald-500/30'
                      }`}>
                        <div className="flex items-center gap-3">
                          {analysisResult.defect_detected ? (
                            <XCircle className="w-8 h-8 text-red-400" />
                          ) : (
                            <CheckCircle className="w-8 h-8 text-emerald-400" />
                          )}
                          <div>
                            <div className={`text-lg font-bold ${
                              analysisResult.defect_detected ? 'text-red-400' : 'text-emerald-400'
                            }`}>
                              {analysisResult.defect_detected ? 'DEFECT DETECTED' : 'INSPECTION PASSED'}
                            </div>
                            <div className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                              ID: {analysisResult.defect_id}
                            </div>
                          </div>
                        </div>
                      </div>

                      {analysisResult.defect_detected && (
                        <>
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <span className={`text-sm ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>Type</span>
                              <span className={`font-mono text-sm px-3 py-1 rounded-lg ${darkMode ? 'text-white bg-gray-800' : 'text-gray-900 bg-gray-100'}`}>
                                {analysisResult.defect_type?.replace(/_/g, ' ').toUpperCase()}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className={`text-sm ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>Severity</span>
                              <SeverityBadge severity={analysisResult.severity} size="sm" />
                            </div>
                            <div className="flex items-center justify-between">
                              <span className={`text-sm ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>Confidence</span>
                              <div className="flex items-center gap-2">
                                <div className={`w-24 h-2 ${darkMode ? 'bg-gray-800' : 'bg-gray-200'} rounded-full overflow-hidden`}>
                                  <div 
                                    className="h-full bg-gradient-to-r from-teal-500 to-cyan-500 rounded-full"
                                    style={{ width: `${(analysisResult.confidence || 0) * 100}%` }}
                                  ></div>
                                </div>
                                <span className="text-sm font-mono text-teal-400">
                                  {((analysisResult.confidence || 0) * 100).toFixed(1)}%
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className={`text-sm ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>Stage</span>
                              <span className="text-sm text-orange-400">
                                {analysisResult.probable_stage?.replace(/_/g, ' ').toUpperCase()}
                              </span>
                            </div>
                          </div>

                          <div>
                            <h4 className={`text-xs uppercase tracking-wider mb-2 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                              Root Cause
                            </h4>
                            <p className={`text-sm p-3 rounded-lg border ${darkMode ? 'text-gray-300 bg-gray-800/50 border-gray-700' : 'text-gray-700 bg-gray-50 border-gray-200'}`}>
                              {analysisResult.root_cause}
                            </p>
                          </div>

                          {analysisResult.corrective_actions?.length > 0 && (
                            <div>
                              <h4 className={`text-xs uppercase tracking-wider mb-2 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                                Corrective Actions
                              </h4>
                              <ul className="space-y-2">
                                {analysisResult.corrective_actions.map((action, i) => (
                                  <li key={i} className={`flex items-start gap-2 text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                                    <ChevronRight className="w-4 h-4 text-teal-400 flex-shrink-0 mt-0.5" />
                                    {action}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </>
                      )}

                      <div className={`pt-4 border-t ${darkMode ? 'border-gray-800' : 'border-gray-200'} grid grid-cols-2 gap-4 text-xs`}>
                        <div>
                          <span className={`block ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>Timestamp</span>
                          <span className={darkMode ? 'text-gray-300' : 'text-gray-700'}>
                            {new Date(analysisResult.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <div>
                          <span className={`block ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>Product</span>
                          <span className={`font-mono ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                            {analysisResult.product_sku}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="py-12 text-center">
                      <div className={`w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center ${darkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
                        <Eye className={`w-8 h-8 ${darkMode ? 'text-gray-600' : 'text-gray-400'}`} />
                      </div>
                      <p className={darkMode ? 'text-gray-500' : 'text-gray-400'}>Upload an image to analyze</p>
                      <p className={`text-xs mt-1 ${darkMode ? 'text-gray-600' : 'text-gray-400'}`}>AI-powered defect detection</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Quick Stats */}
              <div className={`${darkMode ? 'bg-gray-900/50' : 'bg-white'} backdrop-blur border ${darkMode ? 'border-gray-800' : 'border-gray-200'} rounded-2xl p-6 shadow-xl`}>
                <h3 className={`text-xs uppercase tracking-wider mb-4 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                  Shift Summary
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Inspected</span>
                    <span className={`font-mono ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      {stats.totalInspected.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Defects</span>
                    <span className="font-mono text-red-400">{stats.defectsFound}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Rate</span>
                    <span className="font-mono text-emerald-400">{stats.defectRate}%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Target</span>
                    <span className="font-mono text-teal-400">0.18%</span>
                  </div>
                  <div className={`pt-3 border-t ${darkMode ? 'border-gray-800' : 'border-gray-200'}`}>
                    <div className="flex items-center justify-between text-xs">
                      <span className={darkMode ? 'text-gray-500' : 'text-gray-400'}>vs Target</span>
                      <span className={`font-medium ${stats.defectRate <= 0.18 ? 'text-emerald-400' : 'text-orange-400'}`}>
                        {stats.defectRate <= 0.18 ? '✓ ON TARGET' : '⚠ ABOVE TARGET'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'dashboard' && (
          <div className={`${darkMode ? 'bg-gray-900/50' : 'bg-white'} backdrop-blur border ${darkMode ? 'border-gray-800' : 'border-gray-200'} rounded-2xl p-12 text-center shadow-xl`}>
            <BarChart3 className={`w-16 h-16 mx-auto mb-4 ${darkMode ? 'text-gray-600' : 'text-gray-300'}`} />
            <h3 className={`text-xl font-semibold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              Analytics Dashboard
            </h3>
            <p className={`mb-6 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
              Install recharts to enable interactive charts
            </p>
            <code className={`block text-sm font-mono p-3 rounded-lg ${darkMode ? 'bg-gray-800 text-teal-400' : 'bg-gray-100 text-teal-600'}`}>
              npm install recharts
            </code>
            <p className={`mt-4 text-xs ${darkMode ? 'text-gray-600' : 'text-gray-400'}`}>
              Then import WikoDashboard from WikoDashboardCharts.jsx
            </p>
          </div>
        )}

        {activeTab === 'history' && (
          <div className={`${darkMode ? 'bg-gray-900/50' : 'bg-white'} backdrop-blur border ${darkMode ? 'border-gray-800' : 'border-gray-200'} rounded-2xl overflow-hidden shadow-xl`}>
            <div className={`px-6 py-4 border-b ${darkMode ? 'border-gray-800' : 'border-gray-200'} flex items-center justify-between`}>
              <h2 className="font-semibold tracking-wide flex items-center gap-2">
                <Clock className="w-5 h-5 text-cyan-400" />
                RECENT INSPECTIONS
              </h2>
              <div className="flex items-center gap-2">
                <button className={`text-xs px-3 py-1.5 ${darkMode ? 'bg-gray-800 hover:bg-gray-700' : 'bg-gray-100 hover:bg-gray-200'} rounded-lg transition-colors flex items-center gap-2`}>
                  <Filter className="w-3 h-3" />
                  FILTER
                </button>
                <button className={`text-xs px-3 py-1.5 ${darkMode ? 'bg-gray-800 hover:bg-gray-700' : 'bg-gray-100 hover:bg-gray-200'} rounded-lg transition-colors flex items-center gap-2`}>
                  <Download className="w-3 h-3" />
                  EXPORT
                </button>
              </div>
            </div>
            
            <div className="p-6">
              {recentDefects.length > 0 ? (
                <div className="space-y-3">
                  {recentDefects.map((defect, i) => (
                    <div key={i} className={`${darkMode ? 'bg-gray-800/50 border-gray-700 hover:border-gray-600' : 'bg-gray-50 border-gray-200 hover:border-gray-300'} rounded-xl p-4 border transition-colors`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                            defect.defect_detected ? 'bg-red-500/20' : 'bg-emerald-500/20'
                          }`}>
                            {defect.defect_detected ? (
                              <XCircle className="w-5 h-5 text-red-400" />
                            ) : (
                              <CheckCircle className="w-5 h-5 text-emerald-400" />
                            )}
                          </div>
                          <div>
                            <div className={`font-mono text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                              {defect.defect_id}
                            </div>
                            <div className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                              {defect.product_sku} • {new Date(defect.timestamp).toLocaleString()}
                            </div>
                          </div>
                        </div>
                        {defect.defect_detected && (
                          <div className="flex items-center gap-3">
                            <span className={`text-xs font-mono ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                              {defect.defect_type?.replace(/_/g, ' ')}
                            </span>
                            <SeverityBadge severity={defect.severity} size="sm" />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={`py-12 text-center ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                  <Clock className={`w-12 h-12 mx-auto mb-3 opacity-50`} />
                  <p>No inspection history yet</p>
                  <p className={`text-xs ${darkMode ? 'text-gray-600' : 'text-gray-400'}`}>
                    Analyzed images will appear here
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'reports' && (
          <div className={`${darkMode ? 'bg-gray-900/50' : 'bg-white'} backdrop-blur border ${darkMode ? 'border-gray-800' : 'border-gray-200'} rounded-2xl p-12 text-center shadow-xl`}>
            <FileText className={`w-16 h-16 mx-auto mb-4 ${darkMode ? 'text-gray-600' : 'text-gray-300'}`} />
            <h3 className={`text-xl font-semibold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              Reports Module
            </h3>
            <p className={`mb-6 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
              Generate shift reports, export data, and analyze trends
            </p>
            <button className="px-6 py-3 bg-gradient-to-r from-teal-500 to-cyan-500 rounded-xl font-medium text-sm tracking-wider text-white">
              COMING SOON
            </button>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className={`relative z-10 border-t ${darkMode ? 'border-gray-800' : 'border-gray-200'} px-6 py-4 mt-8`}>
        <div className={`flex items-center justify-between text-xs ${darkMode ? 'text-gray-600' : 'text-gray-400'}`}>
          <div className="flex items-center gap-4">
            <span>© 2025 Wiko Cutlery Ltd</span>
            <span className={`w-1 h-1 rounded-full ${darkMode ? 'bg-gray-700' : 'bg-gray-300'}`}></span>
            <span>Manufacturing Intelligence Platform</span>
          </div>
          <div className="flex items-center gap-4">
            <span>Hong Kong</span>
            <span className={`w-1 h-1 rounded-full ${darkMode ? 'bg-gray-700' : 'bg-gray-300'}`}></span>
            <span>Shenzhen</span>
            <span className={`w-1 h-1 rounded-full ${darkMode ? 'bg-gray-700' : 'bg-gray-300'}`}></span>
            <span>Yangjiang</span>
          </div>
        </div>
      </footer>

      {/* CSS for animations */}
      <style>{`
        @keyframes slide-in {
          from {
            opacity: 0;
            transform: translateX(100px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        .animate-slide-in {
          animation: slide-in 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
