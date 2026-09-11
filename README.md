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
# Generate a component from a single Figma node
figma-to-code generate \
  --file-id X0fg87ZELrJBM3zsCEFglG \
  --node-id 1953-27194 \
  --name LoginCard
```

`--node-id` accepts either the dash-separated id from a Figma URL
(`1953-27194`) or the API's colon format (`1953:27194`). `--name` is
optional — it defaults to a PascalCase version of the node's own name in
Figma. See `figma-to-code generate --help` for all options (`--output`,
`--no-cache`).

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