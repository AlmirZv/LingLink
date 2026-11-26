import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const androidDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'android')

function isJdk21(home) {
  if (!home || !existsSync(join(home, 'bin', 'java.exe'))) return false
  try {
    return /JAVA_VERSION="21/.test(readFileSync(join(home, 'release'), 'utf8'))
  } catch {
    return false
  }
}

const jdk21 =
  [process.env.JAVA_HOME, 'C:\\Program Files\\Microsoft\\jdk-21.0.12.101-hotspot'].find(isJdk21) ??
  process.env.JAVA_HOME

const result = spawnSync('gradlew.bat', ['assembleDebug'], {
  cwd: androidDir,
  env: { ...process.env, JAVA_HOME: jdk21 },
  stdio: 'inherit',
  shell: true,
})

process.exit(result.status ?? 1)
