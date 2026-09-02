import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type Weight = "regular" | "fill";

type IconSpec = {
  component: string;
  asset: string;
  defaultWeight?: Weight;
  supportsFilled?: boolean;
};

const PHOSPHOR_VERSION = "2.1.1";
const PHOSPHOR_PACKAGE = "@phosphor-icons/core";

const iconSpecs: readonly IconSpec[] = [
  { component: "IconX", asset: "x" },
  { component: "IconFileText", asset: "file-text" },
  { component: "IconImage", asset: "image" },
  { component: "IconMaskHappy", asset: "mask-happy" },
  { component: "IconMicrophone", asset: "microphone" },
  { component: "IconTrash", asset: "trash" },
  { component: "IconPencil", asset: "pencil" },
  { component: "IconUploadSimple", asset: "upload-simple" },
  { component: "IconUsersThree", asset: "users-three" },
  { component: "IconArrowSquareOut", asset: "arrow-square-out" },
  { component: "IconArrowsClockwise", asset: "arrows-clockwise" },
  { component: "IconBroadcast", asset: "broadcast" },
  { component: "IconCalendarBlank", asset: "calendar-blank" },
  { component: "IconCalendar", asset: "calendar" },
  { component: "IconCheckCircle", asset: "check-circle" },
  { component: "IconClock", asset: "clock" },
  { component: "IconCrown", asset: "crown" },
  { component: "IconDotsThree", asset: "dots-three" },
  { component: "IconDownloadSimple", asset: "download-simple" },
  { component: "IconGlobe", asset: "globe" },
  { component: "IconInfo", asset: "info" },
  { component: "IconLink", asset: "link" },
  { component: "IconLock", asset: "lock" },
  { component: "IconMapPin", asset: "map-pin" },
  { component: "IconRobot", asset: "robot" },
  { component: "IconShareFat", asset: "share-fat" },
  { component: "IconShareNetwork", asset: "share-network" },
  { component: "IconShield", asset: "shield" },
  { component: "IconUsers", asset: "users" },
  { component: "IconVideoCamera", asset: "video-camera" },
  { component: "IconVinylRecord", asset: "vinyl-record" },
  { component: "IconWarningCircle", asset: "warning-circle" },
  { component: "IconCheck", asset: "check" },
  { component: "IconArrowUp", asset: "arrow-up" },
  { component: "IconArrowDown", asset: "arrow-down" },
  { component: "IconChatCircle", asset: "chat-circle", supportsFilled: true },
  { component: "IconPlay", asset: "play", supportsFilled: true },
  { component: "IconPause", asset: "pause" },
  { component: "IconCircleNotch", asset: "circle-notch" },
  { component: "IconMusicNote", asset: "music-note" },
  { component: "IconCopy", asset: "copy" },
  { component: "IconCaretDown", asset: "caret-down" },
  { component: "IconCaretLeft", asset: "caret-left" },
  { component: "IconCaretRight", asset: "caret-right" },
  { component: "IconArrowLeft", asset: "arrow-left" },
  { component: "IconArrowRight", asset: "arrow-right" },
  { component: "IconHouse", asset: "house", supportsFilled: true },
  { component: "IconBell", asset: "bell", supportsFilled: true },
  { component: "IconWallet", asset: "wallet", supportsFilled: true },
  { component: "IconPlaylist", asset: "playlist", supportsFilled: true },
  { component: "IconHandPalm", asset: "hand-palm" },
  { component: "IconMicrophoneStage", asset: "microphone-stage", supportsFilled: true, defaultWeight: "fill" },
  { component: "IconArrowCounterClockwise", asset: "arrow-counter-clockwise" },
  { component: "IconGift", asset: "gift", supportsFilled: true, defaultWeight: "fill" },
  { component: "IconPlus", asset: "plus" },
  { component: "IconList", asset: "list" },
  { component: "IconSquare", asset: "square" },
  { component: "IconStop", asset: "stop", defaultWeight: "fill" },
  { component: "IconSidebarSimple", asset: "sidebar-simple" },
  { component: "IconFire", asset: "fire", supportsFilled: true },
  { component: "IconFlag", asset: "flag" },
  { component: "IconMagnifyingGlass", asset: "magnifying-glass" },
  { component: "IconTrendUp", asset: "trend-up" },
  { component: "IconQuote", asset: "quotes" },
  { component: "IconLinkSimple", asset: "link-simple" },
  { component: "IconListBullets", asset: "list-bullets" },
  { component: "IconListNumbers", asset: "list-numbers" },
  { component: "IconSpeakerHigh", asset: "speaker-high" },
  { component: "IconSpeakerSlash", asset: "speaker-slash" },
  // The feed's existing heart is a filled mark, so preserve that visual while
  // using the canonical Phosphor fill asset. It has no runtime weight switch.
  { component: "IconHeart", asset: "heart", defaultWeight: "fill" },
] as const;

