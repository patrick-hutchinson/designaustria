'use server'

// Server actions: run on the server when a form is submitted.
// They change the cart in Vendure and then refresh the pages (the cart link in the header shows the count).

import { revalidatePath } from 'next/cache'

import { shopQuery } from '@/lib/vendure'

// Vendure mutations return either the Order or an error object (e.g. out of stock).
const ORDER_RESULT = `
  ... on Order { id totalQuantity }
  ... on ErrorResult { errorCode message }
`

/** Used with useActionState in <AddToCart>: returns { ok, message } */
export async function addToCart(_prevState, formData) {
  const variantId = formData.get('variantId')
  const quantity = Number(formData.get('quantity') || 1)

  try {
    const { addItemToOrder } = await shopQuery(
      `mutation AddToCart($variantId: ID!, $quantity: Int!) {
        addItemToOrder(productVariantId: $variantId, quantity: $quantity) { ${ORDER_RESULT} }
      }`,
      { variantId, quantity },
      { saveToken: true }, // the first item creates the Vendure session
    )
    if (addItemToOrder.errorCode) return { ok: false, message: addItemToOrder.message }
  } catch (error) {
    return { ok: false, message: error.message }
  }

  revalidatePath('/[locale]', 'layout') // update the cart count in the header
  return { ok: true, message: null }
}

/** Sets a cart line to a new quantity; 0 removes it. */
export async function updateCartLine(formData) {
  const lineId = formData.get('lineId')
  const quantity = Number(formData.get('quantity'))

  if (quantity > 0) {
    await shopQuery(
      `mutation Adjust($lineId: ID!, $quantity: Int!) {
        adjustOrderLine(orderLineId: $lineId, quantity: $quantity) { ${ORDER_RESULT} }
      }`,
      { lineId, quantity },
      { saveToken: true },
    )
  } else {
    await removeLine(lineId)
  }

  revalidatePath('/[locale]', 'layout')
}

export async function removeCartLine(formData) {
  await removeLine(formData.get('lineId'))
  revalidatePath('/[locale]', 'layout')
}

async function removeLine(lineId) {
  await shopQuery(
    `mutation Remove($lineId: ID!) {
      removeOrderLine(orderLineId: $lineId) { ${ORDER_RESULT} }
    }`,
    { lineId },
    { saveToken: true },
  )
}
