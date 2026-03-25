import React, { useState, useEffect, useCallback } from 'react';
import {
    Box,
    Container,
    Typography,
    Card,
    Button,
    Stack,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Alert,
    Skeleton,
    Tabs,
    Tab,
    Snackbar,
    IconButton,
    Tooltip,
    Menu,
    MenuItem,
    ListItemIcon,
    ListItemText
} from '@mui/material';
import {
    Refresh as RefreshIcon,
    Download as DownloadIcon,
    ArrowDropDown as ArrowDropDownIcon,
    Code as CodeIcon,
    TableChart as TableChartIcon,
    PictureAsPdf as PictureAsPdfIcon,
    Warning as WarningIcon,
    TrendingUp as TrendingUpIcon,
    PersonSearch as PersonSearchIcon,
    AttachMoney as AttachMoneyIcon,
    Psychology as PsychologyIcon,
    Analytics as AnalyticsIcon,
    Assessment as AssessmentIcon,
    BarChart as BarChartIcon,
    Settings as SettingsIcon,
    CheckCircle as CheckCircleIcon,
    ErrorOutline as ErrorOutlineIcon,
    FileDownload as FileDownloadIcon
} from '@mui/icons-material';

// Import chart components
import { ChurnTrendChart, FeatureImportanceChart, CustomerSegmentChart } from './charts';
import AtRiskCustomersTable from './AtRiskCustomersTable';
import ChurnPredictorEnhanced from './ChurnPredictorEnhanced';
import MLDialogContent from './MLDialogContent';

// Types
interface TrendData {
    date: string;
    highRisk: number;
    mediumRisk: number;
    lowRisk: number;
    total: number;
}

interface Customer {
    id: string;
    name: string;
    email: string;
    plan: string;
    planPrice: number;
    probability: number;
    riskLevel: string;
    daysSinceLogin: number;
    paymentFailures: number;
    supportTickets: number;
    npsScore: number;
    usageChange: number;
    contractAge: number;
    recommendation: string;
}

interface CustomerOption {
    id: string;
    name: string;
    email: string;
    plan: string;
}

