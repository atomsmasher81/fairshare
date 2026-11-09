import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ['src/lib/*.js', 'bot/*.js', 'scripts/*.js'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    // New React Compiler rules in eslint-plugin-react-hooks 7 (Next 16). The
    // flagged patterns predate the upgrade; warn until they are reworked.
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/immutability': 'warn',
    },
  },
  globalIgnores(['.next/**', '.next-*/**', '.claude/**', 'node_modules/**', 'next-env.d.ts', 'public/**']),
])
