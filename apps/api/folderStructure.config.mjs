// @ts-check
import { createFolderStructure } from 'eslint-plugin-project-structure'

export const folderStructureConfig = createFolderStructure({
  projectRoot: import.meta.dirname,
  structure: [
    {
      name: 'src',
      children: [
        { name: 'main.ts' },
        { name: 'app.module.ts' },
        { name: 'data-source.ts' },
        {
          name: 'assets',
          ruleId: 'freeFormFolder',
        },
        {
          name: 'module',
          children: [
            {
              name: '{kebab-case}',
              ruleId: 'domainModule',
            },
          ],
        },
        {
          name: 'shared',
          children: [
            {
              name: '__test-support__',
              ruleId: 'freeFormFolder',
            },
            {
              name: 'module',
              children: [
                {
                  name: '{kebab-case}',
                  children: [
                    { name: 'index.ts' },
                    { name: '{kebab-case}.{kebab-case}.ts' },
                    { name: '{kebab-case}.ts' },
                    { ruleId: 'testsFolder' },
                    { ruleId: 'testSupportFolder' },
                    {
                      name: '{kebab-case}',
                      children: [
                        { name: 'index.ts' },
                        { name: '{kebab-case}.{kebab-case}.ts' },
                        { name: '{kebab-case}.ts' },
                        { ruleId: 'testsFolder' },
                        {
                          name: '{kebab-case}',
                          children: [
                            { name: 'index.ts' },
                            { name: '{kebab-case}.{kebab-case}.ts' },
                            { name: '{kebab-case}.ts' },
                            { ruleId: 'testsFolder' },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              name: '{kebab-case}',
              children: [
                { name: 'index.ts' },
                { name: '{kebab-case}.{kebab-case}.ts' },
                { name: '{kebab-case}.ts' },
                { ruleId: 'testsFolder' },
                {
                  name: '{kebab-case}',
                  children: [
                    { name: '{kebab-case}.{kebab-case}.ts' },
                    { name: '{kebab-case}.ts' },
                    { ruleId: 'testsFolder' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
  rules: {
    testsFolder: {
      name: '__tests__',
      children: [
        { name: '{kebab-case}.{kebab-case}.spec.ts' },
        { name: '{kebab-case}.{kebab-case}.int-spec.ts' },
        { name: '{kebab-case}.{kebab-case}.e2e-spec.ts' },
        { name: '{kebab-case}.spec.ts' },
        { name: '{kebab-case}.int-spec.ts' },
        { name: '{kebab-case}.e2e-spec.ts' },
        { name: '{kebab-case}.ts' },
      ],
    },
    testSupportFolder: {
      name: '__test-support__',
      ruleId: 'freeFormFolder',
    },
    freeFormFolder: {
      children: [
        { name: '*' },
        {
          name: '*',
          ruleId: 'freeFormFolder',
        },
      ],
    },
    domainModule: {
      children: [
        { name: '{kebab-case}.module.ts' },
        { name: 'index.ts' },
        { ruleId: 'testsFolder' },
        { ruleId: 'testSupportFolder' },
        {
          name: 'migrations',
          children: [{ name: '*' }],
        },
        {
          name: 'core',
          children: [
            { name: '{kebab-case}.service.ts' },
            { ruleId: 'testsFolder' },
            {
              name: '{kebab-case}',
              children: [
                { name: '{kebab-case}.{kebab-case}.ts' },
                { name: '{kebab-case}.ts' },
                { ruleId: 'testsFolder' },
              ],
            },
          ],
        },
        {
          name: 'http',
          children: [
            {
              name: 'controller',
              children: [
                { name: '{kebab-case}.controller.ts' },
                { ruleId: 'testsFolder' },
              ],
            },
            {
              name: 'dto',
              children: [
                { name: 'index.ts' },
                { name: '{kebab-case}.dto.ts' },
                { name: '{kebab-case}.interface.ts' },
                { name: '{kebab-case}.mapper.ts' },
                { ruleId: 'testsFolder' },
              ],
            },
            {
              name: 'guard',
              children: [
                { name: '{kebab-case}.guard.ts' },
                { ruleId: 'testsFolder' },
              ],
            },
            {
              name: 'decorator',
              children: [
                { name: '{kebab-case}.decorator.ts' },
                { ruleId: 'testsFolder' },
              ],
            },
          ],
        },
        {
          name: 'persistence',
          children: [
            {
              name: 'entity',
              children: [
                { name: '{kebab-case}.entity.ts' },
                { ruleId: 'testsFolder' },
              ],
            },
            {
              name: 'repository',
              children: [
                { name: '{kebab-case}.repository.ts' },
                { ruleId: 'testsFolder' },
              ],
            },
            {
              name: 'enum',
              children: [{ name: '{kebab-case}.enum.ts' }],
            },
            {
              name: 'interface',
              children: [{ name: '{kebab-case}.interface.ts' }],
            },
          ],
        },
      ],
    },
  },
})
