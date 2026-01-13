# 📊 Exact Exporter - Exact Online Transaction Exporter

![Exact Exporter Logo](public/logo.svg)

A modern, cross-platform desktop application for exporting financial transactions from Exact Online. Built with Tauri, React, and Rust.

## ✨ Features

- **🔐 OAuth2 Authentication** - Secure login with Exact Online
- **🏢 Division Selection** - Choose from available divisions with searchable combobox
- **📋 Transaction Fetching** - Retrieve financial transactions from Exact Online API
- **🔍 OData Filtering** - Apply custom filters using OData query syntax
- **📊 Data Table** - View transactions in a sortable, paginated table
- **📥 CSV Export** - Export all transactions to CSV format
- **📈 Progress Tracking** - Real-time progress updates during data fetching
- **🌙 Dark Mode Support** - Beautiful dark and light themes
- **📱 Cross-platform** - Works on Windows, macOS, and Linux

## 🛠️ Tech Stack

- **Frontend**: React 19 + TypeScript + Tailwind CSS + shadcn/ui
- **Backend**: Rust + Tauri
- **API Integration**: Exact Online REST API
- **Data Table**: TanStack Table (React Table)
- **Build Tools**: Vite + pnpm
- **Deployment**: GitHub Actions with semantic release

## 🚀 Quick Start

### Prerequisites

- [Rust](https://rustup.rs/) (latest stable)
- [Node.js](https://nodejs.org/) (v18 or later)
- [pnpm](https://pnpm.io/) package manager
- Exact Online API credentials (Client ID and Client Secret)

### Recommended Development Tools

For the best development experience, we recommend:

- **[asdf](https://asdf-vm.com/)** - Universal version manager for Node.js and Rust
- **[direnv](https://direnv.net/)** - Automatic environment variable management

**Quick setup:**

```bash
asdf install    # Install required versions
direnv allow    # Allow environment variables
```

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/reneweteling/exact_gui.git
   cd exact_gui
   ```

2. **Set up environment variables**
   Create a `.envrc` file in the project root:

   ```bash
   export CLIENT_ID=your_exact_online_client_id
   export CLIENT_SECRET=your_exact_online_client_secret
   export DIVISION=your_default_division_code
   export REDIRECT_URI=https://oauth.pstmn.io/v1/browser-callback
   export API=https://start.exactonline.nl/api
   ```

3. **Install dependencies and run**
   ```bash
   asdf install    # Install required versions
   direnv allow    # Allow environment variables
   cd src-tauri && cargo update  # Install Rust packages
   pnpm install    # Install dependencies
   pnpm tauri dev  # Start development
   ```

## 📦 Building for Production.

```bash
pnpm tauri build
```

### Generate icons

```bash
pnpm generate-icons
```

The built applications will be available in `src-tauri/target/release/bundle/`:

- **macOS**: `.dmg` package
- **Windows**: `.msi` installer
- **Linux**: `.deb` package

## 🔧 Configuration

### Environment Variables

| Variable        | Description                       | Required |
| --------------- | --------------------------------- | -------- |
| `CLIENT_ID`     | Exact Online OAuth2 Client ID     | Yes      |
| `CLIENT_SECRET` | Exact Online OAuth2 Client Secret | Yes      |
| `DIVISION`      | Default division code             | Yes      |
| `REDIRECT_URI`  | OAuth2 redirect URI               | Yes      |
| `API`           | Exact Online API base URL         | Yes      |

### Tauri Configuration

The app window can be customized in `src-tauri/tauri.conf.json`:

```json
{
  "productName": "Exact Exporter",
  "app": {
    "windows": [
      {
        "title": "Exact exporter",
        "width": 1400,
        "height": 1200
      }
    ]
  }
}
```

## 🎯 How It Works

### Authentication Flow

1. **OAuth2 Login**: Click "Open Authentication Page" to authenticate with Exact Online
2. **Authorization**: Grant permissions in your browser
3. **Token Storage**: Access and refresh tokens are securely stored locally

### Transaction Export Process

1. **Select Division**: Choose a division from the searchable dropdown
2. **Apply Filters** (optional): Use OData filter syntax to narrow down results
   - Example: `FinancialYear gt 2022`
   - Learn more: [OData Documentation](https://www.odata.org/documentation/odata-version-2-0/uri-conventions/#QueryStringOptions)
3. **Fetch Transactions**: Click "Fetch Transactions" to retrieve data
4. **View Results**: Browse transactions in the sortable data table
5. **Export CSV**: Click "Export CSV" to save all transactions to a file

### Features

- **Real-time Progress**: See "Fetched X of Y transactions..." during data fetching
- **Sortable Columns**: Click any column header to sort
- **Pagination**: Navigate through large datasets (50 rows per page)
- **All Columns**: View all transaction fields, not just a subset
- **CSV Export**: Export all transactions with proper formatting

## 🔒 Security

- OAuth2 authentication with secure token storage
- Tokens stored locally in user's home directory (`~/.exact_gui/tokens.json`)
- Automatic token refresh before expiration
- No credentials stored in code or configuration files

## 📝 Scripts

| Command               | Description                   |
| --------------------- | ----------------------------- |
| `pnpm dev`            | Start Vite dev server         |
| `pnpm tauri dev`      | Run Tauri in development mode |
| `pnpm build`          | Build frontend for production |
| `pnpm tauri build`    | Build complete application    |
| `pnpm generate-icons` | Generate app icons            |
| `pnpm kill`           | Kill all running processes    |

## 📥 Download

**Ready-to-use applications are available in the [Releases](https://github.com/reneweteling/exact_gui/releases) section.**

Download the latest version for your platform:

- **macOS**: `.dmg` package
- **Windows**: `.msi` installer
- **Linux**: `.deb` package

## 🐛 Troubleshooting

**Authentication fails**: Check your CLIENT_ID and CLIENT_SECRET in `.envrc`
**No divisions shown**: Ensure you're authenticated and have access to divisions
**Export fails**: Check file permissions and ensure you have write access to the selected location
**App won't start**: Ensure Rust and Node.js are properly installed

**Debug mode**: `RUST_LOG=debug pnpm tauri dev`

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Tauri](https://tauri.app/) for the amazing desktop app framework
- [Exact Online](https://www.exact.com/) for the API
- [shadcn/ui](https://ui.shadcn.com/) for beautiful UI components
- [TanStack Table](https://tanstack.com/table) for the data table
- [React](https://reactjs.org/) and [Tailwind CSS](https://tailwindcss.com/) for the UI

---

<div align="center">

[![Background](https://weteling.com/zzz/bg-300.png)](https://weteling.com)

**Built by [René Weteling](https://weteling.com)**

[![René Weteling Logo](src/assets/logo_rene.png)](https://weteling.com)

</div>
