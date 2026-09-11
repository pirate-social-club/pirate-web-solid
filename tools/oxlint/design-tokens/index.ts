import { eslintCompatPlugin } from "@oxlint/plugins";

import { noBareDestructiveTextRule } from "./rules/no-bare-destructive-text.ts";

/** Local rules that keep product class values on the semantic design tokens. */
const designTokensPlugin = eslintCompatPlugin({
	meta: { name: "design-tokens" },
	rules: {
		"no-bare-destructive-text": noBareDestructiveTextRule,
	},
});

export default designTokensPlugin;