const root = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.join(root, "node_modules", PHOSPHOR_PACKAGE, "assets");
const packageJsonPath = path.join(root, "node_modules", PHOSPHOR_PACKAGE, "package.json");
const rootPackageJsonPath = path.join(root, "package.json");
const outputPath = path.join(root, "packages/solid-ui/src/components/media/icons.tsx");
const docsPath = path.join(root, "packages/solid-ui/src/stories/foundations/Icons.mdx");
const sourceRoots = [
  path.join(root, "packages/solid-ui/src"),
  path.join(root, "src"),
];
// These are the only SVG-bearing product modules allowed by the source guard.
// Interface glyphs come from Phosphor; Web3 brand marks come from their own
// pinned generator. Data-derived identity marks must use HTML/CSS or an image.
const generatedSvgOutputs = new Set([
  outputPath,
  path.join(root, "packages/solid-ui/src/components/media/web3-icons.tsx"),
]);

function weightsFor(spec: IconSpec): readonly Weight[] {
  if (spec.supportsFilled) return ["regular", "fill"];
  return [spec.defaultWeight ?? "regular"];
}

function sourcePath(spec: IconSpec, weight: Weight): string {
  return path.join(sourceRoot, weight, `${spec.asset}${weight === "fill" ? "-fill" : ""}.svg`);
}

function bodyFromSvg(source: string, sourcePathname: string): string {
  const match = source.match(/^\s*<svg\b[^>]*>([\s\S]*)<\/svg>\s*$/u);
  if (!match) throw new Error(`Unable to parse SVG root: ${sourcePathname}`);

  const body = match[1]?.trim();
  if (!body) throw new Error(`SVG has no body: ${sourcePathname}`);

  // The official assets use XML attribute names that are also accepted by
  // Solid's SVG JSX transform. Keeping the source spelling makes the emitted
  // file easy to compare against the upstream asset.
  return body.replace(/></gu, ">\n<");
}

function indentBody(body: string, spaces: number): string {
  const prefix = " ".repeat(spaces);
  return body
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");
}

function renderBody(body: string, spaces = 6): string {
  return indentBody(body, spaces);
}

function renderFilledBody(body: string): string {
  return [
    "      <Show",
    "        when={iconProps.filled}",
    "        fallback={",
    "          <>",
    renderBody(body, 12),
    "          </>",
    "        }",
    "      >",
  ].join("\n");
}

function renderIcon(spec: IconSpec, bodies: ReadonlyMap<Weight, string>): string {
  const regularBody = bodies.get("regular");
  const fillBody = bodies.get("fill");
  if (!regularBody && !fillBody) throw new Error(`No SVG body loaded for ${spec.component}`);

  const rootLines = [
    `export function ${spec.component}(props: IconProps) {`,
    "  const iconProps = splitIconProps(props);",
    "  return (",
    '    <svg aria-hidden={iconProps.ariaHidden ?? "true"} class={iconProps.className} fill="currentColor" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg" {...iconProps.rest}>',
  ];

  if (spec.supportsFilled) {
    if (!regularBody || !fillBody) throw new Error(`Filled icon is missing a weight: ${spec.component}`);
    rootLines.push(renderFilledBody(regularBody));
    rootLines.push("        <>");
    rootLines.push(renderBody(fillBody, 10));
    rootLines.push("        </>");
    rootLines.push("      </Show>");
  } else if (spec.defaultWeight === "fill") {
    rootLines.push(renderBody(fillBody ?? regularBody!));
  } else {
    rootLines.push(renderBody(regularBody ?? fillBody!));
  }

  rootLines.push("    </svg>", "  );", "}", "");
  return rootLines.join("\n");
}

