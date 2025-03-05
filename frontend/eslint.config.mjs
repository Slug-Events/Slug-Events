import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

import js from '@eslint/js'

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
});

export default [
  {
      files: [
          "**/*.js",
          "**/*.jsx",
      ]
  },
  ...compat.extends("next/core-web-vitals"),
  ...compat.config({
    extends: ['eslint:recommended', 'next'],
  }),
];