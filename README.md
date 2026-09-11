# Figma to Code

Convert Figma designs to production-ready React/Vue components.

## Features

- 🎨 Convert Figma frames to React/Vue components
- 🎯 Support for Shadcn UI and Material Design
- ⚡ CLI tool for local development
- 📦 Generates TypeScript components
- 🎪 Zero configuration needed

## Installation

```bash
npm install -g figma-to-code
```

## Quick Start

```bash
# Generate components from Figma
figma-to-code generate \
  --file-id "YOUR_FIGMA_FILE_ID" \
  --ui-kit shadcn \
  --framework react
```

## Configuration

Create `.env` file:
FIGMA_API_TOKEN=your_token_here


Get your token: https://www.figma.com/developers/api#access-tokens

## Supported UI Kits

- [x] Shadcn/ui
- [ ] Material Design (coming soon)
- [ ] Ant Design (coming soon)

## Roadmap

- [ ] Figma API integration
- [ ] Shadcn parser
- [ ] React generator
- [ ] Vue generator
- [ ] Web UI
- [ ] Material Design support

## License

MIT