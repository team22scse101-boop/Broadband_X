const User = require('../models/User');
const Subscription = require('../models/Subscription');
const UsageLog = require('../models/UsageLog');
const Billing = require('../models/Billing');
const Plan = require('../models/Plan');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * BroadbandX AI Chat Support Bot
 * Intent-based chatbot that analyzes user questions and fetches real data
 * to provide contextual, personalized responses.
 */

// ─── Intent Detection ────────────────────────────────────────────────
const INTENTS = {
    BILLING: {
        keywords: ['bill', 'billing', 'charge', 'payment', 'invoice', 'cost', 'price', 'expensive', 'high bill', 'pay', 'due', 'overdue', 'receipt', 'amount', 'fee', 'money', 'rupee', 'rupees', '₹', 'overcharge', 'discount', 'coupon', 'promo', 'promo code', 'tax', 'gst', 'recharge', 'autopay', 'auto pay', 'emi', 'transaction', 'debit', 'deducted'],
        patterns: [/why.*(bill|charge|cost).*(high|more|increase)/i, /how much.*(owe|pay|due)/i, /when.*(bill|payment|due)/i, /bill.*breakdown/i, /apply.*(coupon|promo|discount)/i, /payment.*(fail|decline|reject)/i, /where.*(pay|receipt|invoice)/i]
    },
    USAGE: {
        keywords: ['usage', 'data', 'download', 'upload', 'bandwidth', 'consumption', 'used', 'remaining', 'limit', 'throttle', 'speed', 'slow', 'fast', 'gb', 'mb', 'fup', 'fair usage', 'cap', 'overage', 'night data', 'peak hours', 'buffering', 'lag', 'latency'],
        patterns: [/how much.*(data|usage|bandwidth)/i, /data.*(left|remaining|used)/i, /why.*(slow|speed|buffer|lag)/i, /usage.*(today|this month|daily)/i, /check.*(speed|usage|data)/i, /am i.*(throttle|limit|cap)/i, /internet.*(slow|lag|buffer)/i]
    },
    PLAN: {
        keywords: ['plan', 'upgrade', 'downgrade', 'switch', 'change plan', 'best plan', 'recommend', 'suggestion', 'which plan', 'compare', 'features', 'subscription', 'gaming', 'streaming', 'work from home', 'wfh', 'ott', 'family', 'basic', 'premium', 'fiber', 'iptv', 'unlimited', 'cheapest', 'fastest', 'budget'],
        patterns: [/which plan.*(best|right|good|suit)/i, /should i.*(upgrade|downgrade|switch)/i, /recommend.*(plan|package)/i, /compare.*(plan)/i, /what plan/i, /best.*(plan|package).*(gaming|streaming|work|family|budget)/i, /plan.*(gaming|streaming|work|family|budget)/i, /cheapest.*(plan|package)/i, /fastest.*(plan|package)/i]
    },
    ACCOUNT: {
        keywords: ['account', 'profile', 'password', 'email', 'name', 'settings', 'login', 'logout', 'reset', 'update', 'change password', 'edit profile', 'kyc', 'verify', 'verification', 'address', 'phone number', 'mobile', 'otp', 'two factor', '2fa'],
        patterns: [/how.*(change|update|reset).*(password|email|profile|name|address|phone)/i, /account.*(details|info|settings)/i, /forgot.*(password|email)/i, /can.?not.*(login|log in|sign in)/i, /update.*(kyc|address|phone|mobile)/i]
    },
    SUPPORT: {
        keywords: ['support', 'help', 'issue', 'problem', 'complaint', 'ticket', 'contact', 'agent', 'human', 'escalate', 'not working', 'outage', 'down', 'complaint number', 'track ticket', 'status of complaint', 'call back', 'technician visit', 'service request'],
        patterns: [/talk.*(human|agent|support)/i, /raise.*(ticket|complaint)/i, /service.*(outage|down)/i, /track.*(ticket|complaint|request)/i, /complaint.*(number|status)/i, /need.*(help|support|assistance)/i, /call.*(me|back)/i]
    },
    RENEWAL: {
        keywords: ['renew', 'renewal', 'extend', 'auto-renew', 'auto renew', 'continue subscription', 'reactivate', 'resubscribe', 're-subscribe', 'expired plan', 'plan expired', 'subscription expired', 'renew plan'],
        patterns: [/how.*(renew|extend|reactivate)/i, /(renew|extend|continue).*(plan|subscription|service)/i, /auto.?renew/i, /when.*(renew|expir)/i, /plan.*(expir|end)/i, /subscription.*(expir|end|over)/i]
    },
    REFUND: {
        keywords: ['refund', 'money back', 'return money', 'reimburse', 'credited', 'refund policy', 'get refund', 'claim refund', 'refund status', 'where is my refund', 'cashback'],
        patterns: [/want.*(refund|money back)/i, /how.*(get|claim|request).*(refund)/i, /refund.*(status|policy|process|when|how)/i, /money.*(back|return|refund)/i, /can i.*(get|claim).*(refund)/i]
    },
    CANCELLATION: {
        keywords: ['cancel', 'cancellation', 'stop', 'terminate', 'deactivate', 'end subscription', 'unsubscribe', 'close account', 'delete account', 'discontinue', 'stop service', 'cancel plan'],
        patterns: [/cancel.*(plan|subscription|service|account)/i, /how.*(cancel|stop|terminate|deactivate|unsubscribe)/i, /stop.*(plan|subscription|service)/i, /want to.*(cancel|quit|leave|stop)/i, /close.*(account|service)/i, /don.?t want.*(plan|subscription|service)/i]
    },
    NETWORK: {
        keywords: ['wifi', 'wi-fi', 'router', 'modem', 'connection', 'disconnect', 'drop', 'dropping', 'ping', 'dns', 'ip address', 'no internet', 'network', 'signal', 'connectivity', 'fiber cut', 'cable', 'ethernet', 'lan', 'wireless', 'reconnect', 'keeps disconnecting'],
        patterns: [/wifi.*(not|issue|drop|slow|disconnect)/i, /internet.*(not working|down|drop|disconnect|gone)/i, /router.*(issue|problem|restart|reset|blinking)/i, /no.*(internet|connection|connectivity|signal|wifi)/i, /keeps?.*(disconnect|drop|cut)/i, /connection.*(issue|problem|drop|unstable)/i, /how.*(restart|reset).*(router|modem)/i]
    },
    INSTALLATION: {
        keywords: ['install', 'installation', 'setup', 'set up', 'technician', 'appointment', 'activation', 'new connection', 'new line', 'when will', 'schedule visit', 'configure', 'first time', 'get started', 'connect broadband'],
        patterns: [/when.*(technician|install|setup|activation|come)/i, /how.*(install|setup|set up|activate|connect|get started)/i, /schedule.*(visit|installation|appointment)/i, /new.*(connection|line|setup|service)/i, /technician.*(when|schedule|visit|date)/i, /installation.*(status|date|time|schedule)/i]
    },
    GREETING: {
        keywords: ['hello', 'hi', 'hey', 'good morning', 'good evening', 'good afternoon', 'howdy', 'greetings', 'yo', 'sup', 'namaste'],
        patterns: [/^(hi|hello|hey|howdy|greetings|yo|namaste|hii+|helo)[\s!.?]*$/i]
    },
    THANKS: {
        keywords: ['thank', 'thanks', 'thank you', 'thx', 'appreciate', 'helpful', 'great help', 'awesome', 'perfect', 'got it', 'understood'],
        patterns: [/thank/i, /appreciate/i, /^(thx|ty|tysm|thanks?)[\s!.]*$/i]
    }
};

