# BroadbandX

**AI-Powered Dynamic Broadband Subscription Management Platform**

[![MERN Stack](https://img.shields.io/badge/Stack-MERN-green.svg)](https://www.mongodb.com/mern-stack)
[![Python ML](https://img.shields.io/badge/ML-Python%20|%20FastAPI-blue.svg)](https://fastapi.tiangolo.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## Overview

BroadbandX is a full-stack broadband subscription management platform with integrated machine learning for churn prediction, customer segmentation, and dynamic pricing optimization. It features separate admin and customer portals, real-time usage analytics, Razorpay payment integration, automated billing, and AI-powered retention tools.

**Key Highlights:**
- 🎯 **94.1% AUC-ROC** churn prediction accuracy (XGBoost)
- 📊 **5 customer segments** with price elasticity modeling
- 💰 **Dynamic pricing engine** with ML-driven proposals
- ⚡ **Real-time** WebSocket notifications & usage tracking
- 🔐 **Separate Admin & Customer login** portals
- 💳 **Razorpay** payment integration with failure tracking
- 📈 **Speed test** with 7-day persistent history

---

## Features

### Customer Portal
| Feature | Description |
|---------|-------------|
| **Dashboard** | Real-time usage stats, subscription status, quick actions |
| **Subscriptions** | Browse plans, subscribe, renew, upgrade/downgrade, cancel |
| **Billing** | Invoice history, PDF downloads, payment status tracking |
| **Speed Test** | Run speed tests with persistent 7-day history (MongoDB-backed) |
| **Usage Analytics** | Real-time data usage monitoring with alerts |
| **Support** | Ticket system with real-time admin responses |
| **Profile** | Account settings, password management |

### Admin Portal
| Feature | Description |
|---------|-------------|
| **Dashboard** | User stats, revenue metrics, real-time usage overview |
| **User Management** | View, edit, activate/deactivate users |
| **Subscriptions** | Manage all subscriptions, track expiry, renewals |
| **AI Pricing** | ML churn predictor, at-risk customers, pricing engine, payment failures |
| **Support** | Admin support dashboard with ticket management |
| **Exports** | CSV exports for usage, invoices, user summaries, payment failures |

### AI/ML Features
| Feature | Description |
|---------|-------------|
| **Churn Prediction** | XGBoost model (87.8% accuracy, 94.1% AUC-ROC) |
| **At-Risk Monitoring** | Automated 6-hour customer scans with real-time alerts |
| **Dynamic Pricing** | Formula-based pricing: `P = P_base × (1 + α·D + β·E + γ·R)` |
| **Customer Segmentation** | K-Means clustering into 5 segments |
| **Payment Failure Tracking** | Auto-logged to CSV/Excel + admin dashboard with stats |

---

## Tech Stack

### Web Application
| Layer | Technology |
|-------|------------|
| Frontend | React 19, TypeScript, Material-UI (MUI) |
| Backend | Node.js, Express.js |
| Database | MongoDB Atlas (Mongoose ODM) |
| Real-time | Socket.io |
| Payments | Razorpay |
| Email | Resend API |
| Auth | JWT (access + refresh tokens), bcrypt |

### ML Service
| Component | Technology |
|-----------|------------|
| API | Python, FastAPI |
| Churn Model | XGBoost (94.1% AUC-ROC) |
| Segmentation | K-Means Clustering (5 segments) |
| Pricing | Multi-factor optimization engine |

---

## Project Structure

```
BroadbandX/
├── .env                        # Environment variables (root)
├── client/                     # React Frontend
│   └── src/
│       ├── components/         # Reusable UI components
│       │   ├── AIPricingDashboard.tsx
│       │   ├── AtRiskCustomersTable.tsx
│       │   ├── ChurnPredictorEnhanced.tsx
│       │   ├── RazorpayPaymentForm.tsx
│       │   ├── SpeedTest.tsx
│       │   ├── SupportCenter.tsx
│       │   ├── billing/        # Billing components
│       │   └── charts/         # Chart components
│       ├── contexts/           # Auth & WebSocket contexts
│       ├── hooks/              # Custom React hooks
│       ├── pages/              # Page components
│       │   ├── AdminDashboard.tsx
│       │   ├── AdminLoginPage.tsx
│       │   ├── CustomerDashboard.tsx
│       │   ├── LoginPage.tsx
│       │   └── HomePage.tsx
│       ├── services/           # API service layer
│       └── types/              # TypeScript types
│
├── server/                     # Node.js Backend
│   ├── controllers/            # Route handlers
│   ├── middleware/              # Auth, error handling, rate limiting
│   ├── models/                 # Mongoose schemas
│   │   ├── User.js
│   │   ├── Subscription.js
│   │   ├── Payment.js
│   │   ├── SpeedTestResult.js
│   │   └── ...
│   ├── routes/                 # API routes
│   ├── services/               # Background services (expiry, usage, churn)
│   ├── utils/                  # Utilities (email, PaymentFailureLogger)
│   ├── scripts/                # Database seed & migration scripts
│   └── server.js               # Main server entry point
│
└── ml/                         # Python ML Service
    ├── api/                    # FastAPI application
    ├── models/                 # ML model classes
    ├── data/                   # Data processing
    ├── training/               # Training scripts
    └── artifacts/              # Trained model files
```

---

## Quick Start

### Prerequisites
- Node.js 18+
- Python 3.10+
- MongoDB Atlas account (or local MongoDB)
- Razorpay account (test mode)

### Installation

```bash
# Clone repository
git clone https://github.com/CodingManiac11/BroadbandX.git
cd BroadbandX

# Install backend dependencies
cd server && npm install

# Install frontend dependencies
cd ../client && npm install

# Install ML dependencies (optional)
cd ../ml && pip install -r requirements.txt
```

### Environment Setup

Create `.env` in the **root folder**:
```env
NODE_ENV=development
PORT=5001
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
JWT_REFRESH_SECRET=your_jwt_refresh_secret
RAZORPAY_KEY_ID=your_razorpay_key
RAZORPAY_KEY_SECRET=your_razorpay_secret
RESEND_API_KEY=your_resend_api_key
CLIENT_URL=http://localhost:3000
ML_SERVICE_URL=http://localhost:8000
ADMIN_EMAIL=your_admin_email@example.com
ENABLE_CHURN_ALERTS=true
```

### Running the Application

```bash
# Terminal 1: Backend
cd server && node server.js

# Terminal 2: Frontend
cd client && npm start

# Terminal 3: ML Service (optional)
cd ml && python -c "import uvicorn; from api.main import app; uvicorn.run(app, host='0.0.0.0', port=8000)"
```

**Access Points:**
| Service | URL |
|---------|-----|
| Customer Portal | http://localhost:3000 |
| Admin Login | http://localhost:3000/admin-login |
| Backend API | http://localhost:5001 |
| ML API Docs | http://localhost:8000/docs |

---

## API Reference

### Authentication
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/register` | POST | User registration |
| `/api/auth/login` | POST | User login (customer & admin) |
| `/api/auth/forgot-password` | POST | Request password reset |
| `/api/auth/refresh-token` | POST | Refresh access token |

### Subscriptions & Payments
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/customer/subscriptions` | GET | Get user subscriptions |
| `/api/customer/subscriptions` | POST | Create subscription |
| `/api/subscriptions/:id/renew` | PUT | Renew subscription |
| `/api/razorpay/create-order` | POST | Create Razorpay order |
| `/api/razorpay/verify` | POST | Verify payment |

### Usage, Billing & Speed Test
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/usage/current` | GET | Current usage stats |
| `/api/billing/invoices` | GET | Get invoices |
| `/api/billing/invoices/:id/download` | GET | Download PDF invoice |
| `/api/speedtest` | POST | Save speed test result |
| `/api/speedtest/history` | GET | Get 7-day speed test history |

### Admin Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/dashboard` | GET | Dashboard stats |
| `/api/admin/payment-failures` | GET | Payment failure records & stats |
| `/api/admin/payment-failures/download` | GET | Download failures CSV |
| `/api/admin/churn-scan` | POST | Trigger ML churn scan |
| `/api/admin/ai-pricing/at-risk-customers` | GET | At-risk customer list |
| `/api/payment-failures/log` | POST | Log client-side payment failure |

---

## ML Pipeline

### Train Models
```bash
cd ml
python -m training.train_all
```

### Model Performance

| Model | Metric | Achieved |
|-------|--------|----------|
| Churn Prediction (XGBoost) | AUC-ROC | **94.1%** |
| Churn Prediction | Accuracy | **87.8%** |
| Churn Prediction | F1-Score | **76.7%** |
| Customer Segmentation (K-Means) | Clusters | **5** |

### Feature Importance (Churn Model)
| Feature | Weight |
|---------|--------|
| Usage Change (30d) | 17.3% |
| Payment Failures (90d) | 16.0% |
| Support Tickets | 10.7% |
| NPS Score | 9.1% |
| Days Since Login | 8.9% |
| Contract Age | 8.3% |

---

## Background Services

The server runs several automated background services:

| Service | Interval | Purpose |
|---------|----------|---------|
| Subscription Expiry | Hourly | Checks & expires subscriptions, handles grace periods |
| Usage Simulator | Periodic | Simulates usage data for demo |
| Churn Monitoring | 6 hours | Scans all customers for churn risk |
| Reminder Scheduler | Daily | Sends billing reminders |
| Usage Analytics | Periodic | Aggregates usage statistics |

---

## Documentation

- [ML Service README](ml/README.md) - Detailed ML pipeline documentation

---

## Author

**Aditya Utsav**  
B.Tech Final Year Project  
GitHub: [@CodingManiac11](https://github.com/CodingManiac11)

---

## License

This project is licensed under the MIT License.