// One shared tracker of whether the server answers. Fed by the API client and the outbox,
// read by the header dot. A separate file so the API client and the outbox do not import each other.
import { createReachability } from './offline/index.ts'

export const reachability = createReachability()