// Synonym mapping for fuzzy matching
const SYNONYMS = {
    'net': 'internet', 'broadband': 'internet', 'wifi': 'internet', 'wi-fi': 'internet',
    'recharge': 'payment', 'topup': 'payment', 'top-up': 'payment',
    'pack': 'plan', 'package': 'plan', 'offer': 'plan', 'scheme': 'plan', 'tariff': 'plan',
    'slow': 'speed', 'fast': 'speed', 'buffer': 'speed', 'buffering': 'speed', 'lag': 'speed', 'lagging': 'speed',
    'pwd': 'password', 'pass': 'password',
    'amt': 'amount', 'rs': 'rupees', 'inr': 'rupees',
    'prob': 'problem', 'prblm': 'problem',
    'msg': 'message', 'info': 'information',
    'govt': 'government', 'govt id': 'kyc',
    'conn': 'connection', 'discon': 'disconnect',
    'tech': 'technician', 'engineer': 'technician',
};

function normalizeMessage(message) {
    let normalized = message.toLowerCase().trim();
    // Replace synonyms with canonical terms
    for (const [synonym, canonical] of Object.entries(SYNONYMS)) {
        const regex = new RegExp(`\\b${synonym.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
        normalized = normalized.replace(regex, canonical);
    }
    return normalized;
}

function detectIntent(message) {
    const lowerMsg = message.toLowerCase().trim();
    const normalizedMsg = normalizeMessage(message);

    // Check pattern matches first (more specific) — check both original and normalized
    for (const [intent, config] of Object.entries(INTENTS)) {
        for (const pattern of config.patterns) {
            if (pattern.test(lowerMsg) || pattern.test(normalizedMsg)) {
                return { intent, confidence: 0.95, method: 'pattern' };
            }
        }
    }

    // Then check keyword matches on both original and normalized message
    let bestIntent = 'GENERAL';
    let bestScore = 0;
    let secondBestScore = 0;

    for (const [intent, config] of Object.entries(INTENTS)) {
        let score = 0;
        for (const keyword of config.keywords) {
            if (lowerMsg.includes(keyword) || normalizedMsg.includes(keyword)) {
                score += keyword.split(' ').length; // Multi-word keywords score higher
            }
        }
        if (score > bestScore) {
            secondBestScore = bestScore;
            bestScore = score;
            bestIntent = intent;
        } else if (score > secondBestScore) {
            secondBestScore = score;
        }
    }

    return {
        intent: bestScore > 0 ? bestIntent : 'GENERAL',
        confidence: bestScore > 0 ? Math.min(0.95, 0.5 + bestScore * 0.15) : 0.3,
        method: 'keyword'
    };
}

// ─── Context Fetchers ────────────────────────────────────────────────
async function getUserContext(userId) {
    const [user, subscription, plans] = await Promise.all([
        User.findById(userId).select('firstName lastName email'),
        Subscription.findOne({ user: userId, status: 'active' }).populate('plan'),
        Plan.find({ status: 'active' }).sort({ 'pricing.monthly': 1 })
    ]);
    return { user, subscription, allPlans: plans };
}

async function getBillingContext(userId) {
    const invoices = await Billing.find({ user: userId })
        .sort('-createdAt')
        .limit(5);

    const subscription = await Subscription.findOne({ user: userId, status: 'active' }).populate('plan');

    let totalDue = 0;
    let overdueCount = 0;
    invoices.forEach(inv => {
        if (inv.status === 'pending' || inv.status === 'overdue') {
            totalDue += inv.amount || 0;
            if (inv.status === 'overdue') overdueCount++;
        }
    });

    return { invoices, subscription, totalDue, overdueCount };
}

async function getUsageContext(userId) {
    const subscription = await Subscription.findOne({ user: userId, status: 'active' }).populate('plan');
    if (!subscription) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [todayUsage, monthUsage] = await Promise.all([
        UsageLog.aggregate([
            { $match: { userId: subscription.user, timestamp: { $gte: today } } },
            { $group: { _id: null, totalDownload: { $sum: '$download' }, totalUpload: { $sum: '$upload' } } }
        ]),
        UsageLog.aggregate([
            { $match: { userId: subscription.user, timestamp: { $gte: new Date(today.getFullYear(), today.getMonth(), 1) } } },
            { $group: { _id: null, totalDownload: { $sum: '$download' }, totalUpload: { $sum: '$upload' } } }
        ])
    ]);

    const todayData = todayUsage[0] || { totalDownload: 0, totalUpload: 0 };
    const monthData = monthUsage[0] || { totalDownload: 0, totalUpload: 0 };

    const todayGB = ((todayData.totalDownload + todayData.totalUpload) / (1024 * 1024 * 1024)).toFixed(2);
    const monthGB = ((monthData.totalDownload + monthData.totalUpload) / (1024 * 1024 * 1024)).toFixed(2);

    const dataLimit = subscription.plan?.features?.dataLimit;
    const limitGB = dataLimit?.unlimited ? 'Unlimited' : (dataLimit?.amount || 'N/A');
    const usagePercent = dataLimit?.unlimited ? 0 : ((parseFloat(monthGB) / (dataLimit?.amount || 100)) * 100).toFixed(1);

    return {
        todayGB,
        monthGB,
        limitGB,
        usagePercent,
        planName: subscription.plan?.name,
        speed: subscription.plan?.features?.speed
    };
}

// ─── Response Generators ─────────────────────────────────────────────
async function generateBillingResponse(userId, message) {
    const context = await getBillingContext(userId);
    const lowerMsg = message.toLowerCase();

    if (lowerMsg.includes('why') && (lowerMsg.includes('high') || lowerMsg.includes('more') || lowerMsg.includes('increase'))) {
        const planPrice = context.subscription?.plan?.pricing?.monthly || 0;
        return {
            message: `I can help you understand your billing! 💰\n\nHere's your billing breakdown:\n` +
                `• **Current Plan**: ${context.subscription?.plan?.name || 'No active plan'}\n` +
                `• **Monthly Price**: ₹${planPrice.toLocaleString()}\n` +
                `• **Outstanding Amount**: ₹${context.totalDue.toLocaleString()}\n` +
                (context.overdueCount > 0 ? `• ⚠️ **${context.overdueCount} overdue invoice(s)** — late fees may apply\n` : '') +
                `\nCommon reasons for higher bills:\n` +
                `1. Plan upgrade mid-cycle (prorated charges)\n` +
                `2. Overdue invoices accumulating\n` +
                `3. Add-on services or one-time charges\n` +
                `\nWould you like me to recommend a more suitable plan?`,
            suggestions: ['Show my invoices', 'Recommend a cheaper plan', 'Talk to support']
        };
    }

    if (lowerMsg.includes('when') && (lowerMsg.includes('due') || lowerMsg.includes('pay'))) {
        const nextBill = context.subscription?.endDate;
        return {
            message: `📅 Your billing information:\n\n` +
                `• **Next billing date**: ${nextBill ? new Date(nextBill).toLocaleDateString('en-IN') : 'N/A'}\n` +
                `• **Amount due**: ₹${context.totalDue.toLocaleString()}\n` +
                `• **Recent invoices**: ${context.invoices.length}\n` +
                (context.overdueCount > 0 ? `\n⚠️ You have ${context.overdueCount} overdue payment(s). Please clear them to avoid service interruption.` : '\n✅ All payments are up to date!'),
            suggestions: ['Pay now', 'View billing history', 'Download invoice']
        };
    }

    // Default billing response
    return {
        message: `💰 Here's your billing summary:\n\n` +
            `• **Plan**: ${context.subscription?.plan?.name || 'No active plan'}\n` +
            `• **Monthly cost**: ₹${(context.subscription?.plan?.pricing?.monthly || 0).toLocaleString()}\n` +
            `• **Outstanding**: ₹${context.totalDue.toLocaleString()}\n` +
            `• **Overdue invoices**: ${context.overdueCount}\n` +
            `\nNeed more details? Ask me about your invoices or payment schedule!`,
        suggestions: ['Why is my bill high?', 'When is my next payment?', 'Show invoice history']
    };
}

