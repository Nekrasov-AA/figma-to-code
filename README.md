# Figma to Code

A CLI that turns a Figma component instance into working React/TypeScript
code — built specifically for teams using [shadcn/ui](https://ui.shadcn.com/).

## The problem

Designers build UIs out of a Figma component library. Frontend developers
then open that file, find the right instance, and manually transcribe it
into JSX by hand — reading off variant/size/state, matching it to the
right shadcn component and props, copying text content, eyeballing
spacing. It's repetitive and error-prone, and it's *not* the interesting
part of the job. This tool automates that transcription step. It doesn't
design anything, and it doesn't replace a design system — it assumes you
already have one (shadcn/ui) installed in your target project.

## What makes this different

Most "Figma to code" tools treat every node as raw geometry: they walk the
render tree and spit out `<div>`s and CSS that reproduce pixels. That
works, but it means a button becomes 20 lines of hand-rolled markup
instead of `<Button variant="outline">`.

This tool instead asks: *is this instance actually a known design-system
component?* When a Figma INSTANCE resolves to a recognized component (a
Button, Label, Input, or Card from the target kit), it generates real
shadcn usage — a single JSX element with the right props — instead of
reproducing that component's internal structure from scratch. Everything
else (layout frames, plain text, anything not yet recognized) still gets
generated, just more generically.

## Example output

Generated from a real "Login to your account" card
(`figma-to-code generate --file-id X0fg87ZELrJBM3zsCEFglG --node-id 1953-27194 --name LoginCard`),
unedited:

```tsx
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";

export function LoginCard() {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col">
          <p>Login to your account</p>
          <p>Enter your email below to login to your account</p>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-[16px]">
          <div className="flex flex-col gap-[6px]">
            <Label>Email</Label>
            <Input placeholder="Value" />
          </div>
          <div className="flex flex-col gap-[6px]">
            <div className="flex flex-row gap-[22px]">
              <Label>Password</Label>
              <p>Forgot your password?</p>
            </div>
            <Input placeholder="Value" />
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <div className="flex flex-col gap-[12px]">
          <Button variant="default">Login</Button>
          <Button variant="outline">Login with Google</Button>
        </div>
        <p>Don't have an account? Sign up</p>
      </CardFooter>
    </Card>
  );
}
```

Note the recognized components (`Card`, `CardHeader`/`CardContent`/`CardFooter`,
`Label`, `Input`, `Button` with mapped `variant` props) versus the plain
layout `<div>`s with Tailwind arbitrary-value classes for everything the
tool doesn't have a dedicated parser for yet.

## Currently supported components

| Figma component | Generates |
|---|---|
| Button - Nova | `<Button variant="..." size="...">` |
| Label | `<Label>` |
| Input - Nova | `<Input placeholder="...">` |
| Card - Nova (Header/Body/Footer) | `<Card>` / `<CardHeader>` / `<CardContent>` / `<CardFooter>` |

Anything else in the tree (icons, decorative rectangles, components without
a parser yet) is left as a `{/* Unhandled: ... */}` comment rather than
silently dropped, so nothing disappears without a trace.

### How component matching works

An instance's identity is resolved via
`componentId → componentSetId → component set name`, not by reading the
layer name off the instance. This matters because designers rename
instances constantly — a Button - Nova instance placed in a login form is
usually named "Login" or "Submit" in the layers panel, not "Button - Nova".
Matching on `node.name` directly would silently miss every renamed
instance; matching on componentId (which isn't user-editable) doesn't.

## How it works

```
Figma REST API  →  Parser layer          →  React/JSX generator
(cached, single    (resolves component      (maps Figma variants to
 node fetches)      identity, extracts       shadcn props, builds
                     variant/state/props      Tailwind classes, scans
                     as raw Figma data)       tree for needed imports)
```

1. **Fetch** — a single targeted node fetch (`/v1/files/:key/nodes`)
   rather than the whole file tree, with a local `.figma-cache/` (1 hour
   TTL by default) so repeated runs during development don't hit Figma's
   rate limit.
2. **Parse** — recursively walks the node tree, recognizing Button/Label/
   Input/Card instances by componentId and everything else as generic
   containers/text.
3. **Generate** — turns the parsed tree into a `.tsx` file, importing only
   the shadcn components actually used.

## Quick Start

Requires Node.js 20+.

```bash
git clone https://github.com/Nekrasov-AA/figma-to-code.git
cd figma-to-code
npm install

# Create .env with a Figma personal access token
# (File content: Read only scope is enough)
echo "FIGMA_API_TOKEN=your_token_here" > .env

npm run build
npm run start -- generate \
  --file-id X0fg87ZELrJBM3zsCEFglG \
  --node-id 1953-27194 \
  --name LoginCard
```

`--node-id` accepts either the dash-separated id from a Figma URL
(`1953-27194`) or the API's colon format (`1953:27194`). `--name` is
optional and defaults to a PascalCase version of the node's own name in
Figma. Output defaults to `./output/{ComponentName}.tsx`; see
`npm run start -- generate --help` for `--output` and `--no-cache`.

### Alternative: run without building

Instead of `npm run build` + `npm run start --`, you can run the CLI
straight off the TypeScript source via `ts-node` — no build step, and no
`npm run start --` prefix:

```bash
npm link
figma-to-code generate --file-id ... --node-id ...
```

`npm link` registers the `figma-to-code` command globally; it's a
different way to run the same tool, not an extra step on top of building.
Run it from inside this project directory so it can find `.env`.

## Limitations

This is a working prototype, not a production tool. Specifically:

- **One Figma kit.** It's built and tested against a single real-world
  kit — [Obra's "shadcn/ui kit" (community edition)](https://www.figma.com/community).
  Component names, property names (`Size`/`Variant`/`State`, `Show left
  icon`, ...), and structural conventions (e.g. `.Card Section - Nova`
  wrapping content in a `SLOT`) are specific to how *that* kit is built.
  Other kits structure their components differently and would need their
  own parsers — there's no universal standard for how a Figma file
  represents "this is a button."
- **Four components.** Button, Label, Input, Card. Everything else in a
  frame renders as a generic `<div>` or an unhandled-node comment.
- **One node at a time.** No batch mode yet — you point it at one Figma
  node per run.
- **No styling beyond layout.** Fills, typography, effects, etc. aren't
  read from Figma; only auto-layout direction/gap/padding become Tailwind
  classes.

## Tech stack

TypeScript, [Commander](https://github.com/tj/commander.js) (CLI),
[Axios](https://axios-http.com/), the [Figma REST API](https://www.figma.com/developers/api).

## Roadmap

- More shadcn components (Select, Dialog, Checkbox, ...)
- Parsers for additional Figma UI kits
- Auto-detect which kit a file uses instead of assuming Obra's
- A thin web UI over the same CLI core

## License

MIT