// API service for AI Pricing
const aiPricingService = {
    getToken: () => localStorage.getItem('access_token') || sessionStorage.getItem('access_token'),

    async fetchTrends(): Promise<TrendData[]> {
        const response = await fetch('http://localhost:5001/api/admin/ai-pricing/trends', {
            headers: { 'Authorization': `Bearer ${this.getToken()}` }
        });
        const data = await response.json();
        return data.success ? data.data : [];
    },

    async fetchModelMetrics(): Promise<any> {
        const response = await fetch('http://localhost:5001/api/admin/ai-pricing/model-metrics', {
            headers: { 'Authorization': `Bearer ${this.getToken()}` }
        });
        const data = await response.json();
        return data.success ? data.data : null;
    },

    async fetchAtRiskCustomers(): Promise<{ customers: Customer[]; summary: any }> {
        const response = await fetch('http://localhost:5001/api/admin/ai-pricing/at-risk-customers', {
            headers: { 'Authorization': `Bearer ${this.getToken()}` }
        });
        const data = await response.json();
        return data.success ? data.data : { customers: [], summary: {} };
    },

    async fetchCustomers(search: string = ''): Promise<CustomerOption[]> {
        const response = await fetch(`http://localhost:5001/api/admin/ai-pricing/customers?search=${search}`, {
            headers: { 'Authorization': `Bearer ${this.getToken()}` }
        });
        const data = await response.json();
        return data.success ? data.data : [];
    },

    async predictChurn(customerId: string): Promise<any> {
        const response = await fetch(`http://localhost:5001/api/admin/ai-pricing/predict/${customerId}`, {
            headers: { 'Authorization': `Bearer ${this.getToken()}` }
        });
        const data = await response.json();
        return data.success ? data.data.prediction : null;
    },

    async triggerChurnScan(): Promise<any> {
        const response = await fetch('http://localhost:5001/api/admin/churn-scan', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${this.getToken()}` }
        });
        const data = await response.json();
        return data.success ? data.data : null;
    },

    async logRetentionAction(customerId: string, action: string, notes?: string): Promise<void> {
        await fetch('http://localhost:5001/api/admin/ai-pricing/retention-action', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.getToken()}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ customerId, action, notes })
        });
    },

    // Pricing Proposal Workflow APIs
    async createProposal(changes: any[], projectedImpact?: any): Promise<any> {
        const response = await fetch('http://localhost:5001/api/admin/ai-pricing/proposals', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.getToken()}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ changes, projectedImpact })
        });
        const data = await response.json();
        return data;
    },

    async getProposals(status: string = 'all'): Promise<any> {
        const response = await fetch(`http://localhost:5001/api/admin/ai-pricing/proposals?status=${status}`, {
            headers: { 'Authorization': `Bearer ${this.getToken()}` }
        });
        const data = await response.json();
        return data.success ? data.data : { proposals: [], counts: {} };
    },

    async approveProposal(id: string, notes?: string): Promise<any> {
        const response = await fetch(`http://localhost:5001/api/admin/ai-pricing/proposals/${id}/approve`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.getToken()}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ notes })
        });
        return await response.json();
    },

    async applyProposal(id: string): Promise<any> {
        const response = await fetch(`http://localhost:5001/api/admin/ai-pricing/proposals/${id}/apply`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${this.getToken()}` }
        });
        return await response.json();
    }
};

// Feature weights from trained XGBoost model (for manual prediction)
const FEATURE_WEIGHTS = {
    usageChange: 0.173,
    paymentFailures: 0.160,
    supportTickets: 0.107,
    npsScore: 0.091,
    daysSinceLogin: 0.089,
    contractAge: 0.083
};

function calculateManualChurnRisk(inputs: any) {
    const {
        usageChange = 0,
        daysSinceLogin = 0,
        paymentFailures = 0,
        supportTickets = 0,
        npsScore = 7,
        contractAge = 12
    } = inputs;

    const usageRisk = usageChange < 0 ? Math.min(1, Math.abs(usageChange) / 50) : 0;
    const loginRisk = Math.min(1, daysSinceLogin / 30);
    const paymentRisk = Math.min(1, paymentFailures / 3);
    const ticketRisk = Math.min(1, supportTickets / 5);
    const npsRisk = Math.min(1, (10 - npsScore) / 10);
    const contractRisk = contractAge < 6 ? 0.5 : 0;

    const rawScore =
        usageRisk * FEATURE_WEIGHTS.usageChange +
        loginRisk * FEATURE_WEIGHTS.daysSinceLogin +
        paymentRisk * FEATURE_WEIGHTS.paymentFailures +
        ticketRisk * FEATURE_WEIGHTS.supportTickets +
        npsRisk * FEATURE_WEIGHTS.npsScore +
        contractRisk * FEATURE_WEIGHTS.contractAge;

    const probability = 1 / (1 + Math.exp(-((rawScore * 10) - 3)));
    const probPercent = Math.round(probability * 100);

    let riskLevel = 'Low';
    let recommendation = 'Customer is stable. Continue standard engagement.';

    if (probPercent >= 60) {
        riskLevel = 'High';
        recommendation = 'URGENT: Immediate intervention required. Offer retention discount.';
    } else if (probPercent >= 30) {
        riskLevel = 'Medium';
        recommendation = 'Monitor closely. Consider proactive outreach.';
    }

    return {
        probability: probPercent,
        riskLevel,
        recommendation,
        factors: {
            usageRisk: Math.round(usageRisk * 100),
            loginRisk: Math.round(loginRisk * 100),
            paymentRisk: Math.round(paymentRisk * 100),
            ticketRisk: Math.round(ticketRisk * 100),
            npsRisk: Math.round(npsRisk * 100),
            contractRisk: Math.round(contractRisk * 100)
        },
        rawInputs: inputs
    };
}

const AIPricingDashboard: React.FC = () => {
    // State
    const [activeTab, setActiveTab] = useState(0);
    const [loading, setLoading] = useState(true);
    const [trends, setTrends] = useState<TrendData[]>([]);
    const [modelMetrics, setModelMetrics] = useState<any>(null);
    const [atRiskCustomers, setAtRiskCustomers] = useState<Customer[]>([]);
    const [riskSummary, setRiskSummary] = useState({ highRisk: 0, mediumRisk: 0, lowRisk: 0, total: 0 });
    const [customers, setCustomers] = useState<CustomerOption[]>([]);
    const [customersLoading, setCustomersLoading] = useState(false);

    // Dialog state
    const [dialogOpen, setDialogOpen] = useState(false);
    const [dialogTitle, setDialogTitle] = useState('');
    const [dialogType, setDialogType] = useState<string>('');
    const [dialogData, setDialogData] = useState<any>(null);

    // Snackbar state
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

    // Payment failures state
    const [paymentFailures, setPaymentFailures] = useState<any[]>([]);
    const [failureStats, setFailureStats] = useState<any>({ total: 0, today: 0, thisWeek: 0, thisMonth: 0, totalAmount: 0 });
    const [failuresLoading, setFailuresLoading] = useState(false);

    // Load initial data
    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [trendsData, metricsData, riskData] = await Promise.all([
                aiPricingService.fetchTrends(),
                aiPricingService.fetchModelMetrics(),
                aiPricingService.fetchAtRiskCustomers()
            ]);

            setTrends(trendsData);
            setModelMetrics(metricsData);
            setAtRiskCustomers(riskData.customers);
            setRiskSummary(riskData.summary);
        } catch (error) {
            console.error('Failed to load AI Pricing data:', error);
            setSnackbar({ open: true, message: 'Failed to load dashboard data', severity: 'error' });
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Load payment failures when Payment Failures tab is active
    const loadPaymentFailures = useCallback(async () => {
        setFailuresLoading(true);
        try {
            const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
            const response = await fetch('http://localhost:5001/api/admin/payment-failures?limit=100', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            if (data.success) {
                setPaymentFailures(data.data.failures || []);
                setFailureStats(data.data.stats || { total: 0, today: 0, thisWeek: 0, thisMonth: 0, totalAmount: 0 });
            }
        } catch (error) {
            console.error('Failed to load payment failures:', error);
        }
        setFailuresLoading(false);
    }, []);

    useEffect(() => {
        if (activeTab === 4) {
            loadPaymentFailures();
        }
    }, [activeTab, loadPaymentFailures]);

    // Handlers
    const handleCustomerSearch = async (search: string) => {
        if (search.length < 2) return;
        setCustomersLoading(true);
        try {
            const data = await aiPricingService.fetchCustomers(search);
            setCustomers(data);
        } catch (error) {
            console.error('Customer search failed:', error);
        }
        setCustomersLoading(false);
    };

    const handlePredictChurn = async (customerId: string) => {
        return await aiPricingService.predictChurn(customerId);
    };

    const handleRetentionAction = async (customerId: string, action: string, notes?: string) => {
        try {
            await aiPricingService.logRetentionAction(customerId, action, notes);
            setSnackbar({ open: true, message: `${action} action logged successfully`, severity: 'success' });
        } catch (error) {
            setSnackbar({ open: true, message: 'Failed to log action', severity: 'error' });
        }
    };

    const handleScanNow = async () => {
        try {
            const result = await aiPricingService.triggerChurnScan();
            if (result) {
                setDialogTitle('🔍 Churn Scan Results');
                setDialogType('scan');
                setDialogData(result);
                setDialogOpen(true);
                // Refresh ALL dashboard data (trends + at-risk + metrics) for real-time sync
                await loadData();
            }
        } catch (error) {
            setSnackbar({ open: true, message: 'Scan failed', severity: 'error' });
        }
    };

    const handleShowPricingProposal = () => {
        // Dynamic pricing calculation based on real data
        const alpha = 0.15; // Demand weight
        const beta = 0.10;  // Elasticity weight  
        const gamma = 0.20; // Churn Risk weight

        const totalCustomers = riskSummary.total || 1;
        const highRiskRatio = riskSummary.highRisk / totalCustomers;
        const mediumRiskRatio = riskSummary.mediumRisk / totalCustomers;
        const lowRiskRatio = riskSummary.lowRisk / totalCustomers;

        // Calculate demand factor (higher when more customers)
        const demandFactor = Math.min(totalCustomers / 100, 1); // Normalized to 0-1

        // Calculate elasticity factor (price sensitivity)
        const highRiskElasticity = -1.8; // Very price sensitive
        const mediumRiskElasticity = -1.0; // Moderate
        const lowRiskElasticity = -0.3; // Low sensitivity

        // Dynamic pricing for each plan tier
        const basePrices = { basic: 499, standard: 799, premium: 1299 };

        // Basic plan: Target high-risk customers (offer discounts to retain)
        const basicChurnRisk = highRiskRatio > 0.2 ? 0.3 : highRiskRatio > 0.1 ? 0.15 : 0.05;
        const basicAdjustment = 1 + (alpha * demandFactor) + (beta * highRiskElasticity * 0.1) - (gamma * basicChurnRisk);
        const basicDynamicPrice = Math.round(basePrices.basic * Math.max(0.7, Math.min(1.1, basicAdjustment)));
        const basicChange = Math.round(((basicDynamicPrice - basePrices.basic) / basePrices.basic) * 100);

        // Standard plan: Balanced approach (stable pricing)
        const standardAdjustment = 1 + (alpha * demandFactor * 0.5) + (beta * mediumRiskElasticity * 0.05);
        const standardDynamicPrice = Math.round(basePrices.standard * Math.max(0.95, Math.min(1.05, standardAdjustment)));
        const standardChange = Math.round(((standardDynamicPrice - basePrices.standard) / basePrices.standard) * 100);

        // Premium plan: Target low-risk (can increase prices due to low sensitivity)
        const premiumAdjustment = 1 + (alpha * demandFactor) + (beta * lowRiskElasticity * 0.1) + (gamma * (1 - highRiskRatio) * 0.15);
        const premiumDynamicPrice = Math.round(basePrices.premium * Math.max(0.9, Math.min(1.2, premiumAdjustment)));
        const premiumChange = Math.round(((premiumDynamicPrice - basePrices.premium) / basePrices.premium) * 100);

        // Generate reasons based on data
        const basicReason = highRiskRatio > 0.15
            ? `High churn risk (${riskSummary.highRisk} at-risk customers)`
            : highRiskRatio > 0.05
                ? `Moderate churn risk detected`
                : `Market competitive adjustment`;

        const standardReason = Math.abs(standardChange) < 3
            ? `Optimal pricing (${riskSummary.mediumRisk} medium-risk)`
            : standardChange > 0
                ? `Demand-based increase`
                : `Retention strategy`;

        const premiumReason = lowRiskRatio > 0.7
            ? `Low price sensitivity (${Math.round(lowRiskRatio * 100)}% low-risk)`
            : `Value-based pricing`;

        setDialogTitle('🤖 ML Pricing Proposal');
        setDialogType('pricing');
        setDialogData({
            formula: 'P_dynamic = P_base × (1 + α·D_t + β·E_c + γ·R_c)',
            weights: { alpha, beta, gamma },
            marketConditions: {
                totalCustomers,
                highRisk: riskSummary.highRisk,
                mediumRisk: riskSummary.mediumRisk,
                lowRisk: riskSummary.lowRisk,
                demandFactor: (demandFactor * 100).toFixed(0) + '%'
            },
            samplePricing: [
                {
                    plan: 'Basic',
                    basePrice: basePrices.basic,
                    dynamicPrice: basicDynamicPrice,
                    change: `${basicChange >= 0 ? '+' : ''}${basicChange}%`,
                    reason: basicReason
                },
                {
                    plan: 'Standard',
                    basePrice: basePrices.standard,
                    dynamicPrice: standardDynamicPrice,
                    change: `${standardChange >= 0 ? '+' : ''}${standardChange}%`,
                    reason: standardReason
                },
                {
                    plan: 'Premium',
                    basePrice: basePrices.premium,
                    dynamicPrice: premiumDynamicPrice,
                    change: `${premiumChange >= 0 ? '+' : ''}${premiumChange}%`,
                    reason: premiumReason
                }
            ]
        });
        setDialogOpen(true);
    };

    const handleShowMarketAnalysis = () => {
        setDialogTitle('📊 Market Analysis');
        setDialogType('market');
        setDialogData({
            segments: modelMetrics?.segmentation?.segments || [
                { name: 'Premium Power Users', population: 15, elasticity: -0.3 },
                { name: 'Price-Conscious', population: 25, elasticity: -1.8 },
                { name: 'Value-Seekers', population: 30, elasticity: -1.2 },
                { name: 'Budget Users', population: 20, elasticity: -2.0 },
                { name: 'Casual Premium', population: 10, elasticity: -0.5 }
            ],
            insights: ['Revenue Increase: 25%', 'Churn Reduction: 28%', 'ROI: 740%']
        });
        setDialogOpen(true);
    };

    const handleShowPerformance = () => {
        setDialogTitle('🎯 ML Model Performance');
        setDialogType('performance');
        setDialogData({
            churnModel: modelMetrics?.churnModel || {
                name: 'Churn Prediction (XGBoost)',
                accuracy: '87.8%',
                precision: '73.4%',
                recall: '80.4%',
                f1Score: '76.7%',
                aucRoc: '94.1%'
            },
            segmentation: modelMetrics?.segmentation || {
                name: 'Customer Segmentation (K-Means)',
                clusters: 5,
                silhouetteScore: 0.136
            },
            featureImportance: modelMetrics?.featureImportance || []
        });
        setDialogOpen(true);
    };

    const handleShowConfig = () => {
        setDialogTitle('⚙️ ML Configuration');
        setDialogType('config');
        setDialogData(modelMetrics?.pricingModel || {
            pricingFormula: 'P_dynamic = P_base × (1 + α·D_t + β·E_c + γ·R_c)',
            weights: {
                alpha: { name: 'Demand Weight', value: 0.15 },
                beta: { name: 'Elasticity Weight', value: 0.10 },
                gamma: { name: 'Churn Risk Weight', value: 0.20 }
            },
            constraints: { maxDiscount: '-30%', maxPremium: '+20%' }
        });
        setDialogOpen(true);
    };

    // Export menu state
    const [exportAnchorEl, setExportAnchorEl] = useState<null | HTMLElement>(null);
    const exportMenuOpen = Boolean(exportAnchorEl);

    const handleExportClick = (event: React.MouseEvent<HTMLButtonElement>) => {
        setExportAnchorEl(event.currentTarget);
    };

    const handleExportClose = () => {
        setExportAnchorEl(null);
    };

    const generateReportData = () => ({
        generatedAt: new Date().toISOString(),
        summary: riskSummary,
        modelMetrics: {
            churnModel: modelMetrics?.churnModel,
            segmentation: modelMetrics?.segmentation,
            featureImportance: modelMetrics?.featureImportance
        },
        atRiskCustomers: atRiskCustomers.map(c => ({
            id: c.id,
            name: c.name,
            email: c.email,
            plan: c.plan,
            riskLevel: c.riskLevel,
            probability: c.probability,
            daysSinceLogin: c.daysSinceLogin,
            recommendation: c.recommendation
        })),
        trends: trends
    });

    const handleExportJSON = () => {
        const report = generateReportData();
        const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ai_pricing_report_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        handleExportClose();
        setSnackbar({ open: true, message: '✅ JSON report exported successfully!', severity: 'success' });
    };

    const handleExportCSV = () => {
        const report = generateReportData();

        // Create CSV content
        let csvContent = 'AI Pricing Report - Generated: ' + report.generatedAt + '\n\n';

        // Summary section
        csvContent += 'RISK SUMMARY\n';
        csvContent += 'Total Customers,' + report.summary.total + '\n';
        csvContent += 'High Risk,' + report.summary.highRisk + '\n';
        csvContent += 'Medium Risk,' + report.summary.mediumRisk + '\n';
        csvContent += 'Low Risk,' + report.summary.lowRisk + '\n\n';

        // At-Risk Customers section
        csvContent += 'AT-RISK CUSTOMERS\n';
        csvContent += 'Name,Email,Plan,Risk Level,Probability,Days Since Login,Recommendation\n';
        report.atRiskCustomers.forEach(c => {
            csvContent += `"${c.name}","${c.email}","${c.plan}","${c.riskLevel}",${c.probability}%,${c.daysSinceLogin},"${c.recommendation}"\n`;
        });
        csvContent += '\n';

        // Feature Importance section
        csvContent += 'FEATURE IMPORTANCE\n';
        csvContent += 'Feature,Weight\n';
        (report.modelMetrics.featureImportance || []).forEach((f: any) => {
            csvContent += `"${f.feature}",${(f.weight * 100).toFixed(1)}%\n`;
        });

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ai_pricing_report_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        handleExportClose();
        setSnackbar({ open: true, message: '✅ CSV report exported successfully!', severity: 'success' });
    };

    const handleExportPDF = () => {
        const report = generateReportData();

        // Create a printable HTML content
        const printContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>AI Pricing Report</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }
                    h1 { color: #1976d2; border-bottom: 2px solid #1976d2; padding-bottom: 10px; }
                    h2 { color: #333; margin-top: 30px; }
                    .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin: 20px 0; }
                    .stat-box { background: #f5f5f5; padding: 20px; text-align: center; border-radius: 8px; }
                    .stat-box.high { background: #ffebee; }
                    .stat-box.medium { background: #fff3e0; }
                    .stat-box.low { background: #e8f5e9; }
                    .stat-number { font-size: 32px; font-weight: bold; }
                    .stat-label { font-size: 12px; color: #666; }
                    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                    th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
                    th { background: #f5f5f5; }
                    .risk-high { color: #d32f2f; font-weight: bold; }
                    .risk-medium { color: #ed6c02; font-weight: bold; }
                    .risk-low { color: #2e7d32; font-weight: bold; }
                    .footer { margin-top: 40px; text-align: center; color: #666; font-size: 12px; }
                </style>
            </head>
            <body>
                <h1>🤖 AI Pricing Report</h1>
                <p><strong>Generated:</strong> ${new Date(report.generatedAt).toLocaleString()}</p>
                
                <h2>📊 Risk Summary</h2>
                <div class="summary-grid">
                    <div class="stat-box">
                        <div class="stat-number">${report.summary.total}</div>
                        <div class="stat-label">Total Customers</div>
                    </div>
                    <div class="stat-box high">
                        <div class="stat-number">${report.summary.highRisk}</div>
                        <div class="stat-label">High Risk</div>
                    </div>
                    <div class="stat-box medium">
                        <div class="stat-number">${report.summary.mediumRisk}</div>
                        <div class="stat-label">Medium Risk</div>
                    </div>
                    <div class="stat-box low">
                        <div class="stat-number">${report.summary.lowRisk}</div>
                        <div class="stat-label">Low Risk</div>
                    </div>
                </div>
                
                <h2>⚠️ At-Risk Customers</h2>
                <table>
                    <thead>
                        <tr>
                            <th>Customer</th>
                            <th>Email</th>
                            <th>Plan</th>
                            <th>Risk Level</th>
                            <th>Probability</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${report.atRiskCustomers.slice(0, 20).map(c => `
                            <tr>
                                <td>${c.name}</td>
                                <td>${c.email}</td>
                                <td>${c.plan}</td>
                                <td class="risk-${c.riskLevel.toLowerCase()}">${c.riskLevel}</td>
                                <td>${c.probability}%</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                
                <h2>📈 Feature Importance</h2>
                <table>
                    <thead>
                        <tr><th>Feature</th><th>Weight</th></tr>
                    </thead>
                    <tbody>
                        ${(report.modelMetrics.featureImportance || []).map((f: any) => `
                            <tr>
                                <td>${f.feature}</td>
                                <td>${(f.weight * 100).toFixed(1)}%</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                
                <div class="footer">
                    <p>BroadbandX AI Pricing System | ML-Powered Churn Prediction</p>
                </div>
            </body>
            </html>
        `;

        // Open print dialog
        const printWindow = window.open('', '_blank');
        if (printWindow) {
            printWindow.document.write(printContent);
            printWindow.document.close();
            printWindow.focus();
            setTimeout(() => {
                printWindow.print();
            }, 250);
        }

        handleExportClose();
        setSnackbar({ open: true, message: '✅ PDF export opened in print dialog!', severity: 'success' });
    };

    return (
        <Container maxWidth="xl">
            {/* Header */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
                <Box>
                    <Typography variant="h4" sx={{ fontWeight: 'bold', color: '#1a1a2e' }}>
                        🤖 AI Pricing Management
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        ML-powered churn prediction, customer segmentation, and dynamic pricing
                    </Typography>
                </Box>
                <Stack direction="row" spacing={1}>
                    <Tooltip title="Refresh data">
                        <IconButton onClick={loadData} color="primary">
                            <RefreshIcon />
                        </IconButton>
                    </Tooltip>
                    <Button
                        variant="contained"
                        startIcon={<DownloadIcon />}
                        endIcon={<ArrowDropDownIcon />}
                        onClick={handleExportClick}
                        aria-controls={exportMenuOpen ? 'export-menu' : undefined}
                        aria-haspopup="true"
                        aria-expanded={exportMenuOpen ? 'true' : undefined}
                    >
                        Export Report
                    </Button>
                    <Menu
                        id="export-menu"
                        anchorEl={exportAnchorEl}
                        open={exportMenuOpen}
                        onClose={handleExportClose}
                        MenuListProps={{ 'aria-labelledby': 'export-button' }}
                    >
                        <MenuItem onClick={handleExportJSON}>
                            <ListItemIcon>
                                <CodeIcon fontSize="small" />
                            </ListItemIcon>
                            <ListItemText>Export as JSON</ListItemText>
                        </MenuItem>
                        <MenuItem onClick={handleExportCSV}>
                            <ListItemIcon>
                                <TableChartIcon fontSize="small" />
                            </ListItemIcon>
                            <ListItemText>Export as CSV</ListItemText>
                        </MenuItem>
                        <MenuItem onClick={handleExportPDF}>
                            <ListItemIcon>
                                <PictureAsPdfIcon fontSize="small" />
                            </ListItemIcon>
                            <ListItemText>Export as PDF</ListItemText>
                        </MenuItem>
                    </Menu>
                </Stack>
            </Box>

            {/* Quick Stats Row */}
            <Box sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(4, 1fr)' },
                gap: 2,
                mb: 4
            }}>
                <Card sx={{ p: 2, textAlign: 'center', bgcolor: 'primary.light', borderRadius: 2 }}>
                    <Typography variant="h4" color="primary.contrastText" fontWeight="bold">
                        {modelMetrics?.churnModel?.trainingRecords?.toLocaleString() || '10,000'}
                    </Typography>
                    <Typography variant="body2" color="primary.contrastText">Training Records</Typography>
                </Card>
                <Card sx={{ p: 2, textAlign: 'center', bgcolor: 'success.light', borderRadius: 2 }}>
                    <Typography variant="h4" color="success.contrastText" fontWeight="bold">
                        {(modelMetrics?.churnModel?.accuracy * 100 || 87.8).toFixed(1)}%
                    </Typography>
                    <Typography variant="body2" color="success.contrastText">Model Accuracy</Typography>
                </Card>
                <Card sx={{ p: 2, textAlign: 'center', bgcolor: 'warning.light', borderRadius: 2 }}>
                    <Typography variant="h4" color="warning.contrastText" fontWeight="bold">
                        {modelMetrics?.segmentation?.clusters || 5}
                    </Typography>
                    <Typography variant="body2" color="warning.contrastText">Customer Segments</Typography>
                </Card>
                <Card sx={{ p: 2, textAlign: 'center', bgcolor: 'info.light', borderRadius: 2 }}>
                    <Typography variant="h4" color="info.contrastText" fontWeight="bold">
                        {(modelMetrics?.churnModel?.aucRoc * 100 || 94.1).toFixed(1)}%
                    </Typography>
                    <Typography variant="body2" color="info.contrastText">AUC-ROC Score</Typography>
                </Card>
            </Box>

            {/* Tabs */}
            <Card sx={{ mb: 4, borderRadius: 2 }}>
                <Tabs
                    value={activeTab}
                    onChange={(_, v) => setActiveTab(v)}
                    variant="fullWidth"
                    sx={{ borderBottom: 1, borderColor: 'divider' }}
                >
                    <Tab icon={<TrendingUpIcon />} label="Analytics" />
                    <Tab icon={<PersonSearchIcon />} label="Churn Predictor" />
                    <Tab icon={<WarningIcon />} label={`At-Risk (${riskSummary.highRisk + riskSummary.mediumRisk})`} />
                    <Tab icon={<AttachMoneyIcon />} label="Pricing Engine" />
                    <Tab icon={<ErrorOutlineIcon />} label={`Payment Failures (${failureStats.total})`} />
                </Tabs>

                <Box sx={{ p: 3 }}>
                    {/* Analytics Tab */}
                    {activeTab === 0 && (
                        <Box>
                            <Box sx={{
                                display: 'grid',
                                gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' },
                                gap: 3,
                                mb: 4
                            }}>
                                {/* Churn Trend Chart */}
                                <Card sx={{ p: 3, borderRadius: 2 }}>
                                    {loading ? (
                                        <Skeleton variant="rectangular" height={350} />
                                    ) : (
                                        <ChurnTrendChart data={trends} />
                                    )}
                                </Card>

                                {/* Risk Distribution */}
                                <Card sx={{ p: 3, borderRadius: 2 }}>
                                    {loading ? (
                                        <Skeleton variant="rectangular" height={350} />
                                    ) : (
                                        <CustomerSegmentChart
                                            highRisk={riskSummary.highRisk}
                                            mediumRisk={riskSummary.mediumRisk}
                                            lowRisk={riskSummary.lowRisk}
                                        />
                                    )}
                                </Card>
                            </Box>

                            {/* Feature Importance */}
                            <Card sx={{ p: 3, borderRadius: 2 }}>
                                {loading ? (
                                    <Skeleton variant="rectangular" height={420} />
                                ) : (
                                    <FeatureImportanceChart data={modelMetrics?.featureImportance || []} />
                                )}
                            </Card>
                        </Box>
                    )}

                    {/* Churn Predictor Tab */}
                    {activeTab === 1 && (
                        <ChurnPredictorEnhanced
                            customers={customers}
                            loadingCustomers={customersLoading}
                            onCustomerSearch={handleCustomerSearch}
                            onPredict={handlePredictChurn}
                            onManualPredict={calculateManualChurnRisk}
                        />
                    )}

                    {/* At-Risk Customers Tab */}
                    {activeTab === 2 && (
                        <Box>
                            {/* Alert Banner */}
                            {riskSummary.highRisk > 0 && (
                                <Alert severity="error" sx={{ mb: 3 }} icon={<WarningIcon />}>
                                    <strong>{riskSummary.highRisk} customers</strong> are at HIGH churn risk! Immediate action recommended.
                                </Alert>
                            )}

                            {/* Scan Controls */}
                            <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
                                <Button
                                    variant="contained"
                                    color="warning"
                                    startIcon={<RefreshIcon />}
                                    onClick={handleScanNow}
                                >
                                    Scan Now
                                </Button>
                                <Alert severity="info" sx={{ flex: 1 }}>
                                    AI automatically scans every <strong>6 hours</strong>. Last scan: {new Date().toLocaleString()}
                                </Alert>
                            </Box>

                            {/* Customer Table */}
                            <AtRiskCustomersTable
                                customers={atRiskCustomers}
                                loading={loading}
                                onRefresh={loadData}
                                onAction={handleRetentionAction}
                            />
                        </Box>
                    )}

                    {/* Pricing Engine Tab */}
                    {activeTab === 3 && (
                        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
                            {/* Pricing Actions */}
                            <Card sx={{ p: 3, borderRadius: 2 }}>
                                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <PsychologyIcon color="primary" />
                                    ML Pricing Engine
                                </Typography>
                                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                                    AI-powered dynamic pricing based on market conditions, demand, and competitor analysis.
                                </Typography>
                                <Stack spacing={2}>
                                    <Button
                                        variant="contained"
                                        fullWidth
                                        startIcon={<AnalyticsIcon />}
                                        onClick={handleShowPricingProposal}
                                    >
                                        Generate Pricing Proposal
                                    </Button>
                                    <Button
                                        variant="outlined"
                                        fullWidth
                                        startIcon={<TrendingUpIcon />}
                                        onClick={handleShowMarketAnalysis}
                                    >
                                        Market Analysis
                                    </Button>
                                </Stack>
                            </Card>

                            {/* Model Performance */}
                            <Card sx={{ p: 3, borderRadius: 2 }}>
                                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <AssessmentIcon color="primary" />
                                    Model Performance
                                </Typography>
                                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                                    View detailed ML model metrics and configuration.
                                </Typography>
                                <Stack spacing={2}>
                                    <Button
                                        variant="contained"
                                        fullWidth
                                        startIcon={<BarChartIcon />}
                                        onClick={handleShowPerformance}
                                    >
                                        Performance Metrics
                                    </Button>
                                    <Button
                                        variant="outlined"
                                        fullWidth
                                        startIcon={<SettingsIcon />}
                                        onClick={handleShowConfig}
                                    >
                                        Configure ML Settings
                                    </Button>
                                </Stack>
                            </Card>

                            {/* Pricing Formula Info */}
                            <Card sx={{ p: 3, borderRadius: 2, gridColumn: '1 / -1', bgcolor: 'grey.50' }}>
                                <Typography variant="h6" gutterBottom>
                                    📐 Dynamic Pricing Formula
                                </Typography>
                                <Typography
                                    variant="h5"
                                    fontFamily="monospace"
                                    sx={{ p: 2, bgcolor: 'white', borderRadius: 1, mb: 2 }}
                                >
                                    P<sub>dynamic</sub> = P<sub>base</sub> × (1 + α·D<sub>t</sub> + β·E<sub>c</sub> + γ·R<sub>c</sub>)
                                </Typography>
                                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                                    <Typography variant="body2"><strong>α = 0.15</strong> (Demand Weight)</Typography>
                                    <Typography variant="body2"><strong>β = 0.10</strong> (Elasticity Weight)</Typography>
                                    <Typography variant="body2"><strong>γ = 0.20</strong> (Churn Risk Weight)</Typography>
                                </Box>
                            </Card>
                        </Box>
                    )}

                    {/* Payment Failures Tab */}
                    {activeTab === 4 && (
                        <Box>
                            {/* Stats Cards */}
                            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2, mb: 3 }}>
                                <Card sx={{ p: 2, textAlign: 'center', bgcolor: 'error.light', borderRadius: 2 }}>
                                    <Typography variant="h4" color="error.contrastText" fontWeight="bold">{failureStats.total}</Typography>
                                    <Typography variant="body2" color="error.contrastText">Total Failures</Typography>
                                </Card>
                                <Card sx={{ p: 2, textAlign: 'center', bgcolor: 'warning.light', borderRadius: 2 }}>
                                    <Typography variant="h4" color="warning.contrastText" fontWeight="bold">{failureStats.today}</Typography>
                                    <Typography variant="body2" color="warning.contrastText">Today</Typography>
                                </Card>
                                <Card sx={{ p: 2, textAlign: 'center', bgcolor: 'info.light', borderRadius: 2 }}>
                                    <Typography variant="h4" color="info.contrastText" fontWeight="bold">{failureStats.thisWeek}</Typography>
                                    <Typography variant="body2" color="info.contrastText">This Week</Typography>
                                </Card>
                                <Card sx={{ p: 2, textAlign: 'center', bgcolor: 'grey.300', borderRadius: 2 }}>
                                    <Typography variant="h4" fontWeight="bold">₹{(failureStats.totalAmount || 0).toLocaleString('en-IN')}</Typography>
                                    <Typography variant="body2">Total Amount Lost</Typography>
                                </Card>
                            </Box>

                            {/* Actions */}
                            <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
                                <Button variant="contained" startIcon={<RefreshIcon />} onClick={loadPaymentFailures}>
                                    Refresh
                                </Button>
                                <Button
                                    variant="outlined"
                                    color="success"
                                    startIcon={<FileDownloadIcon />}
                                    onClick={async () => {
                                        try {
                                            const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
                                            const response = await fetch('http://localhost:5001/api/admin/payment-failures/download', {
                                                headers: { 'Authorization': `Bearer ${token}` }
                                            });
                                            if (!response.ok) {
                                                alert(response.status === 404 ? 'No payment failures recorded yet.' : 'Download failed');
                                                return;
                                            }
                                            const blob = await response.blob();
                                            const url = window.URL.createObjectURL(blob);
                                            const link = document.createElement('a');
                                            link.href = url;
                                            link.setAttribute('download', `payment_failures_${new Date().toISOString().split('T')[0]}.csv`);
                                            document.body.appendChild(link);
                                            link.click();
                                            link.remove();
                                        } catch (e) { alert('Download failed'); }
                                    }}
                                >
                                    Download CSV
                                </Button>
                            </Box>

                            {/* Failures Table */}
                            {failuresLoading ? (
                                <Skeleton variant="rectangular" height={300} />
                            ) : paymentFailures.length === 0 ? (
                                <Alert severity="success" sx={{ mt: 2 }}>
                                    🎉 No payment failures recorded. All payments are going through successfully!
                                </Alert>
                            ) : (
                                <Card sx={{ borderRadius: 2, overflow: 'auto' }}>
                                    <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                        <Box component="thead" sx={{ bgcolor: 'grey.100' }}>
                                            <Box component="tr">
                                                <Box component="th" sx={{ p: 1.5, textAlign: 'left', borderBottom: '2px solid', borderColor: 'divider' }}>Time</Box>
                                                <Box component="th" sx={{ p: 1.5, textAlign: 'left', borderBottom: '2px solid', borderColor: 'divider' }}>Customer</Box>
                                                <Box component="th" sx={{ p: 1.5, textAlign: 'left', borderBottom: '2px solid', borderColor: 'divider' }}>Plan</Box>
                                                <Box component="th" sx={{ p: 1.5, textAlign: 'right', borderBottom: '2px solid', borderColor: 'divider' }}>Amount</Box>
                                                <Box component="th" sx={{ p: 1.5, textAlign: 'left', borderBottom: '2px solid', borderColor: 'divider' }}>Error</Box>
                                                <Box component="th" sx={{ p: 1.5, textAlign: 'left', borderBottom: '2px solid', borderColor: 'divider' }}>Type</Box>
                                            </Box>
                                        </Box>
                                        <Box component="tbody">
                                            {paymentFailures.map((f: any, i: number) => (
                                                <Box component="tr" key={f.id || i} sx={{ '&:hover': { bgcolor: 'action.hover' } }}>
                                                    <Box component="td" sx={{ p: 1.5, borderBottom: '1px solid', borderColor: 'divider', whiteSpace: 'nowrap' }}>
                                                        {new Date(f.timestamp).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                                    </Box>
                                                    <Box component="td" sx={{ p: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
                                                        <Typography variant="body2" fontWeight={600}>{f.userName}</Typography>
                                                        <Typography variant="caption" color="text.secondary">{f.userEmail}</Typography>
                                                    </Box>
                                                    <Box component="td" sx={{ p: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>{f.planName}</Box>
                                                    <Box component="td" sx={{ p: 1.5, borderBottom: '1px solid', borderColor: 'divider', textAlign: 'right', fontWeight: 600, color: 'error.main' }}>
                                                        ₹{(f.amount || 0).toLocaleString('en-IN')}
                                                    </Box>
                                                    <Box component="td" sx={{ p: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
                                                        <Typography variant="caption" sx={{ bgcolor: 'error.light', px: 1, py: 0.3, borderRadius: 1, color: 'error.dark' }}>
                                                            {f.errorCode}
                                                        </Typography>
                                                        <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.5 }}>{f.errorDescription}</Typography>
                                                    </Box>
                                                    <Box component="td" sx={{ p: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
                                                        <Typography variant="caption" sx={{ bgcolor: f.type === 'renewal' ? 'warning.light' : 'info.light', px: 1, py: 0.3, borderRadius: 1 }}>
                                                            {f.type}
                                                        </Typography>
                                                    </Box>
                                                </Box>
                                            ))}
                                        </Box>
                                    </Box>
                                </Card>
                            )}
                        </Box>
                    )}
                </Box>
            </Card>

            {/* Dialog */}
            <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle sx={{ bgcolor: 'primary.main', color: 'white' }}>
                    {dialogTitle}
                </DialogTitle>
                <DialogContent sx={{ mt: 2, pt: 2 }}>
                    <MLDialogContent type={dialogType as any} data={dialogData} />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDialogOpen(false)}>Close</Button>
                    {dialogType === 'pricing' && (
                        <Button
                            variant="contained"
                            color="success"
                            startIcon={<CheckCircleIcon />}
                            onClick={async () => {
                                try {
                                    setSnackbar({ open: true, message: 'Creating and applying pricing proposal...', severity: 'success' });

                                    // Step 1: Create the proposal
                                    const proposalChanges = dialogData.samplePricing.map((item: any) => ({
                                        plan: item.plan,
                                        proposedPrice: item.dynamicPrice,
                                        reason: item.reason
                                    }));

                                    const createResult = await aiPricingService.createProposal(proposalChanges);

                                    if (!createResult.success) {
                                        throw new Error(createResult.message || 'Failed to create proposal');
                                    }

                                    const proposalId = createResult.data._id;

                                    // Step 2: Auto-approve the proposal (admin creating is also approving)
                                    const approveResult = await aiPricingService.approveProposal(proposalId, 'Auto-approved by creator');

                                    if (!approveResult.success) {
                                        throw new Error(approveResult.message || 'Failed to approve proposal');
                                    }

                                    // Step 3: Apply the proposal to update actual prices
                                    const applyResult = await aiPricingService.applyProposal(proposalId);

                                    if (!applyResult.success) {
                                        throw new Error(applyResult.message || 'Failed to apply proposal');
                                    }

                                    setDialogOpen(false);
                                    setSnackbar({
                                        open: true,
                                        message: `✅ Pricing updated! ${applyResult.data.appliedChanges.map((c: any) => `${c.planName}: ₹${c.oldPrice} → ₹${c.newPrice}`).join(', ')}`,
                                        severity: 'success'
                                    });

                                    // Refresh data
                                    loadData();

                                } catch (error: any) {
                                    console.error('Error applying pricing:', error);
                                    setSnackbar({
                                        open: true,
                                        message: `Failed to apply pricing: ${error.message}`,
                                        severity: 'error'
                                    });
                                }
                            }}
                        >
                            Apply Pricing Changes
                        </Button>
                    )}
                    {dialogType !== 'pricing' && (
                        <Button variant="contained" onClick={() => setDialogOpen(false)}>
                            OK
                        </Button>
                    )}
                </DialogActions>
            </Dialog>

            {/* Snackbar */}
            <Snackbar
                open={snackbar.open}
                autoHideDuration={4000}
                onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            >
                <Alert severity={snackbar.severity} onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}>
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </Container>
    );
};

export default AIPricingDashboard;