async function generateUsageResponse(userId, message) {
    const usage = await getUsageContext(userId);
    const lowerMsg = message.toLowerCase();

    if (!usage) {
        return {
            message: `📊 I couldn't find an active subscription on your account. Please subscribe to a plan to track your usage!\n\nWould you like me to recommend a plan for you?`,
            suggestions: ['Show available plans', 'Talk to support']
        };
    }

    if (lowerMsg.includes('today')) {
        return {
            message: `📊 **Today's Usage Report**\n\n` +
                `• **Data Used Today**: ${usage.todayGB} GB\n` +
                `• **Plan**: ${usage.planName}\n` +
                `• **Max Speed**: ${usage.speed?.download || 'N/A'} ${usage.speed?.unit || 'Mbps'}\n` +
                `\nYour connection is running smoothly! 🟢`,
            suggestions: ['Show monthly usage', 'Check data limit', 'Speed test info']
        };
    }

    if (lowerMsg.includes('slow') || lowerMsg.includes('speed')) {
        return {
            message: `🔍 **Speed Analysis**\n\n` +
                `• **Your Plan Speed**: ${usage.speed?.download || 'N/A'} ${usage.speed?.unit || 'Mbps'} download\n` +
                `• **Upload Speed**: ${usage.speed?.upload || 'N/A'} ${usage.speed?.unit || 'Mbps'}\n` +
                `• **Data Used This Month**: ${usage.monthGB} GB (${usage.usagePercent}% of limit)\n` +
                `\nPossible reasons for slow speed:\n` +
                `1. ${parseFloat(usage.usagePercent) > 80 ? '⚠️ **You\'re at ' + usage.usagePercent + '% of your data limit** — throttling may apply' : '✅ Data usage is within limits'}\n` +
                `2. Too many devices connected simultaneously\n` +
                `3. Peak hours (8-11 PM) may have slight congestion\n` +
                `4. Router needs a restart\n` +
                `\nTry restarting your router. If the issue persists, raise a support ticket!`,
            suggestions: ['Upgrade my plan', 'Raise support ticket', 'Show usage details']
        };
    }

    // Default usage response
    return {
        message: `📊 **Your Usage Summary**\n\n` +
            `• **Today**: ${usage.todayGB} GB\n` +
            `• **This Month**: ${usage.monthGB} GB / ${usage.limitGB} ${typeof usage.limitGB === 'number' ? 'GB' : ''}\n` +
            `• **Usage**: ${usage.usagePercent}% of your monthly limit\n` +
            `• **Plan**: ${usage.planName}\n` +
            `• **Speed**: ${usage.speed?.download || 'N/A'} ${usage.speed?.unit || 'Mbps'}\n` +
            (parseFloat(usage.usagePercent) > 80 ? `\n⚠️ You're approaching your data limit! Consider upgrading your plan.` : '\n✅ Your data usage looks healthy!'),
        suggestions: ['Today\'s usage', 'Why is my internet slow?', 'Upgrade plan']
    };
}

