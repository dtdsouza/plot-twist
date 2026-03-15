import * as fs from 'fs'
import * as path from 'path'

const ROOT_DIR = path.resolve(__dirname, '..', '..', '..')
const MODULES_DIR = path.join(ROOT_DIR, 'src', 'module')

const EXCLUDED_MODULES: string[] = ['app']

const STATIC_IMPORT_REGEX =
  /(?:import|export)(?:\s+type)?\s+[\s\S]*?from\s+['"](\.[^'"]+)['"]/gm
const DYNAMIC_IMPORT_REGEX = /\bimport\s*\(\s*['"](\.[^'"]+)['"]\s*\)/gm

function discoverModules(): string[] {
  return fs
    .readdirSync(MODULES_DIR)
    .filter((entry) =>
      fs.statSync(path.join(MODULES_DIR, entry)).isDirectory(),
    )
}

function collectSourceFiles(moduleDir: string): string[] {
  const files: string[] = []

  function walk(dir: string): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        if (entry.name === '__tests__' || entry.name === 'migrations') {
          continue
        }
        walk(fullPath)
      } else if (
        entry.isFile() &&
        entry.name.endsWith('.ts') &&
        !entry.name.endsWith('.spec.ts') &&
        !entry.name.endsWith('.int-spec.ts') &&
        !entry.name.endsWith('.e2e-spec.ts')
      ) {
        files.push(fullPath)
      }
    }
  }

  walk(moduleDir)
  return files
}

function extractImportPaths(filePath: string): string[] {
  const content = fs.readFileSync(filePath, 'utf-8')
  const imports: string[] = []

  STATIC_IMPORT_REGEX.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = STATIC_IMPORT_REGEX.exec(content)) !== null) {
    imports.push(match[1])
  }

  DYNAMIC_IMPORT_REGEX.lastIndex = 0
  while ((match = DYNAMIC_IMPORT_REGEX.exec(content)) !== null) {
    imports.push(match[1])
  }

  return imports
}

describe('Module Isolation Fitness Function', () => {
  it('should not import across module boundaries', () => {
    const allModules = discoverModules()
    const checkedModules = allModules.filter(
      (m) => !EXCLUDED_MODULES.includes(m),
    )

    const violations: string[] = []

    for (const moduleName of checkedModules) {
      const moduleDir = path.join(MODULES_DIR, moduleName)
      const sourceFiles = collectSourceFiles(moduleDir)

      for (const filePath of sourceFiles) {
        const importPaths = extractImportPaths(filePath)

        for (const importPath of importPaths) {
          const resolved = path.resolve(path.dirname(filePath), importPath)

          for (const otherModule of allModules) {
            if (otherModule === moduleName) continue

            const otherModuleDir = path.join(MODULES_DIR, otherModule)
            if (resolved.startsWith(otherModuleDir + path.sep)) {
              violations.push(
                `[${moduleName}] ${path.relative(ROOT_DIR, filePath)} imports from [${otherModule}]: ${importPath}`,
              )
            }
          }
        }
      }
    }

    if (violations.length > 0) {
      fail(
        `Cross-module boundary violations detected:\n\n${violations.map((v) => `  - ${v}`).join('\n')}`,
      )
    }
  })

  it('should discover at least two modules', () => {
    const modules = discoverModules()
    expect(modules.length).toBeGreaterThanOrEqual(2)
  })

  it('should collect source files from identity module and exclude __tests__ and migrations', () => {
    const identityDir = path.join(MODULES_DIR, 'identity')
    const files = collectSourceFiles(identityDir)

    expect(files.length).toBeGreaterThan(0)
    expect(files.every((f) => f.endsWith('.ts'))).toBe(true)
    expect(files.every((f) => !f.endsWith('.spec.ts'))).toBe(true)
    expect(files.every((f) => !f.endsWith('.int-spec.ts'))).toBe(true)
    expect(files.every((f) => !f.endsWith('.e2e-spec.ts'))).toBe(true)
    expect(files.every((f) => !f.includes(`${path.sep}__tests__${path.sep}`))).toBe(true)
    expect(files.every((f) => !f.includes(`${path.sep}migrations${path.sep}`))).toBe(true)
  })
})
