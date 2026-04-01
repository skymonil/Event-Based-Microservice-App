import { defineConfig } from "eslint/config";
import pluginReact from "eslint-plugin-react";
import globals from "globals";

export default defineConfig([
	{ files: ["**/*.js"], languageOptions: { sourceType: "commonjs" } },
	{
		files: ["**/*.{js,mjs,cjs,jsx}"],
		languageOptions: { globals: globals.browser },
	},
	pluginReact.configs.flat.recommended,
]);
