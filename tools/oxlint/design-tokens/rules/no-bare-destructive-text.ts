import { defineRule } from "@oxlint/plugins";

const bareDestructive = /text-destructive(?!-)/;

/**
 * Destructive text on a surface must use the `--destructive-text` token.
 * The bare `text-destructive` utility is the fill token and fails AA as text.
 * Test files are exempt by configuration because their absence guards assert
 * the misuse is not rendered.
 */
export const noBareDestructiveTextRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow the bare text-destructive utility; use text-destructive-text for destructive text.",
		},
		messages: {
			bare: "Use `text-destructive-text` for destructive text; the bare `text-destructive` utility is the fill token.",
		},
	},
	createOnce(context) {
		return {
			Literal(node) {
				if (typeof node.value !== "string") return;
				if (bareDestructive.test(node.value)) context.report({ node, messageId: "bare" });
			},
			TemplateElement(node) {
				if (bareDestructive.test(node.value.raw)) context.report({ node, messageId: "bare" });
			},
		};
	},
});
