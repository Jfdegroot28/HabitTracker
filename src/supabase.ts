import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export async function sGet(k: string): Promise<unknown> {
  try {
    const { data, error } = await supabase
      .from('kv_store')
      .select('value')
      .eq('key', k)
      .maybeSingle()
    if (error) throw error
    return data ? JSON.parse(data.value) : null
  } catch {
    return null
  }
}

export async function sSet(k: string, v: unknown): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('kv_store')
      .upsert({ key: k, value: JSON.stringify(v) }, { onConflict: 'key' })
    if (error) throw error
    return true
  } catch {
    return false
  }
}

export async function sDel(k: string): Promise<void> {
  try {
    await supabase.from('kv_store').delete().eq('key', k)
  } catch { /* silent */ }
}
