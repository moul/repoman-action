import * as core from '@actions/core'
import * as tc from '@actions/tool-cache'
import path from 'path'
import os from 'os'
import {promisify} from 'util'
import {exec} from 'child_process'

const downloadURL = 'https://github.com/moul/repoman/releases/download'

const getAssetURL = (version: string): string => {
  if (version === 'latest') {
    version = 'v1.4.4' // FIXME: make dynamic
  }
  let ext = 'tar.gz'
  let platform = os.platform().toString()
  switch (platform) {
    case 'linux':
      platform = 'Linux'
      break
    case 'darwin':
      platform = 'Darwin'
      break
    case 'win32':
      platform = 'windows'
      ext = 'zip'
      break
  }
  let arch = os.arch()
  switch (arch) {
    case 'x64':
      arch = 'x86_64'
      break
    case 'x32':
    case 'ia32':
      arch = 'i386'
      break
  }

  return `${downloadURL}/${version}/repoman_${platform}_${arch}.${ext}`
}

const execShellCommand = promisify(exec)

type ExecRes = {
  stdout: string
  stderr: string
}

const printOutput = (res: ExecRes): void => {
  if (res.stdout) {
    core.info(res.stdout)
  }
  if (res.stderr) {
    core.info(res.stderr)
  }
}

async function run(): Promise<void> {
  try {
    // parse input
    const version: string = core.getInput('version') || 'latest'
    const args: string = core.getInput('args')
    const workingDirectory: string = core.getInput('working-directory')
    core.debug(`os: arch=${os.arch()}, platform=${os.platform().toString()}`)
    core.debug(
      `input: version=${version}, working-directory=${workingDirectory}, args=${args}`
    )

    // download repoman
    core.info(`Installing repoman ${version}...`)
    const downloadStartedAt = Date.now()
    const assetURL: string = getAssetURL(version)
    core.info(`Downloading ${assetURL}`)
    const archivePath = await tc.downloadTool(assetURL)
    let extractedDir = ''
    let repl = /\.tar\.gz$/
    if (assetURL.endsWith('zip')) {
      extractedDir = await tc.extractZip(archivePath, process.env.HOME)
      repl = /\.zip$/
    } else {
      const execArgs = ['xz']
      if (process.platform.toString() !== 'darwin') {
        execArgs.push('--overwrite')
      }
      extractedDir = await tc.extractTar(
        archivePath,
        process.env.HOME,
        execArgs
      )
    }
    const urlParts = assetURL.split(`/`)
    const dirName = urlParts[urlParts.length - 1].replace(repl, ``)
    const repomanPath = path.join(extractedDir, dirName, `repoman`)
    core.info(
      `Installed repoman into ${repomanPath} in ${
        Date.now() - downloadStartedAt
      }ms`
    )

    // run repoman info
    core.info(`Running repoman info ${args}`)
    const runStartedAt = Date.now()
    const res = await execShellCommand(`${repomanPath} info ${args}`)
    printOutput(res)
    core.info(`Finished in ${Date.now() - runStartedAt}ms`)

    // set outputs
    const info = JSON.parse(res.stdout)
    core.setOutput('has-go', info.Git.Metadata.HasGo || false)
    core.setOutput('has-go-library', info.Git.Metadata.HasLibrary || false)
    core.setOutput('has-go-binary', info.Git.Metadata.HasBinary || false)
    core.setOutput('has-docker', info.Git.Metadata.HasDocker || false)
    core.setOutput('version', 'n/a')
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
