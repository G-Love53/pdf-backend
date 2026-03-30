# Admin Claims tab — settlement fields (reference)

When **status** is `approved` (case-insensitive), show:

- **Settlement amount** — `number` input, save to `claims.settlement_amount`
- **Settlement date** — `date` input, save to `claims.settlement_date`

On blur or Save, `supabase.from('claims').update({ settlement_amount, settlement_date }).eq('id', id)`.

Use `null` to clear when empty.

Optional: only show when `status === 'approved'` to avoid editing payouts on open claims.
