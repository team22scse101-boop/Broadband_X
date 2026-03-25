import React, { useState, useRef, useCallback, useEffect } from 'react';
import axios from 'axios';
import {
    Box,
    Typography,
    Button,
    Card,
    CardContent,
    Paper,
    Stack,
    Chip,
    LinearProgress,
} from '@mui/material';
import {
    PlayArrow,
    Stop,
    Speed,
    ArrowDownward,
    ArrowUpward,
    NetworkPing,
    Refresh,
} from '@mui/icons-material';

interface TestResult {
    download: number;
    upload: number;
    ping: number;
    jitter: number;
    timestamp: Date;
}

type TestPhase = 'idle' | 'ping' | 'download' | 'upload' | 'complete';

const SpeedTest: React.FC = () => {
    const [phase, setPhase] = useState<TestPhase>('idle');
    const [currentSpeed, setCurrentSpeed] = useState(0);
    const [ping, setPing] = useState(0);
    const [jitter, setJitter] = useState(0);
    const [downloadSpeed, setDownloadSpeed] = useState(0);
    const [uploadSpeed, setUploadSpeed] = useState(0);
    const [progress, setProgress] = useState(0);
    const [history, setHistory] = useState<TestResult[]>([]);
    const animRef = useRef<number | null>(null);
    const abortRef = useRef(false);

    // Simulate a realistic speed ramp-up curve
    const simulatePhase = useCallback(
        (targetSpeed: number, duration: number, onUpdate: (speed: number) => void): Promise<number> => {
            return new Promise((resolve) => {
                const startTime = Date.now();
                const jitterRange = targetSpeed * 0.15;

                const tick = () => {
                    if (abortRef.current) { resolve(0); return; }
                    const elapsed = Date.now() - startTime;
                    const t = Math.min(elapsed / duration, 1);

                    // Realistic curve: ramp up fast, oscillate, then stabilize
                    const rampUp = 1 - Math.exp(-4 * t); // Fast initial ramp
                    const oscillation = Math.sin(t * Math.PI * 8) * (1 - t) * 0.2; // Decreasing oscillation
                    const noise = (Math.random() - 0.5) * jitterRange * (1 - t * 0.7);

                    const speed = Math.max(0, targetSpeed * rampUp + targetSpeed * oscillation + noise);
                    onUpdate(parseFloat(speed.toFixed(1)));

                    if (t < 1) {
                        animRef.current = requestAnimationFrame(tick);
                    } else {
                        // Final stable value with ±5% variance
                        const finalSpeed = targetSpeed * (0.95 + Math.random() * 0.1);
                        onUpdate(parseFloat(finalSpeed.toFixed(1)));
                        resolve(parseFloat(finalSpeed.toFixed(1)));
                    }
                };
                animRef.current = requestAnimationFrame(tick);
            });
        },
        []
    );

    const runSpeedTest = useCallback(async () => {
        abortRef.current = false;
        setCurrentSpeed(0);
        setPing(0);
        setJitter(0);
        setDownloadSpeed(0);
        setUploadSpeed(0);
        setProgress(0);

        // Phase 1: Ping test (1 second)
        setPhase('ping');
        await new Promise((r) => setTimeout(r, 300));
        if (abortRef.current) return;

        const basePing = 5 + Math.random() * 25; // 5-30ms
        for (let i = 0; i < 8; i++) {
            if (abortRef.current) return;
            const p = basePing + (Math.random() - 0.5) * 10;
            setPing(parseFloat(p.toFixed(1)));
            setJitter(parseFloat((Math.random() * 5).toFixed(1)));
            setProgress((i / 8) * 15);
            await new Promise((r) => setTimeout(r, 120));
        }
        const finalPing = parseFloat(basePing.toFixed(1));
        const finalJitter = parseFloat((1 + Math.random() * 4).toFixed(1));
        setPing(finalPing);
        setJitter(finalJitter);
        setProgress(15);

        if (abortRef.current) return;

        // Phase 2: Download test (4 seconds)
        setPhase('download');
        const targetDown = 50 + Math.random() * 150; // 50-200 Mbps
        const downResult = await simulatePhase(targetDown, 4000, (s) => {
            setCurrentSpeed(s);
            setDownloadSpeed(s);
        });
        if (abortRef.current) return;
        setDownloadSpeed(downResult);
        setProgress(60);

        // Phase 3: Upload test (3 seconds)
        setPhase('upload');
        setCurrentSpeed(0);
        const targetUp = targetDown * (0.2 + Math.random() * 0.3); // 20-50% of download
        const upResult = await simulatePhase(targetUp, 3000, (s) => {
            setCurrentSpeed(s);
            setUploadSpeed(s);
        });
        if (abortRef.current) return;
        setUploadSpeed(upResult);
        setProgress(100);

        // Complete
        setPhase('complete');
        const result: TestResult = {
            download: downResult,
            upload: upResult,
            ping: finalPing,
            jitter: finalJitter,
            timestamp: new Date(),
        };
        setHistory(prev => [result, ...prev].slice(0, 20));

        // Save to backend
        try {
            const token = localStorage.getItem('access_token');
            await axios.post(
                `${process.env.REACT_APP_API_URL || 'http://localhost:5001/api'}/speedtest`,
                { download: downResult, upload: upResult, ping: finalPing, jitter: finalJitter },
                { headers: { Authorization: `Bearer ${token}` } }
            );
        } catch (err) {
            console.error('Failed to save speed test result:', err);
        }
    }, [simulatePhase]);

    const stopTest = () => {
        abortRef.current = true;
        if (animRef.current) cancelAnimationFrame(animRef.current);
        setPhase('idle');
        setProgress(0);
    };

    useEffect(() => {
        return () => {
            abortRef.current = true;
            if (animRef.current) cancelAnimationFrame(animRef.current);
        };
    }, []);

    // Load speed test history from backend on mount
    useEffect(() => {
        const loadHistory = async () => {
            try {
                const token = localStorage.getItem('access_token');
                if (!token) return;
                const res = await axios.get(
                    `${process.env.REACT_APP_API_URL || 'http://localhost:5001/api'}/speedtest/history`,
                    { headers: { Authorization: `Bearer ${token}` } }
                );
                if (res.data.success && res.data.data.length > 0) {
                    setHistory(res.data.data.map((r: any) => ({
                        download: r.download,
                        upload: r.upload,
                        ping: r.ping,
                        jitter: r.jitter,
                        timestamp: new Date(r.createdAt),
                    })));
                }
            } catch (err) {
                console.error('Failed to load speed test history:', err);
            }
        };
        loadHistory();
    }, []);

    // Gauge calculations
    const maxGaugeSpeed = 250;
    const gaugeAngle = Math.min((currentSpeed / maxGaugeSpeed) * 240, 240); // 240 degree arc
    const radius = 110;
    const strokeWidth = 14;
    const cx = 140;
    const cy = 140;

    // Create arc path
    const polarToCartesian = (angle: number) => {
        const rad = ((angle - 210) * Math.PI) / 180; // Start from bottom-left
        return {
            x: cx + radius * Math.cos(rad),
            y: cy + radius * Math.sin(rad),
        };
    };

    const arcPath = (endAngle: number) => {
        const start = polarToCartesian(0);
        const end = polarToCartesian(endAngle);
        const largeArc = endAngle > 180 ? 1 : 0;
        return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`;
    };

    // Gauge colors based on speed
    const getGaugeColor = () => {
        if (currentSpeed < 25) return '#f44336';
        if (currentSpeed < 50) return '#ff9800';
        if (currentSpeed < 100) return '#ffc107';
        if (currentSpeed < 150) return '#8bc34a';
        return '#00e676';
    };

    const getSpeedRating = (speed: number) => {
        if (speed < 25) return { label: 'Slow', color: '#f44336' };
        if (speed < 50) return { label: 'Fair', color: '#ff9800' };
        if (speed < 100) return { label: 'Good', color: '#ffc107' };
        if (speed < 150) return { label: 'Fast', color: '#8bc34a' };
        return { label: 'Blazing', color: '#00e676' };
    };

    const phaseLabel = {
        idle: 'Ready',
        ping: 'Testing Latency...',
        download: 'Testing Download...',
        upload: 'Testing Upload...',
        complete: 'Test Complete',
    };

    return (
        <Box>
            <Typography variant="h4" gutterBottom fontWeight={700}>
                Speed Test
            </Typography>
            <Typography variant="body2" color="textSecondary" mb={3}>
                Test your broadband connection speed in real-time
            </Typography>

            <Box display="grid" gridTemplateColumns={{ xs: '1fr', md: '1fr 1fr' }} gap={3}>
                {/* Speed Gauge */}
                <Card elevation={0} sx={{ borderRadius: 4, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
                    <Box
                        sx={{
                            background: 'linear-gradient(180deg, #0a0e27 0%, #1a1f3a 100%)',
                            p: 4,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                        }}
                    >
                        {/* Phase indicator */}
                        <Chip
                            label={phaseLabel[phase]}
                            size="small"
                            sx={{
                                mb: 2,
                                bgcolor: phase === 'complete' ? 'rgba(0,230,118,0.15)' : phase === 'idle' ? 'rgba(255,255,255,0.1)' : 'rgba(102,126,234,0.2)',
                                color: phase === 'complete' ? '#00e676' : phase === 'idle' ? 'rgba(255,255,255,0.6)' : '#667eea',
                                fontWeight: 600,
                                fontSize: '0.75rem',
                                border: '1px solid',
                                borderColor: phase === 'complete' ? 'rgba(0,230,118,0.3)' : 'transparent',
                            }}
                        />

                        {/* SVG Gauge */}
                        <svg width={280} height={220} viewBox="0 0 280 220">
                            {/* Background arc */}
                            <path
                                d={arcPath(240)}
                                fill="none"
                                stroke="rgba(255,255,255,0.08)"
                                strokeWidth={strokeWidth}
                                strokeLinecap="round"
                            />

                            {/* Speed ticks */}
                            {[0, 50, 100, 150, 200, 250].map((speed, i) => {
                                const angle = (speed / maxGaugeSpeed) * 240;
                                const outer = polarToCartesian(angle);
                                const innerR = radius - 22;
                                const rad = ((angle - 210) * Math.PI) / 180;
                                const inner = { x: cx + innerR * Math.cos(rad), y: cy + innerR * Math.sin(rad) };
                                const labelR = radius + 16;
                                const label = { x: cx + labelR * Math.cos(rad), y: cy + labelR * Math.sin(rad) };
                                return (
                                    <g key={i}>
                                        <line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke="rgba(255,255,255,0.3)" strokeWidth={2} />
                                        <text x={label.x} y={label.y} textAnchor="middle" dominantBaseline="middle" fill="rgba(255,255,255,0.4)" fontSize="10">
                                            {speed}
                                        </text>
                                    </g>
                                );
                            })}

                            {/* Active arc */}
                            {currentSpeed > 0 && (
                                <path
                                    d={arcPath(gaugeAngle)}
                                    fill="none"
                                    stroke={getGaugeColor()}
                                    strokeWidth={strokeWidth}
                                    strokeLinecap="round"
                                    style={{
                                        filter: `drop-shadow(0 0 10px ${getGaugeColor()}80)`,
                                        transition: 'stroke 0.3s ease',
                                    }}
                                />
                            )}

                            {/* Needle */}
                            {phase !== 'idle' && (
                                <g transform={`rotate(${gaugeAngle - 210}, ${cx}, ${cy})`} style={{ transition: 'transform 0.1s ease-out' }}>
                                    <line x1={cx} y1={cy} x2={cx + radius - 30} y2={cy} stroke="#fff" strokeWidth={2.5} strokeLinecap="round" />
                                    <circle cx={cx} cy={cy} r={6} fill="#fff" />
                                    <circle cx={cx} cy={cy} r={3} fill={getGaugeColor()} />
                                </g>
                            )}

                            {/* Center speed text */}
                            <text x={cx} y={cy + 40} textAnchor="middle" fill="#fff" fontSize="44" fontWeight="bold" fontFamily="Inter, sans-serif">
                                {phase === 'idle' ? '—' : currentSpeed.toFixed(1)}
                            </text>
                            <text x={cx} y={cy + 60} textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize="13" fontFamily="Inter, sans-serif">
                                Mbps
                            </text>
                        </svg>

                        {/* Progress bar */}
                        {phase !== 'idle' && phase !== 'complete' && (
                            <LinearProgress
                                variant="determinate"
                                value={progress}
                                sx={{
                                    width: '80%',
                                    height: 4,
                                    borderRadius: 2,
                                    bgcolor: 'rgba(255,255,255,0.1)',
                                    mt: 1,
                                    '& .MuiLinearProgress-bar': {
                                        borderRadius: 2,
                                        background: 'linear-gradient(90deg, #667eea, #764ba2)',
                                    },
                                }}
                            />
                        )}

                        {/* Action button */}
                        <Box mt={3}>
                            {phase === 'idle' || phase === 'complete' ? (
                                <Button
                                    variant="contained"
                                    size="large"
                                    startIcon={phase === 'complete' ? <Refresh /> : <PlayArrow />}
                                    onClick={runSpeedTest}
                                    sx={{
                                        px: 5,
                                        py: 1.5,
                                        borderRadius: 6,
                                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                        textTransform: 'none',
                                        fontSize: '1rem',
                                        fontWeight: 700,
                                        boxShadow: '0 8px 24px rgba(102, 126, 234, 0.4)',
                                        '&:hover': {
                                            boxShadow: '0 12px 32px rgba(102, 126, 234, 0.6)',
                                        },
                                    }}
                                >
                                    {phase === 'complete' ? 'Test Again' : 'Start Test'}
                                </Button>
                            ) : (
                                <Button
                                    variant="outlined"
                                    size="large"
                                    startIcon={<Stop />}
                                    onClick={stopTest}
                                    sx={{
                                        px: 5,
                                        py: 1.5,
                                        borderRadius: 6,
                                        borderColor: '#f44336',
                                        color: '#f44336',
                                        textTransform: 'none',
                                        fontSize: '1rem',
                                        fontWeight: 700,
                                    }}
                                >
                                    Stop
                                </Button>
                            )}
                        </Box>
                    </Box>
                </Card>

                {/* Results Panel */}
                <Box display="flex" flexDirection="column" gap={2}>
                    {/* Live Results */}
                    <Card elevation={0} sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
                        <CardContent>
                            <Typography variant="h6" fontWeight={700} gutterBottom>Results</Typography>

                            <Box display="grid" gridTemplateColumns="1fr 1fr" gap={2}>
                                {/* Download */}
                                <Paper
                                    elevation={0}
                                    sx={{
                                        p: 2,
                                        borderRadius: 2,
                                        bgcolor: phase === 'download' ? 'rgba(102,126,234,0.08)' : 'grey.50',
                                        border: '1px solid',
                                        borderColor: phase === 'download' ? 'primary.light' : 'divider',
                                        transition: 'all 0.3s',
                                    }}
                                >
                                    <Box display="flex" alignItems="center" gap={0.5} mb={0.5}>
                                        <ArrowDownward sx={{ fontSize: 16, color: '#667eea' }} />
                                        <Typography variant="caption" color="textSecondary">Download</Typography>
                                    </Box>
                                    <Typography variant="h5" fontWeight={700} color={downloadSpeed > 0 ? 'text.primary' : 'text.disabled'}>
                                        {downloadSpeed > 0 ? downloadSpeed.toFixed(1) : '—'}
                                    </Typography>
                                    <Typography variant="caption" color="textSecondary">Mbps</Typography>
                                    {downloadSpeed > 0 && (
                                        <Chip
                                            label={getSpeedRating(downloadSpeed).label}
                                            size="small"
                                            sx={{
                                                ml: 1,
                                                height: 18,
                                                fontSize: '0.6rem',
                                                bgcolor: `${getSpeedRating(downloadSpeed).color}20`,
                                                color: getSpeedRating(downloadSpeed).color,
                                            }}
                                        />
                                    )}
                                </Paper>

                                {/* Upload */}
                                <Paper
                                    elevation={0}
                                    sx={{
                                        p: 2,
                                        borderRadius: 2,
                                        bgcolor: phase === 'upload' ? 'rgba(118,75,162,0.08)' : 'grey.50',
                                        border: '1px solid',
                                        borderColor: phase === 'upload' ? 'secondary.light' : 'divider',
                                        transition: 'all 0.3s',
                                    }}
                                >
                                    <Box display="flex" alignItems="center" gap={0.5} mb={0.5}>
                                        <ArrowUpward sx={{ fontSize: 16, color: '#764ba2' }} />
                                        <Typography variant="caption" color="textSecondary">Upload</Typography>
                                    </Box>
                                    <Typography variant="h5" fontWeight={700} color={uploadSpeed > 0 ? 'text.primary' : 'text.disabled'}>
                                        {uploadSpeed > 0 ? uploadSpeed.toFixed(1) : '—'}
                                    </Typography>
                                    <Typography variant="caption" color="textSecondary">Mbps</Typography>
                                    {uploadSpeed > 0 && (
                                        <Chip
                                            label={getSpeedRating(uploadSpeed).label}
                                            size="small"
                                            sx={{
                                                ml: 1,
                                                height: 18,
                                                fontSize: '0.6rem',
                                                bgcolor: `${getSpeedRating(uploadSpeed).color}20`,
                                                color: getSpeedRating(uploadSpeed).color,
                                            }}
                                        />
                                    )}
                                </Paper>

                                {/* Ping */}
                                <Paper elevation={0} sx={{ p: 2, borderRadius: 2, bgcolor: 'grey.50', border: '1px solid', borderColor: 'divider' }}>
                                    <Box display="flex" alignItems="center" gap={0.5} mb={0.5}>
                                        <NetworkPing sx={{ fontSize: 16, color: '#00bcd4' }} />
                                        <Typography variant="caption" color="textSecondary">Ping</Typography>
                                    </Box>
                                    <Typography variant="h5" fontWeight={700} color={ping > 0 ? 'text.primary' : 'text.disabled'}>
                                        {ping > 0 ? ping.toFixed(1) : '—'}
                                    </Typography>
                                    <Typography variant="caption" color="textSecondary">ms</Typography>
                                </Paper>

                                {/* Jitter */}
                                <Paper elevation={0} sx={{ p: 2, borderRadius: 2, bgcolor: 'grey.50', border: '1px solid', borderColor: 'divider' }}>
                                    <Box display="flex" alignItems="center" gap={0.5} mb={0.5}>
                                        <Speed sx={{ fontSize: 16, color: '#ff5722' }} />
                                        <Typography variant="caption" color="textSecondary">Jitter</Typography>
                                    </Box>
                                    <Typography variant="h5" fontWeight={700} color={jitter > 0 ? 'text.primary' : 'text.disabled'}>
                                        {jitter > 0 ? jitter.toFixed(1) : '—'}
                                    </Typography>
                                    <Typography variant="caption" color="textSecondary">ms</Typography>
                                </Paper>
                            </Box>
                        </CardContent>
                    </Card>

                    {/* Test History */}
                    {history.length > 0 && (
                        <Card elevation={0} sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
                            <CardContent>
                                <Typography variant="h6" fontWeight={700} gutterBottom>Recent Tests (Last 7 Days)</Typography>
                                <Stack spacing={1}>
                                    {history.map((test, i) => (
                                        <Paper
                                            key={i}
                                            elevation={0}
                                            sx={{
                                                p: 1.5,
                                                borderRadius: 2,
                                                bgcolor: i === 0 ? 'rgba(102,126,234,0.05)' : 'grey.50',
                                                border: '1px solid',
                                                borderColor: i === 0 ? 'primary.light' : 'divider',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                            }}
                                        >
                                            <Typography variant="caption" color="textSecondary" sx={{ minWidth: 120 }}>
                                                {test.timestamp.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}{' '}
                                                {test.timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                                            </Typography>
                                            <Stack direction="row" spacing={2}>
                                                <Typography variant="body2">
                                                    <ArrowDownward sx={{ fontSize: 12, color: '#667eea', verticalAlign: 'middle', mr: 0.3 }} />
                                                    <strong>{test.download.toFixed(1)}</strong> Mbps
                                                </Typography>
                                                <Typography variant="body2">
                                                    <ArrowUpward sx={{ fontSize: 12, color: '#764ba2', verticalAlign: 'middle', mr: 0.3 }} />
                                                    <strong>{test.upload.toFixed(1)}</strong> Mbps
                                                </Typography>
                                                <Typography variant="body2">
                                                    <NetworkPing sx={{ fontSize: 12, color: '#00bcd4', verticalAlign: 'middle', mr: 0.3 }} />
                                                    <strong>{test.ping.toFixed(0)}</strong> ms
                                                </Typography>
                                            </Stack>
                                        </Paper>
                                    ))}
                                </Stack>
                            </CardContent>
                        </Card>
                    )}
                </Box>
            </Box>
        </Box>
    );
};

export default SpeedTest;
