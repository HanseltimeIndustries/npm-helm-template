import { execSync } from 'child_process'

export interface HelmTemplateOptions {
  /** Name of the release we're rendering */
  name: string
  /** Path url to the chart directory */
  chart: string
  /** Path to write the rendered templates to */
  outputDir?: string
  /**
   * The repository to pull the chart from
   *
   * NOTE: it is expected that you have registered your registry credentials for any authorized
   * registries as part of the helm cli set up
   */
  repo?: string
  renderSubchartNotes?: boolean
  /**
   * set individual keys to the value provided
   */
  set?: {
    [key: string]: string
  }
  /** Set values from a file */
  setFile?: string
}

export interface OutputDirReturn {
  /** List of file paths that were created if you wrote to an output directory */
  filesList: string[]
}

export interface RawReturn {
  /**
   * Returns the raw output of the stdout.
   *
   * IMPORTANT: if your helm chart can be larger than the buffer size for execSync or nodejs,
   *            then you will need to use the OutputDir and it's return to systematically parse through
   *            yaml.
   */
  buffer: Buffer
}

export function helmTemplate(options: HelmTemplateOptions & { outputDir: string }): OutputDirReturn
export function helmTemplate(options: HelmTemplateOptions): RawReturn
export function helmTemplate(options: HelmTemplateOptions): OutputDirReturn | RawReturn {
  const output = execSync(`helm template ${transformOptionsToCli(options).join(' ')}`)
  if (options.outputDir) {
    const rawFilesOutput = output
      .toString()
      .split('\n')
      .filter((raw) => !!raw.trim())
    // Try to log proof this by identifying the file portion
    return rawFilesOutput.reduce(
      (output, rawLine) => {
        rawLine.split(' ').forEach((token) => {
          if (token.endsWith('.yaml') || token.endsWith('.yml')) {
            output.filesList.push(token)
          }
        })
        return output
      },
      { filesList: [] as string[] },
    )
  }

  return {
    buffer: output,
  }
}

function transformOptionsToCli(options: HelmTemplateOptions): string[] {
  const { name, chart, ...dynamicOptions } = options
  const args = [name, chart]
  const dynamicKeys = Object.keys(dynamicOptions) as (keyof Omit<
    HelmTemplateOptions,
    'name' | 'chart'
  >)[]
  dynamicKeys.forEach((k) => {
    const value = dynamicOptions[k]
    if (value === undefined || value === null || value === '') {
      throw new Error(`Must supply non-empty value for option: ${k} if declared`)
    }
    switch (k) {
      case 'outputDir':
        args.push('--output-dir', dynamicOptions[k]!)
        break
      case 'repo':
        args.push('--repo', dynamicOptions[k]!)
        break
      case 'renderSubchartNotes':
        args.push('--render-subchart-notes')
        break
      case 'set':
        args.push(
          '--set',
          Object.keys(dynamicOptions.set!)
            .map((_k) => {
              return `${_k}=${dynamicOptions.set![_k]}`
            })
            .join(','),
        )
        break
      case 'setFile':
        args.push('--set-file', dynamicOptions[k]!)
        break
      default:
        throw new Error(`Unrecognized Template option: ${k}`)
    }
  })

  return args
}
