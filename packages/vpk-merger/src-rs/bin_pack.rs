use crate::write::{encode_presorted_vpk, OutputRow};

pub fn encoded_size_for_rows(rows: &[OutputRow]) -> crate::error::Result<u64> {
    if rows.is_empty() {
        return Ok(0);
    }
    let enc = encode_presorted_vpk(rows)?;
    Ok(enc.len() as u64)
}

pub fn pick_shard_for_new_mod(
    shard_sizes: &[(usize, u64)],
    new_mod_encoded_size: u64,
    max_bytes: u64,
) -> Option<usize> {
    let mut best: Option<(usize, u64)> = None;
    for (idx, &(_, used)) in shard_sizes.iter().enumerate() {
        if used + new_mod_encoded_size <= max_bytes {
            let free = max_bytes.saturating_sub(used);
            match best {
                None => best = Some((idx, free)),
                Some((_, bf)) if free > bf => best = Some((idx, free)),
                _ => {}
            }
        }
    }
    best.map(|(i, _)| i)
}