async function generatePlanResponse(userId, message) {
    const context = await getUserContext(userId);
    const lowerMsg = message.toLowerCase();

    const currentPlan = context.subscription?.plan;
    const plans = context.allPlans;

    // Detect use-case sub-intent for targeted recommendations
    const useCaseMap = {
        'gaming': ['gamers', 'gaming'], 'game': ['gamers', 'gaming'],
        'streaming': ['streamers', 'streaming'], 'netflix': ['streamers', 'streaming'], 'ott': ['streamers', 'streaming'],
        'work from home': ['remote-workers', 'work from home'], 'wfh': ['remote-workers', 'work from home'], 'remote': ['remote-workers', 'work from home'],
        'family': ['families', 'family'], 'kids': ['families', 'family'],
        'budget': ['light-users', 'budget'], 'cheap': ['light-users', 'budget'], 'cheapest': ['light-users', 'budget'],
        'fast': ['heavy-users', 'fastest'], 'fastest': ['heavy-users', 'fastest'], 'heavy': ['heavy-users', 'heavy usage'],
    };

    let matchedAudience = null;
    let useCaseLabel = null;
    for (const [keyword, [audience, label]] of Object.entries(useCaseMap)) {
        if (lowerMsg.includes(keyword)) {
            matchedAudience = audience;
            useCaseLabel = label;
            break;
        }
    }

    // Use-case aware recommendation
    if (matchedAudience) {
        const matched = plans.filter(p => p.targetAudience === matchedAudience);
        const recommended = matched.length > 0 ? matched : plans.slice(-3); // fallback to top plans

        let msg = `🎯 **Best Plans for ${useCaseLabel.charAt(0).toUpperCase() + useCaseLabel.slice(1)}**\n\n`;
        if (currentPlan) msg += `📍 Your current plan: **${currentPlan.name}** (₹${currentPlan.pricing.monthly}/mo)\n\n`;

        recommended.slice(0, 3).forEach(p => {
            const latency = p.technicalSpecs?.latency ? ` | ${p.technicalSpecs.latency}ms latency` : '';
            msg += `⭐ **${p.name}** — ₹${p.pricing.monthly}/mo | ${p.features?.speed?.download || '?'} ${p.features?.speed?.unit || 'Mbps'} | ${p.features?.dataLimit?.unlimited ? 'Unlimited' : p.features?.dataLimit?.amount + ' GB'}${latency}\n`;
        });

        if (matched.length === 0) {
            msg += `\n💡 We don't have a plan specifically labeled for ${useCaseLabel}, but the above plans would work great!`;
        } else {
            msg += `\n💡 These plans are optimized for ${useCaseLabel} with the best speed and data for your needs!`;
        }

        return { message: msg, suggestions: ['Compare all plans', 'How to upgrade?', 'Show all plans'] };
    }

    if (lowerMsg.includes('upgrade') || lowerMsg.includes('best') || lowerMsg.includes('recommend') || lowerMsg.includes('suggest')) {
        const currentPrice = currentPlan?.pricing?.monthly || 0;
        const upgrades = plans.filter(p => p.pricing.monthly > currentPrice);
        const downgrades = plans.filter(p => p.pricing.monthly < currentPrice && p.pricing.monthly > 0);

        let recommendMsg = `🎯 **Plan Recommendations for You**\n\n`;
        recommendMsg += `📍 Your current plan: **${currentPlan?.name || 'None'}** (₹${currentPrice}/mo)\n\n`;

        if (upgrades.length > 0) {
            recommendMsg += `⬆️ **Upgrade Options:**\n`;
            upgrades.slice(0, 3).forEach(p => {
                recommendMsg += `• **${p.name}** — ₹${p.pricing.monthly}/mo | ${p.features?.speed?.download || '?'} ${p.features?.speed?.unit || 'Mbps'} | ${p.features?.dataLimit?.unlimited ? 'Unlimited' : p.features?.dataLimit?.amount + ' GB'}\n`;
            });
        }

        if (downgrades.length > 0) {
            recommendMsg += `\n⬇️ **Save Money Options:**\n`;
            downgrades.slice(0, 2).forEach(p => {
                recommendMsg += `• **${p.name}** — ₹${p.pricing.monthly}/mo (save ₹${currentPrice - p.pricing.monthly}/mo)\n`;
            });
        }

        recommendMsg += `\n💡 Based on your usage, I recommend checking the upgrade options for better speed and data limits!`;

        return { message: recommendMsg, suggestions: ['Compare top 2 plans', 'How to upgrade?', 'Show all plans'] };
    }

    if (lowerMsg.includes('compare')) {
        let compareMsg = `📋 **Plan Comparison**\n\n`;
        compareMsg += `| Plan | Price | Speed | Data |\n|------|-------|-------|------|\n`;
        plans.slice(0, 5).forEach(p => {
            const isCurrentPlan = currentPlan && p._id.toString() === currentPlan._id.toString();
            compareMsg += `| ${p.name}${isCurrentPlan ? ' ⭐' : ''} | ₹${p.pricing.monthly} | ${p.features?.speed?.download || '?'} ${p.features?.speed?.unit || 'Mbps'} | ${p.features?.dataLimit?.unlimited ? '∞' : p.features?.dataLimit?.amount + ' GB'} |\n`;
        });
        compareMsg += `\n⭐ = Your current plan`;

        return { message: compareMsg, suggestions: ['Upgrade my plan', 'Which is best for streaming?', 'Best for work from home?'] };
    }

    // Default plan response
    return {
        message: `📦 **Your Current Plan**\n\n` +
            `• **Plan**: ${currentPlan?.name || 'No active plan'}\n` +
            `• **Price**: ₹${(currentPlan?.pricing?.monthly || 0).toLocaleString()}/month\n` +
            `• **Speed**: ${currentPlan?.features?.speed?.download || 'N/A'} ${currentPlan?.features?.speed?.unit || 'Mbps'}\n` +
            `• **Data**: ${currentPlan?.features?.dataLimit?.unlimited ? 'Unlimited' : (currentPlan?.features?.dataLimit?.amount || 'N/A') + ' GB'}\n` +
            `\nWe have ${plans.length} plans available. Want me to recommend the best one for you?`,
        suggestions: ['Recommend a plan', 'Compare all plans', 'Best for gaming', 'Best for streaming']
    };
}