function renderCatalogDocumentation(sourceDigest: string): string {
  const names = iconSpecs.map(({ component }) => `\`${component}\``);
  const catalog = names
    .map((name) => `- ${name}`)
    .join("\n");

return `{/* Generated by scripts/generate-phosphor-icons.ts. Do not edit by hand. */}
{/* Source: ${PHOSPHOR_PACKAGE}@${PHOSPHOR_VERSION}; digest: ${sourceDigest} */}

import { Meta } from "@storybook/addon-docs/blocks";

<Meta title="Foundations/Icons" />

# Icons

Product glyphs come from the pinned Phosphor SVG catalog and are generated as
Solid components in \`src/components/media/icons.tsx\`. Every catalog icon is
decorative by default (\`aria-hidden="true"\`) and inherits \`currentColor\` so
surface color tokens decide its color.

## Rules

- Import the icon component directly; never duplicate a product glyph as an
  inline SVG in a component. If an icon is missing, add it to the generator's
  catalog and rerun the generation check.
- An icon-only control always has an accessible name from its own
  \`aria-label\`, an overlay part, or a wrapping label; the icon itself stays
  decorative.
- Sizes use the spacing scale (\`size-4\`, \`size-5\`) and shrink inside flex
  containers.
- Loading indicators are not icons: use the \`Spinner\` component, which owns
  the \`role="status"\` semantics.
- Icons that convey meaning beyond decoration pair with visible or accessible
  text rather than carrying \`aria-label\` on the SVG.
- The \`filled\` prop is limited to the navigation/status icons that need an
  active state. The generator emits regular and fill assets only for those
  components.

## Catalog

${catalog}

## Visual ownership boundary

- Interface glyphs come from the pinned Phosphor catalog and inherit the
  surface's color; cataloged active-state icons use a generated fill variant.
- Brand marks keep their own pinned source or owned image asset because their
  identity is in the drawing itself. Web3 brand SVGs are maintained by the
  separate provenance gate; they are not interface glyphs.
- Data-derived identity marks, such as community initials, country codes, and
  unknown wallet symbols, use HTML/CSS so their data remains visible without
  hand-authored SVG.
- Progress rings use CSS. Hand-authored inline SVGs are not permitted.
`;
}

async function collectFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const pathname = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(pathname));
    } else if (/\.(?:mdx|ts|tsx)$/u.test(entry.name)) {
      files.push(pathname);
    }
  }

  return files;
}

async function assertNoHandAuthoredSvg(): Promise<void> {
  for (const sourceRoot of sourceRoots) {
    for (const pathname of await collectFiles(sourceRoot)) {
      if (generatedSvgOutputs.has(pathname)) continue;
      const source = await readFile(pathname, "utf8");
      if (/<svg\b/u.test(source) || /data:image\/svg/u.test(source)) {
        throw new Error(
          `${path.relative(root, pathname)} contains hand-authored SVG; use a generated Phosphor icon, CSS/HTML, or an owned image asset`,
        );
      }
    }
  }
}

async function loadSources(): Promise<{
  bodies: ReadonlyMap<string, ReadonlyMap<Weight, string>>;
  sourceDigest: string;
}> {
  const bodies = new Map<string, Map<Weight, string>>();
  const digest = createHash("sha256");

  for (const spec of iconSpecs) {
    const specBodies = new Map<Weight, string>();
    for (const weight of weightsFor(spec)) {
      const pathname = sourcePath(spec, weight);
      const source = await readFile(pathname, "utf8");
      digest.update(`${spec.component}\0${weight}\0${source}\0`);
      specBodies.set(weight, bodyFromSvg(source, pathname));
    }
    bodies.set(spec.component, specBodies);
  }

  return { bodies, sourceDigest: digest.digest("hex") };
}

