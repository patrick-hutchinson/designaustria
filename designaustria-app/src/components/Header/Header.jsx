'use client'

import { motion, AnimatePresence } from 'motion/react'

import { Menu } from '@/components/Menu/Menu'
import { LanguageSwitcher } from '@/components/LanguageSwitcher/LanguageSwitcher'

import styles from './Header.module.scss'
import { useState } from 'react'
import Link from 'next/link'

// `cart` is the cart link (<CartLink>), rendered on the server by the layout: this component runs in the browser.
export function Header({ locale, cart }) {
  let [open, setOpen] = useState(false)
  return (
    <header className={`${styles.header} header`}>
      <Link href="/">Home</Link>
      <div className={styles.controls}>
        <LanguageSwitcher />
        {cart}
        <button onClick={() => setOpen((prev) => !prev)}>Menu</button>
      </div>
      <AnimatePresence>{open && <Menu locale={locale} setOpen={setOpen} />}</AnimatePresence>
    </header>
  )
}
