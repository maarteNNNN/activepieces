import { AppSystemProp, exceptionHandler, system } from '@activepieces/server-shared'
import { isNil } from '@activepieces/shared'
import { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { systemJobsSchedule } from '../../helper/system-jobs'
import { SystemJobName } from '../../helper/system-jobs/common'
import { systemJobHandlers } from '../../helper/system-jobs/job-handlers'
import { platformService } from '../../platform/platform.service'
import { licenseKeysController } from './license-keys-controller'
import { licenseKeysService } from './license-keys-service'

export const licenseKeysModule: FastifyPluginAsyncTypebox = async (app) => {
    systemJobHandlers.registerJobHandler(SystemJobName.TRIAL_TRACKER, licenseKeyJobHandler)
    await systemJobsSchedule.upsertJob({
        job: {
            name: SystemJobName.TRIAL_TRACKER,
            data: {},
        },
        schedule: {
            type: 'repeated',
            cron: '*/59 23 * * *',
        },
    })
    await app.register(licenseKeysController, { prefix: '/v1/license-keys' })
}

async function licenseKeyJobHandler(): Promise<void> {
    const platforms = await platformService.getAll()
    for (const platform of platforms) {
        if (isNil(platform.licenseKey)) {
            continue
        }
        try {
            const key = await licenseKeysService.verifyKeyOrReturnNull({
                platformId: platform.id,
                license: platform.licenseKey,
            })
            if (isNil(key)) {
                await licenseKeysService.downgradeToFreePlan(platform.id)
                continue;
            }
            await licenseKeysService.applyLimits(platform.id, key)
        } catch (e) {
            exceptionHandler.handle(e)
        }
    }
}