/**
 * Support Ticket Routes
 * Comprehensive API for customer and admin ticket management
 */

const express = require('express');
const router = express.Router();
const SupportTicket = require('../models/SupportTicket');
const User = require('../models/User');
const { authenticateToken, adminOnly } = require('../middleware/auth');

// ==========================================
// CUSTOMER ROUTES
// ==========================================

/**
 * POST /api/support/tickets
 * Create a new support ticket (customer)
 */
router.post('/tickets', authenticateToken, async (req, res) => {
    try {
        const { subject, description, category, priority } = req.body;

        if (!subject || !description) {
            return res.status(400).json({
                success: false,
                message: 'Subject and description are required'
            });
        }

        // Create ticket
        const ticket = new SupportTicket({
            customer: req.user._id,
            customerName: `${req.user.firstName} ${req.user.lastName}`,
            customerEmail: req.user.email,
            subject,
            description,
            category: category || 'general',
            priority: priority || 'medium',
            source: 'web'
        });

        // Calculate SLA
        ticket.calculateSLA();

        // Add initial message
        ticket.messages.push({
            sender: req.user._id,
            senderType: 'customer',
            senderName: `${req.user.firstName} ${req.user.lastName}`,
            content: description
        });

        // AI Analysis (basic keyword detection)
        ticket.aiAnalysis = analyzeTicket(subject, description);

        // Apply AI suggestions
        if (ticket.aiAnalysis.suggestedCategory && !category) {
            ticket.category = ticket.aiAnalysis.suggestedCategory;
        }
        if (ticket.aiAnalysis.suggestedPriority && !priority) {
            ticket.priority = ticket.aiAnalysis.suggestedPriority;
        }

        await ticket.save();

        console.log(`🎫 New ticket created: ${ticket.ticketNumber} by ${req.user.email}`);

        // Emit WebSocket event for real-time updates
        if (global.io) {
            global.io.to('admins').emit('new_ticket', {
                ticketNumber: ticket.ticketNumber,
                subject: ticket.subject,
                priority: ticket.priority,
                customerName: ticket.customerName
            });
        }

        res.status(201).json({
            success: true,
            message: 'Ticket created successfully',
            data: ticket
        });
    } catch (error) {
        console.error('Error creating ticket:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create ticket',
            error: error.message
        });
    }
});

/**
 * GET /api/support/tickets/my
 * Get current user's tickets
 */
router.get('/tickets/my', authenticateToken, async (req, res) => {
    try {
        const { status, page = 1, limit = 20 } = req.query;

        const query = { customer: req.user._id };
        if (status && status !== 'all') {
            query.status = status;
        }

        const tickets = await SupportTicket.find(query)
            .select('-messages')
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(parseInt(limit));

        const total = await SupportTicket.countDocuments(query);

        res.json({
            success: true,
            data: {
                tickets,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / limit)
                }
            }
        });
    } catch (error) {
        console.error('Error fetching user tickets:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch tickets',
            error: error.message
        });
    }
});

/**
 * GET /api/support/tickets/:id
 * Get a specific ticket (with messages)
 */
router.get('/tickets/:id', authenticateToken, async (req, res) => {
    try {
        const ticket = await SupportTicket.findById(req.params.id)
            .populate('customer', 'firstName lastName email')
            .populate('assignedTo', 'firstName lastName email');

        if (!ticket) {
            return res.status(404).json({
                success: false,
                message: 'Ticket not found'
            });
        }

        // Customers can only view their own tickets
        if (req.user.role !== 'admin' && ticket.customer._id.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        // Filter out internal messages for customers
        if (req.user.role !== 'admin') {
            ticket.messages = ticket.messages.filter(m => !m.isInternal);
        }

        res.json({
            success: true,
            data: ticket
        });
    } catch (error) {
        console.error('Error fetching ticket:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch ticket',
            error: error.message
        });
    }
});

/**
 * POST /api/support/tickets/:id/messages
 * Add a message to a ticket
 */
