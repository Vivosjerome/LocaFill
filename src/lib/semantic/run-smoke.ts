import { EMPTY_PROFILE } from '@/types/profile'
import { DEFAULT_SETTINGS } from '@/lib/storage/db'
import { runSemanticSmoke } from '@/lib/semantic/smoke'

const results = runSemanticSmoke(EMPTY_PROFILE(), DEFAULT_SETTINGS)
for (const row of results) {
  console.log(`${row.ok ? 'OK' : 'FAIL'}  ${row.label} → ${row.got}${row.ok ? '' : ` (attendu ${row.expected})`}`)
}
const failed = results.filter((r) => !r.ok)
if (failed.length) {
  console.error(`\n${failed.length} cas en échec`)
  process.exit(1)
}
console.log(`\n${results.length} cas OK`)
