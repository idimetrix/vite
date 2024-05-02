import type { PartialResolvedId } from 'rollup'
import aliasPlugin from '@rollup/plugin-alias'
import type { ResolvedConfig } from './config'
import type { Environment } from './environment'
import type { PluginEnvironment } from './plugin'
import type { IsolatedPluginContainer } from './server/pluginContainer'
import { createIsolatedPluginContainer } from './server/pluginContainer'
import { resolvePlugin } from './plugins/resolve'
import type { InternalResolveOptions } from './plugins/resolve'
import { getFsUtils } from './fsUtils'

export type ResolveIdFn = (
  environment: Environment,
  id: string,
  importer?: string,
  aliasOnly?: boolean,
) => Promise<string | undefined>

/**
 * Create an internal resolver to be used in special scenarios, e.g.
 * optimizer and handling css @imports
 */
export function createIdResolver(
  config: ResolvedConfig,
  options: Partial<InternalResolveOptions>,
): ResolveIdFn {
  const scan = options?.scan

  const pluginContainerMap = new Map<Environment, IsolatedPluginContainer>()
  async function resolve(
    environment: PluginEnvironment,
    id: string,
    importer?: string,
  ): Promise<PartialResolvedId | null> {
    let pluginContainer = pluginContainerMap.get(environment)
    if (!pluginContainer) {
      pluginContainer = await createIsolatedPluginContainer(environment, [
        aliasPlugin({ entries: config.resolve.alias }), // TODO: resolve.alias per environment?
        resolvePlugin(
          {
            root: config.root,
            isProduction: config.isProduction,
            isBuild: config.command === 'build',
            asSrc: true,
            preferRelative: false,
            tryIndex: true,
            ...options,
            fsUtils: getFsUtils(config),
            // Ignore sideEffects and other computations as we only need the id
            idOnly: true,
          },
          config.environments,
        ),
      ])
      pluginContainerMap.set(environment, pluginContainer)
    }
    return await pluginContainer.resolveId(id, importer, { scan })
  }

  const aliasOnlyPluginContainerMap = new Map<
    Environment,
    IsolatedPluginContainer
  >()
  async function resolveAlias(
    environment: PluginEnvironment,
    id: string,
    importer?: string,
  ): Promise<PartialResolvedId | null> {
    let pluginContainer = aliasOnlyPluginContainerMap.get(environment)
    if (!pluginContainer) {
      pluginContainer = await createIsolatedPluginContainer(environment, [
        aliasPlugin({ entries: config.resolve.alias }), // TODO: resolve.alias per environment?
      ])
      aliasOnlyPluginContainerMap.set(environment, pluginContainer)
    }
    return await pluginContainer.resolveId(id, importer, { scan })
  }

  return async (environment, id, importer, aliasOnly) => {
    const resolveFn = aliasOnly ? resolveAlias : resolve
    // aliasPlugin and resolvePlugin are implemented to function with a Environment only,
    // we cast it as PluginEnvironment to be able to use the pluginContainer
    const resolved = await resolveFn(
      environment as PluginEnvironment,
      id,
      importer,
    )
    return resolved?.id
  }
}
