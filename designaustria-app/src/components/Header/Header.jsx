'use client'

import { motion, AnimatePresence } from 'motion/react'

import { Menu } from '@/components/Menu/Menu'
import { LanguageSwitcher } from '@/components/LanguageSwitcher/LanguageSwitcher'

import styles from './Header.module.scss'
import { useState } from 'react'
import Link from 'next/link'

export function Header({ locale }) {
  let [open, setOpen] = useState(false)
  return (
    <header className={`${styles.header} header`}>
      <Link href="/">Home</Link>
      <div className={styles.controls}>
        <LanguageSwitcher />
        <button onClick={() => setOpen((prev) => !prev)}>Menu</button>
      </div>
      <AnimatePresence>{open && <Menu locale={locale} setOpen={setOpen} />}</AnimatePresence>
    </header>
  )
}
