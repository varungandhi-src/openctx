import type {
    AnnotationsParams,
    AnnotationsResult,
    ItemsParams,
    ItemsResult,
    ProviderSettings,
} from '@openctx/protocol'
import { scopedLogger } from '../logger'
import { matchSelectors } from './selector'
import { type ProviderTransportOptions, createTransport } from './transport/createTransport'

/**
 * A {@link ProviderClient} communicates with a single OpenCtx provider. It is stateless and
 * wraps a {@link ProviderTransport}.
 */
export interface ProviderClient {
    /** Get items from the provider. */
    items(params: ItemsParams, settings: ProviderSettings): Promise<ItemsResult | null>

    /**
     * Get annotations from the provider, respecting the provider's capabilities. For example, if
     * the resource is not matched by the provider's selectors, then no annotations will be
     * returned.
     */
    annotations(params: AnnotationsParams, settings: ProviderSettings): Promise<AnnotationsResult | null>
}

export interface ProviderClientOptions
    extends Pick<
        ProviderTransportOptions,
        'providerBaseUri' | 'authInfo' | 'logger' | 'dynamicImportFromUri' | 'dynamicImportFromSource'
    > {}

/**
 * Create a new {@link ProviderClient}.
 */
export function createProviderClient(
    providerUri: string,
    { logger, ...options }: ProviderClientOptions = {}
): ProviderClient {
    logger = scopedLogger(logger, `providerClient(${providerUri})`)

    const transport = createTransport(providerUri, { ...options, cache: true, logger })

    return {
        async items(params: ItemsParams, settings: ProviderSettings): Promise<ItemsResult | null> {
            try {
                return await transport.items(params, settings)
            } catch (error) {
                logger?.(`failed to get items: ${error}`)
                return Promise.reject(error)
            }
        },
        async annotations(
            params: AnnotationsParams,
            settings: ProviderSettings
        ): Promise<AnnotationsResult | null> {
            let match: (params: AnnotationsParams) => boolean | undefined
            try {
                logger?.('checking provider capabilities')
                const capabilities = await transport.capabilities({}, settings)
                logger?.(`received capabilities = ${JSON.stringify(capabilities)}`)
                match = matchSelectors(capabilities.selector)
            } catch (error) {
                logger?.(`failed to get provider capabilities: ${error}`)
                return Promise.reject(error)
            }

            const capable = match(params)
            if (!capable) {
                logger?.(
                    `skipping items for ${JSON.stringify(
                        params.uri
                    )} because it did not match the provider's selector`
                )
                return null
            }
            try {
                return await transport.annotations(params, settings)
            } catch (error) {
                logger?.(`failed to get annotations: ${error}`)
                return Promise.reject(error)
            }
        },
    }
}
