/**
 * SupportTicket Model
 * Comprehensive support ticket system with categories, SLA, assignments, and message threads
 */

const mongoose = require('mongoose');

// Message schema for ticket conversation thread
const ticketMessageSchema = new mongoose.Schema({
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    senderType: {
        type: String,
        enum: ['customer', 'agent', 'system'],
        required: true
    },
    senderName: String,
    content: {
        type: String,
        required: true
    },
    attachments: [{
        name: String,
        url: String,
        type: String,
        size: Number
    }],
    isInternal: {
        type: Boolean,
        default: false // Internal notes not visible to customer
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Main ticket schema
const supportTicketSchema = new mongoose.Schema({
    // Ticket identification
    ticketNumber: {
        type: String,
        unique: true,
        required: true
    },

    // Customer info
    customer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    customerName: String,
    customerEmail: String,

    // Ticket details
    subject: {
        type: String,
        required: true,
        maxlength: 200
    },
    description: {
        type: String,
        required: true
    },

    // Classification
    category: {
        type: String,
        enum: ['technical', 'billing', 'service', 'account', 'network', 'general'],
        default: 'general'
    },
    subcategory: String,
    tags: [String],

    // Priority & Status
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium'
    },
    status: {
        type: String,
        enum: ['open', 'assigned', 'in-progress', 'pending-customer', 'resolved', 'closed'],
        default: 'open'
    },

    // Assignment
    assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    assignedToName: String,
    assignedAt: Date,

    // SLA tracking
    sla: {
        responseDeadline: Date,
        resolutionDeadline: Date,
        firstResponseAt: Date,
        resolvedAt: Date,
        responseBreached: { type: Boolean, default: false },
        resolutionBreached: { type: Boolean, default: false }
    },

    // Conversation thread
    messages: [ticketMessageSchema],
    messageCount: {
        type: Number,
        default: 0
    },

    // AI-generated data
    aiAnalysis: {
        suggestedCategory: String,
        suggestedPriority: String,
        sentimentScore: Number, // -1 to 1
        suggestedResponses: [String],
        keyTerms: [String]
    },

    // Related data
    relatedSubscription: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subscription'
    },

    // Customer satisfaction
    satisfaction: {
        rating: { type: Number, min: 1, max: 5 },
        feedback: String,
        ratedAt: Date
    },

    // Metadata
    source: {
        type: String,
        enum: ['web', 'email', 'phone', 'chat', 'api'],
        default: 'web'
    },
    escalated: {
        type: Boolean,
        default: false
    },
    escalatedAt: Date,
    escalationReason: String,

    // Audit
    lastUpdatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

// Indexes for efficient queries
supportTicketSchema.index({ ticketNumber: 1 });
supportTicketSchema.index({ customer: 1, createdAt: -1 });
supportTicketSchema.index({ assignedTo: 1, status: 1 });
supportTicketSchema.index({ status: 1, priority: 1 });
supportTicketSchema.index({ category: 1 });
supportTicketSchema.index({ createdAt: -1 });

// Generate ticket number before validation (must run before save validation)
supportTicketSchema.pre('validate', async function (next) {
    if (this.isNew && !this.ticketNumber) {
        const count = await mongoose.model('SupportTicket').countDocuments();
        this.ticketNumber = `TICK-${String(count + 1).padStart(5, '0')}`;
    }

    // Update message count
    this.messageCount = this.messages.length;

    next();
});

// Calculate SLA deadlines
supportTicketSchema.methods.calculateSLA = function () {
    const now = new Date();
    const hoursToMs = (hours) => hours * 60 * 60 * 1000;

    // SLA based on priority
    const slaHours = {
        urgent: { response: 1, resolution: 4 },
        high: { response: 4, resolution: 24 },
        medium: { response: 8, resolution: 48 },
        low: { response: 24, resolution: 72 }
    };

    const sla = slaHours[this.priority] || slaHours.medium;

    this.sla.responseDeadline = new Date(now.getTime() + hoursToMs(sla.response));
    this.sla.resolutionDeadline = new Date(now.getTime() + hoursToMs(sla.resolution));

    return this;
};

// Add a message to the ticket
supportTicketSchema.methods.addMessage = function (message) {
    this.messages.push(message);
    this.messageCount = this.messages.length;

    // Mark first response time
    if (message.senderType === 'agent' && !this.sla.firstResponseAt) {
        this.sla.firstResponseAt = new Date();

        // Check if response SLA breached
        if (this.sla.responseDeadline && new Date() > this.sla.responseDeadline) {
            this.sla.responseBreached = true;
        }
    }

    return this;
};

// Resolve ticket
supportTicketSchema.methods.resolve = function (agentId) {
    this.status = 'resolved';
    this.sla.resolvedAt = new Date();
    this.lastUpdatedBy = agentId;

    // Check if resolution SLA breached
    if (this.sla.resolutionDeadline && new Date() > this.sla.resolutionDeadline) {
        this.sla.resolutionBreached = true;
    }

    return this;
};

// Static: Get ticket statistics
supportTicketSchema.statics.getStatistics = async function (dateRange = 0) {
    const pipeline = [];

    // Only filter by date if dateRange is specified and > 0
    if (dateRange && dateRange > 0) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - dateRange);
        pipeline.push({ $match: { createdAt: { $gte: startDate } } });
    }

    pipeline.push({
        $group: {
            _id: null,
            total: { $sum: 1 },
            open: { $sum: { $cond: [{ $eq: ['$status', 'open'] }, 1, 0] } },
            inProgress: { $sum: { $cond: [{ $in: ['$status', ['assigned', 'in-progress']] }, 1, 0] } },
            resolved: { $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] } },
            closed: { $sum: { $cond: [{ $eq: ['$status', 'closed'] }, 1, 0] } },
            urgent: { $sum: { $cond: [{ $eq: ['$priority', 'urgent'] }, 1, 0] } },
            high: { $sum: { $cond: [{ $eq: ['$priority', 'high'] }, 1, 0] } },
            avgSatisfaction: { $avg: '$satisfaction.rating' },
            slaBreached: { $sum: { $cond: ['$sla.responseBreached', 1, 0] } }
        }
    });

    const stats = await this.aggregate(pipeline);

    return stats[0] || {
        total: 0, open: 0, inProgress: 0, resolved: 0, closed: 0,
        urgent: 0, high: 0, avgSatisfaction: null, slaBreached: 0
    };
};