function generateAccountResponse(message) {
    const lowerMsg = message.toLowerCase();

    if (lowerMsg.includes('password')) {
        return {
            message: `🔐 **Password Management**\n\n` +
                `To change your password:\n` +
                `1. Go to **Settings** → **Account Settings**\n` +
                `2. Click **"Change Password"**\n` +
                `3. Enter your current password and new password\n` +
                `4. New password must have: 8+ chars, uppercase, lowercase, number, special char\n` +
                `\n🔒 For security, changing your password logs you out of all other devices.`,
            suggestions: ['Go to settings', 'Forgot my password', 'Talk to support']
        };
    }

    return {
        message: `👤 **Account Help**\n\n` +
            `Here's what you can do:\n` +
            `• **Update profile** → Settings → Edit Profile\n` +
            `• **Change password** → Settings → Security\n` +
            `• **View billing** → Billing section\n` +
            `• **Manage subscription** → My Subscriptions\n` +
            `\nWhat would you like to update?`,
        suggestions: ['Change password', 'Update profile', 'View my subscription']
    };
}

function generateSupportResponse() {
    return {
        message: `🎧 **Support Options**\n\n` +
            `I'm here to help! Here's what I can do:\n\n` +
            `1. 📝 **Raise a support ticket** — Go to the Support section in your dashboard\n` +
            `2. 💬 **Ask me anything** — I can help with billing, usage, plans, and account questions\n` +
            `3. 📧 **Email support** — support@broadbandx.com\n` +
            `\nFor urgent issues like service outages, please raise a support ticket with "High" priority and our team will respond within 2 hours.`,
        suggestions: ['Raise a ticket', 'Internet not working', 'Check my bill']
    };
}

