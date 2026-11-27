// Seed: the shop setup the WordPress import depends on (07-shop-plan §3), so local, dev and production match.
// Idempotent: creates what's missing and corrects what differs, never deletes. Run it on every shop database before the import.
//
//   - languages de + en, default channel in German, EUR, prices incl. VAT
//   - country AT, zone "Österreich" as the channel's tax and shipping zone
//   - tax categories with their Austrian rates (the empty WooCommerce tax class is 10 % here)
//   - customer group "Mitglieder" (for the member price, 06-products-plan §4.4)
//
// Shipping methods come with 07-shop-plan.
//
// Usage (from designaustria-shop/):
//   DATABASE_URL=postgres://vendure:vendure@127.0.0.1:5434/vendure npx tsx migration/wordpress/seed.ts [--dry-run] [--allow-remote]

import {
  ChannelService,
  CountryService,
  CurrencyCode,
  CustomerGroupService,
  GlobalSettingsService,
  isGraphQlErrorResult,
  LanguageCode,
  TaxCategoryService,
  TaxRateService,
  ZoneService,
} from '@vendure/core'

import { TAX_CATEGORIES } from '../../../designaustria-app/migration/wordpress/lib/shop-product-mappers'
import { parseArgs, startShop } from './lib-env'

export const ZONE_NAME = 'Österreich'
export const MEMBER_GROUP_NAME = 'Mitglieder'
/** Tax category → rate in Austria (07-shop-plan §3). */
export const TAX_RATES: Record<string, number> = {
  [TAX_CATEGORIES.reduced10]: 10,
  [TAX_CATEGORIES.reduced13]: 13,
  [TAX_CATEGORIES.standard20]: 20,
  [TAX_CATEGORIES.zero]: 0,
}

async function main() {
  const args = parseArgs()
  const shop = await startShop(args)
  const { ctx } = shop
  const changes: string[] = []
  const change = async (what: string, write: () => Promise<unknown>) => {
    changes.push(what)
    console.log(`${args.dryRun ? 'would ' : ''}${what}`)
    if (!args.dryRun) await write()
  }

  try {
    // Languages
    const settings = await shop.get(GlobalSettingsService).getSettings(ctx)
    const languages = [...new Set([...settings.availableLanguages, LanguageCode.de, LanguageCode.en])]
    if (languages.length !== settings.availableLanguages.length) {
      await change(`set available languages to ${languages.join(', ')}`, () =>
        shop.get(GlobalSettingsService).updateSettings(ctx, { availableLanguages: languages }),
      )
    }

    // Country and zone
    const countries = shop.get(CountryService)
    let austria = (await countries.findAll(ctx, { filter: { code: { eq: 'AT' } } })).items[0]
    if (!austria) {
      await change('create country AT', async () => {
        austria = await countries.create(ctx, {
          code: 'AT',
          enabled: true,
          translations: [
            { languageCode: LanguageCode.de, name: 'Österreich' },
            { languageCode: LanguageCode.en, name: 'Austria' },
          ],
        })
      })
    }
    const zones = shop.get(ZoneService)
    let zone = (await zones.findAll(ctx, { filter: { name: { eq: ZONE_NAME } } })).items[0]
    if (!zone) {
      await change(`create zone "${ZONE_NAME}" with AT`, async () => {
        zone = await zones.create(ctx, { name: ZONE_NAME, memberIds: [austria.id] })
      })
    } else if (austria && !(await zones.getAllWithMembers(ctx)).find((z) => z.id === zone.id)?.members.some((member) => member.id === austria.id)) {
      await change(`add AT to zone "${ZONE_NAME}"`, () => zones.addMembersToZone(ctx, { zoneId: zone.id, memberIds: [austria.id] }))
    }

    // Default channel
    const channels = shop.get(ChannelService)
    const channel = await channels.getDefaultChannel(ctx)
    const wanted = {
      defaultLanguageCode: LanguageCode.de,
      availableLanguageCodes: [LanguageCode.de, LanguageCode.en],
      defaultCurrencyCode: CurrencyCode.EUR,
      availableCurrencyCodes: [CurrencyCode.EUR],
      pricesIncludeTax: true,
    }
    const differs =
      channel.defaultLanguageCode !== wanted.defaultLanguageCode ||
      [...(channel.availableLanguageCodes ?? [])].sort().join() !== [...wanted.availableLanguageCodes].sort().join() ||
      channel.defaultCurrencyCode !== wanted.defaultCurrencyCode ||
      (channel.availableCurrencyCodes ?? []).join() !== wanted.availableCurrencyCodes.join() ||
      channel.pricesIncludeTax !== true ||
      (zone && (channel.defaultTaxZone?.id !== zone.id || channel.defaultShippingZone?.id !== zone.id))
    if (differs) {
      await change(`set the default channel to German, EUR, prices incl. VAT, zone "${ZONE_NAME}"`, async () => {
        const result = await channels.update(ctx, {
          id: channel.id,
          ...wanted,
          defaultTaxZoneId: zone?.id,
          defaultShippingZoneId: zone?.id,
        })
        if (isGraphQlErrorResult(result)) throw new Error(`channel update failed: ${result.message}`)
      })
    }

    // Tax categories and rates
    const categories = shop.get(TaxCategoryService)
    const rates = shop.get(TaxRateService)
    const existingCategories = (await categories.findAll(ctx)).items
    const existingRates = (await rates.findAll(ctx, { take: 1000 }, ['category', 'zone'])).items
    for (const [name, value] of Object.entries(TAX_RATES)) {
      let category = existingCategories.find((c) => c.name === name)
      if (!category) {
        await change(`create tax category "${name}"`, async () => {
          category = await categories.create(ctx, { name, isDefault: false })
        })
      }
      if (!category || !zone) continue // dry run: created above
      const rateName = `${name} ${ZONE_NAME}`
      const rate = existingRates.find((r) => r.category?.id === category!.id && r.zone?.id === zone.id)
      if (!rate) {
        await change(`create tax rate "${rateName}" ${value} %`, () =>
          rates.create(ctx, { name: rateName, value, enabled: true, categoryId: category!.id, zoneId: zone.id }),
        )
      } else if (Number(rate.value) !== value || !rate.enabled) {
        await change(`set tax rate "${rate.name}" to ${value} %, enabled`, () => rates.update(ctx, { id: rate.id, value, enabled: true }))
      }
    }

    // Customer group
    const groups = shop.get(CustomerGroupService)
    if (!(await groups.findAll(ctx, { filter: { name: { eq: MEMBER_GROUP_NAME } } })).items.length) {
      await change(`create customer group "${MEMBER_GROUP_NAME}"`, () => groups.create(ctx, { name: MEMBER_GROUP_NAME }))
    }

    console.log(changes.length ? `${args.dryRun ? 'Would make' : 'Made'} ${changes.length} change(s)` : 'Shop setup is up to date')
  } finally {
    await shop.close()
  }
  process.exit(0)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
