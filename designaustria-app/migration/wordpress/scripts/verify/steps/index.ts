// All verify steps, one per import step (same names, same order). To add an entity: write steps/<name>.ts and add it here.

import type { VerifyStep } from '../check'
import { categories } from './categories'
import { events } from './events'
import { members } from './members'
import { posts } from './posts'
import { organizationMembers } from './organization-members'
import { organizations } from './organizations'
import { users } from './users'

export const STEPS: VerifyStep[] = [categories, users, organizations, members, organizationMembers, events, posts]
