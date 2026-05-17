// @ts-check
import {
  projectStructurePlugin,
  projectStructureParser,
} from 'eslint-plugin-project-structure'
import { folderStructureConfig } from './folderStructure.config.mjs'

export default [
  {
    files: ['src/**/*.ts'],
    languageOptions: { parser: projectStructureParser },
    plugins: { 'project-structure': projectStructurePlugin },
    rules: {
      'project-structure/folder-structure': ['error', folderStructureConfig],
    },
  },
]
