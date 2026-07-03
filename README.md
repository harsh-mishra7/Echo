# 🤖 ECHO - AI-Powered Customer Support Platform

> **Transform your customer support with AI-powered chatbots and voice assistants**

A comprehensive B2B SaaS platform that enables businesses to integrate intelligent chatbots with voice capabilities directly into their applications. Built with modern technologies and designed for scalability.

![Dashboard](https://harshmishra-echo-web.vercel.app/dashboard.png)
![Chat Bot](https://harshmishra-echo-widget.vercel.app/widget.png)

## ✨ Features

### 🎯 **Core Capabilities**

- **Intelligent Chatbots** - AI-powered conversational assistants that understand context
- **Voice Integration** - Seamless voice calls and phone support via Vapi
- **Multi-Platform Embedding** - Easy integration across web, mobile, and desktop applications
- **Real-time Analytics** - Comprehensive dashboard with conversation insights
- **Knowledge Base Management** - Centralized content management for AI responses

### 🛠️ **Platform Features**

- **Multi-tenant Architecture** - Secure, isolated environments for each organization
- **Widget Customization** - Branded chat widgets that match your application's design
- **Phone Number Management** - Dedicated phone numbers with AI assistants
- **Conversation History** - Complete audit trail of customer interactions
- **Human Handoff** - Seamless escalation to human agents when needed

### 🔧 **Developer Experience**

- **Multiple Integration Options** - HTML, React, Next.js, and JavaScript SDKs
- **RESTful APIs** - Comprehensive API access for custom integrations
- **Webhook Support** - Real-time notifications and data synchronization
- **Organization Management** - Multi-organization support with role-based access

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- pnpm 8+
- Convex account
- Clerk account (for authentication)
- Vapi account (for voice features)

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/harsh-mishra7/Project_Next_BP-Echo
   cd Project_Next_BP-Echo
   ```

2. **Install dependencies**

   ```bash
   pnpm install
   ```

3. **Environment Setup**

   ```bash
   # Copy environment files
   cp .env.example .env.local

   # Configure your environment variables
   # See Configuration section below
   ```

4. **Start development servers**

   ```bash
   # Start all services
   pnpm dev

   # Or start individually
   pnpm dev:web      # Dashboard application
   pnpm dev:widget   # Chat widget
   ```

## 🏗️ Architecture

This is a **monorepo** built with **Turborepo** containing:

```
├── apps/
│   ├── web/                  # Dashboard application (Next.js)
│   └── widget/               # Embeddable chat widget (Next.js)
│   └── embed/                # Script file (Vite)
├── packages/
│   ├── ui/                   # Shared UI components
│   ├── backend/              # Backend code
│   ├── eslint-config/        # Shared configurations
│   └── typescript-config/    # TypeScript definitions
└── Readme/                     # Documentation
```

### Tech Stack

| Category             | Technology                                                     | Purpose                            |
| -------------------- | -------------------------------------------------------------- | ---------------------------------- |
| **Monorepo**         | [Turborepo](https://turbo.build/)                              | Monorepo management                |
| **Package Manager**  | [pnpm](https://pnpm.io/)                                       | Fast, efficient package management |
| **Frontend**         | [React](https://reactjs.org/) + [Next.js](https://nextjs.org/) | Web application framework          |
| **Language**         | [TypeScript](https://www.typescriptlang.org/)                  | Type-safe development              |
| **State Management** | [Jotai](https://jotai.org/)                                    | Atomic state management            |
| **Styling**          | [Tailwind CSS](https://tailwindcss.com/)                       | Utility-first CSS framework        |
| **UI Components**    | [shadcn/ui](https://ui.shadcn.com/)                            | Beautiful, accessible components   |
| **Database**         | [Convex](https://convex.dev/)                                  | Real-time database and backend     |
| **Authentication**   | [Clerk](https://clerk.dev/)                                    | User authentication and management |
| **AI/Voice**         | [Vapi](https://vapi.dev/) + [Gemini](https://ai.google.dev/)   | Voice AI and language models       |
| **Monitoring**       | [Sentry](https://sentry.io/)                                   | Error tracking and monitoring      |
| **Deployment**       | [Vercel](https://vercel.com/)                                  | Serverless deployment platform     |

## 🎯 Usage

### For Platform Administrators

1. **Access the Dashboard**
   - Navigate to your deployed dashboard URL
   - Sign in with your Clerk account
   - Manage organizations, users, and configurations

2. **Configure Voice Assistant**
   - Go to Voice Assistant settings
   - Connect your Vapi account
   - Configure phone numbers and AI assistants

### For Client Integration

1. **Get Integration Code**
   - Go to Setup & Integrations
   - Copy your organization ID
   - Choose your preferred integration method (HTML/React/Next.js/JavaScript)

2. **Embed the Widget**

   ```html
   <!-- HTML Integration -->
   <script
     src="https://your-widget-domain/widget.js"
     data-organization-id="org_32fjkdfbsiuahlbddjlfbsakj"
   ></script>
   ```

   ```jsx
   // React Integration
   import ChatWidget from "@your-org/chat-widget";

   function App() {
     return <ChatWidget organizationId="org_32fjkdfbsiuahlbddjlfbsakj" />;
   }
   ```

## 📊 Features Showcase

### Dashboard Management

- **Conversation Tracking** - Monitor all customer interactions
- **AI Assistant Configuration** - Customize responses and behavior
- **Knowledge Base Management** - Upload and manage support documents
- **Analytics & Reporting** - Detailed insights into customer engagement

### Voice Integration

- **AI Phone Support** - Automated phone answering with natural conversation
- **Call Routing** - Smart routing to appropriate departments or agents
- **Voice Analytics** - Call quality metrics and conversation insights

### Widget Customization

- **Brand Matching** - Customize colors, fonts, and styling
- **Multi-language Support** - Localization for global audiences
- **Responsive Design** - Perfect experience across all devices

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

<div align="center">

Made with ❤️ by Harsh Mishra

</div>
