# Bind Steam assertions to their signed callback destination

Steam verifies the assertion signature. The auth service verifies the destination and takes callback values from signed fields, then records replay state after Steam confirms the signature so transient lookup failures leave the callback retryable.
