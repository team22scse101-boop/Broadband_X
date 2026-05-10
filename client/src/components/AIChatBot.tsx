import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    Box,
    Fab,
    Paper,
    Typography,
    TextField,
    IconButton,
    Chip,
    Avatar,
    Zoom,
    Slide,
    CircularProgress,
    Divider,
} from '@mui/material';
import {
    SmartToy as BotIcon,
    Close as CloseIcon,
    Send as SendIcon,
    SupportAgent,
} from '@mui/icons-material';
import axios from 'axios';

interface ChatMessage {
    id: string;
    role: 'user' | 'bot';
    content: string;
    suggestions?: string[];
    timestamp: Date;
}

const AIChatBot: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputText, setInputText] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [hasGreeted, setHasGreeted] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [messages, scrollToBottom]);

    useEffect(() => {
        if (isOpen && !hasGreeted) {
            sendMessage('hi');
            setHasGreeted(true);
        }
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 300);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    const sendMessage = async (text: string) => {
        const trimmed = text.trim();
        if (!trimmed) return;

        // Add user message (skip for initial greeting)
        if (hasGreeted || trimmed !== 'hi') {
            const userMsg: ChatMessage = {
                id: `user-${Date.now()}`,
                role: 'user',
                content: trimmed,
                timestamp: new Date(),
            };
            setMessages(prev => [...prev, userMsg]);
        }
        setInputText('');
        setIsTyping(true);

        try {
            const token = localStorage.getItem('access_token');
            const { data } = await axios.post(
                `${process.env.REACT_APP_API_URL || 'http://localhost:5001/api'}/chatbot/message`,
                { message: trimmed },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            // Simulate typing delay for realism
            await new Promise(r => setTimeout(r, 600 + Math.random() * 800));

            const botMsg: ChatMessage = {
                id: `bot-${Date.now()}`,
                role: 'bot',
                content: data.data.response,
                suggestions: data.data.suggestions,
                timestamp: new Date(),
            };
            setMessages(prev => [...prev, botMsg]);
        } catch (err) {
            const errorMsg: ChatMessage = {
                id: `bot-error-${Date.now()}`,
                role: 'bot',
                content: 'Sorry, I\'m having trouble connecting right now. Please try again in a moment! 🔄',
                suggestions: ['Try again'],
                timestamp: new Date(),
            };
            setMessages(prev => [...prev, errorMsg]);
        } finally {
            setIsTyping(false);
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage(inputText);
        }
    };

    const handleSuggestionClick = (suggestion: string) => {
        sendMessage(suggestion);
    };

    const formatMessage = (content: string) => {
        // Convert **bold** to <strong>
        let formatted = content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        // Convert newlines to <br>
        formatted = formatted.replace(/\n/g, '<br/>');
        return formatted;
    };

    return (
        <>
            {/* Floating Chat Button */}
            <Zoom in={!isOpen}>
                <Fab
                    onClick={() => setIsOpen(true)}
                    sx={{
                        position: 'fixed',
                        bottom: 28,
                        right: 28,
                        zIndex: 1300,
                        width: 64,
                        height: 64,
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        boxShadow: '0 8px 32px rgba(102, 126, 234, 0.4)',
                        '&:hover': {
                            background: 'linear-gradient(135deg, #764ba2 0%, #667eea 100%)',
                            transform: 'scale(1.1)',
                            boxShadow: '0 12px 40px rgba(102, 126, 234, 0.6)',
                        },
                        transition: 'all 0.3s ease',
                    }}
                >
                    <SupportAgent sx={{ fontSize: 32, color: '#fff' }} />
                </Fab>
            </Zoom>

            {/* Pulse ring animation */}
            {!isOpen && (
                <Box
                    sx={{
                        position: 'fixed',
                        bottom: 28,
                        right: 28,
                        width: 64,
                        height: 64,
                        borderRadius: '50%',
                        zIndex: 1299,
                        pointerEvents: 'none',
                        '&::before': {
                            content: '""',
                            position: 'absolute',
                            inset: -6,
                            borderRadius: '50%',
                            border: '2px solid rgba(102, 126, 234, 0.5)',
                            animation: 'chatPulse 2s ease-out infinite',
                        },
                        '@keyframes chatPulse': {
                            '0%': { transform: 'scale(1)', opacity: 1 },
                            '100%': { transform: 'scale(1.5)', opacity: 0 },
                        },
                    }}
                />
            )}

            {/* Chat Window */}
            <Slide direction="up" in={isOpen} mountOnEnter unmountOnExit>
                <Paper
                    elevation={24}
                    sx={{
                        position: 'fixed',
                        bottom: 28,
                        right: 28,
                        width: { xs: 'calc(100vw - 32px)', sm: 400 },
                        height: { xs: 'calc(100vh - 100px)', sm: 560 },
                        zIndex: 1301,
                        borderRadius: 4,
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
                    }}
                >
                    {/* Header */}
                    <Box
                        sx={{
                            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                            color: '#fff',
                            p: 2,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1.5,
                        }}
                    >
                        <Avatar
                            sx={{
                                bgcolor: 'rgba(255,255,255,0.2)',
                                width: 42,
                                height: 42,
                            }}
                        >
                            <BotIcon />
                        </Avatar>
                        <Box flex={1}>
                            <Typography variant="subtitle1" fontWeight={700}>
                                BroadbandX AI Assistant
                            </Typography>
                            <Typography variant="caption" sx={{ opacity: 0.85 }}>
                                {isTyping ? '● Typing...' : '● Online'}
                            </Typography>
                        </Box>
                        <IconButton
                            onClick={() => setIsOpen(false)}
                            sx={{ color: '#fff' }}
                            size="small"
                        >
                            <CloseIcon />
                        </IconButton>
                    </Box>

                    {/* Messages */}
                    <Box
                        sx={{
                            flex: 1,
                            overflowY: 'auto',
                            p: 2,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 1.5,
                            bgcolor: '#f8f9ff',
                            '&::-webkit-scrollbar': { width: 5 },
                            '&::-webkit-scrollbar-thumb': {
                                bgcolor: 'rgba(102, 126, 234, 0.3)',
                                borderRadius: 3,
                            },
                        }}
                    >
                        {messages.map((msg) => (
                            <Box key={msg.id}>
                                <Box
                                    sx={{
                                        display: 'flex',
                                        justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                                        gap: 1,
                                        alignItems: 'flex-end',
                                    }}
                                >
                                    {msg.role === 'bot' && (
                                        <Avatar
                                            sx={{
                                                width: 28,
                                                height: 28,
                                                bgcolor: '#667eea',
                                                fontSize: 14,
                                            }}
                                        >
                                            <BotIcon sx={{ fontSize: 16 }} />
                                        </Avatar>
                                    )}
                                    <Paper
                                        elevation={0}
                                        sx={{
                                            p: 1.5,
                                            maxWidth: '82%',
                                            borderRadius: msg.role === 'user'
                                                ? '16px 16px 4px 16px'
                                                : '16px 16px 16px 4px',
                                            bgcolor: msg.role === 'user'
                                                ? 'linear-gradient(135deg, #667eea, #764ba2)'
                                                : '#fff',
                                            background: msg.role === 'user'
                                                ? 'linear-gradient(135deg, #667eea, #764ba2)'
                                                : '#fff',
                                            color: msg.role === 'user' ? '#fff' : 'text.primary',
                                            boxShadow: msg.role === 'user'
                                                ? '0 2px 12px rgba(102,126,234,0.3)'
                                                : '0 1px 6px rgba(0,0,0,0.08)',
                                        }}
                                    >
                                        <Typography
                                            variant="body2"
                                            sx={{
                                                lineHeight: 1.6,
                                                fontSize: '0.85rem',
                                                '& strong': { fontWeight: 700 },
                                            }}
                                            dangerouslySetInnerHTML={{ __html: formatMessage(msg.content) }}
                                        />
                                    </Paper>
                                </Box>

                                {/* Suggestions */}
                                {msg.role === 'bot' && msg.suggestions && msg.suggestions.length > 0 && (
                                    <Box
                                        sx={{
                                            display: 'flex',
                                            flexWrap: 'wrap',
                                            gap: 0.5,
                                            mt: 1,
                                            ml: 4.5,
                                        }}
                                    >
                                        {msg.suggestions.map((suggestion, idx) => (
                                            <Chip
                                                key={idx}
                                                label={suggestion}
                                                size="small"
                                                variant="outlined"
                                                onClick={() => handleSuggestionClick(suggestion)}
                                                sx={{
                                                    fontSize: '0.72rem',
                                                    height: 26,
                                                    borderColor: '#667eea',
                                                    color: '#667eea',
                                                    cursor: 'pointer',
                                                    '&:hover': {
                                                        bgcolor: '#667eea',
                                                        color: '#fff',
                                                    },
                                                    transition: 'all 0.2s',
                                                }}
                                            />
                                        ))}
                                    </Box>
                                )}
                            </Box>
                        ))}

                        {/* Typing indicator */}
                        {isTyping && (
                            <Box display="flex" gap={1} alignItems="center">
                                <Avatar
                                    sx={{ width: 28, height: 28, bgcolor: '#667eea', fontSize: 14 }}
                                >
                                    <BotIcon sx={{ fontSize: 16 }} />
                                </Avatar>
                                <Paper
                                    elevation={0}
                                    sx={{
                                        p: 1.5,
                                        borderRadius: '16px 16px 16px 4px',
                                        bgcolor: '#fff',
                                        display: 'flex',
                                        gap: 0.5,
                                        alignItems: 'center',
                                    }}
                                >
                                    {[0, 1, 2].map(i => (
                                        <Box
                                            key={i}
                                            sx={{
                                                width: 7,
                                                height: 7,
                                                borderRadius: '50%',
                                                bgcolor: '#667eea',
                                                animation: 'typingDot 1.4s ease-in-out infinite',
                                                animationDelay: `${i * 0.2}s`,
                                                '@keyframes typingDot': {
                                                    '0%, 60%, 100%': { opacity: 0.3, transform: 'scale(0.8)' },
                                                    '30%': { opacity: 1, transform: 'scale(1.2)' },
                                                },
                                            }}
                                        />
                                    ))}
                                </Paper>
                            </Box>
                        )}

                        <div ref={messagesEndRef} />
                    </Box>

                    <Divider />

                    {/* Input */}
                    <Box
                        sx={{
                            p: 1.5,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            bgcolor: '#fff',
                        }}
                    >
                        <TextField
                            inputRef={inputRef}
                            fullWidth
                            size="small"
                            placeholder="Ask me anything..."
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            onKeyPress={handleKeyPress}
                            disabled={isTyping}
                            sx={{
                                '& .MuiOutlinedInput-root': {
                                    borderRadius: 3,
                                    bgcolor: '#f8f9ff',
                                    '&.Mui-focused fieldset': {
                                        borderColor: '#667eea',
                                    },
                                },
                            }}
                        />
                        <IconButton
                            onClick={() => sendMessage(inputText)}
                            disabled={!inputText.trim() || isTyping}
                            sx={{
                                bgcolor: '#667eea',
                                color: '#fff',
                                width: 40,
                                height: 40,
                                '&:hover': { bgcolor: '#5a6fd6' },
                                '&.Mui-disabled': { bgcolor: '#e0e0e0', color: '#999' },
                            }}
                        >
                            {isTyping ? <CircularProgress size={20} color="inherit" /> : <SendIcon fontSize="small" />}
                        </IconButton>
                    </Box>
                </Paper>
            </Slide>
        </>
    );
};

export default AIChatBot;