// Static: Get category breakdown
supportTicketSchema.statics.getCategoryBreakdown = async function () {
    return this.aggregate([
        {
            $group: {
                _id: '$category',
                count: { $sum: 1 }
            }
        },
        { $sort: { count: -1 } }
    ]);
};

// Static: Get agent performance
supportTicketSchema.statics.getAgentPerformance = async function (dateRange = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - dateRange);

    return this.aggregate([
        {
            $match: {
                assignedTo: { $exists: true, $ne: null },
                createdAt: { $gte: startDate }
            }
        },
        {
            $group: {
                _id: '$assignedTo',
                totalTickets: { $sum: 1 },
                resolved: { $sum: { $cond: [{ $in: ['$status', ['resolved', 'closed']] }, 1, 0] } },
                avgResponseTime: {
                    $avg: {
                        $subtract: ['$sla.firstResponseAt', '$createdAt']
                    }
                },
                avgSatisfaction: { $avg: '$satisfaction.rating' }
            }
        },
        {
            $lookup: {
                from: 'users',
                localField: '_id',
                foreignField: '_id',
                as: 'agent'
            }
        },
        { $unwind: '$agent' },
        {
            $project: {
                agentName: { $concat: ['$agent.firstName', ' ', '$agent.lastName'] },
                agentEmail: '$agent.email',
                totalTickets: 1,
                resolved: 1,
                resolutionRate: { $multiply: [{ $divide: ['$resolved', '$totalTickets'] }, 100] },
                avgResponseTimeHours: { $divide: ['$avgResponseTime', 3600000] },
                avgSatisfaction: 1
            }
        },
        { $sort: { totalTickets: -1 } }
    ]);
};

module.exports = mongoose.model('SupportTicket', supportTicketSchema);