router.post('/tickets/:id/messages', authenticateToken, async (req, res) => {
    try {
        const { content, isInternal } = req.body;

        if (!content || !content.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Message content is required'
            });
        }

        const ticket = await SupportTicket.findById(req.params.id);

        if (!ticket) {
            return res.status(404).json({
                success: false,
                message: 'Ticket not found'
            });
        }

        // Customers can only message their own tickets
        const isAdmin = req.user.role === 'admin';
        if (!isAdmin && ticket.customer.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        // Add message
        const message = {
            sender: req.user._id,
            senderType: isAdmin ? 'agent' : 'customer',
            senderName: `${req.user.firstName} ${req.user.lastName}`,
            content: content.trim(),
            isInternal: isAdmin ? (isInternal || false) : false
        };

        ticket.addMessage(message);
        ticket.lastUpdatedBy = req.user._id;

        // Update status based on who replied
        if (isAdmin && ticket.status === 'open') {
            ticket.status = 'in-progress';
        } else if (!isAdmin && ticket.status === 'pending-customer') {
            ticket.status = 'in-progress';
        }

        await ticket.save();

        // Emit WebSocket event
        if (global.io) {
            const room = isAdmin ? `user_${ticket.customer}` : 'admins';
            global.io.to(room).emit('ticket_message', {
                ticketId: ticket._id,
                ticketNumber: ticket.ticketNumber,
                message: isInternal ? null : message
            });
        }

        res.json({
            success: true,
            message: 'Message added',
            data: message
        });
    } catch (error) {
        console.error('Error adding message:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to add message',
            error: error.message
        });
    }
});

/**
 * POST /api/support/tickets/:id/rate
 * Rate a resolved ticket (customer)
 */
router.post('/tickets/:id/rate', authenticateToken, async (req, res) => {
    try {
        const { rating, feedback } = req.body;

        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({
                success: false,
                message: 'Rating must be between 1 and 5'
            });
        }

        const ticket = await SupportTicket.findById(req.params.id);

        if (!ticket) {
            return res.status(404).json({
                success: false,
                message: 'Ticket not found'
            });
        }

        if (ticket.customer.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        if (!['resolved', 'closed'].includes(ticket.status)) {
            return res.status(400).json({
                success: false,
                message: 'Can only rate resolved or closed tickets'
            });
        }

        ticket.satisfaction = {
            rating,
            feedback: feedback || '',
            ratedAt: new Date()
        };

        await ticket.save();

        res.json({
            success: true,
            message: 'Thank you for your feedback!',
            data: ticket.satisfaction
        });
    } catch (error) {
        console.error('Error rating ticket:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to rate ticket',
            error: error.message
        });
    }
});

// ==========================================
// ADMIN ROUTES
// ==========================================

/**
 * GET /api/support/admin/tickets
 * Get all tickets (admin)
 */
router.get('/admin/tickets', authenticateToken, adminOnly, async (req, res) => {
    try {
        const {
            status,
            priority,
            category,
            assignedTo,
            search,
            page = 1,
            limit = 20
        } = req.query;

        const query = {};

        if (status && status !== 'all') query.status = status;
        if (priority && priority !== 'all') query.priority = priority;
        if (category && category !== 'all') query.category = category;
        if (assignedTo) query.assignedTo = assignedTo;
        if (search) {
            query.$or = [
                { ticketNumber: { $regex: search, $options: 'i' } },
                { subject: { $regex: search, $options: 'i' } },
                { customerName: { $regex: search, $options: 'i' } },
                { customerEmail: { $regex: search, $options: 'i' } }
            ];
        }

        const tickets = await SupportTicket.find(query)
            .populate('customer', 'firstName lastName email')
            .populate('assignedTo', 'firstName lastName')
            .select('-messages')
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(parseInt(limit));

        const total = await SupportTicket.countDocuments(query);

        // Get summary counts (all-time for dashboard cards)
        const summary = await SupportTicket.getStatistics(0);

        res.json({
            success: true,
            data: {
                tickets,
                summary,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / limit)
                }
            }
        });
    } catch (error) {
        console.error('Error fetching admin tickets:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch tickets',
            error: error.message
        });
    }
});

/**
 * GET /api/support/admin/statistics
 * Get ticket statistics (admin)
 */
router.get('/admin/statistics', authenticateToken, adminOnly, async (req, res) => {
    try {
        const { days = 7 } = req.query;

        const [statistics, categoryBreakdown, agentPerformance] = await Promise.all([
            SupportTicket.getStatistics(parseInt(days)),
            SupportTicket.getCategoryBreakdown(),
            SupportTicket.getAgentPerformance(parseInt(days))
        ]);

        res.json({
            success: true,
            data: {
                statistics,
                categoryBreakdown,
                agentPerformance
            }
        });
    } catch (error) {
        console.error('Error fetching statistics:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch statistics',
            error: error.message
        });
    }
});

/**
 * PUT /api/support/admin/tickets/:id/assign
 * Assign ticket to an agent (admin)
 */