function generateGreetingResponse(userName) {
    const hour = new Date().getHours();
    let greeting = '👋';
    if (hour < 12) greeting = '☀️ Good morning';
    else if (hour < 17) greeting = '🌤️ Good afternoon';
    else greeting = '🌙 Good evening';

    return {
        message: `${greeting}, ${userName || 'there'}! I'm **BroadbandX AI Assistant** 🤖\n\n` +
            `I can help you with:\n` +
            `• 💰 **Billing** — Bills, payments, invoices, discounts\n` +
            `• 📊 **Usage** — Data consumption, speed, FUP status\n` +
            `• 📦 **Plans** — Recommendations, comparisons, upgrades\n` +
            `• 🔄 **Renewal** — Renew or extend your subscription\n` +
            `• ❌ **Cancellation** — Cancel or modify your service\n` +
            `• 💸 **Refund** — Refund policy and status\n` +
            `• 🌐 **Network** — WiFi, router, connectivity issues\n` +
            `• 🔧 **Installation** — New connection, technician visits\n` +
            `• 👤 **Account** — Profile, password, KYC\n` +
            `• 🎧 **Support** — Raise tickets, track complaints\n` +
            `\nWhat can I help you with today?`,
        suggestions: ['Check my usage', 'Why is my bill high?', 'Recommend a plan', 'My WiFi is not working']
    };
}

function generateThanksResponse() {
    return {
        message: `You're welcome! 😊 I'm always here to help.\n\nIs there anything else you'd like to know?`,
        suggestions: ['Check my usage', 'View billing', 'Browse plans']
    };
}

// ─── FAQ Knowledge Base ──────────────────────────────────────────────
const FAQ_ENTRIES = [
    { q: ['working hours', 'office hours', 'open', 'timing', 'office timing'], a: '🕐 **BroadbandX Support Hours**\n\n• Online chat: 24/7\n• Phone support: 9 AM – 9 PM (Mon–Sat)\n• Office visits: 10 AM – 6 PM (Mon–Fri)' },
    { q: ['service area', 'available', 'city', 'location', 'where', 'coverage'], a: '📍 **Service Coverage**\n\nBroadbandX is available across major cities. Check the **Plans** section for availability in your area, or contact support for specifics.' },
    { q: ['minimum contract', 'lock in', 'contract period', 'commitment'], a: '📝 **Contract Terms**\n\nMost plans have a 12-month minimum term. Early termination fees may apply. Check your plan details in the **Subscription** section.' },
    { q: ['payment method', 'how to pay', 'upi', 'card', 'net banking', 'razorpay'], a: '💳 **Payment Methods**\n\nWe accept: UPI, Credit/Debit Cards, Net Banking, and Wallets via Razorpay. Go to **Billing** → **Pay Now** to make a payment.' },
    { q: ['speed test', 'test speed', 'check speed'], a: '⚡ **Speed Test**\n\nYou can run a speed test from your dashboard! Go to **Dashboard** → **Speed Test** to check your current connection speed.' },
];

function generateGeneralResponse(message) {
    const lowerMsg = (message || '').toLowerCase();

    // Try FAQ matching first
    for (const faq of FAQ_ENTRIES) {
        if (faq.q.some(keyword => lowerMsg.includes(keyword))) {
            return {
                message: faq.a,
                suggestions: ['Check my bill', 'Show my usage', 'Recommend a plan', 'Get support']
            };
        }
    }

    return {
        message: `I'm not quite sure what you're asking about. 🤔\n\nHere are some things I can help with:\n` +
            `• **"Why is my bill high?"** — Billing analysis\n` +
            `• **"How much data have I used?"** — Usage stats\n` +
            `• **"Best plan for gaming"** — Use-case recommendations\n` +
            `• **"Cancel my subscription"** — Cancellation help\n` +
            `• **"My WiFi keeps dropping"** — Network troubleshooting\n` +
            `• **"How to renew my plan"** — Renewal info\n` +
            `• **"Refund policy"** — Refund info\n` +
            `• **"New connection setup"** — Installation info\n` +
            `\nTry asking one of these, or type your question differently!`,
        suggestions: ['Check my bill', 'My WiFi is not working', 'Recommend a plan', 'Cancel subscription']
    };
}