function renderIconsFile(
  bodies: ReadonlyMap<string, ReadonlyMap<Weight, string>>,
  sourceDigest: string,
): string {
  const needsShow = iconSpecs.some((spec) => spec.supportsFilled);
  const renderedIcons = iconSpecs.map((spec) => {
    const specBodies = bodies.get(spec.component);
    if (!specBodies) throw new Error(`No source map loaded for ${spec.component}`);
    return renderIcon(spec, specBodies);
  });

  return [
    "/* Generated by scripts/generate-phosphor-icons.ts. Do not edit by hand. */",
    `/* Source: ${PHOSPHOR_PACKAGE}@${PHOSPHOR_VERSION}. */`,
    `/* Source digest: ${sourceDigest}. */`,
    "",
    needsShow ? 'import { Show, omit } from "solid-js";' : 'import { omit } from "solid-js";',
    "",
    'import type { JSX } from "@solidjs/web";',
    "",
    'type IconProps = Omit<JSX.SvgSVGAttributes<SVGSVGElement>, "class" | "aria-hidden"> & {',
    '  "aria-hidden"?: "true" | "false";',
    "  class?: string;",
    "  filled?: boolean;",
    "};",
    "",
    "// Props stay lazy. Destructuring an icon's props reads every caller getter",
    "// during setup, which allocates caller memos out of order and desynchronises",
    "// the hydration id sequence for later siblings.",
    "function splitIconProps(props: IconProps) {",
    '  const rest = omit(props, "aria-hidden", "class", "filled");',
    "  return {",
    '    get ariaHidden() { return props["aria-hidden"]; },',
    "    get className() { return props.class; },",
    "    get filled() { return props.filled; },",
    "    rest,",
    "  };",
    "}",
    "",
    ...renderedIcons,
  ].join("\n");
}

async function assertPinnedVersion(): Promise<void> {
  const rootPackage = JSON.parse(await readFile(rootPackageJsonPath, "utf8")) as {
    devDependencies?: Record<string, string>;
  };
  const declaredVersion = rootPackage.devDependencies?.[PHOSPHOR_PACKAGE];
  if (declaredVersion !== PHOSPHOR_VERSION) {
    throw new Error(
      `${PHOSPHOR_PACKAGE} declaration ${declaredVersion ?? "missing"} does not match pinned ${PHOSPHOR_VERSION}`,
    );
  }

  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as { version?: string };
  if (packageJson.version !== PHOSPHOR_VERSION) {
    throw new Error(
      `${PHOSPHOR_PACKAGE} version ${packageJson.version ?? "unknown"} does not match pinned ${PHOSPHOR_VERSION}`,
    );
  }
}

const checkOnly = process.argv.includes("--check");
await assertPinnedVersion();
await assertNoHandAuthoredSvg();
const { bodies, sourceDigest } = await loadSources();
const generatedIcons = renderIconsFile(bodies, sourceDigest);
const generatedDocs = renderCatalogDocumentation(sourceDigest);

if (checkOnly) {
  const [existingIcons, existingDocs] = await Promise.all([
    readFile(outputPath, "utf8"),
    readFile(docsPath, "utf8"),
  ]);
  if (existingIcons !== generatedIcons) {
    throw new Error(`${path.relative(root, outputPath)} is out of date; run bun run generate:phosphor-icons`);
  }
  if (existingDocs !== generatedDocs) {
    throw new Error(`${path.relative(root, docsPath)} is out of date; run bun run generate:phosphor-icons`);
  }
} else {
  await Promise.all([
    writeFile(outputPath, generatedIcons),
    writeFile(docsPath, generatedDocs),
  ]);
}
