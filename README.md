# 🚀 Exact Gui - The Fast No Hassle File Uploader

![Exact Gui Logo](public/logo.svg)

A modern, cross-platform desktop application for uploading files to Amazon S3 with drag-and-drop support, multipart uploads, and real-time progress tracking.

## ✨ Features

- **🎯 Drag & Drop Interface** - Simply drag files onto the app to upload
- **⚡ Multipart Uploads** - Large files (>5MB) are automatically uploaded in chunks for better reliability
- **📊 Real-time Progress** - Live upload progress with speed and time estimates
- **🔄 File Management** - View, rename, download, and delete uploaded files
- **📋 One-click Sharing** - Copy file URLs to clipboard instantly
- **🔔 Desktop Notifications** - Get notified when uploads complete or fail
- **🌙 Dark Mode Support** - Beautiful dark and light themes
- **📱 Cross-platform** - Works on Windows, macOS, and Linux

## 🛠️ Tech Stack

- **Frontend**: React 19 + TypeScript + Tailwind CSS
- **Backend**: Rust + Tauri
- **Cloud Storage**: Amazon S3
- **Build Tools**: Vite + pnpm
- **Deployment**: GitHub Actions with semantic release

## 🚀 Quick Start

### Prerequisites

- [Rust](https://rustup.rs/) (latest stable)
- [Node.js](https://nodejs.org/) (v18 or later)
- [pnpm](https://pnpm.io/) package manager
- AWS S3 bucket and credentials

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
    export CLIENT_ID=xxx
    export CLIENT_SECRET=xxx
    export DIVISION=3150655
    export REDIRECT_URI=https://oauth.pstmn.io/v1/browser-callback
    export API=https://start.exactonline.nl/api
   ```

3. **Install dependencies and run**
   ```bash
   asdf install    # Install required versions
   direnv allow    # Allow environment variables
   cd src-tauri && cargo update  # install rusk packages
   pnpm install    # Install dependencies
   pnpm tauri dev  # Start development
   ```

## 📦 Building for Production

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

| Variable                | Description    | Default                  |
| ----------------------- | -------------- | ------------------------ |
| `AWS_ACCESS_KEY_ID`     | AWS access key | Required                 |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key | Required                 |
| `AWS_REGION`            | AWS region     | `eu-west-1`              |
| `AWS_BUCKET`            | S3 bucket name | `exact_gui.weteling.com` |

### Tauri Configuration

The app window can be customized in `src-tauri/tauri.conf.json`:

```json
{
  "app": {
    "windows": [
      {
        "title": "exact_gui",
        "width": 800,
        "height": 600,
        "dragDropEnabled": false
      }
    ]
  }
}
```

## 🎯 How It Works

### Upload Process

1. **File Selection**: Drag & drop or click to select files
2. **Upload Strategy**:
   - Files ≤5MB: Direct upload via presigned POST
   - Files >5MB: Multipart upload with 5MB chunks
3. **Progress Tracking**: Real-time progress with speed/time estimates
4. **Completion**: Files are made publicly accessible and URLs are generated

### File Management

- **View**: Browse all uploaded files with metadata
- **Rename**: Double-click any file name to rename
- **Download**: Click download to open file in browser
- **Share**: Copy file URL to clipboard
- **Delete**: Remove files with confirmation dialog

## 🔒 Security

- Uses AWS IAM credentials for secure S3 access
- Presigned URLs with 1-hour expiration
- Files are automatically set to public read ACL
- No file content is stored locally (only metadata)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Use conventional commits for commit messages
- Follow the existing code style
- Add tests for new features
- Update documentation as needed

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

**Upload fails**: Check your AWS credentials and bucket permissions
**App won't start**: Ensure Rust and Node.js are properly installed
**Build errors**: Try `pnpm clean && pnpm install`

**Debug mode**: `RUST_LOG=debug pnpm tauri dev`

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Tauri](https://tauri.app/) for the amazing desktop app framework
- [AWS SDK for Rust](https://github.com/awslabs/aws-sdk-rust) for S3 integration
- [React](https://reactjs.org/) and [Tailwind CSS](https://tailwindcss.com/) for the UI

---

![Background](https://weteling.com/zzz/bg-300.png)
**Made with ❤️ by [René Weteling](https://github.com/reneweteling)**