// ─── New Response Generators ─────────────────────────────────────────
async function generateRenewalResponse(userId) {
    const subscription = await Subscription.findOne({ user: userId }).populate('plan').sort({ createdAt: -1 });

    if (!subscription) {
        return {
            message: `🔄 You don't have any subscription on record.\n\nWould you like to browse our plans and subscribe?`,
            suggestions: ['Show available plans', 'Talk to support']
        };
    }

    const status = subscription.status;
    const endDate = subscription.endDate ? new Date(subscription.endDate).toLocaleDateString('en-IN') : 'N/A';
    const planName = subscription.plan?.name || 'Unknown';
    const autoRenew = subscription.plan?.contractTerms?.autoRenewal;

    if (status === 'active') {
        return {
            message: `🔄 **Renewal Information**\n\n` +
                `• **Plan**: ${planName}\n` +
                `• **Status**: ✅ Active\n` +
                `• **Current period ends**: ${endDate}\n` +
                `• **Auto-renewal**: ${autoRenew ? '✅ Enabled' : '❌ Disabled'}\n` +
                (autoRenew ? `\nYour plan will automatically renew. No action needed!` : `\nYou'll need to manually renew before ${endDate} to avoid service interruption.`),
            suggestions: ['When is my next payment?', 'Change plan', 'Disable auto-renew']
        };
    }

    if (status === 'expired' || status === 'grace_period') {
        return {
            message: `⚠️ **Your Subscription ${status === 'expired' ? 'Has Expired' : 'Is in Grace Period'}**\n\n` +
                `• **Plan**: ${planName}\n` +
                `• **Ended on**: ${endDate}\n` +
                `\nTo continue enjoying BroadbandX services, please renew your subscription from the **Billing** section.\n` +
                (status === 'grace_period' ? `\n⏳ You're in a grace period — renew now to avoid losing access!` : ''),
            suggestions: ['Renew now', 'Show available plans', 'Talk to support']
        };
    }

    return {
        message: `🔄 **Subscription Status: ${status}**\n\n• **Plan**: ${planName}\n\nPlease visit the **Billing** or **Subscriptions** section for renewal options.`,
        suggestions: ['Show available plans', 'Talk to support']
    };
}

async function generateRefundResponse(userId) {
    const invoices = await Billing.find({ user: userId, status: 'paid' }).sort('-createdAt').limit(5);

    return {
        message: `💸 **Refund Policy**\n\n` +
            `BroadbandX refund guidelines:\n` +
            `• Refunds are processed within **5-7 business days**\n` +
            `• Eligible for refund: service outages > 24 hours, billing errors, cancelled within 7 days of activation\n` +
            `• Not eligible: partial month usage, add-on services already consumed\n` +
            `\n📋 **Your recent paid invoices**: ${invoices.length > 0 ? invoices.length : 'None found'}\n` +
            (invoices.length > 0 ? invoices.slice(0, 3).map(inv => `• Invoice #${inv.invoiceNumber || inv._id.toString().slice(-6)} — ₹${(inv.amount || 0).toLocaleString()} (${new Date(inv.createdAt).toLocaleDateString('en-IN')})`).join('\n') : '') +
            `\n\nTo request a refund, please raise a **Support Ticket** with the subject "Refund Request" and include the invoice number.`,
        suggestions: ['Raise refund ticket', 'View billing history', 'Talk to support']
    };
}

async function generateCancellationResponse(userId) {
    const subscription = await Subscription.findOne({ user: userId, status: { $in: ['active', 'grace_period'] } }).populate('plan');

    if (!subscription) {
        return {
            message: `❌ You don't have an active subscription to cancel.\n\nIf you'd like to browse plans or need other help, just ask!`,
            suggestions: ['Show available plans', 'Talk to support']
        };
    }

    const planName = subscription.plan?.name || 'Unknown';
    const earlyFee = subscription.plan?.contractTerms?.earlyTerminationFee || 0;
    const minTerm = subscription.plan?.contractTerms?.minimumTerm || 12;
    const endDate = subscription.endDate ? new Date(subscription.endDate).toLocaleDateString('en-IN') : 'N/A';

    return {
        message: `❌ **Cancellation Information**\n\n` +
            `• **Active Plan**: ${planName}\n` +
            `• **Minimum contract**: ${minTerm} months\n` +
            `• **Early termination fee**: ${earlyFee > 0 ? '₹' + earlyFee.toLocaleString() : 'None'}\n` +
            `• **Current period ends**: ${endDate}\n` +
            `\n⚠️ **Before you cancel:**\n` +
            `1. Your service will continue until ${endDate}\n` +
            `2. ${earlyFee > 0 ? 'An early termination fee of ₹' + earlyFee.toLocaleString() + ' may apply' : 'No early termination fee applies'}\n` +
            `3. You'll lose access to all plan features after cancellation\n` +
            `\n💡 **Consider downgrading** instead of cancelling — we have budget plans starting at lower prices!\n` +
            `\nTo proceed with cancellation, please raise a support ticket or contact our team.`,
        suggestions: ['Show cheaper plans', 'Raise cancellation ticket', 'Talk to support']
    };
}

