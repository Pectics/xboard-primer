import {execFileSync} from 'node:child_process'
import {chmod, copyFile, mkdir, mkdtemp, readFile, readdir, rename, rm, utimes, writeFile} from 'node:fs/promises'
import {basename, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {build} from 'esbuild'

const root = fileURLToPath(new URL('../', import.meta.url))
const dist = join(root, 'dist')
const config = JSON.parse(await readFile(join(root, 'theme/config.json'), 'utf8'))
const {version} = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const archive = `${config.name}-v${version.replace(/\.0$/, '')}.zip`
await mkdir(dist, {recursive: true})
const temp = await mkdtemp(join(dist, '.build-'))
const theme = join(temp, config.name)

async function dependencyNotices(outputs) {
  const packages = new Set()
  for (const output of Object.values(outputs)) {
    for (const [path, input] of Object.entries(output.inputs)) {
      const pkg = path.match(/^node_modules\/((?:@[^/]+\/)?[^/]+)/)
      if (input.bytesInOutput > 0 && pkg) packages.add(pkg[1])
    }
  }
  const sections = []
  for (const name of [...packages].sort()) {
    const directory = join(root, 'node_modules', name)
    const {version} = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'))
    const files = (await readdir(directory)).filter(file => /^(license|licence|copying|notice)($|[.-])/i.test(file)).sort()
    const paths = files.length ? files.map(file => join(directory, file)) : [join(root, 'licenses', `${name.replace(/^@/, '').replace('/', '-')}.txt`)]
    const licenses = await Promise.all(paths.map(path => readFile(path, 'utf8')))
    sections.push(`${name} ${version}\n\n${licenses.join('\n').trim()}`)
  }
  return sections.join('\n\n----------------------------------------\n\n') + '\n'
}

try {
  const {metafile} = await build({
    absWorkingDir: root,
    entryPoints: {portal: 'src/main.jsx'},
    outdir: join(theme, 'assets'),
    entryNames: '[name]-[hash]',
    bundle: true,
    minify: true,
    target: 'es2020',
    format: 'esm',
    jsx: 'automatic',
    charset: 'utf8',
    legalComments: 'inline',
    loader: {'.svg': 'dataurl'},
    define: {'process.env.NODE_ENV': '"production"'},
    metafile: true,
  })
  const outputs = Object.keys(metafile.outputs)
  const style = basename(outputs.find(path => path.endsWith('.css')))
  const script = basename(outputs.find(path => path.endsWith('.js')))
  const blade = await readFile(join(root, 'theme/dashboard.blade.php'), 'utf8')
  await writeFile(join(theme, 'dashboard.blade.php'), blade.replace('__PORTAL_CSS__', style).replace('__PORTAL_JS__', script))
  await writeFile(join(theme, 'config.json'), JSON.stringify({...config, version}, null, 2) + '\n')
  await copyFile(join(root, 'LICENSE'), join(theme, 'LICENSE'))
  await writeFile(join(theme, 'THIRD-PARTY-NOTICES.txt'), await dependencyNotices(metafile.outputs))

  const files = ['config.json', 'dashboard.blade.php', `assets/${style}`, `assets/${script}`, 'LICENSE', 'THIRD-PARTY-NOTICES.txt']
  const timestamp = new Date('2000-01-01T00:00:00Z')
  for (const file of files) {
    await chmod(join(theme, file), 0o644)
    await utimes(join(theme, file), timestamp, timestamp)
  }
  execFileSync('zip', ['-X', '-q', '-9', join(temp, archive), ...files], {cwd: theme, env: {...process.env, TZ: 'UTC'}})
  await rm(join(dist, config.name), {recursive: true, force: true})
  await rename(theme, join(dist, config.name))
  await rename(join(temp, archive), join(dist, archive))
  console.log(`Built dist/${archive}`)
} finally {
  await rm(temp, {recursive: true, force: true})
}
