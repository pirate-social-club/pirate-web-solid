import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import * as ts from "typescript";

// Type-only provenance anchor: the generator reads this pinned package's files
// directly, so it must not load React at runtime.
import type { IconComponentProps } from "@web3icons/react";

type Web3IconsSourceProps = IconComponentProps;

const iconSpecs = [
  ["network", "NetworkBase"],
  ["network", "NetworkBitcoin"],
  ["network", "NetworkEthereum"],
  ["network", "NetworkOptimism"],
  ["network", "NetworkTempo"],
  ["token", "TokenBTC"],
  ["token", "TokenDAI"],
  ["token", "TokenETH"],
  ["token", "TokenLINK"],
  ["token", "TokenSOL"],
  ["token", "TokenUSDC"],
  ["token", "TokenUSDT"],
] as const;

type StaticValue =
  | boolean
  | number
  | string
  | StaticValue[]
  | { [key: string]: StaticValue };

type RenderedIcon = {
  source: string;
  scopesIds: boolean;
};

const attributeNames: Record<string, string> = {
  clipPath: "clip-path",
  clipRule: "clip-rule",
  fillRule: "fill-rule",
  gradientUnits: "gradientUnits",
  strokeLinecap: "stroke-linecap",
  strokeLinejoin: "stroke-linejoin",
  strokeWidth: "stroke-width",
  stopColor: "stop-color",
};

const root = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.join(root, "node_modules/@web3icons/react/dist/icons");
const outputPath = path.join(root, "packages/solid-ui/src/components/media/web3-icons.tsx");

function propertyName(name: ts.PropertyName): string {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  throw new Error("Unsupported property name");
}

function decode(node: ts.Expression): StaticValue {
  if (ts.isParenthesizedExpression(node)) return decode(node.expression);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;

  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.map((element) => {
      if (!ts.isExpression(element)) throw new Error("Unsupported array element");
      return decode(element);
    });
  }

  if (ts.isObjectLiteralExpression(node)) {
    const value: { [key: string]: StaticValue } = {};
    for (const property of node.properties) {
      if (!ts.isPropertyAssignment(property)) {
        throw new Error(`Unsupported object property: ${property.getText()}`);
      }
      value[propertyName(property.name)] = decode(property.initializer);
    }
    return value;
  }

  throw new Error(`Unsupported static value: ${node.getText()}`);
}

function findIconNode(sourceFile: ts.SourceFile): StaticValue {
  let iconNode: StaticValue | undefined;

  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "__iconNode") {
      if (!node.initializer) throw new Error("__iconNode has no initializer");
      iconNode = decode(node.initializer);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  if (!iconNode) throw new Error("Could not find __iconNode");
  return iconNode;
}

function getBrandedNodes(value: StaticValue, iconName: string): StaticValue[] {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new Error(`${iconName} has an invalid icon-node object`);
  }
  const branded = value.branded;
  if (!Array.isArray(branded)) throw new Error(`${iconName} has no branded variant`);
  return branded;
}

function hasScopedIds(value: StaticValue): boolean {
  if (Array.isArray(value)) return value.some(hasScopedIds);
  if (!value || typeof value !== "object") return false;

  return Object.entries(value).some(([name, child]) => {
    if (name === "id" && typeof child === "string") return true;
    if (typeof child === "string" && (child.includes("url(#") || (name === "href" && child.startsWith("#")))) {
      return true;
    }
    return hasScopedIds(child);
  });
}

function renderAttribute(name: string, value: StaticValue, scopesIds: boolean): string {
  const attributeName = attributeNames[name] ?? name;
  if (scopesIds && name === "id" && typeof value === "string") {
    return ` ${attributeName}={scopeSvgId(${JSON.stringify(value)}, iconId)}`;
  }
  if (
    scopesIds &&
    typeof value === "string" &&
    (value.includes("url(#") || (name === "href" && value.startsWith("#")))
  ) {
    return ` ${attributeName}={scopeSvgValue(${JSON.stringify(value)}, iconId)}`;
  }
  return ` ${attributeName}=${JSON.stringify(value)}`;
}

function renderNode(value: StaticValue, level: number, scopesIds: boolean): string {
  if (
    !Array.isArray(value) ||
    typeof value[0] !== "string" ||
    !value[1] ||
    typeof value[1] !== "object" ||
    Array.isArray(value[1])
  ) {
    throw new Error("Invalid icon node");
  }

  const [element, attributes, children] = value;
  const indent = " ".repeat(level * 2);
  const renderedAttributes = Object.entries(attributes)
    .map(([name, attributeValue]) => renderAttribute(name, attributeValue, scopesIds))
    .join("");

  if (!Array.isArray(children) || children.length === 0) {
    return `${indent}<${element}${renderedAttributes} />`;
  }

  return [
    `${indent}<${element}${renderedAttributes}>`,
    children.map((child) => renderNode(child, level + 1, scopesIds)).join("\n"),
    `${indent}</${element}>`,
  ].join("\n");
}

async function renderIcon(group: "network" | "token", name: string): Promise<RenderedIcon> {
  const sourcePath = path.join(sourceRoot, `${group}s/${name}.js`);
  const source = await readFile(sourcePath, "utf8");
  const sourceFile = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const nodes = getBrandedNodes(findIconNode(sourceFile), name);
  const scopesIds = nodes.some(hasScopedIds);
  const renderedNodes = nodes.map((node) => renderNode(node, 2, scopesIds)).join("\n");

  return {
    scopesIds,
    source: `export function ${name}(props: Web3IconProps) {
${scopesIds ? "  const iconId = createUniqueId();\n" : ""}  return (
    <svg
      aria-hidden={props["aria-hidden"] ?? "true"}
      class={props.class}
      fill="none"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
${renderedNodes}
    </svg>
  );
}
`,
  };
}

const renderedIcons = await Promise.all(iconSpecs.map(([group, name]) => renderIcon(group, name)));
const needsScopedIds = renderedIcons.some(({ scopesIds }) => scopesIds);

const generated = [
  "/* Generated by scripts/generate-web3-icons.ts. Do not edit by hand. */",
  "/* Source: @web3icons/react@4.1.17 branded variants. */",
  "",
  ...(needsScopedIds
    ? [
        'import { createUniqueId } from "solid-js";',
        "",
        "function scopeSvgId(value: string, scope: string): string {",
        "  return `${scope}-${value}`;",
        "}",
        "",
        "function scopeSvgValue(value: string, scope: string): string {",
        "  return value",
        "    .replace(/url\\(#([^)]*)\\)/g, (_match, id) => `url(#${scope}-${id})`)",
        "    .replace(/^#(.+)$/, (_match, id) => `#${scope}-${id}`);",
        "}",
        "",
      ]
    : []),
  "export interface Web3IconProps {",
  "  class?: string;",
  '  "aria-hidden"?: "true" | "false";',
  "}",
  "",
  ...renderedIcons.map(({ source }) => source),
].join("\n");

if (process.argv.includes("--check")) {
  const existing = await readFile(outputPath, "utf8");
  if (existing !== generated) {
    throw new Error(`${path.relative(root, outputPath)} is out of date; run bun run generate:web3-icons`);
  }
} else {
  await writeFile(outputPath, generated);
}
