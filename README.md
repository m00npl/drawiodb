# DrawIO DB - Decentralized Diagram Editor

A decentralized diagram editor built on DrawIO with Arkiv blockchain storage integration. Store your diagrams permanently on the blockchain with cryptographic security.

## 🌐 Live Demo

**[https://drawiodb.online](https://drawiodb.online)**

## ✨ Features

- **Blockchain Storage**: Store diagrams permanently on Arkiv blockchain
- **DrawIO Integration**: Full-featured diagram editor with all DrawIO capabilities
- **Multiple Authentication**: Support for MetaMask wallet, custodial accounts, and guest mode
- **Decentralized**: No central server required for diagram storage
- **Secure**: End-to-end encryption and blockchain immutability
- **Free & Open Source**: MIT licensed, community-driven development

## 🚀 Quick Start

### Prerequisites

- Docker and Docker Compose
- Node.js 18+ (for development)
- Bun runtime (preferred package manager)

### Environment Setup

1. Clone the repository:

```bash
git clone https://github.com/m00npl/drawiodb.git
cd drawiodb
```

2. Copy environment configuration:

```bash
cp .env.example .env
```

3. Configure your environment variables in `.env`:

```env
# Arkiv Configuration (Kaolin Testnet)
GOLEM_CHAIN_ID=60138453025
GOLEM_PRIVATE_KEY=your_private_key_here
GOLEM_RPC_URL=https://kaolin.hoodi.arkiv.network/rpc
GOLEM_WS_URL=wss://kaolin.hoodi.arkiv.network/rpc/ws

# Server Configuration
PORT=3000
NODE_ENV=development
```

Before running the server locally, copy the DrawIO public assets:

```bash
cp -r drawio-public public
```

### Deployment Options

#### Option 1: Docker Compose (Recommended)

```bash
# Build and start services
docker compose up -d

# View logs
docker compose logs -f
```

Access the application at `http://localhost:8900`

#### Option 2: Development Mode

```bash
# Install dependencies
bun install

# Build the project
bun run build

# Start development server
bun run dev
```

### Production Deployment

#### Server Setup

1. **Prepare your server**:
   - Ubuntu 20.04+ recommended
   - Docker and Docker Compose installed
   - Domain name pointing to your server IP

2. **Clone and configure**:

   ```bash
   git clone https://github.com/m00npl/drawiodb.git
   cd drawiodb
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Deploy with Docker**:

   ```bash
   docker compose up -d
   ```

#### Domain Configuration

For production deployment with custom domain:

1. **DNS Setup**: Point your domain A record to your server IP
2. **Reverse Proxy**: Use nginx-proxy-manager or similar for SSL termination
3. **SSL Certificate**: Automatic Let's Encrypt certificates recommended

Example nginx configuration:

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:8900;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `GOLEM_CHAIN_ID` | Arkiv chain ID | Yes | `60138453025` |
| `GOLEM_PRIVATE_KEY` | Your funded private key | No* | - |
| `GOLEM_RPC_URL` | Arkiv RPC endpoint | Yes | - |
| `GOLEM_WS_URL` | Arkiv WebSocket endpoint | Yes | - |
| `PORT` | Server port | No | `3000` |
| `NODE_ENV` | Environment mode | No | `development` |

*Note: If `GOLEM_PRIVATE_KEY` is not provided, the backend runs in read-only mode and users must sign transactions with MetaMask.

### Docker Configuration

The application runs as a single service:

- **drawiodb**: Unified application serving both the DrawIO interface (static files) and Backend API for Arkiv operations

The service uses port 8080 and handles all requests through a single container.

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   DrawIO UI     │───▶│   Backend API    │───▶│   Arkiv      │
│   (Frontend)    │    │   (Node.js)      │    │   (Blockchain)  │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### Key Components

- **Frontend**: Modified DrawIO with Arkiv plugin integration
- **Backend**: Hono.js API server handling blockchain operations
- **Storage**: Arkiv blockchain for permanent diagram storage
- **Authentication**: MetaMask, custodial, or guest mode options

## 🛠️ Development

### Project Structure

```
drawio/
├── src/                    # Backend source code
├── drawio-custom/          # Modified DrawIO files
├── drawio-public/          # DrawIO public assets
├── dist/                   # Compiled backend
├── docker-compose.yml      # Docker services
├── Dockerfile             # Container definition
└── README.md              # This file
```

### Building from Source

```bash
# Install dependencies
bun install

# Build backend
bun run build

# Run tests
bun run test

# Start development server
bun run dev
```

### Testing

```bash
# Run comprehensive test suite
bun run test:all

# Run specific test types
bun run test:api
bun run test:ui
```

## 📝 Usage

### Creating Diagrams

1. **Open DrawIO DB**: Navigate to your deployment URL
2. **Choose Authentication**: Select wallet, custodial, or guest mode
3. **Create Diagram**: Use the full DrawIO interface to create your diagram
4. **Save to Blockchain**: Use "File → Save to Arkiv" to store permanently

### Managing Diagrams

- **Load from Blockchain**: Use "File → Open from Arkiv"
- **Share Diagrams**: Generate shareable links for public diagrams
- **Export Options**: Export to various formats (PNG, JPG, SVG, PDF)

## 🔐 Security

- **Private Keys**: Never commit private keys to version control
- **Environment Variables**: Use `.env` files for sensitive configuration
- **HTTPS**: Always use HTTPS in production
- **Blockchain Security**: Diagrams are cryptographically secured on-chain

## 🤝 Contributing

We welcome contributions! Please see our contributing guidelines:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License. See [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Issues**: [GitHub Issues](https://github.com/m00npl/drawiodb/issues)
- **Discussions**: [GitHub Discussions](https://github.com/m00npl/drawiodb/discussions)
- **Demo**: [https://drawiodb.online](https://drawiodb.online)

## 🔗 Links

- **Live Demo**: [https://drawiodb.online](https://drawiodb.online)
- **Arkiv**: [https://golemdb.io](https://golemdb.io)
- **DrawIO**: [https://drawio.com](https://drawio.com)

---

**Made with ❤️ for the decentralized web**
