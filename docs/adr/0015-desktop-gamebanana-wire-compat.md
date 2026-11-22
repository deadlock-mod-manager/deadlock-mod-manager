# Handle GameBanana catalog transport separately from archive bytes

Preserve archive byte representation and use bounded decompression only for catalog responses. Support provider-specific payload quirks such as object-shaped PHP arrays, warnings before JSON, and empty successful responses with targeted recovery and validation.
