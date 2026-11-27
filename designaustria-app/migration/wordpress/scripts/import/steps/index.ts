// All import steps, in dependency order: a step may only reference what the steps before it imported.
// The wipe runs in reverse order. To add an entity: write steps/<name>.ts and add it here.

import type { ImportStep } from '../step'
import { categories } from './categories'
import { events } from './events'
import { members } from './members'
import { posts } from './posts'
import { products } from './products'
import { organizationMembers } from './organization-members'
import { organizations } from './organizations'
import { users } from './users'

export const STEPS: ImportStep[] = [categories, users, organizations, members, organizationMembers, events, posts, products]
