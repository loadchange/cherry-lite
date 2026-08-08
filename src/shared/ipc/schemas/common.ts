import * as z from 'zod'

/** Shared binary payload primitive for IPC route schemas. */
export const uint8ArraySchema = z.custom<Uint8Array>((value) => value instanceof Uint8Array, {
  message: 'Expected Uint8Array'
})