router.put('/admin/tickets/:id/assign', authenticateToken, adminOnly, async (req, res) => {
    try {
        const { agentId } = req.body;

        const ticket = await SupportTicket.findById(req.params.id);

        if (!ticket) {
            return res.status(404).json({
                success: false,
                message: 'Ticket not found'
            });
        }

        const agent = await User.findById(agentId);
        if (!agent || agent.role !== 'admin') {
            return res.status(400).json({
                success: false,
                message: 'Invalid agent'
            });
        }

        ticket.assignedTo = agent._id;
        ticket.assignedToName = `${agent.firstName} ${agent.lastName}`;
        ticket.assignedAt = new Date();
        ticket.status = 'assigned';
        ticket.lastUpdatedBy = req.user._id;

        // Add system message
        ticket.messages.push({
            sender: req.user._id,
            senderType: 'system',
            senderName: 'System',
            content: `Ticket assigned to ${agent.firstName} ${agent.lastName}`,
            isInternal: true
        });

        await ticket.save();

        // Notify the assigned agent
        if (global.io) {
            global.io.to(`user_${agent._id}`).emit('ticket_assigned', {
                ticketId: ticket._id,
                ticketNumber: ticket.ticketNumber,
                subject: ticket.subject
            });
        }

        console.log(`📋 Ticket ${ticket.ticketNumber} assigned to ${agent.email}`);

        res.json({
            success: true,
            message: `Ticket assigned to ${agent.firstName}`,
            data: ticket
        });
    } catch (error) {
        console.error('Error assigning ticket:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to assign ticket',
            error: error.message
        });
    }
});

/**
 * PUT /api/support/admin/tickets/:id/status
 * Update ticket status (admin)
 */
router.put('/admin/tickets/:id/status', authenticateToken, adminOnly, async (req, res) => {
    try {
        const { status } = req.body;
        const validStatuses = ['open', 'assigned', 'in-progress', 'pending-customer', 'resolved', 'closed'];

        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status'
            });
        }

        const ticket = await SupportTicket.findById(req.params.id);

        if (!ticket) {
            return res.status(404).json({
                success: false,
                message: 'Ticket not found'
            });
        }

        const oldStatus = ticket.status;
        ticket.status = status;
        ticket.lastUpdatedBy = req.user._id;

        if (status === 'resolved') {
            ticket.resolve(req.user._id);
        }

        // Add system message
        ticket.messages.push({
            sender: req.user._id,
            senderType: 'system',
            senderName: 'System',
            content: `Status changed from ${oldStatus} to ${status}`,
            isInternal: true
        });

        await ticket.save();

        // Notify customer
        if (global.io && ['resolved', 'closed'].includes(status)) {
            global.io.to(`user_${ticket.customer}`).emit('ticket_resolved', {
                ticketId: ticket._id,
                ticketNumber: ticket.ticketNumber,
                status
            });
        }

        res.json({
            success: true,
            message: `Ticket status updated to ${status}`,
            data: ticket
        });
    } catch (error) {
        console.error('Error updating ticket status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update status',
            error: error.message
        });
    }
});

/**
 * PUT /api/support/admin/tickets/:id/priority
 * Update ticket priority (admin)
 */
router.put('/admin/tickets/:id/priority', authenticateToken, adminOnly, async (req, res) => {
    try {
        const { priority } = req.body;
        const validPriorities = ['low', 'medium', 'high', 'urgent'];

        if (!validPriorities.includes(priority)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid priority'
            });
        }

        const ticket = await SupportTicket.findById(req.params.id);

        if (!ticket) {
            return res.status(404).json({
                success: false,
                message: 'Ticket not found'
            });
        }

        const oldPriority = ticket.priority;
        ticket.priority = priority;
        ticket.lastUpdatedBy = req.user._id;

        // Recalculate SLA if priority changed
        if (oldPriority !== priority) {
            ticket.calculateSLA();
        }

        await ticket.save();

        res.json({
            success: true,
            message: `Priority updated to ${priority}`,
            data: ticket
        });
    } catch (error) {
        console.error('Error updating priority:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update priority',
            error: error.message
        });
    }
});

/**
 * PUT /api/support/admin/tickets/:id/escalate
 * Escalate a ticket (admin)
 */
router.put('/admin/tickets/:id/escalate', authenticateToken, adminOnly, async (req, res) => {
    try {
        const { reason } = req.body;

        const ticket = await SupportTicket.findById(req.params.id);

        if (!ticket) {
            return res.status(404).json({
                success: false,
                message: 'Ticket not found'
            });
        }

        ticket.escalated = true;
        ticket.escalatedAt = new Date();
        ticket.escalationReason = reason || 'Escalated by admin';
        ticket.priority = 'urgent';
        ticket.lastUpdatedBy = req.user._id;

        // Add system message
        ticket.messages.push({
            sender: req.user._id,
            senderType: 'system',
            senderName: 'System',
            content: `🚨 Ticket escalated: ${reason || 'No reason provided'}`,
            isInternal: true
        });

        await ticket.save();

        // Notify all admins
        if (global.io) {
            global.io.to('admins').emit('ticket_escalated', {
                ticketId: ticket._id,
                ticketNumber: ticket.ticketNumber,
                reason
            });
        }

        console.log(`🚨 Ticket ${ticket.ticketNumber} ESCALATED: ${reason}`);

        res.json({
            success: true,
            message: 'Ticket escalated',
            data: ticket
        });
    } catch (error) {
        console.error('Error escalating ticket:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to escalate ticket',
            error: error.message
        });
    }
});

