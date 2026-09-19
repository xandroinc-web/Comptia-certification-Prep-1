---
name: Stripe admin resilience
description: Handling unavailable Stripe sync tables in the admin dashboard.
---

Admin overview metrics that depend on Stripe sync tables are optional and must fail soft when those tables are unavailable. The rest of the owner dashboard should still load with a safe zero or empty value.

**Why:** Development and some restored databases can run the API without the managed Stripe schema. Treating those relations as required made an otherwise authorized admin request return HTTP 500.

**How to apply:** Keep Stripe-backed counts and catalog reads isolated behind narrow try/catch boundaries, while separately tracking the underlying Stripe sync setup as follow-up work.