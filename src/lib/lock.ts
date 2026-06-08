import { createContext, useContext } from 'react'

// Page-wide read-only lock. When true, edit controls are disabled (but viewing,
// collapsing, and switching tabs still work). Provided by App, read anywhere.
export const LockContext = createContext(true)
export const useLocked = () => useContext(LockContext)