/**
 * GET /api/support/admin/agents
 * Get available agents for assignment (admin)
 */
router.get('/admin/agents', authenticateToken, adminOnly, async (req, res) => {
    try {
        const agents = await User.find({ role: 'admin' })
            .select('firstName lastName email');

        // Get ticket counts for each agent
        const agentCounts = await SupportTicket.aggregate([
            { $match: { assignedTo: { $exists: true }, status: { $nin: ['resolved', 'closed'] } } },
            { $group: { _id: '$assignedTo', openTickets: { $sum: 1 } } }
        ]);

        const countMap = {};
        agentCounts.forEach(a => { countMap[a._id.toString()] = a.openTickets; });

        const agentsWithCounts = agents.map(agent => ({
            _id: agent._id,
            name: `${agent.firstName} ${agent.lastName}`,
            email: agent.email,
            openTickets: countMap[agent._id.toString()] || 0
        }));

        res.json({
            success: true,
            data: agentsWithCounts
        });
    } catch (error) {
        console.error('Error fetching agents:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch agents',
            error: error.message
        });
    }
});

// ==========================================
// AI HELPER FUNCTIONS
// ==========================================

/**
 * Analyze ticket content for auto-categorization and priority
 */
function analyzeTicket(subject, description) {
    const text = `${subject} ${description}`.toLowerCase();

    const analysis = {
        suggestedCategory: 'general',
        suggestedPriority: 'medium',
        sentimentScore: 0,
        keyTerms: [],
        suggestedResponses: []
    };

    // Category detection
    const categoryKeywords = {
        technical: ['error', 'bug', 'crash', 'not working', 'issue', 'problem', 'slow', 'router', 'modem', 'connection'],
        billing: ['bill', 'invoice', 'payment', 'charge', 'refund', 'price', 'cost', 'money', 'account balance'],
        service: ['upgrade', 'downgrade', 'plan', 'subscription', 'speed', 'data', 'limit'],
        network: ['internet', 'wifi', 'disconnect', 'outage', 'no connection', 'speed test', 'bandwidth'],
        account: ['password', 'login', 'account', 'profile', 'email', 'username', 'verification']
    };

    for (const [category, keywords] of Object.entries(categoryKeywords)) {
        if (keywords.some(kw => text.includes(kw))) {
            analysis.suggestedCategory = category;
            analysis.keyTerms = keywords.filter(kw => text.includes(kw));
            break;
        }
    }

    // Priority detection
    const urgentKeywords = ['urgent', 'emergency', 'critical', 'asap', 'immediately', 'down', 'outage', 'not working at all'];
    const highKeywords = ['important', 'serious', 'major', 'significant', 'broken'];

    if (urgentKeywords.some(kw => text.includes(kw))) {
        analysis.suggestedPriority = 'urgent';
    } else if (highKeywords.some(kw => text.includes(kw))) {
        analysis.suggestedPriority = 'high';
    }

    // Sentiment detection (basic)
    const negativeWords = ['angry', 'frustrated', 'terrible', 'worst', 'awful', 'horrible', 'hate', 'disappointed'];
    const positiveWords = ['thank', 'appreciate', 'great', 'good', 'helpful', 'excellent'];

    const negCount = negativeWords.filter(w => text.includes(w)).length;
    const posCount = positiveWords.filter(w => text.includes(w)).length;
    analysis.sentimentScore = (posCount - negCount) / Math.max(1, posCount + negCount);

    // Suggested responses based on category
    const suggestedResponses = {
        technical: [
            "Thank you for reaching out. Can you please provide more details about the error you're experiencing?",
            "Have you tried restarting your router? This often resolves common connectivity issues."
        ],
        billing: [
            "Thank you for contacting us about your billing concern. Let me review your account.",
            "I understand billing issues can be frustrating. I'll look into this right away."
        ],
        network: [
            "I'm sorry to hear you're experiencing connectivity issues. Let me check the network status in your area.",
            "Can you please run a speed test at speedtest.net and share the results?"
        ],
        general: [
            "Thank you for contacting BroadbandX support. I'll be happy to help you.",
            "I appreciate you reaching out. Let me look into this for you."
        ]
    };

    analysis.suggestedResponses = suggestedResponses[analysis.suggestedCategory] || suggestedResponses.general;

    return analysis;
}

module.exports = router;