async function generateNetworkResponse(userId, message) {
    const lowerMsg = message.toLowerCase();
    const subscription = await Subscription.findOne({ user: userId, status: { $in: ['active', 'grace_period'] } }).populate('plan');

    const planSpeed = subscription?.plan?.features?.speed;
    const technology = subscription?.plan?.technicalSpecs?.technology || 'fiber';

    if (lowerMsg.includes('router') || lowerMsg.includes('restart') || lowerMsg.includes('reset')) {
        return {
            message: `🔧 **Router Troubleshooting**\n\n` +
                `Try these steps:\n` +
                `1. **Power cycle**: Unplug the router, wait 30 seconds, plug back in\n` +
                `2. **Check lights**: All lights should be solid green after 2 minutes\n` +
                `3. **Factory reset**: Hold the reset button for 10 seconds (⚠️ this erases custom settings)\n` +
                `4. **Check cables**: Ensure all cables are firmly connected\n` +
                `\n${planSpeed ? `Your plan supports up to **${planSpeed.download} ${planSpeed.unit || 'Mbps'}** download speed.` : ''}\n` +
                `\nIf the issue persists after restarting, please raise a support ticket for a technician visit.`,
            suggestions: ['Raise support ticket', 'Check my speed', 'Schedule technician']
        };
    }

    return {
        message: `🌐 **Network Troubleshooting**\n\n` +
            `${subscription ? `Your connection: **${technology.toUpperCase()}** | **${planSpeed?.download || '?'} ${planSpeed?.unit || 'Mbps'}** plan` : '⚠️ No active subscription found'}\n\n` +
            `**Quick fixes to try:**\n` +
            `1. 🔄 **Restart your router** — Unplug for 30 seconds, then reconnect\n` +
            `2. 📶 **Move closer to the router** — Walls and distance reduce WiFi signal\n` +
            `3. 📱 **Disconnect unused devices** — Too many devices split bandwidth\n` +
            `4. 🔌 **Use a wired connection** — Ethernet is faster than WiFi\n` +
            `5. 🕐 **Check peak hours** — 8-11 PM may have slight congestion\n` +
            `\nIf the issue persists, our team can run a remote diagnostic. Raise a support ticket with "Network Issue" as the subject.`,
        suggestions: ['Router troubleshooting', 'Raise support ticket', 'Check my speed', 'Upgrade my plan']
    };
}

function generateInstallationResponse() {
    return {
        message: `🔧 **Installation & Setup**\n\n` +
            `**New Connection Process:**\n` +
            `1. 📝 **Choose a plan** — Browse available plans in the Plans section\n` +
            `2. 💳 **Complete payment** — Pay online via UPI, Card, or Net Banking\n` +
            `3. 📅 **Schedule installation** — A technician visit will be scheduled within 2-5 business days\n` +
            `4. 🔧 **Technician visit** — Our engineer will install the router and test your connection\n` +
            `5. ✅ **Go live!** — Start using your broadband immediately\n` +
            `\n**What's included:**\n` +
            `• WiFi router (provided by BroadbandX)\n` +
            `• Professional installation\n` +
            `• Speed test verification\n` +
            `• 24/7 support post-installation\n` +
            `\n📞 For installation queries or to reschedule, raise a support ticket or contact us.`,
        suggestions: ['Show available plans', 'Raise support ticket', 'Check installation status']
    };
}

// ─── Controller ─────────────────────────────────────────────────────
const processMessage = asyncHandler(async (req, res) => {
    const { message } = req.body;
    const userId = req.user._id;

    if (!message || message.trim().length === 0) {
        return res.status(400).json({
            status: 'error',
            message: 'Message is required'
        });
    }

    const { intent, confidence } = detectIntent(message);
    let response;

    try {
        switch (intent) {
            case 'BILLING':
                response = await generateBillingResponse(userId, message);
                break;
            case 'USAGE':
                response = await generateUsageResponse(userId, message);
                break;
            case 'PLAN':
                response = await generatePlanResponse(userId, message);
                break;
            case 'ACCOUNT':
                response = generateAccountResponse(message);
                break;
            case 'SUPPORT':
                response = generateSupportResponse();
                break;
            case 'RENEWAL':
                response = await generateRenewalResponse(userId);
                break;
            case 'REFUND':
                response = await generateRefundResponse(userId);
                break;
            case 'CANCELLATION':
                response = await generateCancellationResponse(userId);
                break;
            case 'NETWORK':
                response = await generateNetworkResponse(userId, message);
                break;
            case 'INSTALLATION':
                response = generateInstallationResponse();
                break;
            case 'GREETING':
                response = generateGreetingResponse(req.user.firstName);
                break;
            case 'THANKS':
                response = generateThanksResponse();
                break;
            default:
                response = generateGeneralResponse(message);
        }
    } catch (err) {
        console.error('Chatbot context fetch error:', err.message);
        response = {
            message: `I encountered an issue fetching your data. Please try again in a moment, or head to the **Support** section to raise a ticket.\n\nError: ${err.message}`,
            suggestions: ['Try again', 'Go to Support']
        };
    }

    res.status(200).json({
        status: 'success',
        data: {
            intent,
            confidence,
            response: response.message,
            suggestions: response.suggestions || [],
            timestamp: new Date().toISOString()
        }
    });
});

const getSuggestions = asyncHandler(async (req, res) => {
    const userId = req.user._id;

    // Generate contextual suggestions based on user state
    const suggestions = [
        'What\'s my usage today?',
        'Why is my bill high?',
        'Which plan is best for me?',
        'When is my next payment?'
    ];

    // Check for overdue bills
    try {
        const overdueInvoices = await Billing.countDocuments({
            user: userId,
            status: 'overdue'
        });
        if (overdueInvoices > 0) {
            suggestions.unshift(`⚠️ I have ${overdueInvoices} overdue payment(s)`);
        }
    } catch (e) { /* non-critical */ }

    res.status(200).json({
        status: 'success',
        data: { suggestions }
    });
});

module.exports = { processMessage, getSuggestions };
