import * as core from '@actions/core'
import * as tc from '@actions/tool-cache'
import path from 'path'
import os from 'os'
import {promisify} from 'util'
import {exec} from 'child_process'
import * as httpm from '@actions/http-client'

type AssetRes = {
  url: string
  version: string
}

const getAsset = async (version: string): Promise<AssetRes> => {
  const versionRe = /^v(\d+)(?:\.(\d+))?$/
  if (version === 'latest' || version.match(versionRe)) {
    core.debug(
      `version is set to ${version}, getting the latest version from assets-config.json`
    )
    const http = new httpm.HttpClient(`moul/repoman-action`, [], {
      allowRetries: true,
      maxRetries: 5
    })
    try {
      const url =
        'https://raw.githubusercontent.com/moul/repoman/master/.github/assets-config.json'
      const response: httpm.HttpClientResponse = await http.get(url)
      if (response.message.statusCode !== 200) {
        throw new Error(
          `failed to download from "${url}". Code(${response.message.statusCode}) Message(${response.message.statusMessage})`
        )
      }

      const body = await response.readBody()
      const ret = JSON.parse(body)
      const alias = ret.VersionAliases[version]
      if (alias !== undefined) {
        version = alias.TargetVersion
        core.debug(`using alias ${alias.TargetVersion}`)
      } else {
        core.debug(`no such alias`)
      }
    } catch (exc) {
      throw new Error(`failed to get action config: ${exc.message}`)
    }
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

  return {
    url: `https://github.com/moul/repoman/releases/download/${version}/repoman_${platform}_${arch}.${ext}`,
    version
  }
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
    const asset: AssetRes = await getAsset(version)
    core.info(`Downloading ${asset.url} (${asset.version})`)
    const archivePath = await tc.downloadTool(asset.url)
    let extractedDir = ''
    let repl = /\.tar\.gz$/
    if (asset.url.endsWith('zip')) {
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
    const urlParts = asset.url.split(`/`)
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
